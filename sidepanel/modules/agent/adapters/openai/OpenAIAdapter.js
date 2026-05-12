// OpenAI API 适配器
// 支持 OpenAI 标准的 API 接口
// 基于 MessageModels 和 BaseAdapter

(function() {
  'use strict';
  
  const { Message, Tool } = window.MessageModels || {};
  const BaseAdapter = window.BaseAdapter;
  
  class OpenAIAdapter extends BaseAdapter {
    constructor() {
      super('openai');
    }
    
    /**
     * 获取默认配置
     */
    getDefaultConfig() {
      return {
        endpoint: 'https://api.openai.com/v1',
        apiKey: '',
        defaultModel: 'gpt-3.5-turbo'
      };
    }
    
    /**
     * 构建请求头
     */
    buildHeaders(customHeaders = {}) {
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...customHeaders
      };
    }
    
    /**
     * 解析响应为 Message 对象
     */
    parseResponse(data, model) {
      const choice = data.choices[0];
      if (!choice || !choice.message) {
        throw new Error('Invalid response format');
      }
      
      return new Message(
        choice.message.role || 'assistant',
        choice.message.content || '',
        {
          tool_calls: choice.message.tool_calls || [],
          reasoning_content: choice.message.reasoning_content || null,
          model: model || data.model
        }
      );
    }
    
    /**
     * 解析流式片段
     */
    parseStreamChunk(data) {
      const choice = data.choices?.[0];
      if (!choice || !choice.delta) {
        return null;
      }
      
      return {
        content: choice.delta.content || '',
        role: choice.delta.role,
        toolCalls: choice.delta.tool_calls || [],
        finishReason: choice.finish_reason,
        reasoningContent: choice.delta.reasoning_content || null
      };
    }
    
    /**
     * 获取聊天端点
     */
    getChatEndpoint() {
      return '/chat/completions';
    }
    
    /**
     * 获取模型列表端点
     */
    getModelsEndpoint() {
      return '/models'; // endpoint 已包含 /v1
    }
    
    /**
     * 检测模型能力
     */
    async detectCapabilities(modelName, config) {
      const lowerName = modelName.toLowerCase();
      
      return {
        vision: lowerName.includes('vision') || lowerName.includes('gpt-4o'),
        audio: false,
        streaming: true,
        tools: !lowerName.includes('instruct')
      };
    }
  }
  
  // 导出到全局
  window.OpenAIAdapter = OpenAIAdapter;
})();
