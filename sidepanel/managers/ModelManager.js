// 模型管理器
// 负责模型列表获取、能力检测、缓存管理
(function() {
  'use strict';
  
  class ModelManager {
    constructor() {
      this.models = [];
      this.capabilities = {}; // { modelName: { vision, streaming, ... } }
      this.lastFetchTime = null;
      this.cacheDuration = 5 * 60 * 1000; // 缓存5分钟
    }
    
    /**
     * 从 API 获取模型列表
     */
    async fetchModels(apiKey, apiEndpoint) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_MODELS',
          payload: {
            apiKey: apiKey || '',
            apiEndpoint
          }
        });
        
        if (response.success) {
          this.models = response.models;
          this.lastFetchTime = Date.now();
          
          // 自动检测模型能力
          this.detectCapabilities();
          
          console.log('[ModelManager] Fetched', this.models.length, 'models');
          return this.models;
        } else {
          throw new Error(response.error || 'Failed to fetch models');
        }
      } catch (error) {
        console.error('[ModelManager] Fetch error:', error);
        throw error;
      }
    }
    
    /**
     * 根据模型名称推断能力
     */
    detectCapabilities() {
      this.capabilities = {};
      
      this.models.forEach(modelName => {
        const lower = modelName.toLowerCase();
        
        this.capabilities[modelName] = {
          // 视觉能力检测
          vision: this.checkVisionSupport(lower),
          
          // 流式支持（大部分模型都支持）
          streaming: true,
          
          // 工具调用能力
          tools: this.checkToolsSupport(lower),
          
          // 上下文窗口大小估算
          contextWindow: this.estimateContextWindow(lower)
        };
      });
    }
    
    /**
     * 检查视觉支持
     */
    checkVisionSupport(modelNameLower) {
      const visionKeywords = [
        'gpt-4o', 'gpt-4-vision', 'claude-3', 'gemini', 
        'vision', 'llava', 'qwen-vl'
      ];
      
      return visionKeywords.some(keyword => modelNameLower.includes(keyword));
    }
    
    /**
     * 检查工具调用支持
     */
    checkToolsSupport(modelNameLower) {
      const toolKeywords = [
        'gpt-4', 'gpt-3.5-turbo', 'claude', 'gemini'
      ];
      
      return toolKeywords.some(keyword => modelNameLower.includes(keyword));
    }
    
    /**
     * 估算上下文窗口大小
     */
    estimateContextWindow(modelNameLower) {
      // GPT-4 系列
      if (modelNameLower.includes('gpt-4o')) return 128000;
      if (modelNameLower.includes('gpt-4-32k')) return 32768;
      if (modelNameLower.includes('gpt-4')) return 8192;
      if (modelNameLower.includes('gpt-3.5')) return 16385;
      
      // Claude 系列
      if (modelNameLower.includes('claude-3')) return 200000;
      if (modelNameLower.includes('claude-2')) return 100000;
      
      // Gemini 系列
      if (modelNameLower.includes('gemini')) return 32768;
      
      // Llama 系列
      if (modelNameLower.includes('llama-3')) return 8192;
      
      // 默认保守估计
      return 8192;
    }
    
    /**
     * 获取模型的上下文窗口大小（公开 API）
     */
    getContextWindowSize(modelName) {
      if (!modelName) return 8192;
      
      const lower = modelName.toLowerCase();
      return this.estimateContextWindow(lower);
    }
    
    /**
     * 获取模型列表
     */
    getModels() {
      return [...this.models];
    }
    
    /**
     * 获取模型能力
     */
    getCapability(modelName) {
      return this.capabilities[modelName] || null;
    }
    
    /**
     * 检查是否已加载模型
     */
    isLoaded() {
      return this.models.length > 0;
    }
    
    /**
     * 检查缓存是否过期
     */
    isCacheExpired() {
      if (!this.lastFetchTime) return true;
      return Date.now() - this.lastFetchTime > this.cacheDuration;
    }
    
    /**
     * 清空缓存
     */
    clearCache() {
      this.models = [];
      this.capabilities = {};
      this.lastFetchTime = null;
    }
  }
  
  // 全局单例
  window.ModelManager = new ModelManager();
})();
