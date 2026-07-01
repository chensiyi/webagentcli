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

  buildHeaders() {
    const headers = super.buildHeaders();
    // FIXME: window 依赖 — 已知浏览器环境耦合（参见 MEMORY.md）
    headers['HTTP-Referer'] = window.location.href || 'http://localhost';
    headers['X-Title'] = 'Web Agent Client';
    return headers;
  }

  buildRequestBody(request: any) {
    const body = super.buildRequestBody(request);
    if (request.metadata?.transforms) body.transforms = request.metadata.transforms;
    if (request.metadata?.provider) body.provider = request.metadata.provider;
    if (request.metadata?.route) body.route = request.metadata.route;
    const thinking = request.thinking;
    if (thinking && thinking.effort) {
      body.reasoning_effort = thinking.effort === 'off' ? 'none' : thinking.effort;
    }
    // 不记录完整请求体（含 API Key），仅记录关键元数据
    Log.debug('OpenRouterService', `Request: model=${body.model}, messages=${body.messages?.length}, reasoning_effort=${body.reasoning_effort || 'none'}`);
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

  chatStream(request: any, onChunk: any) {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders();
    request.stream = true;
    const body = this.buildRequestBody(request);
    this.abortController = new AbortController();

    let pendingContent = '';
    let pendingReasoning = '';
    const pendingToolCalls: any = {};
    let pendingFinishReason: string | null = null;

    Log.info('OpenRouterService', `Stream request: model=${body.model}, messages=${body.messages?.length}`);

    return new Promise((resolve, reject) => {
      fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: this.abortController.signal
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
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = () => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              const { MessageStructure } = MessageContent;
              Log.info('OpenRouterService', `Stream completed: content=${pendingContent.length}chars, finishReason=${pendingFinishReason || 'stop'}`);
              resolve({
                content: pendingContent,
                reasoning_content: pendingReasoning,
                toolCalls: MessageStructure.parseToolCallsFromOpenAI(Object.values(pendingToolCalls)),
                finishReason: pendingFinishReason || 'stop',
                usage: null,
                model: null
              });
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              if (!trimmed.startsWith('data: ')) continue;

              try {
                const json = JSON.parse(trimmed.slice(6));
                const choice = json.choices?.[0];
                if (!choice) continue;
                const delta = choice.delta || {};
                const finish = choice.finish_reason;
                if (finish) pendingFinishReason = finish;

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (!pendingToolCalls[tc.index]) {
                      pendingToolCalls[tc.index] = tc;
                    } else {
                      const existing = pendingToolCalls[tc.index];
                      if (tc.function) {
                        existing.function = existing.function || { arguments: '' };
                        existing.function.arguments = (existing.function.arguments || '') + (tc.function.arguments || '');
                      }
                    }
                  }
                }

                const contentChunk = delta.content || '';
                const reasoningChunk = delta.reasoning || delta.reasoning_content || '';
                if (contentChunk) pendingContent += contentChunk;
                if (reasoningChunk) pendingReasoning += reasoningChunk;
                if (onChunk && (contentChunk || reasoningChunk)) {
                  onChunk({ content: contentChunk, reasoning_content: reasoningChunk });
                }
              } catch (e) {
                Log.warn('OpenRouterService', 'Failed to parse chunk:', e);
              }
            }
            return processStream();
          });
        };
        return processStream();
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
    const modelsEndpoint = this.config.endpoint.replace(/\/$/, '') + '/models';
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
    return this.listModels().then((models: any[]) => models.find(m => m.id === modelId) || null);
  }
}
export { OpenRouterService };