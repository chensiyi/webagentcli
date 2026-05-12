// LM Studio API 适配器
// 使用 LM Studio 原生 Server API 标准
// Base URL: http://localhost:1234
// API 端点: /api/v1/chat/completions, /api/v1/models
// 参考: https://lmstudio.ai/docs/api/server

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
      endpoint: config.endpoint || 'http://localhost:1234',
      apiKey: '', // LM Studio 通常不需要 API Key
      defaultModel: config.defaultModel || 'local-model',
      ...config
    };
    console.log('[LMStudioAdapter] Configured:', this.config);
  }

  /**
   * 构建 API URL
   * LM Studio 标准: Base URL + /api/v1/ + path
   */
  buildUrl(path) {
    const cleanBase = this.config.endpoint.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    // 如果 Base URL 已经包含 /api/v1，直接拼接
    if (cleanBase.includes('/api/v1')) {
      return `${cleanBase}${cleanPath}`;
    }
    
    // 否则添加 /api/v1 前缀
    return `${cleanBase}/api/v1${cleanPath}`;
  }

  /**
   * 构建请求头
   */
  buildHeaders(customHeaders = {}) {
    // LM Studio 无需认证（本地服务）
    return {
      'Content-Type': 'application/json',
      ...customHeaders
    };
  }

  /**
   * 格式化聊天消息
   * LM Studio 完全兼容 OpenAI 格式
   */
  formatMessages(messages) {
    return messages.map(msg => {
      const formatted = {
        role: msg.role,
        content: msg.content
      };
      
      // 添加工具调用（如果有）
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        formatted.tool_calls = msg.tool_calls;
      }
      
      // 添加工具结果 ID（tool 角色必需）
      if (msg.role === 'tool' && msg.tool_call_id) {
        formatted.tool_call_id = msg.tool_call_id;
      }
      
      // 添加名称（可选）
      if (msg.name) {
        formatted.name = msg.name;
      }
      
      return formatted;
    });
  }

  /**
   * 构建请求体
   */
  buildRequestBody(params) {
    const baseBody = {
      model: params.model || this.config.defaultModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? false
    };
    
    // 添加可选参数
    if (params.maxTokens) {
      baseBody.max_tokens = params.maxTokens;
    }
    
    if (params.top_p !== undefined) {
      baseBody.top_p = params.top_p;
    }
    
    if (params.frequency_penalty !== undefined) {
      baseBody.frequency_penalty = params.frequency_penalty;
    }
    
    if (params.presence_penalty !== undefined) {
      baseBody.presence_penalty = params.presence_penalty;
    }
    
    // 工具调用
    if (params.tools && params.tools.length > 0) {
      baseBody.tools = params.tools;
      
      if (params.toolChoice) {
        baseBody.tool_choice = params.toolChoice;
      }
    }
    
    return baseBody;
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
   * 支持 reasoning_content 字段（思考过程）
   */
  parseStreamChunk(data) {
    const choice = data.choices[0];
    if (!choice || !choice.delta) return null;
    
    return {
      content: choice.delta.content || '',
      reasoning_content: choice.delta.reasoning_content || choice.delta.thinking || '',
      role: choice.delta.role,
      toolCalls: choice.delta.tool_calls || [],
      finishReason: choice.finish_reason
    };
  }

  /**
   * 获取模型列表端点
   */
  getModelsEndpoint() {
    return '/models'; // 相对于 /api/v1
  }

  /**
   * 拉取模型列表
   * @returns {Array} 返回完整的模型数据数组
   */
  async fetchModels(apiEndpoint, apiKey) {
    try {
      const baseUrl = apiEndpoint.replace(/\/$/, '');
      let modelsEndpoint;
      
      // 根据 Base URL 构建正确的端点
      if (baseUrl.includes('/api/v1')) {
        modelsEndpoint = `${baseUrl}/models`;
      } else {
        modelsEndpoint = `${baseUrl}/api/v1/models`;
      }
      
      console.log('[LMStudioAdapter] Fetching models from:', modelsEndpoint);
      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      const result = await response.json();
      
      // OpenAI 兼容格式: { data: [...] }
      if (result.data && Array.isArray(result.data)) {
        return result.data.map(model => this.enrichModelData(model));
      }
      
      // 原生 API 格式
      if (result.models && Array.isArray(result.models)) {
        return result.models.map(model => this.enrichModelData(model));
      }
      
      return [];
    } catch (error) {
      console.error('[LMStudioAdapter] Failed to fetch models:', error);
      throw error;
    }
  }

  /**
   * 为 LM Studio 模型添加详细的元数据
   */
  enrichModelData(model) {
    // 确保 modelId 是字符串
    const modelId = String(model.id || model);
    const lowerName = modelId.toLowerCase();
    
    // 根据模型名称推断上下文长度
    let contextLength = 8192; // 默认值
    if (lowerName.includes('gemma')) {
      contextLength = 8192;
    } else if (lowerName.includes('llama-3') || lowerName.includes('llama3')) {
      contextLength = 8192;
    } else if (lowerName.includes('llama') || lowerName.includes('llava')) {
      contextLength = 4096;
    } else if (lowerName.includes('mistral')) {
      contextLength = 32768;
    } else if (lowerName.includes('qwen')) {
      contextLength = 32768;
    } else if (lowerName.includes('glm')) {
      contextLength = 32768;
    } else if (lowerName.includes('yi')) {
      contextLength = 4096;
    }
    
    // 检测输入模态
    const inputModalities = ['text'];
    if (lowerName.includes('vision') || 
        lowerName.includes('llava') || 
        lowerName.includes('vl') ||
        lowerName.includes('clip')) {
      inputModalities.push('image');
    }
    
    // 检测是否支持工具调用
    const supportedParameters = [
      'temperature', 
      'max_tokens', 
      'top_p', 
      'frequency_penalty', 
      'presence_penalty'
    ];
    
    // 非 embedding 模型通常支持工具调用
    if (!lowerName.includes('embedding') && !lowerName.includes('embed')) {
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
        modality: 'chat'
      },
      supported_parameters: supportedParameters,
      description: `Local model: ${modelId}`,
      created: model.created || Date.now(),
      _raw: model
    };
  }

  /**
   * 检测模型能力
   */
  async detectCapabilities(modelName) {
    const lowerName = modelName.toLowerCase();
    
    return {
      vision: lowerName.includes('vision') || 
              lowerName.includes('llava') || 
              lowerName.includes('vl'),
      audio: lowerName.includes('audio') || lowerName.includes('whisper'),
      streaming: true, // LM Studio 始终支持流式
      tools: !lowerName.includes('embedding') && 
             !lowerName.includes('embed')
    };
  }
}

// 导出
window.LMStudioAdapter = LMStudioAdapter;
