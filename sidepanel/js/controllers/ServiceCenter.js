/**
 * ServiceCenter - 框架核心服务管理中心
 * 
 * 职责：
 * - 管理 ServiceRegistry（服务注册中心）
 * - 管理 EventBus（事件总线）
 * - 提供全局框架服务的统一访问入口与装配逻辑
 */

class ServiceCenter {
  constructor() {
    this.serviceRegistry = window.ServiceRegistry;
    this.eventBus = window.EventBus;
    this.sessionManager = null;
  }

  /**
   * 初始化并获取 SessionManager 实例
   * @returns {ISessionManager} SessionManager 实例
   */
  getSessionManager() {
    if (!this.sessionManager) {
      if (!window.ISessionManager || !this.eventBus) {
        throw new Error('ISessionManager or EventBus not initialized');
      }
      this.sessionManager = new window.ISessionManager(this.eventBus);
      console.log('[ServiceCenter] SessionManager initialized');
    }
    return this.sessionManager;
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

    // 1. 获取原始 API 服务实例
    const apiService = this.serviceRegistry.registerChatService(providerId, config);

    // 2. 封装：组合底层 API 能力与标准 UI 交互逻辑
    const chatServiceFacade = {
      // 转发底层 API 能力
      configure: apiService.configure.bind(apiService),
      chat: apiService.chat.bind(apiService),
      chatStream: apiService.chatStream.bind(apiService),
      cancel: apiService.cancel.bind(apiService),
      listModels: apiService.listModels ? apiService.listModels.bind(apiService) : undefined,
      getModelDetails: apiService.getModelDetails ? apiService.getModelDetails.bind(apiService) : undefined,
            
      // 混入标准的 UI 交互逻辑（来自 IChatUIHandler）
      ...(window.IChatUIHandler ? {
        confirmDeleteMessage: window.IChatUIHandler.confirmDeleteMessage.bind(window.IChatUIHandler),
        handleStreamStart: window.IChatUIHandler.handleStreamStart.bind(window.IChatUIHandler),
        handleStreamUpdate: window.IChatUIHandler.handleStreamUpdate.bind(window.IChatUIHandler),
        handleStreamReasoning: window.IChatUIHandler.handleStreamReasoning.bind(window.IChatUIHandler),
        handleStreamComplete: window.IChatUIHandler.handleStreamComplete.bind(window.IChatUIHandler),
        handleStreamError: window.IChatUIHandler.handleStreamError.bind(window.IChatUIHandler)
      } : {})
    };

    console.log('[ServiceCenter] Chat service facade created for:', providerId);
    return chatServiceFacade;
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

// 导出单例
window.ServiceCenter = new ServiceCenter();
