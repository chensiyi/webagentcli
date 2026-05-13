/**
 * LM Studio Service
 * 
 * 基于 LMStudioAdapter 实现
 * 使用 LM Studio 原生 v1 REST API 标准
 */

class LMStudioService {
  constructor() {
    this.name = 'lm-studio';
    this.config = null;
    this.abortController = null;
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
    return messages.map(msg => {
      const formatted = {
        role: msg.role,
        content: msg.content
      };
      
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        formatted.tool_calls = msg.tool_calls;
      }
      
      if (msg.role === 'tool' && msg.tool_call_id) {
        formatted.tool_call_id = msg.tool_call_id;
      }
      
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
      input: this.formatMessages(params.messages || []),
      stream: params.stream ?? false
    };
    
    if (params.temperature !== undefined) {
      baseBody.temperature = params.temperature;
    }
    
    if (params.maxTokens) {
      baseBody.max_output_tokens = params.maxTokens;
    }
    
    if (params.top_p !== undefined) {
      baseBody.top_p = params.top_p;
    }
    
    if (params.systemPrompt) {
      baseBody.system_prompt = params.systemPrompt;
    }
    
    return baseBody;
  }

  /**
   * 解析响应
   */
  parseResponse(data) {
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
          total_tokens: data.stats.input_tokens + data.stats.total_output_tokens
        } : undefined,
        model: data.model_instance_id,
        response_id: data.response_id
      };
    }
    
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
   */
  parseStreamChunk(data) {
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
   * 发送聊天请求（非流式）
   */
  async chat(params) {
    const url = this.buildUrl('/chat');
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
        throw new Error(`LM Studio API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[LMStudioService] Request cancelled');
      } else {
        console.error('[LMStudioService] Chat error:', error);
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
    const url = this.buildUrl('/chat');
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
        throw new Error(`LM Studio API error: ${response.status} - ${errorText}`);
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
              console.warn('[LMStudioService] Failed to parse chunk:', e);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[LMStudioService] Stream cancelled');
      } else {
        console.error('[LMStudioService] Stream error:', error);
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
    const url = this.buildUrl('/models');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }
    
    const result = await response.json();
    
    if (result.models && Array.isArray(result.models)) {
      return result.models.map(model => model.key || model.id);
    }
    
    if (result.data && Array.isArray(result.data)) {
      return result.data.map(model => model.id);
    }
    
    return [];
  }
}

window.LMStudioService = LMStudioService;
