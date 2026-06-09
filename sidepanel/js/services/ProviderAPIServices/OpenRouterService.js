/**
 * OpenRouter Service
 *
 * 继承 OpenAIService，OpenRouter 使用 OpenAI 兼容的 API 标准。
 * 差异点：reasoning 字段名不同（delta.reasoning / message.reasoning）。
 * tool_calls 处理与 OpenAI 一致，继承父类逻辑。
 */
class OpenRouterService extends OpenAIService {
  constructor() {
    super();
    this.name = 'openrouter';
  }

  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey || '',
      defaultModel: config.defaultModel || 'openai/gpt-3.5-turbo',
      ...config
    };
    if (!this.config.apiKey) throw new Error('OpenRouter: apiKey is required');
  }

  buildHeaders() {
    const headers = super.buildHeaders();
    headers['HTTP-Referer'] = window.location.href || 'http://localhost';
    headers['X-Title'] = 'Web Agent Client';
    return headers;
  }

  buildRequestBody(request) {
    const body = super.buildRequestBody(request);
    // OpenRouter 特有的参数
    if (request.metadata?.transforms) body.transforms = request.metadata.transforms;
    if (request.metadata?.provider) body.provider = request.metadata.provider;
    if (request.metadata?.route) body.route = request.metadata.route;
    // 思考模式：OpenRouter 用 thinking 对象
    if (request.reasoningEffort && request.reasoningEffort !== 'off') {
      body.thinking = { enabled: true, effort: request.reasoningEffort };
      delete body.reasoning_effort;
    }

    // === OpenRouter 端前缀缓存 ===
    // OpenRouter 通过给 system / 历史消息上加 cache_control: { type: 'ephemeral' } 启用 Anthropic-style 缓存
    // - 命中后计费降到原价 ~10%
    // - cache_control 字段会透传到上游 provider，不支持的 provider 会忽略
    if (this._shouldApplyCache(request)) {
      this._applyCacheControl(body);
    }
    return body;
  }

  /**
   * 覆盖 _shouldApplyCache：OpenRouter 缓存策略与 OpenAI 不同
   * 任何 sessionId 存在 + messages >= 2 即可应用（由 cache_control 控制粒度）
   * @override
   */
  _shouldApplyCache(request) {
    if (!this.cacheOptions.enabled) return false;
    if (!this.cacheOptions.sessionCacheKey) return false;
    const msgCount = Array.isArray(request.messages) ? request.messages.length : 0;
    return msgCount >= 2;
  }

  /**
   * 在 system 提示和部分早期消息上加 cache_control 断点
   * 这样后续轮次中只要这些点之前的内容不变，OpenRouter 就可以命中缓存
   * @private
   */
  _applyCacheControl(body) {
    const breakPoints = 2; // system + 前 1/3 历史
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

  /** 覆盖：OpenRouter 的 reasoning 字段是 delta.reasoning / message.reasoning */
  chatStream(request, onChunk) {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders();
    request.stream = true;
    const body = this.buildRequestBody(request);

    this.abortController = new AbortController();

    let pendingContent = '';
    let pendingReasoning = '';
    const pendingToolCalls = {};
    let pendingFinishReason = null;

    return new Promise((resolve, reject) => {
      fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: this.abortController.signal
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(t => { throw new Error(`OpenRouter API error: ${response.status} - ${t}`); });
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = () => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              const { MessageStructure } = window.MessageContent;
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

              if (trimmed.startsWith('data: ')) {
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const choice = json.choices?.[0];
                  if (!choice) continue;

                  const delta = choice.delta || {};
                  const finish = choice.finish_reason;
                  if (finish) pendingFinishReason = finish;

                  // 累计 tool_calls（与 OpenAIService 相同）
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

                  // OpenRouter 的 reasoning 在 delta.reasoning 字段
                  const contentChunk = delta.content || '';
                  const reasoningChunk = delta.reasoning || delta.reasoning_content || '';
                  if (contentChunk) pendingContent += contentChunk;
                  if (reasoningChunk) pendingReasoning += reasoningChunk;

                  if (onChunk && (contentChunk || reasoningChunk)) {
                    onChunk({ content: contentChunk, reasoning_content: reasoningChunk });
                  }
                } catch (e) {
                  console.warn('[OpenRouterService] Failed to parse chunk:', e);
                }
              }
            }
            return processStream();
          });
        };
        return processStream();
      })
      .catch(error => {
        if (error.name === 'AbortError') {
          console.log('[OpenRouterService] Stream cancelled');
          resolve(null);
        } else {
          reject(error);
        }
      })
      .finally(() => { this.abortController = null; });
    });
  }

  /** 覆盖：OpenRouter 非流式响应中 reasoning 字段位置不同 */
  _buildStandardResponse(choice, data) {
    const { MessageStructure } = window.MessageContent;
    const reasoning = choice.message?.reasoning || data.reasoning_details?.map(d => d.text || '').join('\n') || choice.message?.reasoning_content || '';
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
    return fetch(modelsEndpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
    })
    .then(r => { if (!r.ok) return r.text().then(t => { throw new Error(`HTTP ${r.status}: ${t.substring(0,200)}`); }); return r.json(); })
    .then(result => (result.data || []).map(m => ({
      id: m.id, name: m.name || m.id, created: m.created,
      owned_by: m.owned_by || m.owner || 'openrouter',
      context_length: m.context_length || null, max_output_tokens: m.max_output_tokens || null,
      modality: m.architecture?.modality || 'text->text',
      pricing: { prompt: m.pricing?.prompt ? parseFloat(m.pricing.prompt) : null, completion: m.pricing?.completion ? parseFloat(m.pricing.completion) : null },
      supports_reasoning: (m.supported_parameters || []).includes('reasoning'),
      supports_tools: (m.supported_parameters || []).includes('tools'),
      description: m.description || null, ...m
    })));
  }

  getModelDetails(modelId) {
    return this.listModels().then(models => models.find(m => m.id === modelId) || null);
  }
}

window.OpenRouterService = OpenRouterService;