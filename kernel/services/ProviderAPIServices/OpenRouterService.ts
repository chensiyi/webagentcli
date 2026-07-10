/**
 * OpenRouter Service
 *
 * 继承 OpenAIService，OpenRouter 使用 OpenAI 兼容的 API 标准。
 * 差异点：reasoning 字段名不同（delta.reasoning / message.reasoning）。
 * tool_calls 处理与 OpenAI 一致，继承父类逻辑。
 */
import { OpenAIService } from './OpenAIService.js';
import { Settings } from '../../models/Settings.js';
import * as MessageContent from '../../models/MessageContent.js';
import { Log } from '../Log.js';
import { joinUrl } from '../../utils/url.js';
import { forEachSSEData, accumulateOpenAIToolCall, makeStreamResult, extractStreamError } from './sse.js';

export default class OpenRouterService extends OpenAIService {
  constructor() {
    super();
    this.name = 'openrouter';
  }

  configure(settings: Settings) {
    this.config = settings;
    if (!this.config.endpoint) this.config.endpoint = 'https://openrouter.ai/api/v1';
    if (!this.config.apiKey) throw new Error('OpenRouter: apiKey is required');
  }

  buildHeaders(request?: any):  Record<string, string>{
    const headers = super.buildHeaders(request);
    // referer 由 Shell 层通过 request.headers 传入（kernel 不引用 window）
    headers['HTTP-Referer'] = request?.headers?.['HTTP-Referer'] || 'http://localhost';
    headers['X-Title'] = 'Web Agent Client';
    return headers;
  }

  buildRequestBody(request: any) {
    const body = super.buildRequestBody(request);
    if (request.metadata?.transforms) body.transforms = request.metadata.transforms;
    if (request.metadata?.provider) body.provider = request.metadata.provider;
    if (request.metadata?.route) body.route = request.metadata.route;
    // OpenRouter 官方用 reasoning 对象控制推理强度（非顶层 reasoning_effort）。
    // 清掉父类可能为推理模型加上的顶层 reasoning_effort，避免参数冲突。
    delete body.reasoning_effort;
    // 思考强度是数据，必须忠实透传：off 不是「无值」，而是用户的显式关闭选择，
    // 翻译成官方 effort:'none'（Disables reasoning entirely）；其它档位按原值下发。
    const effort = request.thinking?.effort;
    if (effort) {
      if (effort === 'off') {
        body.reasoning = { effort: 'none' };
      } else {
        body.reasoning = { effort, exclude: false };
      }
    }
    // 不记录完整请求体（含 API Key），仅记录关键元数据
    Log.debug('OpenRouterService', `Request: model=${body.model}, messages=${body.messages?.length}, reasoning=${body.reasoning ? JSON.stringify(body.reasoning) : 'none'}`);
    if (this.shouldApplyCache(request)) {
      this._applyCacheControl(body);
    }
    return body;
  }

  shouldApplyCache(request: any): boolean {
    if (!this.cacheOptions.enabled) return false;
    if (!this.cacheOptions.sessionCacheKey) return false;
    const msgCount = Array.isArray(request.messages) ? request.messages.length : 0;
    return msgCount >= 2;
  }

  _applyCacheControl(body: any) {
    const breakPoints = 2;
    if (Array.isArray(body.messages)) {
      let stamps = 0;
      for (let i = 0; i < body.messages.length && stamps < breakPoints; i++) {
        const m = body.messages[i];
        if (m.role === 'system' || i < Math.max(2, Math.floor(body.messages.length / 3))) {
          m.cache_control = { type: 'ephemeral' };
          stamps++;
        }
      }
    }
  }

  chatStream(request: any, onChunk: any): Promise<any> {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders(request);
    request.stream = true;
    const body = this.buildRequestBody(request);
    this.abortController = new AbortController();
    const ac = this.abortController;

    let pendingContent = '';
    let pendingReasoning = '';
    const pendingToolCalls: Record<number, any> = {};
    let pendingFinishReason: string | null = null;
    let streamError: Error | null = null;

    Log.info('OpenRouterService', `Stream request: model=${body.model}, messages=${body.messages?.length}`);

    return new Promise((resolve, reject) => {
      fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: ac.signal
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(t => {
            Log.error('OpenRouterService', `HTTP ${response.status}: ${t.substring(0, 200)}`);
            throw new Error(`OpenRouter API error: ${response.status} - ${t}`);
          });
        }
        const reader = response.body?.getReader();
        if (!reader) return Promise.resolve(null);
        return forEachSSEData(reader, (parsed) => {
          // 上游在 chunk 内返回错误（choices 为空 + error 字段）→ 记录后由外层 reject 传播，不让交互静默停止
          const errMsg = extractStreamError(parsed);
          if (errMsg) { streamError = new Error(`上游返回错误: ${errMsg}`); return; }
          const choice = parsed.choices?.[0];
          if (!choice) return;
          const delta = choice.delta || {};
          if (choice.finish_reason) pendingFinishReason = choice.finish_reason;

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) accumulateOpenAIToolCall(pendingToolCalls, tc);
          }

          const contentChunk = delta.content || '';
          const reasoningChunk = delta.reasoning || delta.reasoning_content || '';
          if (contentChunk) pendingContent += contentChunk;
          if (reasoningChunk) pendingReasoning += reasoningChunk;
          if (onChunk && (contentChunk || reasoningChunk)) {
            onChunk({ content: contentChunk, reasoning_content: reasoningChunk });
          }
        }, 'OpenRouterService').then(() => {
          if (streamError) {
            Log.error('OpenRouterService', `Stream error from upstream: ${streamError.message}`);
            reject(streamError);
            return;
          }
          Log.info('OpenRouterService', `Stream completed: content=${pendingContent.length}chars, finishReason=${pendingFinishReason || 'stop'}`);
          resolve(makeStreamResult(pendingContent, pendingReasoning, MessageContent.MessageStructure.parseToolCallsFromOpenAI(Object.values(pendingToolCalls)), pendingFinishReason));
        });
      })
      .catch(error => {
        if (error.name === 'AbortError') {
          Log.info('OpenRouterService', 'Stream cancelled');
          resolve(null);
        } else {
          Log.error('OpenRouterService', 'Stream failed:', error);
          reject(error);
        }
      })
      .finally(() => { this.abortController = null; });
    });
  }

  _buildStandardResponse(choice: any, data: any) {
    const { MessageStructure } = MessageContent;
    const reasoning = choice.message?.reasoning || data.reasoning_details?.map((d: any) => d.text || '').join('\n') || choice.message?.reasoning_content || '';
    return {
      content: choice.message?.content || '',
      reasoning_content: reasoning,
      role: choice.message?.role || 'assistant',
      toolCalls: MessageStructure.parseToolCallsFromOpenAI(choice.message?.tool_calls || []),
      finishReason: choice.finish_reason || null,
      usage: data.usage || null,
      model: data.model || null
    };
  }

  listModels() {
    const modelsEndpoint = joinUrl(this.config.endpoint, '/models');
    Log.info('OpenRouterService', 'Fetching model list');
    return fetch(modelsEndpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
    })
    .then(r => {
      if (!r.ok) return r.text().then(t => {
        Log.error('OpenRouterService', `listModels HTTP ${r.status}: ${t.substring(0, 200)}`);
        throw new Error(`HTTP ${r.status}: ${t.substring(0,200)}`);
      });
      return r.json();
    })
    .then((result: any) => {
      const models = (result.data || []).map((m: any) => ({
      id: m.id, name: m.name || m.id, created: m.created,
      owned_by: m.owned_by || m.owner || 'openrouter',
      context_length: m.context_length || null, max_output_tokens: m.max_output_tokens || null,
      modality: m.architecture?.modality || 'text->text',
      pricing: { prompt: m.pricing?.prompt ? parseFloat(m.pricing.prompt) : null, completion: m.pricing?.completion ? parseFloat(m.pricing.completion) : null },
      supports_reasoning: (m.supported_parameters || []).includes('reasoning'),
      supports_tools: (m.supported_parameters || []).includes('tools'),
      description: m.description || null, ...m
    }));
    Log.info('OpenRouterService', `Model list fetched: ${models.length} models`);
    return models;
    });
  }

  getModelDetails(modelId: string) {
    return this.listModels().then((models: any[]) => models.find((m: any) => m.id === modelId) || null);
  }
}
export { OpenRouterService };
