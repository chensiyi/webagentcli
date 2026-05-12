/**
 * 适配器基类 - 基于 MessageModels
 * 
 * 所有具体的 API 适配器都应继承此基类
 */

(function() {
  'use strict';
  
  const { Message, MessagesRequest, Tool } = window.MessageModels || {};
  
  class BaseAdapter {
    constructor(name) {
      this.name = name;
      this.config = null;
    }
    
    /**
     * 配置适配器
     * @param {Object} config - 配置对象
     */
    configure(config) {
      this.config = {
        ...this.getDefaultConfig(),
        ...config
      };
      console.log(`[${this.name}] Configured:`, this.config);
    }
    
    /**
     * 获取默认配置（子类应重写）
     */
    getDefaultConfig() {
      return {};
    }
    
    /**
     * 构建 API URL
     * @param {string} path - API 路径
     * @returns {string} 完整 URL
     */
    buildUrl(path) {
      const baseUrl = this.config.endpoint || '';
      if (!baseUrl) {
        throw new Error('No endpoint configured');
      }
      
      // 如果 path 已经包含在 endpoint 中，直接使用
      if (baseUrl.includes(path)) {
        return baseUrl;
      }
      
      const cleanBase = baseUrl.replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return `${cleanBase}${cleanPath}`;
    }
    
    /**
     * 构建请求头（子类应重写）
     * @param {Object} customHeaders - 自定义请求头
     * @returns {Object} 请求头对象
     */
    buildHeaders(customHeaders = {}) {
      return {
        'Content-Type': 'application/json',
        ...customHeaders
      };
    }
    
    /**
     * 将 Message 对象转换为 API 格式的消息数组
     * @param {Array<Message>} messages - Message 对象数组
     * @returns {Array<Object>} API 格式的消息数组
     */
    formatMessages(messages) {
      if (!messages || !Array.isArray(messages)) {
        return [];
      }
      
      return messages.map(msg => {
        // 如果已经是普通对象，直接返回
        if (!(msg instanceof Message)) {
          return msg;
        }
        
        // 转换为 OpenAI 兼容格式
        return msg.toOpenAIFormat();
      });
    }
    
    /**
     * 构建请求体（子类应重写）
     * @param {MessagesRequest} requestData - 请求对象
     * @returns {Object} 请求体对象
     */
    buildRequestBody(requestData) {
      const formattedMessages = this.formatMessages(requestData.messages);
      
      return {
        model: requestData.model || this.config.defaultModel,
        messages: formattedMessages,
        temperature: requestData.temperature ?? 0.7,
        stream: requestData.stream ?? false,
        ...(requestData.max_tokens && { max_tokens: requestData.max_tokens }),
        ...(requestData.tools && { tools: this.formatTools(requestData.tools) }),
        ...(requestData.tool_choice && { tool_choice: requestData.tool_choice })
      };
    }
    
    /**
     * 格式化工具定义
     * @param {Array<Tool>} tools - Tool 对象数组
     * @returns {Array<Object>} API 格式的工具数组
     */
    formatTools(tools) {
      if (!tools || !Array.isArray(tools)) {
        return null;
      }
      
      return tools.map(tool => {
        if (tool instanceof Tool) {
          return tool.toOpenAIFormat();
        }
        return tool;
      });
    }
    
    /**
     * 解析响应为 Message 对象（子类应重写）
     * @param {Object} data - API 响应数据
     * @param {string} model - 模型名称
     * @returns {Message} Message 对象
     */
    parseResponse(data, model) {
      throw new Error('Method not implemented');
    }
    
    /**
     * 解析流式片段（子类应重写）
     * @param {Object} chunk - 流式数据块
     * @returns {Object|null} 解析后的片段
     */
    parseStreamChunk(chunk) {
      throw new Error('Method not implemented');
    }
    
    /**
     * 发送聊天请求（非流式）
     * @param {MessagesRequest} requestData - 请求对象
     * @param {Object} config - 配置对象
     * @returns {Promise<Message>} Message 对象
     */
    async sendChat(requestData, config) {
      const url = this.buildUrl(this.getChatEndpoint());
      const headers = this.buildHeaders();
      const body = this.buildRequestBody(requestData);
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      const data = await response.json();
      return this.parseResponse(data, requestData.model);
    }
    
    /**
     * 发送流式聊天请求
     * @param {MessagesRequest} requestData - 请求对象
     * @param {Object} config - 配置对象
     * @param {Function} onChunk - 数据块回调
     * @param {Function} onComplete - 完成回调
     * @returns {Promise<void>}
     */
    async sendChatStream(requestData, config, onChunk, onComplete) {
      const url = this.buildUrl(this.getChatEndpoint());
      const headers = this.buildHeaders();
      const body = this.buildRequestBody({ ...requestData, stream: true });
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // 保留最后一个不完整的行
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') {
              continue;
            }
            
            if (trimmed.startsWith('data: ')) {
              try {
                const jsonStr = trimmed.slice(6);
                const data = JSON.parse(jsonStr);
                const parsed = this.parseStreamChunk(data);
                
                if (parsed && onChunk) {
                  onChunk(parsed);
                }
              } catch (e) {
                console.warn('[BaseAdapter] Failed to parse stream chunk:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        if (onComplete) {
          onComplete();
        }
      }
    }
    
    /**
     * 获取聊天端点（子类应重写）
     * @returns {string} 端点路径
     */
    getChatEndpoint() {
      return '/v1/chat/completions';
    }
    
    /**
     * 获取模型列表端点（子类应重写）
     * @returns {string} 端点路径
     */
    getModelsEndpoint() {
      return '/v1/models';
    }
    
    /**
     * 拉取模型列表
     * @param {Object} config - 配置对象
     * @returns {Promise<Array>} 模型列表
     */
    async listModels(config) {
      const endpoint = this.getModelsEndpoint();
      if (!endpoint) {
        console.warn(`[${this.name}] No models endpoint available`);
        return [];
      }
      
      const url = this.buildUrl(endpoint);
      const headers = this.buildHeaders();
      
      const response = await fetch(url, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseModelsList(data);
    }
    
    /**
     * 解析模型列表（子类可重写）
     * @param {Object} data - API 响应数据
     * @returns {Array} 模型数组
     */
    parseModelsList(data) {
      // OpenAI 标准格式
      if (data.data && Array.isArray(data.data)) {
        return data.data;
      }
      return [];
    }
    
    /**
     * 检测模型能力（子类可重写）
     * @param {string} modelName - 模型名称
     * @param {Object} config - 配置对象
     * @returns {Promise<Object|null>} 能力对象
     */
    async detectCapabilities(modelName, config) {
      return null;
    }
  }
  
  // 导出到全局
  window.BaseAdapter = BaseAdapter;
})();
