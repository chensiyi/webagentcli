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
      ...(params.toolChoice && { tool_choice: params.toolChoice }),
      // Reasoning 参数（OpenAI o系列模型）- reasoning_effort 是顶层参数
      // 可选值: "low" | "medium" | "high" | "minimal" | "none"
      ...(params.reasoningEnabled === true ? {
        reasoning_effort: params.reasoningEffort || 'medium'
      } : {
        reasoning_effort: 'none'
      })
    };
  }

  /**
   * 解析响应
   */
  parseResponse(data) {
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
  chat(params) {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders();
    const body = this.buildRequestBody({ ...params, stream: false });
    
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
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        });
      }
      return response.json();
    })
    .then(data => {
      return this.parseResponse(data);
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        console.log('[OpenAIService] Request cancelled');
      } else {
        console.error('[OpenAIService] Chat error:', error);
        throw error;
      }
    })
    .finally(() => {
      this.abortController = null;
    });
  }

  /**
   * 发送流式聊天请求
   */
  chatStream(params, onChunk, onComplete) {
    const url = this.buildUrl('/chat/completions');
    const headers = this.buildHeaders();
    const body = this.buildRequestBody({ ...params, stream: true });
    
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
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
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
                console.warn('[OpenAIService] Failed to parse chunk:', e);
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
        console.log('[OpenAIService] Stream cancelled');
      } else {
        console.error('[OpenAIService] Stream error:', error);
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
    const baseUrl = this.config.endpoint.replace(/\/$/, '');
    let modelsEndpoint;
    
    if (baseUrl.endsWith('/v1')) {
      modelsEndpoint = baseUrl + '/models';
    } else {
      modelsEndpoint = baseUrl + '/v1/models';
    }
    
    return fetch(modelsEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(errorText => {
          throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        });
      }
      return response.json();
    })
    .then(result => {
      if (result.data && Array.isArray(result.data)) {
        // 返回完整的模型数据，包含详细信息
        return result.data.map(model => ({
          id: model.id,
          name: model.name || model.id,
          created: model.created,
          owned_by: model.owned_by,
          context_length: model.context_length || null,
          max_output_tokens: model.max_output_tokens || null,
          modality: 'text->text',
          supports_reasoning: false,
          supports_tools: true, // OpenAI 标准支持工具调用
          pricing: { prompt: null, completion: null }, // OpenAI 官方 API 通常不在此处返回价格
          ...model
        }));
      }
      
      return [];
    });
  }
  
  /**
   * 获取单个模型的详细信息
   * @param {string} modelId - 模型 ID
   */
  getModelDetails(modelId) {
    const baseUrl = this.config.endpoint.replace(/\/$/, '');
    let modelEndpoint;
    
    if (baseUrl.endsWith('/v1')) {
      modelEndpoint = `${baseUrl}/models/${modelId}`;
    } else {
      modelEndpoint = `${baseUrl}/v1/models/${modelId}`;
    }
    
    return fetch(modelEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    })
    .then(response => {
      if (!response.ok) {
        // 如果获取失败，返回 null
        console.warn(`[OpenAIService] Failed to fetch details for model ${modelId}: ${response.status}`);
        return null;
      }
      return response.json();
    })
    .then(model => {
      if (!model) return null;
      
      // 返回标准化的模型详细信息，匹配 Model 原型
      return {
        id: model.id,
        name: model.name || model.id,
        created: model.created,
        owned_by: model.owned_by,
        context_length: model.context_length || null,
        max_output_tokens: model.max_output_tokens || null,
        modality: 'text->text',
        supports_reasoning: false,
        supports_tools: true,
        pricing: { prompt: null, completion: null },
        ...model
      };
    });
  }
}

window.OpenAIService = OpenAIService;
