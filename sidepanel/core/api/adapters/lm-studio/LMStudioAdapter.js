// LM Studio API 适配器
// 使用 LM Studio 原生 v1 REST API 标准
// Base URL: http://localhost:1234
// API 端点: /api/v1/chat, /api/v1/models
// 参考: https://lmstudio.ai/docs/developer/rest

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
   * LM Studio 原生 v1 API: Base URL + /api/v1/ + path
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
   * LM Studio 原生 v1 API: POST /api/v1/chat
   * 参考: https://lmstudio.ai/docs/developer/rest/chat
   */
  buildRequestBody(params) {
    // LM Studio 原生 API 使用不同的字段名
    const baseBody = {
      model: params.model || this.config.defaultModel,
      input: params.messages, // 原生 API 使用 'input' 而不是 'messages'
      stream: params.stream ?? false
    };
    
    // 添加可选参数
    if (params.temperature !== undefined) {
      baseBody.temperature = params.temperature;
    }
    
    if (params.maxTokens) {
      baseBody.max_output_tokens = params.maxTokens; // 原生 API 使用 'max_output_tokens'
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
    
    // 系统提示（原生 API 支持）
    if (params.systemPrompt) {
      baseBody.system_prompt = params.systemPrompt;
    }
    
    // 上下文长度（原生 API 特有）
    if (params.contextLength) {
      baseBody.context_length = params.contextLength;
    }
    
    // 推理设置（原生 API 特有）
    if (params.reasoning) {
      baseBody.reasoning = params.reasoning;
    }
    
    // 存储对话（原生 API 特有）
    if (params.store !== undefined) {
      baseBody.store = params.store;
    }
    
    // 之前的响应 ID（用于有状态对话）
    if (params.previousResponseId) {
      baseBody.previous_response_id = params.previousResponseId;
    }
    
    return baseBody;
  }

  /**
   * 解析响应
   * LM Studio 原生 API 响应格式:
   * {
   *   "model_instance_id": "...",
   *   "output": [...],
   *   "stats": {...},
   *   "response_id": "resp_..."
   * }
   */
  parseResponse(data) {
    // 原生 API 返回 output 数组
    if (data.output && Array.isArray(data.output)) {
      // 找到第一个 message 类型的输出
      const messageOutput = data.output.find(item => item.type === 'message');
      const reasoningOutputs = data.output.filter(item => item.type === 'reasoning');
      const toolCalls = data.output.filter(item => item.type === 'tool_call');
      
      return {
        content: messageOutput?.content || '',
        reasoning_content: reasoningOutputs.map(r => r.content).join(''),
        role: 'assistant',
        toolCalls: toolCalls.map(tc => ({
          id: tc.tool,
          type: 'function',
          function: {
            name: tc.tool,
            arguments: JSON.stringify(tc.arguments)
          }
        })),
        finishReason: 'stop',
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
        toolCalls: choice.message.tool_calls || [],
        finishReason: choice.finish_reason,
        usage: data.usage,
        model: data.model
      };
    }
    
    throw new Error('Unexpected response format');
  }

  /**
   * 解析流式片段
   * LM Studio 原生 API 流式响应使用 SSE 格式
   * 参考: https://lmstudio.ai/docs/developer/rest/streaming-events
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
            toolCalls: [],
            finishReason: data.finish_reason || null
          };
        case 'reasoning_chunk':
          return {
            content: '',
            reasoning_content: data.output || '',
            role: 'assistant',
            toolCalls: [],
            finishReason: null
          };
        case 'tool_call_start':
        case 'tool_call_end':
          return {
            content: '',
            reasoning_content: '',
            role: 'assistant',
            toolCalls: data.tool_call ? [data.tool_call] : [],
            finishReason: null
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
        toolCalls: choice.delta.tool_calls || [],
        finishReason: choice.finish_reason
      };
    }
    
    return null;
  }

  /**
   * 获取聊天端点
   */
  getChatEndpoint() {
    return '/chat'; // 相对于 /api/v1
  }

  /**
   * 构建请求体
   * LM Studio 原生 v1 API: POST /api/v1/chat
   * 参考: https://lmstudio.ai/docs/developer/rest/chat
   */
  buildRequestBody(params) {
    // LM Studio 原生 API 使用不同的字段名
    const baseBody = {
      model: params.model || this.config.defaultModel,
      input: params.messages, // 原生 API 使用 'input' 而不是 'messages'
      stream: params.stream ?? false
    };
    
    // 添加可选参数
    if (params.temperature !== undefined) {
      baseBody.temperature = params.temperature;
    }
    
    if (params.maxTokens) {
      baseBody.max_output_tokens = params.maxTokens; // 原生 API 使用 'max_output_tokens'
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
    
    // 系统提示（原生 API 支持）
    if (params.systemPrompt) {
      baseBody.system_prompt = params.systemPrompt;
    }
    
    // 上下文长度（原生 API 特有）
    if (params.contextLength) {
      baseBody.context_length = params.contextLength;
    }
    
    // 推理设置（原生 API 特有）
    if (params.reasoning) {
      baseBody.reasoning = params.reasoning;
    }
    
    // 存储对话（原生 API 特有）
    if (params.store !== undefined) {
      baseBody.store = params.store;
    }
    
    // 之前的响应 ID（用于有状态对话）
    if (params.previousResponseId) {
      baseBody.previous_response_id = params.previousResponseId;
    }
    
    return baseBody;
  }

  /**
   * 拉取模型列表
   * GET /api/v1/models
   * @returns {Array} 返回完整的模型数据数组
   */
  async fetchModels(apiEndpoint, apiKey) {
    try {
      const modelsUrl = this.buildUrl('/models');
      
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
   * 为 LM Studio 模型添加详细的元数据
   * 根据官方文档: https://lmstudio.ai/docs/developer/rest/list
   */
  enrichModelData(model) {
    // LM Studio 原生 API 字段:
    // - key: 唯一标识符 (如 "google/gemma-4-26b-a4b")
    // - display_name: 人类可读名称 (如 "Gemma 4 26B A4B")
    // - publisher: 发布者 (如 "google")
    // - type: "llm" 或 "embedding"
    // - architecture: 架构 (如 "gemma4", "llama")
    // - capabilities.vision: 是否支持视觉
    // - max_context_length: 最大上下文长度
    
    const modelId = String(model.key || model.id || model);
    const modelName = model.display_name || model.name || modelId;
    const lowerName = modelId.toLowerCase();
    
    // 从官方 API 获取上下文长度
    const contextLength = model.max_context_length || 
                          (model.loaded_instances && model.loaded_instances.length > 0 ? 
                           model.loaded_instances[0].config?.context_length : null) ||
                          8192; // 默认值
    
    // 检测输入模态
    const inputModalities = ['text'];
    if (model.capabilities?.vision || 
        lowerName.includes('vision') || 
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
    if (model.type !== 'embedding' && 
        !lowerName.includes('embedding') && 
        !lowerName.includes('embed')) {
      supportedParameters.push('tools', 'tool_choice');
    }
    
    // 构建增强的模型信息
    return {
      id: modelId,
      object: 'model',
      owned_by: model.publisher || 'local',
      name: modelName,
      type: model.type || 'llm',
      context_length: contextLength,
      pricing: null, // 本地模型免费
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
      supported_parameters: supportedParameters,
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
