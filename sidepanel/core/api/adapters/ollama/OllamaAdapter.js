// Ollama API 适配器
// 支持 Ollama 本地模型的 API 接口

class OllamaAdapter {
  constructor() {
    this.name = 'ollama';
    this.config = null;
  }

  /**
   * 配置适配器
   */
  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'http://localhost:11434',
      apiKey: '', // Ollama 通常不需要 API Key
      defaultModel: config.defaultModel || 'llama2',
      ...config
    };
    console.log('[OllamaAdapter] Configured:', this.config);
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
    // Ollama 无需认证
    return {
      'Content-Type': 'application/json',
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
      stream: params.stream ?? false,
      options: {
        temperature: params.temperature ?? 0.7,
        ...(params.maxTokens && { num_predict: params.maxTokens })
      },
      // Ollama 使用 OpenAI 兼容格式
      ...(params.tools && { tools: params.tools })
    };
  }

  /**
   * 解析响应
   */
  parseResponse(data) {
    // Ollama 非流式响应格式
    return {
      content: data.message?.content || '',
      role: data.message?.role || 'assistant',
      toolCalls: data.message?.tool_calls || [],
      finishReason: data.done ? 'stop' : null,
      model: data.model
    };
  }

  /**
   * 解析流式片段
   */
  parseStreamChunk(data) {
    // Ollama 流式响应格式
    if (data.done) {
      return {
        content: '',
        role: 'assistant',
        toolCalls: data.message?.tool_calls || [],
        finishReason: 'stop'
      };
    }
    
    return {
      content: data.message?.content || '',
      role: data.message?.role,
      toolCalls: data.message?.tool_calls || [],
      finishReason: null
    };
  }

  /**
   * 获取模型列表端点
   */
  getModelsEndpoint() {
    return '/api/tags';
  }

  /**
   * 拉取模型列表
   * @returns {Array} 返回完整的模型数据数组
   */
  async fetchModels(apiEndpoint, apiKey) {
    try {
      const endpoint = apiEndpoint.replace(/\/$/, '') + '/api/tags';
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      const result = await response.json();
      
      // Ollama 返回格式: { models: [{ name: '...', ... }] }
      if (result.models && Array.isArray(result.models)) {
        // 转换为标准格式，包含详细信息
        return result.models.map(model => ({
          id: model.name,
          name: model.name,
          description: `Ollama model: ${model.name}`,
          details: model
        }));
      }
      
      return [];
    } catch (error) {
      console.error('[OllamaAdapter] Failed to fetch models:', error);
      throw error;
    }
  }

  /**
   * 检测模型能力
   */
  async detectCapabilities(modelName) {
    // Ollama 可以通过 /api/show 端点获取模型详细信息
    try {
      const response = await fetch(this.buildUrl('/api/show'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });
      
      if (!response.ok) return null;
      
      const info = await response.json();
      return {
        vision: info.details?.families?.includes('clip') || false,
        audio: false,
        streaming: true,
        tools: info.details?.supports_function_calling || false
      };
    } catch (e) {
      console.warn('[OllamaAdapter] Failed to detect capabilities:', e);
      return null;
    }
  }
}

// 导出
window.OllamaAdapter = OllamaAdapter;
