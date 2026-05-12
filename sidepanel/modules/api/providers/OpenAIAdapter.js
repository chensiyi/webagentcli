// OpenAI API适配器
// 标准OpenAI兼容的API端点

class OpenAIAdapter {
  constructor() {
    this.name = 'openai';
    this.baseUrl = '';
    this.apiKey = '';
  }

  /**
   * 配置适配器
   */
  configure(config) {
    this.baseUrl = config.endpoint || '';
    this.apiKey = config.apiKey || '';
    console.log('[OpenAIAdapter] Configured:', { baseUrl: this.baseUrl });
  }

  /**
   * 构建模型列表URL
   */
  getModelsUrl() {
    // OpenAI标准：/v1/models
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    return `${cleanBase}/v1/models`;
  }

  /**
   * 构建聊天URL
   */
  getChatUrl() {
    // OpenAI标准：/v1/chat/completions
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    return `${cleanBase}/v1/chat/completions`;
  }

  /**
   * 构建请求头
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
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
   */
  parseModelsResponse(data) {
    if (!data || !data.data) {
      return [];
    }
    return data.data.map(model => model.id);
  }
}

// 导出到全局
window.OpenAIAdapter = OpenAIAdapter;
