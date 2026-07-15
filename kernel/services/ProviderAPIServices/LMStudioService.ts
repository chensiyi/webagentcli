/**
 * LM Studio Service
 *
 * 使用 LM Studio v1 REST API 标准。
 * 同时支持 v1 output 数组格式和 OpenAI 兼容格式。
 * chat() 和 chatStream() 返回 StandardResponse，toolCalls 为 ToolCall[] 对象。
 */
import { BaseProviderAPIService } from '../IProviderAPIService.js';
import { Settings } from '../../models/Settings.js';
import * as MessageContent from '../../models/MessageContent.js';
import { Log } from '../Log.js';
import { joinUrl } from '../../utils/url.js';
import { forEachSSEData, makeStreamResult } from './sse.js';

class LMStudioService extends BaseProviderAPIService {
  constructor() {
    super();
    this.name = 'lm-studio';
  }

  configure(settings: Settings) {
    this.config = settings;
    if (!this.config.endpoint) this.config.endpoint = 'http://localhost:1234';
    if (!this.config.apiKey) this.config.apiKey = '';
  }

  buildUrl(path: string): string {
    const cleanBase = joinUrl(this.config.endpoint || 'http://localhost:1234');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (path === '/chat') return `${cleanBase}/v1/chat/completions`;
    if (cleanBase.includes('/api/v1')) return `${cleanBase}${cleanPath}`;
    return `${cleanBase}/api/v1${cleanPath}`;
  }

  buildHeaders(request?: any):  Record<string, string>{
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // 合并 request.headers（由 Shell 层传入浏览器相关头，kernel 不直接引用 window/chrome）
    if (request?.headers) {
      Object.assign(headers, request.headers);
    }
    return headers;
  }

  formatMessages(messages: any[]): any[] {
    if (!messages || !Array.isArray(messages)) return [];
    const { MessageStructure } = MessageContent;
    return messages.map(msg => MessageStructure.toAPIFormat(msg, 'openai'));
  }

  buildRequestBody(request: Record<string, any>): Record<string, any> {
    const body: Record<string, any> = {
      model: request.model || this.config.model,
      messages: this.formatMessages(request.messages || []),
      stream: request.stream ?? false
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    if (request.system) body.messages.unshift({ role: 'system', content: request.system });
    // 思考强度忠实透传：off 也要发送「关闭」信号，而非静默省略。
    // LM Studio 无统一 off 字段，按官方约定分档处理：
    //  - off  → chat_template_kwargs.enable_thinking=false（覆盖 Qwen3 等本地推理模型的思考开关），
    //           且不下发 reasoning_effort；
    //  - 其它 → 下发 reasoning_effort（gpt-oss 等据此调档）。
    const effort = request.thinking?.effort;
    if (effort === 'off') {
      body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), enable_thinking: false };
    } else if (effort) {
      body.reasoning_effort = effort;
    }

    // === LM Studio 端前缀缓存 ===
    // LM Studio v0.3.5+ 支持 context_overlap / cache_prompt
    // - cache_prompt=true: 启用服务端 prompt 缓存（多次调用可复用）
    // - 本地运行、零成本，强烈推荐开启
    if (this.shouldApplyCache(request)) {
      body.cache_prompt = true;
    }

    return body;
  }

  /** 解析非流式响应 → StandardResponse（含 ToolCall[]） */
  _parseResponse(data: any): any {
    const { MessageStructure } = MessageContent;

    if (data.output && Array.isArray(data.output)) {
      const messageOutput = data.output.find((item: any) => item.type === 'message');
      const reasoningOutputs = data.output.filter((item: any) => item.type === 'reasoning');
      const rawToolCalls = data.output.filter((item: any) => item.type === 'tool_call').map((tc: any) => ({
        id: tc.tool,
        function: { name: tc.tool, arguments: JSON.stringify(tc.arguments || {}) }
      }));
      return {
        content: messageOutput?.content || '',
        reasoning_content: reasoningOutputs.map((r: any) => r.content).join(''),
        toolCalls: MessageStructure.parseToolCallsFromOpenAI(rawToolCalls),
        finishReason: 'stop',
        usage: data.stats ? {
          prompt_tokens: data.stats.input_tokens,
          completion_tokens: data.stats.total_output_tokens,
          total_tokens: data.stats.input_tokens + data.stats.total_output_tokens
        } : null,
        model: data.model_instance_id || null
      };
    }

    if (data.choices?.length) {
      const choice = data.choices[0];
      return {
        content: choice.message?.content || '',
        reasoning_content: choice.message?.reasoning_content || '',
        toolCalls: MessageStructure.parseToolCallsFromOpenAI(choice.message?.tool_calls || []),
        finishReason: choice.finish_reason || null,
        usage: data.usage || null,
        model: data.model || null
      };
    }

    throw new Error('Unexpected LM Studio response format');
  }

  /** 解析流式单片数据 → 返回 { contentChunk, reasoningChunk, rawToolCall?, finishReason? } */
  _parseStreamChunkRaw(data: any): any {
    if (data.type && data.output !== undefined) {
      switch (data.type) {
        case 'chunk':
          return { contentChunk: data.output || '', finishReason: data.finish_reason || null };
        case 'reasoning_chunk':
          return { reasoningChunk: data.output || '' };
        case 'tool_call_start':
        case 'tool_call_end':
          return { rawToolCall: data.tool_call || null };
        default:
          return null;
      }
    }

    if (data.choices?.length) {
      const choice = data.choices[0];
      const delta = choice?.delta;
      if (!delta) return null;
      return {
        contentChunk: delta.content || '',
        reasoningChunk: delta.reasoning || delta.reasoning_content || delta.thinking || '',
        finishReason: choice.finish_reason || null
      };
    }
    return null;
  }

  // ==================== 非流式 ====================

  chat(request: any): Promise<any> {
    const url = this.buildUrl('/chat');
    const headers = this.buildHeaders(request);
    request.stream = false;
    const body = this.buildRequestBody(request);

    Log.info('LMStudioService', `Chat request: model=${body.model}, messages=${body.messages?.length}`);
    this.abortController = new AbortController();

    return fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: this.abortController.signal
    })
    .then(response => {
      if (!response.ok) return response.text().then(t => {
        Log.error('LMStudioService', `Chat HTTP ${response.status}: ${t.substring(0, 200)}`);
        throw new Error(`LM Studio API error: ${response.status} - ${t}`);
      });
      return response.json();
    })
    .then(data => {
      const result = this._parseResponse(data);
      Log.info('LMStudioService', `Chat response received: finishReason=${result.finishReason}`);
      return result;
    })
    .catch((error: any): any => {
      if (error.name === 'AbortError') {
        Log.info('LMStudioService', 'Chat cancelled');
        return null;
      }
      Log.error('LMStudioService', 'Chat failed:', error);
      throw error;
    })
    .finally(() => { this.abortController = null; });
  }

  // ==================== 流式 ====================

  chatStream(request: any, onChunk?: (chunk: any) => void): Promise<any> {
    const url = this.buildUrl('/chat');
    const headers = this.buildHeaders(request);
    request.stream = true;
    const body = this.buildRequestBody(request);

    this.abortController = new AbortController();
    const ac = this.abortController;
    let pendingContent = '';
    let pendingReasoning = '';
    const pendingToolCalls: Record<number, any> = {}; // index → raw
    let pendingFinishReason: string | null = null;

    Log.info('LMStudioService', `Stream request: model=${body.model}, messages=${body.messages?.length}`);

    return new Promise((resolve, reject) => {
      fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: ac.signal
      })
      .then(response => {
        if (!response.ok) return response.text().then(t => {
          Log.error('LMStudioService', `Stream HTTP ${response.status}: ${t.substring(0, 200)}`);
          throw new Error(`LM Studio API error: ${response.status} - ${t}`);
        });

        const reader = response.body?.getReader();
        if (!reader) { resolve(null); return; }
        return forEachSSEData(reader, (parsed) => {
          const raw = this._parseStreamChunkRaw(parsed);
          if (!raw) return;

          if (raw.finishReason) pendingFinishReason = raw.finishReason;

          // 累计 tool_call（按 index 合并）
          if (raw.rawToolCall) {
            const idx = Object.keys(pendingToolCalls).length;
            pendingToolCalls[idx] = {
              id: raw.rawToolCall.tool || raw.rawToolCall.id,
              index: idx,
              function: {
                name: raw.rawToolCall.tool,
                arguments: typeof raw.rawToolCall.arguments === 'string'
                  ? raw.rawToolCall.arguments
                  : JSON.stringify(raw.rawToolCall.arguments || {})
              }
            };
          }

          if (raw.contentChunk) pendingContent += raw.contentChunk;
          if (raw.reasoningChunk) pendingReasoning += raw.reasoningChunk;

          if (onChunk && (raw.contentChunk || raw.reasoningChunk)) {
            onChunk({ content: raw.contentChunk || '', reasoning_content: raw.reasoningChunk || '' });
          }
        }, 'LMStudioService').then(() => {
          Log.info('LMStudioService', `Stream completed: content=${pendingContent.length}chars, finishReason=${pendingFinishReason || 'stop'}`);
          resolve(makeStreamResult(pendingContent, pendingReasoning, MessageContent.MessageStructure.parseToolCallsFromOpenAI(Object.values(pendingToolCalls)), pendingFinishReason));
        });
      })
      .catch(error => {
        if (error.name === 'AbortError') {
          Log.info('LMStudioService', 'Stream cancelled');
          resolve(null);
        } else {
          Log.error('LMStudioService', 'Stream failed:', error);
          reject(error);
        }
      })
      .finally(() => { this.abortController = null; });
    });
  }

  cancel() {
    if (this.abortController) { this.abortController.abort(); this.abortController = null; }
  }

  listModels() {
    const endpoints = [
      joinUrl(this.config.endpoint, '/api/v1/models'),
      joinUrl(this.config.endpoint, '/v1/models')
    ];

    const tryEndpoint = (index: number): Promise<any> => {
      if (index >= endpoints.length) return Promise.reject(new Error('Failed to fetch models from any LM Studio endpoint'));
      const url = endpoints[index];
      return fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      .then((r: Response): Promise<any> => {
        if (!r.ok) return tryEndpoint(index + 1);
        return r.json();
      })
      .then((result: any): any => {
        let modelsArray: any[] = [];
        if (result.data?.length) modelsArray = result.data;
        else if (result.models?.length) modelsArray = result.models;
        if (modelsArray.length === 0) return tryEndpoint(index + 1);
        const mappedModels = modelsArray.map((m: any) => this.normalizeModel(m));
        Log.info('LMStudioService', `Model list fetched: ${mappedModels.length} models from ${url}`);
        return mappedModels;
      })
      .catch((e: any) => { Log.warn('LMStudioService', `Failed from ${endpoints[index]}:`, e); return tryEndpoint(index + 1); });
    };
    return tryEndpoint(0);
  }

  getModelDetails(modelId: string) {
    return this.listModels().then((models: any[]) => models.find((m: any) => m.id === modelId) || null);
  }
}
export default LMStudioService;
export { LMStudioService };
