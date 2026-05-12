// API 提供商适配器
// 支持 OpenAI、LM Studio、Ollama 等不同标准的统一配置

class ProviderAdapter {
  constructor() {
    // 预定义的适配器模板
    this.templates = new Map([
      ['openai', this.createOpenAITemplate()],
      ['lm-studio', this.createLMStudioTemplate()],
      ['ollama', this.createOllamaTemplate()],
      ['openrouter', this.createOpenRouterTemplate()],
      ['anthropic', this.createAnthropicTemplate()]
    ]);
    
    // 当前使用的适配器
    this.currentAdapter = null;
    this.config = null;
  }

  /**
   * 选择适配器模板
   * @param {string} templateName - 模板名称
   */
  selectTemplate(templateName) {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Unknown adapter template: ${templateName}`);
    }
    this.currentAdapter = template;
    console.log(`[ProviderAdapter] Selected template: ${templateName}`);
  }

  /**
   * 配置适配器
   * @param {Object} config - 配置对象
   */
  configure(config) {
    if (!this.currentAdapter) {
      throw new Error('No adapter selected. Call selectTemplate first.');
    }
    
    this.config = {
      ...this.currentAdapter.defaults,
      ...config
    };
    
    console.log('[ProviderAdapter] Configured:', this.config);
  }

  /**
   * 构建 API URL
   */
  buildUrl(endpoint, path) {
    const baseUrl = endpoint || this.config?.endpoint;
    if (!baseUrl) {
      throw new Error('No endpoint configured');
    }
    
    // 如果 endpoint 已经包含完整路径，直接使用
    if (endpoint && endpoint.includes(path)) {
      return endpoint;
    }
    
    // 否则拼接路径
    const cleanBase = baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  /**
   * 构建请求头
   */
  buildHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...this.currentAdapter?.headers(this.config),
      ...customHeaders
    };
    
    return headers;
  }

  /**
   * 格式化聊天消息
   */
  formatMessages(messages) {
    if (!this.currentAdapter) {
      throw new Error('No adapter selected');
    }
    
    return this.currentAdapter.formatMessages(messages, this.config);
  }

  /**
   * 构建请求体
   */
  buildRequestBody(params) {
    if (!this.currentAdapter) {
      throw new Error('No adapter selected');
    }
    
    return this.currentAdapter.buildRequestBody(params, this.config);
  }

  /**
   * 解析响应
   */
  parseResponse(data) {
    if (!this.currentAdapter) {
      throw new Error('No adapter selected');
    }
    
    return this.currentAdapter.parseResponse(data);
  }

  /**
   * 解析流式片段
   */
  parseStreamChunk(data) {
    if (!this.currentAdapter) {
      throw new Error('No adapter selected');
    }
    
    return this.currentAdapter.parseStreamChunk(data);
  }

  /**
   * 获取模型列表的端点
   */
  getModelsEndpoint() {
    return this.currentAdapter?.endpoints?.models || '/v1/models';
  }

  /**
   * 检测模型能力
   */
  async detectCapabilities(modelName) {
    if (!this.currentAdapter?.detectCapabilities) {
      return null;
    }
    
    return await this.currentAdapter.detectCapabilities(modelName, this.config);
  }

  // ==================== 适配器模板 ====================

  /**
   * OpenAI 标准适配器
   */
  createOpenAITemplate() {
    return {
      name: 'openai',
      defaults: {
        apiVersion: 'v1',
        chatPath: '/chat/completions',
        modelsPath: '/models'
      },
      headers: (config) => ({
        'Authorization': `Bearer ${config.apiKey || ''}`
      }),
      formatMessages: (messages) => messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls })
      })),
      buildRequestBody: (params, config) => ({
        model: params.model || config.defaultModel,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        stream: params.stream ?? false,
        ...(params.maxTokens && { max_tokens: params.maxTokens }),
        ...(params.tools && { tools: params.tools }),
        ...(params.toolChoice && { tool_choice: params.toolChoice })
      }),
      parseResponse: (data) => {
        const choice = data.choices[0];
        return {
          content: choice.message.content,
          role: choice.message.role,
          toolCalls: choice.message.tool_calls || [],
          finishReason: choice.finish_reason,
          usage: data.usage,
          model: data.model
        };
      },
      parseStreamChunk: (data) => {
        const choice = data.choices[0];
        if (!choice || !choice.delta) return null;
        
        return {
          content: choice.delta.content || '',
          role: choice.delta.role,
          toolCalls: choice.delta.tool_calls || [],
          finishReason: choice.finish_reason
        };
      },
      endpoints: {
        models: '/v1/models'
      }
    };
  }

  /**
   * LM Studio 适配器
   * 使用 LM Studio 原生 Server API 标准 (Base URL 通常为 http://localhost:1234)
   * 参考: https://lmstudio.ai/docs/api/server
   */
  createLMStudioTemplate() {
    return {
      name: 'lm-studio',
      defaults: {
        apiVersion: 'api/v1',
        chatPath: '/api/v1/chat/completions',
        modelsPath: '/api/v1/models',
        apiKey: 'not-needed' // LM Studio 通常不需要 API Key
      },
      headers: (config) => ({}), // 无需认证
      formatMessages: (messages) => messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls })
      })),
      buildRequestBody: (params, config) => ({
        model: params.model || config.defaultModel || 'local-model',
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        stream: params.stream ?? false,
        ...(params.maxTokens && { max_tokens: params.maxTokens }),
        ...(params.tools && { tools: params.tools })
      }),
      parseResponse: (data) => {
        const choice = data.choices[0];
        return {
          content: choice.message.content,
          role: choice.message.role,
          toolCalls: choice.message.tool_calls || [],
          finishReason: choice.finish_reason,
          usage: data.usage,
          model: data.model
        };
      },
      parseStreamChunk: (data) => {
        const choice = data.choices[0];
        if (!choice || !choice.delta) return null;
        
        return {
          content: choice.delta.content || '',
          role: choice.delta.role,
          toolCalls: choice.delta.tool_calls || [],
          finishReason: choice.finish_reason
        };
      },
      endpoints: {
        models: '/api/v1/models'
      },
      detectCapabilities: async (modelName, config) => {
        // LM Studio 本地模型，尝试从 /api/v1/models 获取信息
        try {
          const modelsEndpoint = this.buildUrl(config.endpoint, '/api/v1/models');
          const response = await fetch(modelsEndpoint, {
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (!response.ok) {
            // 默认能力
            return {
              vision: false,
              audio: false,
              streaming: true,
              tools: false
            };
          }
          
          const data = await response.json();
          const model = data.data?.find(m => m.id === modelName);
          
          if (!model) {
            return {
              vision: false,
              audio: false,
              streaming: true,
              tools: false
            };
          }
          
          // LM Studio 模型通常不直接提供能力信息
          // 根据模型名称推断
          const lowerName = modelName.toLowerCase();
          return {
            vision: lowerName.includes('vision') || lowerName.includes('llava'),
            audio: false,
            streaming: true,
            tools: lowerName.includes('function') || lowerName.includes('tool')
          };
        } catch (e) {
          console.warn('[LM Studio] Failed to detect capabilities:', e);
          return {
            vision: false,
            audio: false,
            streaming: true,
            tools: false
          };
        }
      }
    };
  }

  /**
   * Ollama 适配器
   */
  createOllamaTemplate() {
    return {
      name: 'ollama',
      defaults: {
        apiVersion: 'api',
        chatPath: '/api/chat',
        modelsPath: '/api/tags'
      },
      headers: (config) => ({}), // Ollama 通常无需认证
      formatMessages: (messages) => messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls })
      })),
      buildRequestBody: (params, config) => ({
        model: params.model || config.defaultModel,
        messages: params.messages,
        stream: params.stream ?? false,
        options: {
          temperature: params.temperature ?? 0.7,
          ...(params.maxTokens && { num_predict: params.maxTokens })
        },
        ...(params.tools && { tools: params.tools })
      }),
      parseResponse: (data) => {
        // Ollama 非流式响应格式
        return {
          content: data.message?.content || '',
          role: data.message?.role || 'assistant',
          toolCalls: data.message?.tool_calls || [],
          finishReason: data.done ? 'stop' : null,
          model: data.model
        };
      },
      parseStreamChunk: (data) => {
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
      },
      endpoints: {
        models: '/api/tags'
      },
      detectCapabilities: async (modelName, config) => {
        // Ollama 模型能力检测
        // 可以通过 /api/show 端点获取模型详细信息
        try {
          const response = await fetch(`${config.endpoint}/api/show`, {
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
          console.warn('[Ollama] Failed to detect capabilities:', e);
          return null;
        }
      }
    };
  }

  /**
   * OpenRouter 适配器
   */
  createOpenRouterTemplate() {
    return {
      name: 'openrouter',
      defaults: {
        apiVersion: 'v1',
        chatPath: '/chat/completions',
        modelsPath: '/models'
      },
      headers: (config) => ({
        'Authorization': `Bearer ${config.apiKey || ''}`,
        'HTTP-Referer': window.location.href,
        'X-Title': 'WebAgentCLI'
      }),
      formatMessages: (messages) => messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls })
      })),
      buildRequestBody: (params, config) => ({
        model: params.model || config.defaultModel,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        stream: params.stream ?? false,
        ...(params.maxTokens && { max_tokens: params.maxTokens }),
        ...(params.tools && { tools: params.tools }),
        ...(params.toolChoice && { tool_choice: params.toolChoice })
      }),
      parseResponse: (data) => {
        const choice = data.choices[0];
        return {
          content: choice.message.content,
          role: choice.message.role,
          toolCalls: choice.message.tool_calls || [],
          finishReason: choice.finish_reason,
          usage: data.usage,
          model: data.model
        };
      },
      parseStreamChunk: (data) => {
        const choice = data.choices[0];
        if (!choice || !choice.delta) return null;
        
        return {
          content: choice.delta.content || '',
          role: choice.delta.role,
          toolCalls: choice.delta.tool_calls || [],
          finishReason: choice.finish_reason
        };
      },
      endpoints: {
        models: '/v1/models'
      }
    };
  }

  /**
   * Anthropic Claude 适配器
   */
  createAnthropicTemplate() {
    return {
      name: 'anthropic',
      defaults: {
        apiVersion: '2023-06-01',
        chatPath: '/messages',
        modelsPath: null // Anthropic 没有公开的模型列表 API
      },
      headers: (config) => ({
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'tools-2024-05-16'
      }),
      formatMessages: (messages) => {
        // Anthropic 使用不同的消息格式
        return messages.map(msg => {
          if (msg.role === 'system') {
            return null; // system 消息单独处理
          }
          return {
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
            ...(msg.tool_calls && { tool_calls: msg.tool_calls })
          };
        }).filter(Boolean);
      },
      buildRequestBody: (params, config) => {
        // Anthropic 需要将 formattedMessages 中的 system 消息提取出来
        const systemMsg = params.messages.find(m => m.role === 'system');
        const otherMessages = params.messages.filter(m => m.role !== 'system');
        
        return {
          model: params.model || config.defaultModel,
          messages: otherMessages,
          ...(systemMsg && { system: typeof systemMsg.content === 'string' ? systemMsg.content : '' }),
          temperature: params.temperature ?? 0.7,
          stream: params.stream ?? false,
          max_tokens: params.maxTokens || 4096, // Anthropic 必需参数
          ...(params.tools && { tools: params.tools }),
          ...(params.toolChoice && { tool_choice: params.toolChoice })
        };
      },
      parseResponse: (data) => {
        // Anthropic 响应格式
        const content = data.content || [];
        
        // 提取文本内容
        const textContent = content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
        
        // 提取工具调用
        const toolCalls = content
          .filter(c => c.type === 'tool_use')
          .map(c => ({
            id: c.id,
            type: 'function',
            function: {
              name: c.name,
              arguments: JSON.stringify(c.input || {})
            }
          }));
        
        return {
          content: textContent,
          role: 'assistant',
          toolCalls: toolCalls,
          finishReason: data.stop_reason,
          usage: data.usage,
          model: data.model
        };
      },
      parseStreamChunk: (data) => {
        // Anthropic 流式响应事件类型
        if (data.type === 'content_block_start') {
          // 内容块开始（可能是文本或工具调用）
          if (data.content_block?.type === 'tool_use') {
            return {
              content: '',
              role: 'assistant',
              toolCalls: [{
                id: data.content_block.id,
                type: 'function',
                function: {
                  name: data.content_block.name,
                  arguments: ''
                }
              }],
              finishReason: null
            };
          }
          return null;
        }
        
        if (data.type === 'content_block_delta') {
          // 内容增量（文本或工具参数）
          if (data.delta?.type === 'text_delta') {
            return {
              content: data.delta.text || '',
              role: 'assistant',
              toolCalls: [],
              finishReason: null
            };
          }
          if (data.delta?.type === 'input_json_delta') {
            // 工具调用参数增量
            return {
              content: '',
              role: 'assistant',
              toolCalls: [{
                index: data.index,
                function: {
                  arguments: data.delta.partial_json || ''
                }
              }],
              finishReason: null
            };
          }
          return null;
        }
        
        if (data.type === 'message_delta') {
          return {
            content: '',
            role: 'assistant',
            toolCalls: [],
            finishReason: data.delta?.stop_reason
          };
        }
        
        return null;
      },
      endpoints: {
        models: null
      }
    };
  }
}

// 导出
window.ProviderAdapter = ProviderAdapter;
