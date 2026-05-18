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
      
      // 混入标准的 UI 交互逻辑（来自 IChatService）
      ...(window.IChatService ? {
        confirmDeleteMessage: window.IChatService.confirmDeleteMessage.bind(window.IChatService),
        handleStreamStart: window.IChatService.handleStreamStart.bind(window.IChatService),
        handleStreamUpdate: window.IChatService.handleStreamUpdate.bind(window.IChatService),
        handleStreamReasoning: window.IChatService.handleStreamReasoning.bind(window.IChatService),
        handleStreamComplete: window.IChatService.handleStreamComplete.bind(window.IChatService),
        handleStreamError: window.IChatService.handleStreamError.bind(window.IChatService)
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
