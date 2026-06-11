/**
 * ServiceCenter - 框架核心服务管理中心（向后兼容层）
 * 
 * 职责：
 * - 提供全局框架服务的统一访问入口（单例管理）
 * - 底层 IPC 由 Kernel 提供，不再创建独立 EventBus
 * 
 * 注意：新代码应通过 kernel.get('serviceName') 访问服务
 */

class ServiceCenter {
  constructor(ipc = null, kernel = null) {
    // 使用 Kernel IPC 代替独立 EventBus
    this.eventBus = ipc;
    this.kernel = kernel;
    
    // 服务实例缓存
    this.sessionManager = null;
    this.settingsManager = null;
    this.storageManager = null;
    this.scriptsManager = null;
    this.modelManager = null;
    this.currentProviderService = null;
    this.currentProviderId = null;
    this.chatController = null;
    
    // 工具注册表
    this.tools = new Map();
  }

  /**
   * 获取事件总线实例（返回 Kernel IPC，API 完全兼容）
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * 设置 IPC 实例（由 app.js 注入 Kernel IPC）
   * @param {IPC} ipc
   */
  setIPC(ipc) {
    this.eventBus = ipc;
    this._ownsEventBus = false;
  }

  /**
   * 获取 SessionManager
   */
  getSessionManager() {
    return this.sessionManager;
  }

  /**
   * 获取 SettingsManager
   */
  getSettingsManager() {
    return this.settingsManager;
  }

  /**
   * 获取 StorageManager
   */
  getStorageManager() {
    return this.storageManager;
  }

  /**
   * 获取 ScriptsManager
   */
  getScriptsManager() {
    return this.scriptsManager;
  }

  /**
   * 获取 ModelManager
   */
  getModelManager() {
    return this.modelManager;
  }

  /**
   * 获取所有已注册的工具
   * @returns {Array} 工具实例数组
   */
  getAllTools() {
    if (this.kernel && this.kernel.toolRegistry && typeof this.kernel.toolRegistry.getAll === 'function') {
      return this.kernel.toolRegistry.getAll();
    }
    return Array.from(this.tools.values());
  }

  /**
   * 获取指定工具
   * @param {string} name
   * @returns {Object|null}
   */
  getTool(name) {
    if (this.kernel && this.kernel.toolRegistry && typeof this.kernel.toolRegistry.get === 'function') {
      return this.kernel.toolRegistry.get(name);
    }
    return this.tools.get(name) || null;
  }

  /**
   * 获取工具定义列表（用于传给 LLM 的 tools 参数）
   * @param {string} [format='openai']
   * @returns {Array}
   */
  getToolDefinitionsForLLM(format = 'openai') {
    if (this.kernel && this.kernel.toolRegistry && typeof this.kernel.toolRegistry.getDefinitionsForLLM === 'function') {
      return this.kernel.toolRegistry.getDefinitionsForLLM(format);
    }
    return [];
  }

  /**
   * 登记或更新当前活跃的 Provider API 服务
   */
  updateProviderService(settings) {
    if (!settings || !settings.apiStandard) {
      console.warn('[ServiceCenter] Cannot update provider: settings or apiStandard missing');
      return null;
    }

    const providerId = settings.apiStandard;
    const config = {
      endpoint: settings.apiEndpoint,
      apiKey: settings.apiKey,
      defaultModel: settings.model || 'default'
    };

    if (!this.currentProviderService || this.currentProviderId !== providerId) {
      this.currentProviderService = this.createProviderService(providerId, config);
      this.currentProviderId = providerId;
      console.log('[ServiceCenter] New provider service registered:', providerId);
    } else {
      const currentConfig = this.currentProviderService.config || {};
      const configChanged = 
        currentConfig.endpoint !== config.endpoint ||
        currentConfig.apiKey !== config.apiKey ||
        currentConfig.defaultModel !== config.defaultModel;

      if (configChanged) {
        this.currentProviderService.configure(config);
        console.log('[ServiceCenter] Existing provider service updated:', providerId);
      }
    }

    return this.currentProviderService;
  }

  /**
   * 获取当前活跃的 Provider API 服务
   */
  getCurrentProviderService() {
    if (!this.currentProviderService) {
      const settings = this.getSettingsManager().getSettings();
      if (settings && settings.apiStandard) {
        return this.updateProviderService(settings.toJSON ? settings.toJSON() : settings);
      }
      throw new Error('Chat service not registered. Please ensure provider is initialized via SettingsEventHandler.');
    }
    return this.currentProviderService;
  }

  /**
   * 获取 ChatController（单例）
   */
  getChatController() {
    if (!this.chatController) {
      this.chatController = new window.ChatController(this);
      console.log('[ServiceCenter] ChatController initialized');
    }
    return this.chatController;
  }

  /**
   * 创建 Provider API 服务实例
   */
  createProviderService(providerId, config) {
    let ServiceClass = null;
    switch (providerId) {
      case 'openai':
        ServiceClass = window.OpenAIService;
        break;
      case 'openrouter':
        ServiceClass = window.OpenRouterService;
        break;
      case 'lm-studio':
        ServiceClass = window.LMStudioService;
        break;
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
    
    if (!ServiceClass) {
      throw new Error(`Service class not found for provider: ${providerId}`);
    }
    
    const service = new ServiceClass();
    service.configure(config);
    
    console.log('[ServiceCenter] Chat service created for:', providerId);
    return service;
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ServiceCenter = ServiceCenter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServiceCenter;
}