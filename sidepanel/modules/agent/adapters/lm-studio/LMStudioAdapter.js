// LM Studio API 适配器
// 支持 LM Studio 本地模型的 API 接口

class LMStudioAdapter {
  constructor() {
    this.name = 'lm-studio';
    this.config = null;
  }

  /**
   * 配置适配器
   */
  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'http://localhost:1234/v1',
      apiKey: '', // LM Studio 通常不需要 API Key
      defaultModel: config.defaultModel || 'local-model',
      ...config
    };
    console.log('[LMStudioAdapter] Configured:', this.config);
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
    // LM Studio 无需认证
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
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? false,
      ...(params.maxTokens && { max_tokens: params.maxTokens }),
      // LM Studio 完全兼容 OpenAI 格式
      ...(params.tools && { tools: params.tools })
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
   * @returns {Array} 返回完整的模型数据数组
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
        headers: { 'Content-Type': 'application/json' }
      });
      
      // 如果失败，尝试 /api/v1/models
      if (!response.ok) {
        const alternativeEndpoint = baseUrl + '/api/v1/models';
        console.log('[LMStudioAdapter] Retrying with alternative endpoint:', alternativeEndpoint);
        response = await fetch(alternativeEndpoint, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      const result = await response.json();
      
      if (result.data && Array.isArray(result.data)) {
        // 为 LM Studio 模型添加默认的详细信息
        return result.data.map(model => this.enrichModelData(model));
      }
      
      return [];
    } catch (error) {
      console.error('[LMStudioAdapter] Failed to fetch models:', error);
      throw error;
    }
  }

  /**
   * 为 LM Studio 模型添加默认的详细信息
   * LM Studio API 返回的信息有限，我们需要补充一些合理的默认值
   */
  enrichModelData(model) {
    const modelId = model.id || model;
    const lowerName = modelId.toLowerCase();
    
    // 根据模型名称推断上下文长度
    let contextLength = 8192; // 默认值
    if (lowerName.includes('gemma')) {
      contextLength = 8192;
    } else if (lowerName.includes('llama') || lowerName.includes('llava')) {
      contextLength = 4096;
    } else if (lowerName.includes('mistral')) {
      contextLength = 32768;
    } else if (lowerName.includes('qwen')) {
      contextLength = 32768;
    } else if (lowerName.includes('glm')) {
      contextLength = 32768;
    }
    
    // 检测输入模态
    const inputModalities = ['text'];
    if (lowerName.includes('vision') || lowerName.includes('llava') || lowerName.includes('vl')) {
      inputModalities.push('image');
    }
    
    // 检测是否支持工具调用
    const supportedParameters = ['temperature', 'max_tokens', 'top_p', 'frequency_penalty', 'presence_penalty'];
    if (!lowerName.includes('embedding')) {
      supportedParameters.push('tools', 'tool_choice');
    }
    
    // 构建增强的模型信息
    return {
      id: modelId,
      object: model.object || 'model',
      owned_by: model.owned_by || 'local',
      name: model.name || modelId,
      context_length: contextLength,
      pricing: null, // 本地模型免费
      architecture: {
        input_modalities: inputModalities,
        output_modalities: ['text'],
        modality: 'chat' // 假设都是聊天模型
      },
      supported_parameters: supportedParameters,
      description: `Local model: ${modelId}`,
      created: model.created || Date.now(),
      // 保存原始数据
      _raw: model
    };
  }

  /**
   * 检测模型能力
   */
  async detectCapabilities(modelName) {
    // LM Studio 本地模型，根据模型名称推断
    const lowerName = modelName.toLowerCase();
    
    return {
      vision: lowerName.includes('vision') || lowerName.includes('llava'),
      audio: false,
      streaming: true,
      tools: lowerName.includes('function') || lowerName.includes('tool')
    };
  }
}

// 导出
window.LMStudioAdapter = LMStudioAdapter;
