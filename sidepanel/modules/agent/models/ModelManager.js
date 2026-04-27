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
        const details = this.modelDetails[modelName];
        
        if (details) {
          // 从 API 返回的详细信息中提取能力
          this.capabilities[modelName] = this.extractCapabilitiesFromDetails(details);
        } else {
          // 如果没有详细信息，使用回退机制（基于名称推断）
          this.capabilities[modelName] = this.fallbackCapabilityDetection(modelName);
        }
      });
    }
    
    /**
     * 从模型详细信息中提取能力
     */
    extractCapabilitiesFromDetails(details) {
      const inputModalities = details.input_modalities || [];
      const outputModalities = details.output_modalities || [];
      const supportedParams = details.supported_parameters || [];
      
      return {
        // 多模态能力 - 直接从 architecture 获取
        vision: inputModalities.includes('image'),
        audio: inputModalities.includes('audio'),
        video: inputModalities.includes('video'),
        
        // 流式支持 - 默认所有模型都支持
        streaming: true,
        
        // 工具调用 - 检查 supported_parameters 是否包含 tools
        tools: supportedParams.includes('tools') || supportedParams.includes('tool_choice'),
        
        // 上下文窗口 - 直接使用 API 返回的值
        contextWindow: details.context_length || 8192,
        
        // 思考模式 - 检查是否支持 reasoning 参数
        thinking: supportedParams.includes('reasoning') || supportedParams.includes('include_reasoning'),
        
        // 结构化输出
        structured_output: supportedParams.includes('structured_outputs') || supportedParams.includes('response_format'),
        
        // 原始详细信息
        _details: details
      };
    }
    
    /**
     * 回退机制：基于名称推断能力（当没有详细信息时使用）
     */
    fallbackCapabilityDetection(modelName) {
      const lower = modelName.toLowerCase();
      
      // 优先使用 CapabilityManager
      if (this.capabilityManager) {
        return this.capabilityManager.getModelCapabilities(modelName);
      }
      
      // 简单的默认能力配置
      console.warn(`[ModelManager] No details for model "${modelName}", using default capabilities`);
      return {
        vision: false,
        audio: false,
        streaming: true,
        tools: false,
        contextWindow: 8192
      };
    }
    
    /**
     * 获取模型的上下文窗口大小（公开 API）
     */
    getContextWindowSize(modelName) {
      if (!modelName) return 8192;
      
      // 优先从详细信息中获取
      const details = this.modelDetails[modelName];
      if (details && details.context_length) {
        return details.context_length;
      }
      
      // 回退：从能力缓存中获取
      const capability = this.capabilities[modelName];
      if (capability && capability.contextWindow) {
        return capability.contextWindow;
      }
      
      // 默认值
      return 8192;
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
     * 获取模型的完整配置信息（包括能力和详细信息）
     */
    getModelFullInfo(modelId) {
      const details = this.modelDetails[modelId];
      const capability = this.capabilities[modelId];
      
      if (!details && !capability) {
        return null;
      }
      
      return {
        id: modelId,
        name: details?.name || modelId,
        capability: capability,
        details: details,
        // 便捷访问字段
        context_length: details?.context_length,
        pricing: details?.pricing,
        input_modalities: details?.input_modalities || [],
        output_modalities: details?.output_modalities || [],
        supported_parameters: details?.supported_parameters || []
      };
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
      
      // 优先从详细信息中获取
      const details = this.modelDetails[modelName];
      if (details) {
        return details.input_modalities?.includes('image') || false;
      }
      
      // 回退：从能力缓存中获取
      const capability = this.capabilities[modelName];
      if (capability) {
        return capability.vision || false;
      }
      
      // 默认不支持
      return false;
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
