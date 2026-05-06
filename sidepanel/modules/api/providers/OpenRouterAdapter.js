// OpenRouter API适配器
// OpenRouter有特殊的模型列表端点和格式

class OpenRouterAdapter {
  constructor() {
    this.name = 'openrouter';
    this.baseUrl = '';
    this.apiKey = '';
  }

  /**
   * 配置适配器
   */
  configure(config) {
    this.baseUrl = config.endpoint || '';
    this.apiKey = config.apiKey || '';
    console.log('[OpenRouterAdapter] Configured:', { baseUrl: this.baseUrl });
  }

  /**
   * 构建模型列表URL
   * OpenRouter使用不同的端点
   */
  getModelsUrl() {
    // OpenRouter: /api/v1/models (不带/v前缀)
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    // 如果baseUrl已经包含/api/v1，直接使用
    if (cleanBase.includes('/api/v1')) {
      return `${cleanBase}/models`;
    }
    // 否则添加/api/v1
    return `${cleanBase}/api/v1/models`;
  }

  /**
   * 构建聊天URL
   */
  getChatUrl() {
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    // OpenRouter标准：/api/v1/chat/completions
    if (cleanBase.includes('/api/v1')) {
      return `${cleanBase}/chat/completions`;
    }
    return `${cleanBase}/api/v1/chat/completions`;
  }

  /**
   * 构建请求头
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      // OpenRouter需要额外的头
      'HTTP-Referer': 'https://github.com/webagentcli',
      'X-Title': 'Web Agent Client'
    };
  }

  /**
   * 构建请求体
   */
  buildRequestBody(params) {
    return {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? true,
      ...(params.maxTokens && { max_tokens: params.maxTokens }),
      ...(params.tools && { tools: params.tools }),
      ...(params.toolChoice && { tool_choice: params.toolChoice })
    };
  }

  /**
   * 解析模型列表响应
   * OpenRouter返回格式：{ data: [{ id: '...', name: '...' }] }
   */
  parseModelsResponse(data) {
    if (!data || !data.data) {
      return [];
    }
    return data.data.map(model => model.id);
  }
}

// 导出到全局
window.OpenRouterAdapter = OpenRouterAdapter;
