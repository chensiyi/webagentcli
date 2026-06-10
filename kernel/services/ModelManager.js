/**
 * ModelManager - 模型列表管理与能力检测管理器
 * 
 * 职责：
 * 1. 负责从 Provider API 获取模型列表并标准化为业务模型
 * 2. 负责模型能力的检测逻辑
 * 3. 不维护自有缓存——模型列表以 SettingsManager.settings.models 为准
 * 
 * 设计变更说明：
 * - 移除了 this.models 运行时缓存，改用 serviceCenter.getSettingsManager().getSettings().models
 * - fetchModels() 仅负责 API 调用和标准化，持久化由调用方（SettingsManager）负责
 */

class ModelManager extends window.IModelManager {
  /**
   * @param {ServiceCenter} serviceCenter - 服务中心
   */
  constructor(serviceCenter) {
    super(serviceCenter);
  }

  /**
   * 获取已持久化的模型列表（来自 Settings）
   * @returns {Array<Model>}
   */
  getModels() {
    const settings = this.serviceCenter.getSettingsManager().getSettings();
    if (!settings || !Array.isArray(settings.models)) return [];
    return settings.models.map(m => 
      m instanceof window.Model ? m : window.Model.fromJSON(m)
    );
  }

  /**
   * 获取指定模型（来自 Settings）
   * @param {string} modelId 
   * @returns {Model|null}
   */
  getModel(modelId) {
    return this.getModels().find(m => m.id === modelId) || null;
  }

  /**
   * 从 Provider API 获取模型列表并标准化
   * @param {Object} params
   * @param {string} params.apiStandard - API 标准
   * @param {string} params.apiEndpoint - API 端点
   * @param {string} params.apiKey - API Key
   * @param {boolean} [params.forceRefresh=false] - 强制刷新（当前忽略，始终拉取）
   * @returns {Promise<Array<Model>>}
   */
  async fetchModels({ apiStandard, apiEndpoint, apiKey }) {
    console.log('[ModelManager] Fetching models:', { apiStandard, apiEndpoint });

    const service = this.serviceCenter.createProviderService(apiStandard, {
      endpoint: apiEndpoint,
      apiKey: apiKey,
      defaultModel: 'default'
    });

    const rawModels = await service.listModels();
    const models = this._processModelData(rawModels, apiStandard);

    console.log('[ModelManager] Fetched and standardized', models.length, 'models');
    return models;
  }

  /**
   * 清除模型缓存（仅清空 Settings 中的 models，重新拉取由调用方决定）
   */
  async clearCache() {
    console.log('[ModelManager] Cache clear requested — delegates to settings.models reset');
  }

  /**
   * 标准化原始模型数据
   * @private
   */
  _processModelData(rawModels, apiStandard) {
    if (!Array.isArray(rawModels)) return [];

    return rawModels.map(raw => {
      if (raw instanceof window.Model) return raw;

      const id = typeof raw === 'string' ? raw : raw.id;
      const name = raw.name || id;

      const capabilities = {
        vision: this._detectVisionCapability(id, name, raw),
        toolUse: this._detectToolUseCapability(id, name, raw, apiStandard),
        streaming: true,
        reasoning: this._detectReasoningCapability(id, name, raw),
        jsonMode: this._detectJsonModeCapability(id, name, raw, apiStandard)
      };

      return new window.Model({
        id,
        name,
        publisher: raw.owned_by || raw.publisher || 'unknown',
        architecture: raw.architecture || null,
        capabilities,
        contextLength: raw.context_length || raw.context_window || 8192,
        inputModalities: raw.input_modalities || (this._detectVisionCapability(id, name, raw) ? ['text', 'image'] : ['text']),
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
           !!(raw.capabilities?.vision) ||
           raw.modality?.includes('image');
  }

  /**
   * 检测工具调用能力
   * @private
   */
  _detectToolUseCapability(id, name, raw, apiStandard) {
    const searchStr = (id + ' ' + name).toLowerCase();
    if (searchStr.includes('embedding')) return false;
    if (apiStandard === 'openai') return true;
    return raw.capabilities?.tool_use !== false && 
           raw.supports_tools !== false && 
           raw.supports_function_calling !== false;
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
           !!(raw.capabilities?.reasoning) ||
           raw.supports_reasoning === true;
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