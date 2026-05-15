/**
 * Model Manager
 * 
 * 负责模型列表的获取、缓存和能力检测
 * 基于 Services 层的 Provider API 接口实现
 */

class ModelManager {
  constructor() {
    this.models = [];
    this.modelDetails = {};
    this.capabilities = {};
    this.lastFetchTime = null;
    this.cacheDuration = 30 * 24 * 60 * 60 * 1000; // 30 days
    this.storageKey = 'model_cache_v2';
    this.currentApiEndpoint = null;
    this.currentApiStandard = null;
    this.eventBus = window.EventBus;
  }

  /**
   * 获取模型列表
   * @param {string} apiKey - API Key
   * @param {string} apiEndpoint - API 端点
   * @param {string} apiStandard - API 标准
   */
  async fetchModels(apiKey, apiEndpoint, apiStandard) {
    console.log('[ModelManager] Fetching models:', apiStandard, apiEndpoint);

    // 1. 尝试从缓存加载
    const cached = await this.loadFromStorage(apiEndpoint);
    if (cached && !this.isCacheExpired()) {
      console.log('[ModelManager] Using cached models');
      this.restoreFromCache(cached);
      return this.models;
    }

    // 2. 获取对应的 Service
    const service = this.getServiceByStandard(apiStandard);
    if (!service) {
      throw new Error(`No service found for standard: ${apiStandard}`);
    }

    // 3. 配置并调用 Service
    service.configure({
      endpoint: apiEndpoint,
      apiKey: apiKey,
      defaultModel: 'default'
    });

    const rawModels = await service.listModels();

    // 4. 处理数据
    this.processModelData(rawModels);
    this.currentApiEndpoint = apiEndpoint;
    this.currentApiStandard = apiStandard;
    this.lastFetchTime = Date.now();

    // 5. 保存缓存
    this.saveToStorage();

    console.log('[ModelManager] Fetched', this.models.length, 'models');
    return this.models;
  }

  /**
   * 根据标准获取 Service 实例
   */
  getServiceByStandard(standard) {
    const map = {
      'openai': window.OpenAIService,
      'lm-studio': window.LMStudioService
      // TODO: Add ollama, openrouter, anthropic when implemented
    };
    const ServiceClass = map[standard];
    return ServiceClass ? new ServiceClass() : null;
  }

  /**
   * 处理模型数据
   */
  processModelData(rawModels) {
    this.models = [];
    this.modelDetails = {};
    this.capabilities = {};

    if (!Array.isArray(rawModels)) return;

    rawModels.forEach(model => {
      const id = typeof model === 'string' ? model : model.id;
      this.models.push(id);

      const details = typeof model === 'object' ? model : { id, name: id };
      this.modelDetails[id] = {
        id: details.id,
        name: details.name || details.id,
        context_length: details.context_length,
        pricing: details.pricing,
        architecture: details.architecture
      };

      // 简单能力检测
      this.capabilities[id] = {
        vision: (details.name || '').toLowerCase().includes('vision'),
        contextWindow: details.context_length || 8192
      };
    });
  }

  /**
   * 检查是否已加载
   */
  isLoaded() {
    return this.models.length > 0;
  }

  /**
   * 获取模型列表
   */
  getModels() {
    return [...this.models];
  }

  /**
   * 获取模型详情
   */
  getModelDetails(modelId) {
    return this.modelDetails[modelId] || null;
  }

  /**
   * 获取模型能力
   */
  getCapability(modelId) {
    return this.capabilities[modelId] || null;
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.models = [];
    this.modelDetails = {};
    this.capabilities = {};
    this.lastFetchTime = null;
    chrome.storage.local.remove(this.storageKey);
  }

  /**
   * 缓存是否过期
   */
  isCacheExpired() {
    return !this.lastFetchTime || (Date.now() - this.lastFetchTime > this.cacheDuration);
  }

  /**
   * 保存到存储
   */
  saveToStorage() {
    chrome.storage.local.set({
      [this.storageKey]: {
        models: this.models,
        modelDetails: this.modelDetails,
        capabilities: this.capabilities,
        lastFetchTime: this.lastFetchTime,
        apiEndpoint: this.currentApiEndpoint
      }
    });
  }

  /**
   * 从存储加载
   */
  loadFromStorage(apiEndpoint) {
    return new Promise(resolve => {
      chrome.storage.local.get(this.storageKey, result => {
        const cache = result[this.storageKey];
        if (cache && cache.apiEndpoint === apiEndpoint) {
          resolve(cache);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * 从缓存恢复
   */
  restoreFromCache(cache) {
    this.models = cache.models || [];
    this.modelDetails = cache.modelDetails || {};
    this.capabilities = cache.capabilities || {};
    this.lastFetchTime = cache.lastFetchTime;
    this.currentApiEndpoint = cache.apiEndpoint;
  }
}

// 全局单例
window.ModelManager = new ModelManager();
