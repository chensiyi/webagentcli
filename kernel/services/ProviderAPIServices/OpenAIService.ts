import { BaseProviderAPIService } from '../IProviderAPIService.js';
import { Log } from '../Log.js';
import { MessageStructure } from '../../models/MessageContent.js';
import { joinUrl } from '../../utils/url.js';
import { forEachSSEData, accumulateOpenAIToolCall, makeStreamResult, extractStreamError } from './sse.js';

export default class OpenAIService extends BaseProviderAPIService {
  constructor() { super(); this.name = 'openai'; }

  buildUrl(path: string) {
    return joinUrl(this.config.endpoint || 'https://api.openai.com/v1', path);
  }
  buildHeaders(request?: any): Record<string, string> {
    // 委托父类构建基础头 + 合并 request.headers
    return super.buildHeaders(request);
  }
  /**
   * 仅对推理模型发送 reasoning_effort，避免对 gpt-4o 等非推理模型误发导致 400 报错。
   * 模型名可能带 provider 前缀（如 OpenRouter 的 openai/o3-mini），取末段再匹配；
   * 覆盖 OpenAI 原生推理模型（o1/o3/o4、gpt-5 系列）及常见第三方推理模型
   * （deepseek-r1、qwq、qwen3、glm-z1 等经 OpenRouter 等代理支持 reasoning 参数的）。
   */
  static isReasoningModel(model: string): boolean {
    const m = (model || '').toLowerCase();
    const name = m.includes('/') ? m.split('/').pop()! : m;
    if (/^(o[1-9]|gpt-5)/.test(name)) return true;       // OpenAI 原生推理模型
    if (/(deepseek-r1|qwq|qwen3|glm-z1)/.test(name)) return true; // 常见第三方推理模型
    return false;
  }

  /**
   * 是否支持 reasoning_effort='none'（真正关闭推理）。
   * o3/o4 与 GPT-5 系列支持；o1 仅支持 low/medium/high，需回落 'low' 避免 400。
   */
  static supportsNoneEffort(model: string): boolean {
    const m = (model || '').toLowerCase();
    const name = m.includes('/') ? m.split('/').pop()! : m;
    return /^(o[3-9]|gpt-5)/.test(name);
  }

  buildRequestBody(request: Record<string, any>): Record<string, any> {
    const body: Record<string, any> = {
      model: request.model || this.config.model,
      messages: request.messages,
      stream: !!request.stream,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      tools: request.tools || undefined,
    };
    // 仅对推理模型发送 reasoning_effort，避免对非推理模型（gpt-4o 等）误发导致 400。
    // 「关」(off) 必须显式下发，不能用「省略字段」代替：o 系列 / GPT-5 在缺省时按
    // medium 思考，会表现为「设置 off 仍按 medium 思考」（OpenRouter/LMStudio 已正确映射 off→关闭）。
    // 此处与兄弟 provider 对齐：off → 'none' 真正关闭推理；o1 不支持 'none'，回落最低 'low' 防 400。
    const effort = request.thinking?.effort;
    if (effort && OpenAIService.isReasoningModel(body.model)) {
      body.reasoning_effort = effort === 'off'
        ? (OpenAIService.supportsNoneEffort(body.model) ? 'none' : 'low')
        : effort;
    }
    return body;
  }
  _buildStandardResponse(choice: any, data: any) {
    const msg = choice.message || {};
    return {
      content: msg.content || '',
      reasoning_content: msg.reasoning_content || null,
      toolCalls: MessageStructure.parseToolCallsFromOpenAI(msg.tool_calls || []),
      finishReason: choice.finish_reason || null,
      usage: data.usage || null,
      model: data.model || null,
    };
  }
  async chat(request: any) {
    const url = this.buildUrl('/chat/completions');
    // stream 由调用方（runTurn）经 request.stream 控制：阻塞路径 request.stream=false → 非流式 JSON；
    // 流式路径走 chatStream（各自强制 stream:true）。此处忠实读取 request，不擅自改写。
    const body = this.buildRequestBody(request);
    Log.info('OpenAIService', `Chat request: model=${body.model}, messages=${body.messages?.length}`);

    try {
      const res = await fetch(url, {
        method: 'POST', headers: this.buildHeaders(request), body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '(no body)');
        Log.error('OpenAIService', `Chat HTTP ${res.status}: ${errText.substring(0, 200)}`);
        throw new Error(`OpenAI API error: ${res.status} - ${errText.substring(0, 200)}`);
      }
      const data = await res.json();
      const choice = data.choices && data.choices[0];
      if (!choice) {
        Log.error('OpenAIService', 'Chat response empty: no choices');
        throw new Error('Empty response');
      }
      Log.info('OpenAIService', `Chat response received: finishReason=${choice.finish_reason}`);
      return this._buildStandardResponse(choice, data);
    } catch (error) {
      if ((error).name !== 'AbortError') {
        Log.error('OpenAIService', 'Chat failed:', error);
      }
      throw error;
    }
  }
  async chatStream(request: any, onChunk?: (chunk: any) => void): Promise<any> {
    const url = this.buildUrl('/chat/completions');
    const body: Record<string, any> = { ...this.buildRequestBody(request), stream: true };
    Log.info('OpenAIService', `Stream request: model=${body.model}, messages=${body.messages?.length}`);

    const pendingToolCalls: Record<number, any> = {};
    let pendingContent = '';
    let pendingReasoning = '';
    let pendingFinishReason: string | null = null;
    let streamError: Error | null = null;

    try {
      const res = await fetch(url, {
        method: 'POST', headers: { ...this.buildHeaders(request) }, body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '(no body)');
        Log.error('OpenAIService', `Stream HTTP ${res.status}: ${errText.substring(0, 200)}`);
        throw new Error(`OpenAI API error: ${res.status} - ${errText.substring(0, 200)}`);
      }
      if (!res.body) {
        Log.warn('OpenAIService', 'Stream response has no body');
        return null;
      }
      const reader = res.body.getReader();
      this.abortController = new AbortController();
      let totalChunkCount = 0;

      await forEachSSEData(reader, (parsed) => {
        // 上游在 chunk 内返回错误（choices 为空 + error 字段）→ 记录后由外层 reject 传播，不让交互静默停止
        const errMsg = extractStreamError(parsed);
        if (errMsg) { streamError = new Error(`上游返回错误: ${errMsg}`); return; }
        const choice = parsed.choices && parsed.choices[0];
        if (!choice) return;
        const delta = choice.delta || {};
        if (choice.finish_reason) pendingFinishReason = choice.finish_reason;

        // 累积 tool_calls（流式分片合并，OpenAI 格式）
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) accumulateOpenAIToolCall(pendingToolCalls, tc);
        }

        totalChunkCount++;
        const contentChunk = delta.content || '';
        const reasoningChunk = delta.reasoning_content || delta.reasoning || '';
        if (contentChunk) pendingContent += contentChunk;
        if (reasoningChunk) pendingReasoning += reasoningChunk;
        if (onChunk) onChunk({ content: contentChunk, reasoning_content: reasoningChunk });
      }, 'OpenAIService');

      if (streamError) {
        Log.error('OpenAIService', `Stream error from upstream: ${streamError.message}`);
        throw streamError;
      }
      Log.info('OpenAIService', `Stream completed: ${totalChunkCount} chunks, toolCalls=${Object.keys(pendingToolCalls).length}`);
      return makeStreamResult(pendingContent, pendingReasoning, MessageStructure.parseToolCallsFromOpenAI(Object.values(pendingToolCalls)), pendingFinishReason);
    } catch (error) {
      if ((error).name === 'AbortError') {
        Log.info('OpenAIService', 'Stream cancelled');
        return null;
      }
      Log.error('OpenAIService', 'Stream failed:', error);
      throw error;
    }
  }
  cancel() {
    if (this.abortController) {
      Log.info('OpenAIService', 'Request cancelled by user');
      this.abortController.abort();
    }
  }
}
export { OpenAIService };
