/**
 * AdapterService - 适配器服务
 * 
 * 职责：
 * 1. 管理 Adapter 的生命周期
 * 2. 提供统一的 API 调用接口
 * 3. 处理错误和重试
 */

class AdapterService {
  constructor() {
    this.currentAdapter = null;
    this.adapters = new Map();
  }

  /**
   * 注册适配器
   */
  registerAdapter(name, adapter) {
    this.adapters.set(name, adapter);
  }

  /**
   * 选择适配器
   */
  selectAdapter(name, config) {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Adapter ${name} not found`);
    }
    
    adapter.configure(config);
    this.currentAdapter = adapter;
    
    return adapter;
  }

  /**
   * 获取当前适配器
   */
  getCurrentAdapter() {
    if (!this.currentAdapter) {
      throw new Error('No adapter selected');
    }
    return this.currentAdapter;
  }

  /**
   * 获取模型列表
   */
  async fetchModels(apiEndpoint, apiKey) {
    const adapter = this.getCurrentAdapter();
    
    if (adapter.fetchModels) {
      return await adapter.fetchModels(apiEndpoint, apiKey);
    }
    
    throw new Error('Adapter does not support fetchModels');
  }

  /**
   * 发送聊天请求（非流式）
   */
  async chat(requestParams) {
    const adapter = this.getCurrentAdapter();
    const endpoint = adapter.buildUrl(adapter.getChatEndpoint());
    const requestBody = adapter.buildRequestBody(requestParams);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: adapter.buildHeaders(),
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    return adapter.parseResponse(data);
  }

  /**
   * 发送流式聊天请求
   */
  async chatStream(requestParams, onChunk, onComplete, onError) {
    const adapter = this.getCurrentAdapter();
    const endpoint = adapter.buildUrl(adapter.getChatEndpoint());
    const requestBody = adapter.buildRequestBody({
      ...requestParams,
      stream: true
    });
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: adapter.buildHeaders(),
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
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
              const jsonStr = trimmed.slice(6);
              const data = JSON.parse(jsonStr);
              const chunk = adapter.parseStreamChunk(data);
              
              if (chunk && onChunk) {
                onChunk(chunk);
              }
              
              if (chunk?.finish_reason && onComplete) {
                onComplete(chunk);
              }
            } catch (e) {
              console.warn('[AdapterService] Failed to parse chunk:', e);
            }
          }
        }
      }
      
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        throw error;
      }
    }
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.AdapterService = AdapterService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdapterService;
}
