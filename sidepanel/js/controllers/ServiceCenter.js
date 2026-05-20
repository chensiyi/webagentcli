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
    this.serviceRegistry = window.ServiceRegistry;
    
    // 服务实例缓存
    this.sessionManager = null;
    this.settingsController = null;
    this.chatControllers = new Map(); // sessionId -> ChatController
  }

  /**
   * 初始化并获取 SessionManager 实例
   * @returns {SessionController} SessionManager 实例
   */
  getSessionManager() {
    if (!this.sessionManager) {
      if (!window.SessionController || !this.eventBus) {
        throw new Error('SessionController or EventBus not initialized');
      }
      this.sessionManager = new window.SessionController(this.eventBus);
      console.log('[ServiceCenter] SessionController initialized');
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
   * 获取或创建 ChatController 实例
   * @param {IProviderAPIService} chatService - Provider API 服务实例
   * @returns {ChatController} ChatController 实例
   */
  getChatController(chatService) {
    if (!chatService) {
      throw new Error('ChatService is required');
    }
    
    // 获取当前会话 ID
    const sessionManager = this.getSessionManager();
    const sessionId = sessionManager.currentSessionId;
    
    if (!sessionId) {
      // 如果没有会话，返回 EphemeralChat
      return new window.EphemeralChat(sessionManager, chatService, this.eventBus);
    }
    
    // 检查缓存
    if (this.chatControllers.has(sessionId)) {
      const cachedChat = this.chatControllers.get(sessionId);
      if (cachedChat.getService() !== chatService) {
        cachedChat.setService(chatService);
      }
      return cachedChat;
    }
    
    // 创建新的 ChatController
    const session = sessionManager.getCurrentSession();
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    const chatController = new window.ChatController(session, chatService, sessionManager, this.eventBus);
    this.chatControllers.set(sessionId, chatController);
    
    console.log('[ServiceCenter] Created ChatController for session:', sessionId);
    return chatController;
  }

  /**
   * 注册并获取聊天服务实例（Facade 模式）
   * @param {string} providerId - 服务提供商标识
   * @param {Object} config - 服务配置
   * @returns {Object} 封装后的 ChatService 实例
   */
  createChatService(providerId, config) {
    if (!this.serviceRegistry) {
      throw new Error('ServiceRegistry not initialized');
    }

    // 获取原始 API 服务实例
    const apiService = this.serviceRegistry.registerChatService(providerId, config);

    console.log('[ServiceCenter] Chat service created for:', providerId);
    return apiService;
  }

  /**
   * 获取事件总线实例
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * 获取服务注册中心实例
   */
  getServiceRegistry() {
    return this.serviceRegistry;
  }
}

// 导出类（由 app.js 创建实例）
if (typeof window !== 'undefined') {
  window.ServiceCenter = ServiceCenter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServiceCenter;
}
