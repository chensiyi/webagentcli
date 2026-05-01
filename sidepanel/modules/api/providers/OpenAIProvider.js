/**
 * OpenAI Provider - 基于 free-claude-code 的 Provider 模式
 * 
 * 职责：
 * 1. 与 OpenAI 兼容 API 通信
 * 2. 处理流式响应
 * 3. 错误处理和重试
 */

import { BaseProvider } from '../APIService.js';

class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiEndpoint = config.apiEndpoint || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey;
  }

  /**
   * 检查是否支持指定模型
   */
  supportsModel(model) {
    // OpenAI provider 支持所有模型
    return true;
  }

  /**
   * 预检流式连接
   */
  preflightStream(requestData) {
    if (!this.apiKey && !this.isLocalEndpoint()) {
      throw new Error('API key is required for non-local endpoints');
    }
  }

  /**
   * 判断是否为本地端点
   */
  isLocalEndpoint() {
    return this.apiEndpoint.includes('localhost') || 
           this.apiEndpoint.includes('127.0.0.1') ||
           this.apiEndpoint.includes('lmstudio') ||
           this.apiEndpoint.includes('ollama');
  }

  /**
   * 流式响应
   * 
   * @param {Object} requestData - 请求数据
   * @param {number} inputTokens - 输入 token 数
   * @param {string} requestId - 请求ID
   * @param {Function} onChunk - 数据块回调
   * @param {Function} onComplete - 完成回调
   */
  async streamResponse(requestData, inputTokens, requestId, onChunk, onComplete) {
    const url = `${this.apiEndpoint}/chat/completions`;
    
    // 构建请求体
    const body = this.buildRequestBody(requestData);
    
    console.log(`[OpenAI] Streaming request: model=${requestData.model}`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // 处理流式响应
      await this.handleStream(response.body, onChunk, onComplete, requestId);

    } catch (error) {
      console.error(`[OpenAI] Stream error [${requestId}]:`, error.message);
      throw error;
    }
  }

  /**
   * 构建请求头
   */
  buildHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * 构建请求体
   */
  buildRequestBody(requestData) {
    const body = {
      model: requestData.model,
      messages: this.convertMessages(requestData.messages),
      stream: true,
      max_tokens: requestData.max_tokens,
      temperature: requestData.temperature
    };

    if (requestData.top_p !== null && requestData.top_p !== undefined) {
      body.top_p = requestData.top_p;
    }

    if (requestData.tools && requestData.tools.length > 0) {
      body.tools = this.convertTools(requestData.tools);
    }

    if (requestData.tool_choice) {
      body.tool_choice = requestData.tool_choice;
    }

    return body;
  }

  /**
   * 转换消息格式
   */
  convertMessages(messages) {
    return messages.map(msg => {
      // 如果已经是 OpenAI 格式，直接返回
      if (msg.role && msg.content !== undefined) {
        return msg;
      }
      
      // 如果是 MessageModels 格式，转换
      if (msg.toOpenAIFormat) {
        return msg.toOpenAIFormat();
      }
      
      // 否则假设是普通对象
      return {
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls,
        tool_call_id: msg.tool_call_id
      };
    });
  }

  /**
   * 转换工具定义
   */
  convertTools(tools) {
    return tools.map(tool => {
      if (tool.toOpenAIFormat) {
        return tool.toOpenAIFormat();
      }
      
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema || tool.parameters
        }
      };
    });
  }

  /**
   * 处理流式响应
   */
  async handleStream(stream, onChunk, onComplete, requestId) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let currentMessage = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        // 处理 SSE 事件
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          if (!trimmed || trimmed.startsWith(':')) {
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            
            if (data === '[DONE]') {
              // 流结束
              if (onComplete && currentMessage) {
                onComplete(currentMessage, false);
              }
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const chunk = this.parseChunk(parsed);
              
              if (chunk) {
                // 更新当前消息
                if (!currentMessage) {
                  currentMessage = {
                    role: 'assistant',
                    content: '',
                    tool_calls: []
                  };
                }
                
                this.applyChunk(currentMessage, chunk);
                
                // 调用回调
                if (onChunk) {
                  onChunk(currentMessage);
                }
              }
            } catch (e) {
              console.warn(`[OpenAI] Failed to parse chunk [${requestId}]:`, e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 解析数据块
   */
  parseChunk(data) {
    const choice = data.choices && data.choices[0];
    if (!choice) {
      return null;
    }

    const delta = choice.delta;
    if (!delta) {
      return null;
    }

    return {
      content: delta.content || '',
      reasoning_content: delta.reasoning_content || null,
      tool_calls: delta.tool_calls || null,
      finish_reason: choice.finish_reason || null
    };
  }

  /**
   * 应用数据块到消息
   */
  applyChunk(message, chunk) {
    // 追加内容
    if (chunk.content) {
      message.content += chunk.content;
    }

    // 追加推理内容
    if (chunk.reasoning_content) {
      message.reasoning_content = (message.reasoning_content || '') + chunk.reasoning_content;
    }

    // 处理工具调用
    if (chunk.tool_calls && chunk.tool_calls.length > 0) {
      chunk.tool_calls.forEach(tc => {
        const index = tc.index || 0;
        
        if (!message.tool_calls[index]) {
          message.tool_calls[index] = {
            id: tc.id || '',
            type: 'function',
            function: {
              name: '',
              arguments: ''
            }
          };
        }

        if (tc.id) {
          message.tool_calls[index].id = tc.id;
        }

        if (tc.function && tc.function.name) {
          message.tool_calls[index].function.name += tc.function.name;
        }

        if (tc.function && tc.function.arguments) {
          message.tool_calls[index].function.arguments += tc.function.arguments;
        }
      });
    }

    // 设置结束原因
    if (chunk.finish_reason) {
      message.finish_reason = chunk.finish_reason;
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // OpenAI provider 无需特殊清理
  }
}

export default OpenAIProvider;
