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
   * @returns {SessionManager} SessionManager 实例
   */
  getSessionManager() {
    if (!this.sessionManager) {
      if (!window.SessionManager || !this.eventBus) {
        throw new Error('SessionManager or EventBus not initialized');
      }
      this.sessionManager = new window.SessionManager(this.eventBus);
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

// 导出单例
window.ServiceCenter = new ServiceCenter();
