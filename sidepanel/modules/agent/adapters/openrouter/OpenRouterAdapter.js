// OpenRouter API 适配器
// 支持 OpenRouter 聚合平台的 API 接口

class OpenRouterAdapter {
  constructor() {
    this.name = 'openrouter';
    this.config = null;
  }

  /**
   * 配置适配器
   */
  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey || '',
      defaultModel: config.defaultModel || 'openai/gpt-4o',
      ...config
    };
    console.log('[OpenRouterAdapter] Configured:', this.config);
  }

  /**
   * 构建 API URL
   */
  buildUrl(path) {
    const cleanBase = this.config.endpoint.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  /**
   * 构建请求头
   */
  buildHeaders(customHeaders = {}) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': window.location.href,
      'X-Title': 'WebAgentCLI',
      ...customHeaders
    };
  }

  /**
   * 格式化聊天消息
   */
  formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls })
    }));
  }

  /**
   * 构建请求体
   */
  buildRequestBody(params) {
    return {
      model: params.model || this.config.defaultModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? false,
      ...(params.maxTokens && { max_tokens: params.maxTokens }),
      // OpenRouter 完全兼容 OpenAI 格式
      ...(params.tools && { tools: params.tools }),
      ...(params.toolChoice && { tool_choice: params.toolChoice })
    };
  }

  /**
   * 解析响应
   */
  parseResponse(data) {
    const choice = data.choices[0];
    return {
      content: choice.message.content,
      role: choice.message.role,
      toolCalls: choice.message.tool_calls || [],
      finishReason: choice.finish_reason,
      usage: data.usage,
      model: data.model
    };
  }

  /**
   * 解析流式片段
   */
  parseStreamChunk(data) {
    const choice = data.choices[0];
    if (!choice || !choice.delta) return null;
    
    return {
      content: choice.delta.content || '',
      role: choice.delta.role,
      toolCalls: choice.delta.tool_calls || [],
      finishReason: choice.finish_reason
    };
  }

  /**
   * 获取模型列表端点
   */
  getModelsEndpoint() {
    return '/v1/models';
  }

  /**
   * 拉取模型列表
   * @returns {Array} 返回完整的模型数据数组，每个元素包含 id, name, description 等详细信息
   */
  async fetchModels(apiEndpoint, apiKey) {
    try {
      let response;
      
      // 检查 endpoint 是否已经包含 /v1
      const baseUrl = apiEndpoint.replace(/\/$/, '');
      let modelsEndpoint;
      
      if (baseUrl.endsWith('/v1')) {
        // endpoint 已经包含 /v1，直接拼接 /models
        modelsEndpoint = baseUrl + '/models';
      } else {
        // endpoint 不包含 /v1，拼接 /v1/models
        modelsEndpoint = baseUrl + '/v1/models';
      }
      
      response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
      });
      
      // 如果失败，尝试 /api/v1/models
      if (!response.ok) {
        const alternativeEndpoint = baseUrl + '/api/v1/models';
        console.log('[OpenRouterAdapter] Retrying with alternative endpoint:', alternativeEndpoint);
        response = await fetch(alternativeEndpoint, {
          method: 'GET',
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      const result = await response.json();
      
      if (result.data && Array.isArray(result.data)) {
        // 返回完整的模型数据，而不仅仅是 ID
        return result.data;
      }
      
      return [];
    } catch (error) {
      console.error('[OpenRouterAdapter] Failed to fetch models:', error);
      throw error;
    }
  }

  /**
   * 检测模型能力
   */
  async detectCapabilities(modelName) {
    // OpenRouter 可以通过模型 ID 推断能力
    const lowerName = modelName.toLowerCase();
    
    return {
      vision: lowerName.includes('vision') || lowerName.includes('gpt-4o'),
      audio: lowerName.includes('audio') || lowerName.includes('whisper'),
      streaming: true,
      tools: !lowerName.includes('instruct') && !lowerName.includes('chat')
    };
  }
}

// 导出
window.OpenRouterAdapter = OpenRouterAdapter;
