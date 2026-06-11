/**
 * OpenAI Service
 *
 * chat() 和 chatStream() 均返回 StandardResponse（Promise），
 * 内部完成协议解析，Controller 层面接受 ToolCall[] 对象。
 */
class OpenAIService extends window.IProviderAPIService {
  constructor() {
    super();
    this.name = 'openai';
  }

  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'https://api.openai.com/v1',
      apiKey: config.apiKey || '',
      defaultModel: config.defaultModel || 'gpt-3.5-turbo',
      ...config
    };
    if (!this.config.apiKey) throw new Error('OpenAI: apiKey is required');
  }

  buildUrl(path) {
    const cleanBase = this.config.endpoint.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    };
  }

  formatMessages(messages) {
    if (!messages || !Array.isArray(messages)) return [];
    const { MessageStructure } = window.MessageContent;
    return messages.map(msg => MessageStructure.toAPIFormat(msg, 'openai'));
  }

  buildRequestBody(request) {
    const body = {
      model: request.model || this.config.defaultModel,
      messages: this.formatMessages(request.messages || []),
      temperature: request.temperature ?? 0.7,
      stream: request.stream ?? false,
      ...(request.maxTokens && { max_tokens: request.maxTokens }),
      ...(request.tools && { tools: request.tools })
    };
    if (request.system) {
      body.messages.unshift({ role: 'system', content: request.system });
    }
    // reasoning_effort 来自 MessagesRequest.thinking (ThinkingConfig 对象)
    const thinking = request.thinking;
    if (thinking && thinking.effort) {
      body.reasoning_effort = thinking.effort;
    }

    // === Provider 端前缀缓存 ===
    // OpenAI gpt-4o / gpt-4.1 / o-series 自动启用 prompt caching
    // - 提供 prompt_cache_key 则是手动控制（仅 o-series、gpt-4.1 等付费 KV cache 模型）
    // - 不支持时该字段会被忽略，不影响请求
    if (this.shouldApplyCache(request) && this._isModelCacheable(request.model)) {
      body.prompt_cache_key = this.cacheOptions.sessionCacheKey;
    }

    return body;
  }

  /**
   * 判断本次请求是否应应用 Provider 端缓存
   * OpenAI 只对支持缓存的模型提供 prompt_cache_key
   * @private
   */
  _isModelCacheable(modelId) {
    const model = modelId || this.config?.defaultModel || '';
    // 支持缓存的模型（只对需要 KV cache 的模型传 key，避免额外 1 token 推断成本）
    const cacheable = /^(o\d|gpt-4\.1|gpt-4o)/i;
    return cacheable.test(model);
  }

  /** 公用的 API 调用后处理：生成 StandardResponse，将 OpenAI tool_calls 转为 ToolCall[] */
  _buildStandardResponse(choice, data) {
    const { MessageStructure } = window.MessageContent;
    return {
      content: choice.message?.content || '',
      reasoning_content: choice.message?.reasoning_content || '',
      role: choice.message?.role || 'assistant',
      toolCalls: MessageStructure.parseToolCallsFromOpenAI(choice.message?.tool_calls || []),
      finishReason: choice.finish_reason || null,
      usage: data.usage || null,
      model: data.model || null
    };
  }

  // ==================== 非流式 ====================

  chat(request) {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders();
    request.stream = false;
    const body = this.buildRequestBody(request);

    this.abortController = new AbortController();

    return fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: this.abortController.signal
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(t => { throw new Error(`OpenAI API error: ${response.status} - ${t}`); });
      }
      return response.json();
    })
    .then(data => {
      const choice = data.choices?.[0];
      if (!choice) throw new Error('Empty response');
      return this._buildStandardResponse(choice, data);
    })
    .catch(error => {
      if (error.name === 'AbortError') { console.log('[OpenAIService] cancelled'); return null; }
      throw error;
    })
    .finally(() => { this.abortController = null; });
  }

  // ==================== 流式 ====================

  chatStream(request, onChunk) {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders();
    request.stream = true;
    const body = this.buildRequestBody(request);

    this.abortController = new AbortController();

    // 累计流式分片
    let pendingContent = '';
    let pendingReasoning = '';
    const pendingToolCalls = {};   // index → OpenAI raw tool_call
    let pendingFinishReason = null;

    return new Promise((resolve, reject) => {
      fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: this.abortController.signal
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(t => { throw new Error(`OpenAI API error: ${response.status} - ${t}`); });
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = () => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              // 流结束：构造 StandardResponse
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

                  // 累计 tool_calls（按 index 合并 arguments）
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

                  // 累计 content / reasoning
                  const contentChunk = delta.content || '';
                  const reasoningChunk = delta.reasoning_content || delta.thinking || '';
                  if (contentChunk) pendingContent += contentChunk;
                  if (reasoningChunk) pendingReasoning += reasoningChunk;

                  // 实时回调 onChunk（仅用于 UI 更新）
                  if (onChunk && (contentChunk || reasoningChunk)) {
                    onChunk({ content: contentChunk, reasoning_content: reasoningChunk });
                  }
                } catch (e) {
                  console.warn('[OpenAIService] Failed to parse chunk:', e);
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
          console.log('[OpenAIService] Stream cancelled');
          resolve(null);
        } else {
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
    const baseUrl = this.config.endpoint.replace(/\/$/, '');
    const modelsEndpoint = baseUrl.endsWith('/v1') ? baseUrl + '/models' : baseUrl + '/v1/models';
    return fetch(modelsEndpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
    })
    .then(r => { if (!r.ok) return r.text().then(t => { throw new Error(`HTTP ${r.status}: ${t.substring(0, 200)}`); }); return r.json(); })
    .then(result => (result.data || []).map(m => ({
      id: m.id, name: m.name || m.id, created: m.created,
      owned_by: m.owned_by, context_length: m.context_length || null,
      max_output_tokens: m.max_output_tokens || null,
      modality: 'text->text', supports_reasoning: this._detectReasoningSupport(m.id), supports_tools: true,
      pricing: { prompt: null, completion: null }, ...m
    })));
  }

  getModelDetails(modelId) {
    const baseUrl = this.config.endpoint.replace(/\/$/, '');
    const ep = baseUrl.endsWith('/v1') ? `${baseUrl}/models/${modelId}` : `${baseUrl}/v1/models/${modelId}`;
    return fetch(ep, { method: 'GET', headers: { 'Authorization': `Bearer ${this.config.apiKey}` } })
    .then(r => { if (!r.ok) return null; return r.json(); })
    .then(m => m ? {
      id: m.id, name: m.name || m.id, created: m.created, owned_by: m.owned_by,
      context_length: m.context_length || null, max_output_tokens: m.max_output_tokens || null,
      modality: 'text->text', supports_reasoning: this._detectReasoningSupport(m.id), supports_tools: true,
      pricing: { prompt: null, completion: null }, ...m
    } : null);
  }

  /**
   * 检测 OpenAI 模型是否支持推理能力
   * @private
   */
  _detectReasoningSupport(modelId) {
    const id = modelId.toLowerCase();
    return id.includes('o1') || id.includes('o3') || 
           id.includes('reasoning') || id.includes('think') ||
           id.includes('r1'); // DeepSeek-R1 compatibility
  }
}

window.OpenAIService = OpenAIService;