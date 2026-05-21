/**
 * LM Studio Service
 * 
 * 基于 LMStudioAdapter 实现
 * 使用 LM Studio 原生 v1 REST API 标准
 */

class LMStudioService extends window.IProviderAPIService {
  constructor() {
    super();
    this.name = 'lm-studio';
  }

  /**
   * 配置服务
   */
  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'http://localhost:1234',
      apiKey: '',
      defaultModel: config.defaultModel || 'local-model',
      ...config
    };
    console.log('[LMStudioService] Configured:', this.config);
  }

  /**
   * 构建 API URL
   */
  buildUrl(path) {
    const cleanBase = this.config.endpoint.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    // LM Studio 支持两种 API 模式：
    // 1. /api/v1/chat - LM Studio 专有格式（简化版）
    // 2. /v1/chat/completions - OpenAI 兼容格式（推荐用于多轮对话）
    
    if (path === '/chat') {
      // 使用 OpenAI 兼容端点
      return `${cleanBase}/v1/chat/completions`;
    }
    
    if (cleanBase.includes('/api/v1')) {
      return `${cleanBase}${cleanPath}`;
    }
    
    return `${cleanBase}/api/v1${cleanPath}`;
  }

  /**
   * 构建请求头
   */
  buildHeaders() {
    return {
      'Content-Type': 'application/json'
    };
  }

  /**
   * 格式化消息
   */
  formatMessages(messages) {
    if (!messages || !Array.isArray(messages)) return [];
    
    const { MessageStructure } = window.MessageContent;
    // 使用 OpenAI 兼容格式
    return messages.map(msg => MessageStructure.toAPIFormat(msg, 'openai'));
  }

  /**
   * 构建请求体
   * @param {MessagesRequest} request - 统一请求对象
   */
  buildRequestBody(request) {
    // 使用 OpenAI 兼容格式
    const baseBody = {
      model: request.model || this.config.defaultModel,
      messages: this.formatMessages(request.messages || []),
      stream: request.stream ?? false
    };
    
    if (request.temperature !== undefined) {
      baseBody.temperature = request.temperature;
    }
    
    if (request.maxTokens) {
      baseBody.max_tokens = request.maxTokens;
    }
    
    // 处理系统提示词
    if (request.system) {
      baseBody.messages.unshift({
        role: 'system',
        content: request.system
      });
    }

    // 思考模式配置 (LM Studio v1 兼容 OpenAI o1/o3 格式)
    // LM Studio 需要始终发送 reasoning_effort 参数，包括 'off'
    if (request.reasoningEffort !== undefined) {
      baseBody.reasoning_effort = request.reasoningEffort || 'off';
    }
    
    return baseBody;
  }

  /**
   * 解析响应
   */
  parseResponse(data) {
    // LM Studio v1 API 格式：output 数组包含不同类型的输出项
    if (data.output && Array.isArray(data.output)) {
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
          total_tokens: data.stats.input_tokens + data.stats.total_output_tokens,
          reasoning_tokens: data.stats.reasoning_output_tokens || 0
        } : undefined,
        model: data.model_instance_id,
        response_id: data.response_id
      };
    }
    
    // OpenAI 兼容格式
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      return {
        content: choice.message.content,
        reasoning_content: choice.message.reasoning_content || '',
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
   */
  parseStreamChunk(data) {
    // LM Studio v1 API 流式格式
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
          // 专门的推理内容块
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
    
    // OpenAI 兼容流式格式
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      if (!choice || !choice.delta) return null;
      
      // 支持多种 reasoning 字段名称
      const reasoningContent = choice.delta.reasoning || 
                               choice.delta.reasoning_content || 
                               choice.delta.thinking || '';
      
      return {
        content: choice.delta.content || '',
        reasoning_content: reasoningContent,
        role: choice.delta.role,
        toolCalls: choice.delta.tool_calls || [],
        finishReason: choice.finish_reason
      };
    }
    
    return null;
  }

  /**
   * 发送聊天请求（非流式）
   * @param {MessagesRequest} request - 统一请求对象
   */
  chat(request) {
    const url = this.buildUrl('/chat');
    const headers = this.buildHeaders();
    
    request.stream = false;
    const body = this.buildRequestBody(request);
    
    this.abortController = new AbortController();
    
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: this.abortController.signal
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(errorText => {
          throw new Error(`LM Studio API error: ${response.status} - ${errorText}`);
        });
      }
      return response.json();
    })
    .then(data => {
      return this.parseResponse(data);
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        console.log('[LMStudioService] Request cancelled');
      } else {
        console.error('[LMStudioService] Chat error:', error);
        throw error;
      }
    })
    .finally(() => {
      this.abortController = null;
    });
  }

  /**
   * 发送流式聊天请求
   * @param {MessagesRequest} request - 统一请求对象
   * @param {Function} onChunk - 片段回调
   * @param {Function} onComplete - 完成回调
   */
  chatStream(request, onChunk, onComplete) {
    const url = this.buildUrl('/chat');
    const headers = this.buildHeaders();
    
    request.stream = true;
    const body = this.buildRequestBody(request);
    
    this.abortController = new AbortController();
    
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: this.abortController.signal
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(errorText => {
          throw new Error(`LM Studio API error: ${response.status} - ${errorText}`);
        });
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      const processStream = () => {
        return reader.read().then(({ done, value }) => {
          if (done) {
            if (onComplete) onComplete();
            return;
          }
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const parsed = this.parseStreamChunk(json);
                if (parsed && onChunk) onChunk(parsed);
              } catch (e) {
                console.warn('[LMStudioService] Failed to parse chunk:', e);
              }
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
      } else {
        console.error('[LMStudioService] Stream error:', error);
        throw error;
      }
    })
    .finally(() => {
      this.abortController = null;
    });
  }

  /**
   * 取消请求
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 列出可用模型
   */
  listModels() {
    // 优先尝试 LM Studio v1 API (0.4.0+), 失败则回退到 OpenAI 兼容模式
    const endpoints = [
      '/api/v1/models', // Native v1 API
      '/v1/models'      // OpenAI compatible mode
    ];

    const tryEndpoint = (index) => {
      if (index >= endpoints.length) {
        return Promise.reject(new Error('Failed to fetch models from any LM Studio endpoint'));
      }

      const path = endpoints[index];
      const url = this.config.endpoint.replace(/\/$/, '') + path;
      
      return fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(response => {
        if (!response.ok) {
          return tryEndpoint(index + 1);
        }
        return response.json();
      })
      .then(result => {
        // 处理不同版本的响应格式
        let modelsArray = [];
        if (result.data && Array.isArray(result.data)) {
          modelsArray = result.data; // OpenAI 兼容格式
        } else if (result.models && Array.isArray(result.models)) {
          modelsArray = result.models; // LM Studio v1 格式
        }

        if (modelsArray.length > 0) {
          return modelsArray.map(model => {
            // LM Studio v1 特有字段映射
            const contextLength = model.max_context_length || model.context_length || model.contextWindow || null;
            const maxOutputTokens = model.max_output_tokens || model.maxTokens || null;
            const quantization = model.quantization || model.quant || null;
            const architecture = model.architecture || model.arch || null;
            const publisher = model.publisher || model.owner || 'local';
            const type = model.type || 'llm';
            const state = model.state || 'not-loaded';
            const paramsString = model.params_string || model.parameter_size || null;
            const sizeBytes = model.size_bytes || model.model_size || null;

            return {
              id: model.key || model.id,
              name: model.name || model.key || model.id,
              context_length: contextLength,
              max_output_tokens: maxOutputTokens,
              owned_by: publisher,
              created: model.created || Math.floor(Date.now() / 1000),
              modality: (model.input_modalities && model.input_modalities.includes('image')) ? 'text+image->text' : 'text->text',
              supports_reasoning: !!model.capabilities?.reasoning || false,
              supports_tools: !!model.capabilities?.toolUse || false,
              pricing: { prompt: 0, completion: 0 }, // 本地模型免费
              // 额外元数据，用于 Model 对象构建
              _metadata: {
                quantization,
                architecture,
                type,
                state,
                paramsString,
                sizeBytes
              },
              ...model
            };
          });
        }
        
        return tryEndpoint(index + 1);
      })
      .catch(error => {
        console.warn(`[LMStudioService] Failed to fetch from ${path}:`, error);
        return tryEndpoint(index + 1);
      });
    };

    return tryEndpoint(0);
  }

  /**
   * 获取单个模型的详细信息
   * @param {string} modelId - 模型 ID
   * @returns {Promise<Object>} 模型详细信息
   */
  getModelDetails(modelId) {
    // LM Studio 没有单独的模型详情 API
    // 通过 listModels 获取所有模型，然后查找指定模型
    return this.listModels()
    .then(models => {
      const model = models.find(m => m.id === modelId);
      
      if (!model) {
        console.warn(`[LMStudioService] Model ${modelId} not found`);
        return null;
      }
      
      return model;
    })
    .catch(error => {
      console.error('[LMStudioService] Failed to get model details:', error);
      return null;
    });
  }
}

window.LMStudioService = LMStudioService;