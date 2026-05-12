// LM Studio API适配器
// LM Studio使用本地服务器，端口通常为1234

class LMStudioAdapter {
  constructor() {
    this.name = 'lm-studio';
    this.baseUrl = '';
    this.apiKey = ''; // LM Studio通常不需要API Key
  }

  /**
   * 配置适配器
   */
  configure(config) {
    this.baseUrl = config.endpoint || 'http://localhost:1234';
    this.apiKey = config.apiKey || '';
    console.log('[LMStudioAdapter] Configured:', { baseUrl: this.baseUrl });
  }

  /**
   * 构建模型列表URL
   * LM Studio: /v1/models
   */
  getModelsUrl() {
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    return `${cleanBase}/v1/models`;
  }

  /**
   * 构建聊天URL
   * LM Studio: /v1/chat/completions
   */
  getChatUrl() {
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    return `${cleanBase}/v1/chat/completions`;
  }

  /**
   * 构建请求头
   * LM Studio不需要认证
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json'
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
window.LMStudioAdapter = LMStudioAdapter;
