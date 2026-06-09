/**
 * LM Studio Service
 *
 * 使用 LM Studio v1 REST API 标准。
 * 同时支持 v1 output 数组格式和 OpenAI 兼容格式。
 * chat() 和 chatStream() 返回 StandardResponse，toolCalls 为 ToolCall[] 对象。
 */
class LMStudioService extends window.IProviderAPIService {
  constructor() {
    super();
    this.name = 'lm-studio';
  }

  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'http://localhost:1234',
      apiKey: '',
      defaultModel: config.defaultModel || 'local-model',
      ...config
    };
  }

  buildUrl(path) {
    const cleanBase = this.config.endpoint.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (path === '/chat') return `${cleanBase}/v1/chat/completions`;
    if (cleanBase.includes('/api/v1')) return `${cleanBase}${cleanPath}`;
    return `${cleanBase}/api/v1${cleanPath}`;
  }

  buildHeaders() { return { 'Content-Type': 'application/json' }; }

  formatMessages(messages) {
    if (!messages || !Array.isArray(messages)) return [];
    const { MessageStructure } = window.MessageContent;
    return messages.map(msg => MessageStructure.toAPIFormat(msg, 'openai'));
  }

  buildRequestBody(request) {
    const body = {
      model: request.model || this.config.defaultModel,
      messages: this.formatMessages(request.messages || []),
      stream: request.stream ?? false
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    if (request.system) body.messages.unshift({ role: 'system', content: request.system });
    if (request.reasoningEffort !== undefined) body.reasoning_effort = request.reasoningEffort || 'off';

    // === LM Studio 端前缀缓存 ===
    // LM Studio v0.3.5+ 支持 context_overlap / cache_prompt
    // - cache_prompt=true: 启用服务端 prompt 缓存（多次调用可复用）
    // - 本地运行、零成本，强烈推荐开启
    if (this._shouldApplyCache(request)) {
      body.cache_prompt = true;
    }

    return body;
  }

  /**
   * 判断本次请求是否应应用 LM Studio 的本地 prompt 缓存
   * 本地无成本，开箱即用开启
   * @private
   */
  _shouldApplyCache(request) {
    if (!this.cacheOptions.enabled) return false;
    if (!this.cacheOptions.sessionCacheKey) return false;
    const msgCount = Array.isArray(request.messages) ? request.messages.length : 0;
    return msgCount >= 1; // 本地缓存零成本，即使是首条消息也开启
  }

  /** 解析非流式响应 → StandardResponse（含 ToolCall[]） */
  _parseResponse(data) {
    const { MessageStructure } = window.MessageContent;

    if (data.output && Array.isArray(data.output)) {
      const messageOutput = data.output.find(item => item.type === 'message');
      const reasoningOutputs = data.output.filter(item => item.type === 'reasoning');
      const rawToolCalls = data.output.filter(item => item.type === 'tool_call').map(tc => ({
        id: tc.tool,
        function: { name: tc.tool, arguments: JSON.stringify(tc.arguments || {}) }
      }));
      return {
        content: messageOutput?.content || '',
        reasoning_content: reasoningOutputs.map(r => r.content).join(''),
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
  _parseStreamChunkRaw(data) {
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

  chat(request) {
    const url = this.buildUrl('/chat');
    const headers = this.buildHeaders();
    request.stream = false;
    const body = this.buildRequestBody(request);

    this.abortController = new AbortController();

    return fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: this.abortController.signal
    })
    .then(response => {
      if (!response.ok) return response.text().then(t => { throw new Error(`LM Studio API error: ${response.status} - ${t}`); });
      return response.json();
    })
    .then(data => this._parseResponse(data))
    .catch(error => {
      if (error.name === 'AbortError') { console.log('[LMStudioService] cancelled'); return null; }
      throw error;
    })
    .finally(() => { this.abortController = null; });
  }

  // ==================== 流式 ====================

  chatStream(request, onChunk) {
    const url = this.buildUrl('/chat');
    const headers = this.buildHeaders();
    request.stream = true;
    const body = this.buildRequestBody(request);

    this.abortController = new AbortController();
    let pendingContent = '';
    let pendingReasoning = '';
    const pendingToolCalls = {}; // index → raw
    let pendingFinishReason = null;

    return new Promise((resolve, reject) => {
      fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: this.abortController.signal
      })
      .then(response => {
        if (!response.ok) return response.text().then(t => { throw new Error(`LM Studio API error: ${response.status} - ${t}`); });

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
              if (!trimmed.startsWith('data: ')) continue;

              try {
                const json = JSON.parse(trimmed.slice(6));
                const raw = this._parseStreamChunkRaw(json);
                if (!raw) continue;

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
              } catch (e) {
                console.warn('[LMStudioService] Failed to parse chunk:', e);
              }
            }
            return processStream();
          });
        };
        return processStream();
      })
      .catch(error => {
        if (error.name === 'AbortError') {
          console.log('[LMStudioService] Stream cancelled');
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
    const endpoints = [
      this.config.endpoint.replace(/\/$/, '') + '/api/v1/models',
      this.config.endpoint.replace(/\/$/, '') + '/v1/models'
    ];

    const tryEndpoint = (index) => {
      if (index >= endpoints.length) return Promise.reject(new Error('Failed to fetch models from any LM Studio endpoint'));
      const url = endpoints[index];
      return fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      .then(r => {
        if (!r.ok) return tryEndpoint(index + 1);
        return r.json();
      })
      .then(result => {
        let modelsArray = [];
        if (result.data?.length) modelsArray = result.data;
        else if (result.models?.length) modelsArray = result.models;
        if (modelsArray.length === 0) return tryEndpoint(index + 1);
        return modelsArray.map(m => ({
          id: m.key || m.id, name: m.name || m.key || m.id,
          context_length: m.max_context_length || m.context_length || null,
          max_output_tokens: m.max_output_tokens || null,
          owned_by: m.publisher || m.owner || 'local',
          created: m.created || Math.floor(Date.now() / 1000),
          modality: m.input_modalities?.includes('image') ? 'text+image->text' : 'text->text',
          supports_reasoning: !!(m.capabilities?.reasoning),
          supports_tools: !!(m.capabilities?.toolUse),
          pricing: { prompt: 0, completion: 0 },
          ...m
        }));
      })
      .catch(e => { console.warn(`[LMStudioService] Failed from ${endpoints[index]}:`, e); return tryEndpoint(index + 1); });
    };
    return tryEndpoint(0);
  }

  getModelDetails(modelId) {
    return this.listModels().then(models => models.find(m => m.id === modelId) || null);
  }
}

window.LMStudioService = LMStudioService;