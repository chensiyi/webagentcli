/**
 * ServiceCenter - 框架核心服务管理中心
 * 
 * 职责：
 * - 管理 EventBus（事件总线）
 * - 提供全局框架服务的统一访问入口
 */

class ServiceCenter {
  constructor(eventBus = window.EventBus) {
    this.eventBus = eventBus;
    
    // 服务实例缓存
    this.sessionManager = null;
    this.settingsManager = null;
    this.storageManager = null;
    this.scriptsManager = null;
    this.modelManager = null;
    this.currentProviderService = null; // 当前活跃的 Provider API 服务
    this.currentProviderId = null;
    this.chatController = null; // ChatController 单例
  }

  /**
   * 获取事件总线实例
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * 初始化 SessionManager（等待异步加载完成）
   * @returns {Promise<void>}
   */
  initializeSessionManager() {
    if (this.sessionManager) {
      return Promise.resolve(); // 已经初始化
    }
    
    if (!window.SessionManager || !this.eventBus) {
      throw new Error('SessionManager or EventBus not initialized');
    }
    
    this.sessionManager = new window.SessionManager(this.eventBus);
    
    console.log('[ServiceCenter] SessionManager initialized');
    
    // 返回 Promise，等待异步加载完成
    return this.sessionManager.initialize();
  }

  /**
   * 获取 SessionManager 实例（同步，要求已初始化）
   * @returns {SessionManager} SessionManager 实例
   */
  getSessionManager() {
    if (!this.sessionManager) {
      throw new Error('SessionManager not initialized. Call initializeSessionManager() first.');
    }
    return this.sessionManager;
  }

  /**
   * 获取 SettingsManager 实例
   * @returns {SettingsManager} SettingsManager 实例
   */
  getSettingsManager() {
    if (!this.settingsManager) {
      if (!window.SettingsManager || !this.eventBus) {
        throw new Error('SettingsManager or EventBus not initialized');
      }
      this.settingsManager = new window.SettingsManager(this);
      console.log('[ServiceCenter] SettingsManager initialized');
    }
    return this.settingsManager;
  }

  /**
   * 获取 StorageManager 实例
   * @returns {StorageManager} StorageManager 实例
   */
  getStorageManager() {
    if (!this.storageManager) {
      if (!window.StorageManager) {
        throw new Error('StorageManager not initialized');
      }
      this.storageManager = new window.StorageManager(this);
      console.log('[ServiceCenter] StorageManager initialized');
    }
    return this.storageManager;
  }

  /**
   * 获取 ScriptsManager 实例
   * @returns {ScriptsManager} ScriptsManager 实例
   */
  getScriptsManager() {
    if (!this.scriptsManager) {
      if (!window.ScriptsManager) {
        throw new Error('ScriptsManager not initialized');
      }
      this.scriptsManager = new window.ScriptsManager(this);
      console.log('[ServiceCenter] ScriptsManager initialized');
    }
    return this.scriptsManager;
  }

  /**
   * 获取 ModelManager 实例
   * @returns {ModelManager} ModelManager 实例
   */
  getModelManager() {
    if (!this.modelManager) {
      if (!window.ModelManager) {
        throw new Error('ModelManager not initialized');
      }
      this.modelManager = new window.ModelManager(this);
      console.log('[ServiceCenter] ModelManager initialized');
    }
    return this.modelManager;
  }

  /**
   * 重置当前 Provider API 服务（当设置变更时调用）
   */
  resetProviderService() {
    this.currentProviderService = null;
    this.currentProviderId = null;
    console.log('[ServiceCenter] Provider service reset');
  }

  /**
   * 获取当前活跃的 Provider API 服务（从 Settings 自动配置）
   * @returns {IProviderAPIService} Provider API 服务实例
   */
  getCurrentProviderService() {
    const settingsManager = this.getSettingsManager();
    const settings = settingsManager.getSettings();
    
    if (!settings || !settings.apiStandard) {
      throw new Error('Chat service not configured');
    }
    
    const providerId = settings.apiStandard;
    const config = {
      endpoint: settings.apiEndpoint,
      apiKey: settings.apiKey,
      defaultModel: settings.model || 'default'
    };

    // 如果服务不存在，或者 Provider ID 变了，创建新服务
    if (!this.currentProviderService || this.currentProviderId !== providerId) {
      this.currentProviderService = this.createProviderService(providerId, config);
      this.currentProviderId = providerId;
      return this.currentProviderService;
    }

    // 否则，仅更新现有服务的配置
    this.currentProviderService.configure(config);
    
    return this.currentProviderService;
  }

  /**
   * 获取当前 ChatController 实例（单例）
   * @returns {ChatController} ChatController 实例
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
   * @param {string} providerId - 服务提供商标识 ('openai', 'openrouter', 'lm-studio')
   * @param {Object} config - 服务配置
   * @returns {IProviderAPIService} Provider API 服务实例
   */
  createProviderService(providerId, config) {
    // 根据 providerId 选择对应的 Service 类
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
    
    // 创建并配置服务实例
    const service = new ServiceClass();
    service.configure(config);
    
    console.log('[ServiceCenter] Chat service created for:', providerId);
    return service;
  }
}

// 导出类（由 app.js 创建实例）
if (typeof window !== 'undefined') {
  window.ServiceCenter = ServiceCenter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServiceCenter;
}
