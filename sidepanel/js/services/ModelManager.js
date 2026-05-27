/**
 * ModelManager - 模型列表管理与能力检测管理器
 * 
 * 职责：
 * 1. 负责从 Provider API 获取模型列表并标准化为业务模型
 * 2. 负责模型能力的检测逻辑
 * 3. 负责模型列表的持久化缓存管理
 */

class ModelManager extends window.IModelManager {
  /**
   * @param {ServiceCenter} serviceCenter - 服务中心
   */
  constructor(serviceCenter) {
    super(serviceCenter);
    
    // 运行时状态
    this.models = []; // Array<Model>
    this.lastFetchTime = null;
    this.cacheDuration = 30 * 24 * 60 * 60 * 1000; // 30 天缓存
  }

  /**
   * 初始化
   */
  async initialize() {
    console.log('[ModelManager] Initialized');
  }

  /**
   * 获取模型列表
   * @param {Object} params - 获取参数
   * @param {string} params.apiStandard - API 标准
   * @param {string} params.apiEndpoint - API 端点
   * @param {string} params.apiKey - API Key
   * @param {boolean} [params.forceRefresh=false] - 是否强制刷新
   * @returns {Promise<Array<Model>>}
   */
  async fetchModels({ apiStandard, apiEndpoint, apiKey, forceRefresh = false }) {
    console.log('[ModelManager] Fetching models:', { apiStandard, apiEndpoint, forceRefresh });

    console.log('[ModelManager] Fetching models:', { apiStandard, apiEndpoint, forceRefresh });

    // 1. 如果已经有运行时缓存且未强制刷新，则直接返回当前模型列表
    if (!forceRefresh && this.models.length > 0) {
      return this.models;
    }

    // 2. 获取 Provider Service
    const service = this.serviceCenter.createProviderService(apiStandard, {
      endpoint: apiEndpoint,
      apiKey: apiKey,
      defaultModel: 'default'
    });

    // 3. 调用 API 获取原始数据
    const rawModels = await service.listModels();

    // 4. 标准化为 Model 实例
    this.models = this._processModelData(rawModels, apiStandard);
    this.lastFetchTime = Date.now();

    console.log('[ModelManager] Fetched and standardized', this.models.length, 'models');
    return this.models;
  }

  /**
   * 获取当前已加载的模型列表
   * @returns {Array<Model>}
   */
  getModels() {
    return this.models;
  }

  /**
   * 获取指定模型
   * @param {string} modelId 
   * @returns {Model|null}
   */
  getModel(modelId) {
    return this.models.find(m => m.id === modelId) || null;
  }

  /**
   * 清除指定端点的模型缓存
   * @param {string} apiEndpoint 
   */
  async clearCache(apiEndpoint) {
    if (this.models.length > 0) {
      this.models = [];
    }
    console.log('[ModelManager] Runtime model list cleared for', apiEndpoint);
  }

  /**
   * 标准化原始模型数据
   * @private
   */
  _processModelData(rawModels, apiStandard) {
    if (!Array.isArray(rawModels)) return [];

    return rawModels.map(raw => {
      // 如果已经是 Model 实例，直接返回
      if (raw instanceof window.Model) return raw;

      const id = typeof raw === 'string' ? raw : raw.id;
      const name = raw.name || id;

      // 基础能力检测
      const capabilities = {
        vision: this._detectVisionCapability(id, name, raw),
        toolUse: this._detectToolUseCapability(id, name, raw, apiStandard),
        streaming: true,
        reasoning: this._detectReasoningCapability(id, name, raw),
        jsonMode: this._detectJsonModeCapability(id, name, raw, apiStandard)
      };

      // 创建标准 Model 实例
      return new window.Model({
        id,
        name,
        publisher: raw.owned_by || raw.publisher || 'unknown',
        architecture: raw.architecture || null,
        capabilities,
        contextLength: raw.context_length || raw.context_window || 8192,
        pricing: raw.pricing || null,
        description: raw.description || '',
        metadata: raw
      });
    });
  }

  /**
   * 检测视觉能力
   * @private
   */
  _detectVisionCapability(id, name, raw) {
    const searchStr = (id + ' ' + name).toLowerCase();
    return searchStr.includes('vision') || 
           searchStr.includes('vl') || 
           searchStr.includes('multimodal') ||
           !!(raw.capabilities?.vision);
  }

  /**
   * 检测工具调用能力
   * @private
   */
  _detectToolUseCapability(id, name, raw, apiStandard) {
    const searchStr = (id + ' ' + name).toLowerCase();
    if (searchStr.includes('embedding')) return false;
    if (apiStandard === 'openai') return true;
    return raw.capabilities?.tool_use !== false;
  }

  /**
   * 检测推理/思考能力
   * @private
   */
  _detectReasoningCapability(id, name, raw) {
    const searchStr = (id + ' ' + name).toLowerCase();
    return searchStr.includes('think') || 
           searchStr.includes('reasoning') || 
           searchStr.includes('deepseek-r1') ||
           searchStr.includes('o1') ||
           searchStr.includes('o3') ||
           !!(raw.capabilities?.reasoning);
  }

  /**
   * 检测 JSON 模式能力
   * @private
   */
  _detectJsonModeCapability(id, name, raw, apiStandard) {
    if (apiStandard === 'openai') return true;
    return !!(raw.capabilities?.json_mode);
  }
}

// 导出类
if (typeof window !== 'undefined') {
  window.ModelManager = ModelManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModelManager;
}
