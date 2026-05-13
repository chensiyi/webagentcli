/**
 * OpenAI Service
 * 
 * 基于 OpenAIAdapter 实现
 * 支持 OpenAI 标准的 API 接口
 */

class OpenAIService {
  constructor() {
    this.name = 'openai';
    this.config = null;
    this.abortController = null;
  }

  /**
   * 配置服务
   */
  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'https://api.openai.com/v1',
      apiKey: config.apiKey || '',
      defaultModel: config.defaultModel || 'gpt-3.5-turbo',
      ...config
    };
    
    if (!this.config.apiKey) {
      throw new Error('OpenAI: apiKey is required');
    }
    
    console.log('[OpenAIService] Configured:', this.config);
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
  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    };
  }

  /**
   * 格式化消息
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
      messages: this.formatMessages(params.messages || []),
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? false,
      ...(params.maxTokens && { max_tokens: params.maxTokens }),
      ...(params.tools && { tools: params.tools }),
      ...(params.toolChoice && { tool_choice: params.toolChoice })
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
      reasoning_content: choice.delta.reasoning_content || choice.delta.thinking || '',
      role: choice.delta.role,
      toolCalls: choice.delta.tool_calls || [],
      finishReason: choice.finish_reason
    };
  }

  /**
   * 发送聊天请求（非流式）
   */
  async chat(params) {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders();
    const body = this.buildRequestBody({ ...params, stream: false });
    
    this.abortController = new AbortController();
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: this.abortController.signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[OpenAIService] Request cancelled');
      } else {
        console.error('[OpenAIService] Chat error:', error);
        throw error;
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 发送流式聊天请求
   */
  async chatStream(params, onChunk, onComplete) {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders();
    const body = this.buildRequestBody({ ...params, stream: true });
    
    this.abortController = new AbortController();
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: this.abortController.signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (onComplete) onComplete();
          break;
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
              console.warn('[OpenAIService] Failed to parse chunk:', e);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[OpenAIService] Stream cancelled');
      } else {
        console.error('[OpenAIService] Stream error:', error);
        throw error;
      }
    } finally {
      this.abortController = null;
    }
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
  async listModels() {
    const baseUrl = this.config.endpoint.replace(/\/$/, '');
    let modelsEndpoint;
    
    if (baseUrl.endsWith('/v1')) {
      modelsEndpoint = baseUrl + '/models';
    } else {
      modelsEndpoint = baseUrl + '/v1/models';
    }
    
    const response = await fetch(modelsEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }
    
    const result = await response.json();
    
    if (result.data && Array.isArray(result.data)) {
      return result.data;
    }
    
    return [];
  }
}

window.OpenAIService = OpenAIService;
