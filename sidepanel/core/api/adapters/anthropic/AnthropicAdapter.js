// Anthropic Claude API 适配器
// 支持 Anthropic 的 API 接口

class AnthropicAdapter {
  constructor() {
    this.name = 'anthropic';
    this.config = null;
  }

  /**
   * 配置适配器
   */
  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'https://api.anthropic.com/v1',
      apiKey: config.apiKey || '',
      defaultModel: config.defaultModel || 'claude-3-opus-20240229',
      apiVersion: '2023-06-01',
      ...config
    };
    console.log('[AnthropicAdapter] Configured:', this.config);
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
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': this.config.apiVersion || '2023-06-01',
      'anthropic-beta': 'tools-2024-05-16',
      ...customHeaders
    };
  }

  /**
   * 格式化聊天消息
   */
  formatMessages(messages) {
    // Anthropic 使用不同的消息格式，system 消息需要单独处理
    return messages.map(msg => {
      if (msg.role === 'system') {
        return null; // system 消息在 buildRequestBody 中单独处理
      }
      
      // 处理 tool 消息（Anthropic 使用 user 角色 + tool_result 内容块）
      if (msg.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id,
              content: msg.content
            }
          ]
        };
      }
      
      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
        // Anthropic 不直接使用 tool_calls 字段，而是放在 content 中
      };
    }).filter(Boolean);
  }

  /**
   * 构建请求体
   */
  buildRequestBody(params) {
    // Anthropic 需要将 system 消息提取出来
    const systemMsg = params.messages.find(m => m.role === 'system');
    const otherMessages = params.messages.filter(m => m.role !== 'system');
    
    return {
      model: params.model || this.config.defaultModel,
      messages: otherMessages,
      ...(systemMsg && { 
        system: typeof systemMsg.content === 'string' ? systemMsg.content : '' 
      }),
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? false,
      max_tokens: params.maxTokens || 4096, // Anthropic 必需参数
      // Anthropic 工具定义格式转换
      ...(params.tools && { 
        tools: this.convertToolsForAnthropic(params.tools) 
      }),
      ...(params.toolChoice && { tool_choice: params.toolChoice })
    };
  }

  /**
   * 将 OpenAI 标准工具定义转换为 Anthropic 格式
   */
  convertToolsForAnthropic(openaiTools) {
    if (!openaiTools || !Array.isArray(openaiTools)) {
      return openaiTools;
    }
    
    return openaiTools.map(tool => {
      if (tool.type === 'function') {
        return {
          name: tool.function.name,
          description: tool.function.description || '',
          input_schema: tool.function.parameters || {
            type: 'object',
            properties: {},
            required: []
          }
        };
      }
      return tool;
    });
  }

  /**
   * 解析响应
   */
  parseResponse(data) {
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
  }

  /**
   * 解析流式片段
   */
  parseStreamChunk(data) {
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
  }

  /**
   * 获取模型列表端点
   */
  getModelsEndpoint() {
    // Anthropic 没有公开的模型列表 API
    return null;
  }

  /**
   * 拉取模型列表
   * @returns {Array} 返回完整的模型数据数组
   */
  async fetchModels(apiEndpoint, apiKey) {
    // Anthropic 不提供公开的模型列表 API
    // 返回预定义的模型列表，包含详细信息
    console.warn('[AnthropicAdapter] Anthropic does not provide a public models API endpoint');
    
    const models = [
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Anthropic 最强大的模型，适合复杂任务',
        context_length: 200000,
        architecture: {
          input_modalities: ['text', 'image'],
          output_modalities: ['text']
        },
        pricing: { prompt: '0.000015', completion: '0.000075' }
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        description: '平衡性能和成本的模型',
        context_length: 200000,
        architecture: {
          input_modalities: ['text', 'image'],
          output_modalities: ['text']
        },
        pricing: { prompt: '0.000003', completion: '0.000015' }
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: '最快最便宜的模型',
        context_length: 200000,
        architecture: {
          input_modalities: ['text', 'image'],
          output_modalities: ['text']
        },
        pricing: { prompt: '0.00000025', completion: '0.00000125' }
      },
      {
        id: 'claude-2.1',
        name: 'Claude 2.1',
        description: '上一代模型',
        context_length: 200000,
        architecture: {
          input_modalities: ['text'],
          output_modalities: ['text']
        },
        pricing: { prompt: '0.000008', completion: '0.000024' }
      }
    ];
    
    return models;
  }

  /**
   * 检测模型能力
   */
  async detectCapabilities(modelName) {
    // Anthropic 模型能力可以通过名称推断
    const lowerName = modelName.toLowerCase();
    
    return {
      vision: lowerName.includes('opus') || lowerName.includes('sonnet'),
      audio: false,
      streaming: true,
      tools: !lowerName.includes('instant')
    };
  }
}

// 导出
window.AnthropicAdapter = AnthropicAdapter;
