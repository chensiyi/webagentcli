/**
 * LMStudioAdapter - LM Studio API 适配器
 * 
 * 实现 ProtocolAdapter 接口，负责业务模型与 LM Studio 原生 API 格式之间的转换。
 * 参考: https://lmstudio.ai/docs/developer/rest
 */

class LMStudioAdapter extends ProtocolAdapter {
  constructor() {
    super();
    this.name = 'lm-studio';
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

  // ==================== URL 构建 ====================

  /**
   * 构建完整 URL
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
   * 获取聊天端点路径
   */
  getChatEndpoint() {
    return '/chat'; // LM Studio 原生 API 使用 /api/v1/chat
  }

  /**
   * 获取模型列表端点路径
   */
  getModelsEndpoint() {
    return '/models';
  }

  // ==================== 请求构建 ====================

  /**
   * 构建 HTTP 请求头
   */
  buildHeaders(customHeaders = {}) {
    return {
      'Content-Type': 'application/json',
      ...customHeaders
    };
  }

  /**
   * 构建请求体（业务参数 → LM Studio 原生格式）
   */
  buildRequestBody(params) {
    const baseBody = {
      model: params.model || this.config.defaultModel,
      input: params.messages, // LM Studio 使用 'input' 而不是 'messages'
      stream: params.stream ?? false
    };
    
    // 添加可选参数
    if (params.temperature !== undefined) {
      baseBody.temperature = params.temperature;
    }
    
    if (params.maxTokens) {
      baseBody.max_output_tokens = params.maxTokens;
    }
    
    if (params.top_p !== undefined) {
      baseBody.top_p = params.top_p;
    }
    
    if (params.top_k !== undefined) {
      baseBody.top_k = params.top_k;
    }
    
    if (params.min_p !== undefined) {
      baseBody.min_p = params.min_p;
    }
    
    if (params.repeat_penalty !== undefined) {
      baseBody.repeat_penalty = params.repeat_penalty;
    }
    
    if (params.systemPrompt) {
      baseBody.system_prompt = params.systemPrompt;
    }
    
    if (params.contextLength) {
      baseBody.context_length = params.contextLength;
    }
    
    if (params.reasoning) {
      baseBody.reasoning = params.reasoning;
    }
    
    if (params.store !== undefined) {
      baseBody.store = params.store;
    }
    
    if (params.previousResponseId) {
      baseBody.previous_response_id = params.previousResponseId;
    }
    
    return baseBody;
  }

  // ==================== 响应解析 ====================

  /**
   * 解析非流式响应（LM Studio 格式 → 业务模型）
   */
  parseResponse(data) {
    // 原生 API 返回 output 数组
    if (data.output && Array.isArray(data.output)) {
      const messageOutput = data.output.find(item => item.type === 'message');
      const reasoningOutputs = data.output.filter(item => item.type === 'reasoning');
      const toolCalls = data.output.filter(item => item.type === 'tool_call');
      
      return {
        content: messageOutput?.content || '',
        reasoning_content: reasoningOutputs.map(r => r.content).join(''),
        role: 'assistant',
        tool_calls: toolCalls.map(tc => ({
          id: tc.tool,
          type: 'function',
          function: {
            name: tc.tool,
            arguments: JSON.stringify(tc.arguments)
          }
        })),
        finish_reason: 'stop',
        usage: data.stats ? {
          prompt_tokens: data.stats.input_tokens,
          completion_tokens: data.stats.total_output_tokens,
          total_tokens: data.stats.input_tokens + data.stats.total_output_tokens
        } : undefined,
        model: data.model_instance_id,
        response_id: data.response_id
      };
    }
    
    // OpenAI 兼容格式回退
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      return {
        content: choice.message.content,
        role: choice.message.role,
        tool_calls: choice.message.tool_calls || [],
        finish_reason: choice.finish_reason,
        usage: data.usage,
        model: data.model
      };
    }
    
    throw new Error('Unexpected response format');
  }

  /**
   * 解析流式响应片段
   */
  parseStreamChunk(data) {
    // 原生 API 流式格式
    if (data.type && data.output !== undefined) {
      switch (data.type) {
        case 'chunk':
          return {
            content: data.output || '',
            reasoning_content: '',
            role: 'assistant',
            tool_calls: [],
            finish_reason: data.finish_reason || null
          };
        case 'reasoning_chunk':
          return {
            content: '',
            reasoning_content: data.output || '',
            role: 'assistant',
            tool_calls: [],
            finish_reason: null
          };
        case 'tool_call_start':
        case 'tool_call_end':
          return {
            content: '',
            reasoning_content: '',
            role: 'assistant',
            tool_calls: data.tool_call ? [data.tool_call] : [],
            finish_reason: null
          };
        default:
          return null;
      }
    }
    
    // OpenAI 兼容格式回退
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      if (!choice || !choice.delta) return null;
      
      return {
        content: choice.delta.content || '',
        reasoning_content: choice.delta.reasoning_content || choice.delta.thinking || '',
        role: choice.delta.role,
        tool_calls: choice.delta.tool_calls || [],
        finish_reason: choice.finish_reason
      };
    }
    
    return null;
  }

  // ==================== 模型管理 ====================

  /**
   * 拉取模型列表
   */
  async fetchModels(apiEndpoint, apiKey) {
    try {
      const modelsUrl = this.buildUrl(this.getModelsEndpoint());
      
      console.log('[LMStudioAdapter] Fetching models from:', modelsUrl);
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      const result = await response.json();
      
      // LM Studio 原生 API 格式: { models: [...] }
      if (result.models && Array.isArray(result.models)) {
        console.log('[LMStudioAdapter] Found', result.models.length, 'models');
        return result.models.map(model => this.enrichModelData(model));
      }
      
      // OpenAI 兼容格式: { data: [...] }
      if (result.data && Array.isArray(result.data)) {
        console.log('[LMStudioAdapter] Found', result.data.length, 'models (OpenAI format)');
        return result.data.map(model => this.enrichModelData(model));
      }
      
      console.warn('[LMStudioAdapter] Unexpected response format:', result);
      return [];
    } catch (error) {
      console.error('[LMStudioAdapter] Failed to fetch models:', error);
      throw error;
    }
  }

  /**
   * 为模型数据添加增强的元信息
   */
  enrichModelData(model) {
    const modelId = String(model.key || model.id || model);
    const modelName = model.display_name || model.name || modelId;
    
    const contextLength = model.max_context_length || 
                          (model.loaded_instances && model.loaded_instances.length > 0 ? 
                           model.loaded_instances[0].config?.context_length : null) ||
                          8192;
    
    const inputModalities = ['text'];
    if (model.capabilities?.vision || 
        modelId.toLowerCase().includes('vision') || 
        modelId.toLowerCase().includes('llava')) {
      inputModalities.push('image');
    }
    
    return {
      id: modelId,
      object: 'model',
      owned_by: model.publisher || 'local',
      name: modelName,
      type: model.type || 'llm',
      context_length: contextLength,
      pricing: null,
      architecture: {
        modality: model.architecture || 'unknown',
        input_modalities: inputModalities,
        output_modalities: ['text']
      },
      capabilities: {
        vision: model.capabilities?.vision || false,
        tool_use: model.capabilities?.trained_for_tool_use || false,
        reasoning: model.capabilities?.reasoning || null
      },
      quantization: model.quantization || null,
      size_bytes: model.size_bytes || null,
      params_string: model.params_string || null,
      description: model.description || `Local model: ${modelName}`,
      created: Date.now(),
      _raw: model
    };
  }

  /**
   * 检测模型能力
   */
  async detectCapabilities(modelName) {
    const lowerName = modelName.toLowerCase();
    
    return {
      vision: lowerName.includes('vision') || lowerName.includes('llava'),
      audio: lowerName.includes('audio'),
      streaming: true,
      tools: !lowerName.includes('embedding')
    };
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.LMStudioAdapter = LMStudioAdapter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LMStudioAdapter;
}
