// AI API 管理器 - LangChain 兼容接口
class AIManager {
  constructor() {
    this.providers = new Map();
    this.currentProvider = null;
  }

  // 注册提供商
  registerProvider(name, config) {
    this.providers.set(name, {
      name,
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      models: config.models || [],
      defaultModel: config.defaultModel,
      supportsStreaming: config.supportsStreaming !== false,
      supportsVision: config.supportsVision || false,
      supportsTools: config.supportsTools || false
    });
  }

  // 设置当前提供商
  setProvider(name) {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    this.currentProvider = provider;
  }

  // 发送聊天请求（标准接口）
  async invoke(messages, options = {}) {
    const { 
      model = this.currentProvider.defaultModel,
      stream = false,
      temperature = 0.7,
      maxTokens,
      tools,
      toolChoice,
      responseFormat
    } = options;

    if (!this.currentProvider) {
      throw new Error('No provider selected');
    }

    // 构建完整的 API URL
    let endpoint = this.currentProvider.endpoint;
    if (!endpoint.includes('/chat/completions')) {
      endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
    }

    // 构建请求体
    const requestBody = {
      model,
      messages: this.formatMessages(messages),
      temperature,
      stream
    };

    if (maxTokens) requestBody.max_tokens = maxTokens;
    if (tools) requestBody.tools = tools;
    if (toolChoice) requestBody.tool_choice = toolChoice;
    if (responseFormat) requestBody.response_format = responseFormat;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.currentProvider.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.error?.message || 'API request failed');
      } catch (e) {
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
    }

    if (stream) {
      return this.handleStream(response);
    } else {
      const data = await response.json();
      return this.parseResponse(data);
    }
  }

  // 流式调用
  async stream(messages, options = {}, onChunk) {
    const stream = await this.invoke(messages, { ...options, stream: true });
    
    for await (const chunk of stream) {
      if (onChunk) {
        onChunk(chunk);
      }
    }
  }

  // 处理流式响应
  async *handleStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const chunk = this.parseStreamChunk(data);
            if (chunk) {
              yield chunk;
            }
          } catch (e) {
            console.warn('[AIManager] Failed to parse stream chunk:', e);
          }
        }
      }
    }
  }

  // 格式化消息（支持文本、图片、文件等）
  formatMessages(messages) {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content
        };
      }
      
      // 多模态内容
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content.map(item => {
            if (item.type === 'text') {
              return { type: 'text', text: item.text };
            }
            if (item.type === 'image_url') {
              return {
                type: 'image_url',
                image_url: {
                  url: item.imageUrl,
                  detail: item.detail || 'auto'
                }
              };
            }
            if (item.type === 'file') {
              return {
                type: 'file',
                file: {
                  filename: item.filename,
                  data: item.data,
                  mimeType: item.mimeType
                }
              };
            }
            return item;
          })
        };
      }
      
      return msg;
    });
  }

  // 解析响应
  parseResponse(data) {
    const choice = data.choices[0];
    const message = choice.message;
    
    return {
      content: message.content,
      role: message.role,
      toolCalls: message.tool_calls || [],
      finishReason: choice.finish_reason,
      usage: data.usage,
      model: data.model
    };
  }

  // 解析流式片段
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

  // 获取可用模型列表
  getModels() {
    if (!this.currentProvider) {
      return [];
    }
    return this.currentProvider.models;
  }

  // 检查功能支持
  supportsFeature(feature) {
    if (!this.currentProvider) return false;
    
    switch (feature) {
      case 'streaming':
        return this.currentProvider.supportsStreaming;
      case 'vision':
        return this.currentProvider.supportsVision;
      case 'tools':
        return this.currentProvider.supportsTools;
      default:
        return false;
    }
  }
}

// 导出单例
window.AIManager = AIManager;
