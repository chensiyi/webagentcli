/**
 * ServiceCenter - 框架核心服务管理中心
 * 
 * 职责：
 * - 管理 ServiceRegistry（服务注册中心）
 * - 管理 EventBus（事件总线）
 * - 提供全局框架服务的统一访问入口与装配逻辑
 */

class ServiceCenter {
  constructor(eventBus = window.EventBus) {
    this.eventBus = eventBus;
    
    // 服务实例缓存
    this.sessionManager = null;
    this.settingsController = null;
    this.storageController = null;
    this.scriptsController = null;
    this.currentProviderService = null; // 当前活跃的 Provider API 服务
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
    
    if (!window.SessionController || !this.eventBus) {
      throw new Error('SessionController or EventBus not initialized');
    }
    
    this.sessionManager = new window.SessionController(this.eventBus);
    
    console.log('[ServiceCenter] SessionController initialized');
    
    // 返回 Promise，等待异步加载完成
    return this.sessionManager.initialize();
  }

  /**
   * 获取 SessionManager 实例（同步，要求已初始化）
   * @returns {SessionController} SessionManager 实例
   */
  getSessionManager() {
    if (!this.sessionManager) {
      throw new Error('SessionManager not initialized. Call initializeSessionManager() first.');
    }
    return this.sessionManager;
  }

  /**
   * 获取 SettingsController 实例
   * @returns {SettingsController} SettingsController 实例
   */
  getSettingsController() {
    if (!this.settingsController) {
      if (!window.SettingsController || !this.eventBus) {
        throw new Error('SettingsController or EventBus not initialized');
      }
      this.settingsController = new window.SettingsController(this.eventBus);
      console.log('[ServiceCenter] SettingsController initialized');
    }
    return this.settingsController;
  }

  /**
   * 获取 StorageController 实例
   * @returns {StorageController} StorageController 实例
   */
  getStorageController() {
    if (!this.storageController) {
      if (!window.StorageController) {
        throw new Error('StorageController not initialized');
      }
      this.storageController = new window.StorageController();
      console.log('[ServiceCenter] StorageController initialized');
    }
    return this.storageController;
  }

  /**
   * 获取 ScriptsController 实例
   * @returns {ScriptsController} ScriptsController 实例
   */
  getScriptsController() {
    if (!this.scriptsController) {
      if (!window.ScriptsController) {
        throw new Error('ScriptsController not initialized');
      }
      this.scriptsController = new window.ScriptsController();
      console.log('[ServiceCenter] ScriptsController initialized');
    }
    return this.scriptsController;
  }

  /**
   * 获取当前活跃的 Provider API 服务（从 Settings 自动配置）
   * @returns {IProviderAPIService} Provider API 服务实例
   */
  getCurrentProviderService() {
    // 如果已经有缓存的当前服务，直接返回
    if (this.currentProviderService) {
      return this.currentProviderService;
    }
    
    // 否则从 Settings 读取配置并创建
    const settingsController = this.getSettingsController();
    const settings = settingsController.getSettings();
    
    if (!settings || !settings.apiStandard) {
      throw new Error('Chat service not configured');
    }
    
    this.currentProviderService = this.createProviderService(settings.apiStandard, {
      endpoint: settings.apiEndpoint,
      apiKey: settings.apiKey,
      defaultModel: settings.model || 'default'
    });
    
    return this.currentProviderService;
  }

  /**
   * 获取当前 Chat 实例（单例）
   * @returns {ChatController} ChatController 实例
   */
  getCurrentChat() {
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
