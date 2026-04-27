// 模型管理器
// 负责模型列表获取、能力检测、缓存管理
(function() {
  'use strict';
  
  class ModelManager {
    constructor() {
      this.models = []; // 只存储模型ID列表（向后兼容）
      this.modelDetails = {}; // { modelId: { id, name, context_length, pricing, ... } }
      this.capabilities = {}; // { modelName: { vision, streaming, ... } }
      this.lastFetchTime = null;
      this.cacheDuration = 5 * 60 * 1000; // 缓存5分钟
      
      // 使用全局的 CapabilityManager（如果存在）
      this.capabilityManager = window.MessageTypes?.CapabilityManager || null;
    }
    
    /**
     * 从 API 获取模型列表
     */
    async fetchModels(apiKey, apiEndpoint) {
      try {
        // 构建 models API URL
        let modelsEndpoint = apiEndpoint.replace('/chat/completions', '').replace(/\/$/, '') + '/models';
        
        // 构建请求头（API Key 可选）
        const headers = {};
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        const response = await fetch(modelsEndpoint, {
          method: 'GET',
          headers
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const result = await response.json();
        
        // 提取模型列表和详细信息
        if (result.data) {
          this.models = result.data.map(m => m.id);
          
          // 保存每个模型的详细信息
          result.data.forEach(model => {
            this.modelDetails[model.id] = {
              id: model.id,
              name: model.name || model.id,
              canonical_slug: model.canonical_slug,
              description: model.description,
              context_length: model.context_length,
              architecture: model.architecture,
              pricing: model.pricing,
              top_provider: model.top_provider,
              supported_parameters: model.supported_parameters || [],
              created: model.created,
              input_modalities: model.architecture?.input_modalities || [],
              output_modalities: model.architecture?.output_modalities || []
            };
          });
        }
        
        this.lastFetchTime = Date.now();
        
        // 自动检测模型能力
        this.detectCapabilities();
        
        console.log('[ModelManager] Fetched', this.models.length, 'models from', apiEndpoint);
        return this.models;
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
        // 优先使用 CapabilityManager
        if (this.capabilityManager) {
          this.capabilities[modelName] = this.capabilityManager.getModelCapabilities(modelName);
        } else {
          // 使用 ModelCapabilityDetector
          const lower = modelName.toLowerCase();
          
          this.capabilities[modelName] = {
            vision: window.ModelCapabilityDetector.checkVisionSupport(lower),
            audio: window.ModelCapabilityDetector.checkAudioSupport(lower),
            streaming: true,
            tools: window.ModelCapabilityDetector.checkToolsSupport(lower),
            contextWindow: window.ModelCapabilityDetector.estimateContextWindow(lower)
          };
        }
      });
    }
    
    /**
     * 获取模型的上下文窗口大小（公开 API）
     */
    getContextWindowSize(modelName) {
      if (!modelName) return 8192;
      
      const lower = modelName.toLowerCase();
      return window.ModelCapabilityDetector.estimateContextWindow(lower);
    }
    
    /**
     * 获取模型列表
     */
    getModels() {
      return [...this.models];
    }
    
    /**
     * 获取模型详细信息
     */
    getModelDetails(modelId) {
      return this.modelDetails[modelId] || null;
    }
    
    /**
     * 获取所有模型的详细信息
     */
    getAllModelDetails() {
      return { ...this.modelDetails };
    }
    
    /**
     * 获取模型能力
     */
    getCapability(modelName) {
      return this.capabilities[modelName] ?? null;
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
      this.modelDetails = {};
      this.capabilities = {};
      this.lastFetchTime = null;
    }
    
    /**
     * 检查模型是否支持视觉（无需加载模型列表）
     * 用于在模型列表未加载时进行快速检测
     */
    isVisionModel(modelName) {
      if (!modelName) return false;
      
      return this.capabilityManager
        ? this.capabilityManager.checkCapability(modelName.toLowerCase(), window.MessageTypes.ModelCapability.VISION)
        : window.ModelCapabilityDetector.checkVisionSupport(modelName.toLowerCase());
    }
    
    /**
     * 检查模型是否支持视觉（回退机制）
     * 如果已加载模型列表，使用缓存的能力数据
     * 否则直接使用实例方法检测
     */
    checkModelVisionSupport(modelName) {
      if (!modelName) return false;
      
      // 1. 优先使用缓存数据
      const cachedCapability = this.getCapability(modelName);
      if (cachedCapability) {
        return cachedCapability.vision;
      }
      
      // 2. 回退：使用实例方法直接检测
      return this.isVisionModel(modelName);
    }
  }
  
  // 全局单例
  window.ModelManager = new ModelManager();
})();
