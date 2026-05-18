/**
 * 服务注册中心 (Service Registry)
 * 
 * 负责统一管理应用内所有核心服务的声明、实例化与装配。
 * 采用依赖注入（DI）思想，将具体实现与业务逻辑解耦。
 */

const ServiceRegistry = {
  // 存储已注册的服务实例
  _services: {},

  /**
   * 注册并初始化聊天服务
   * @param {string} provider - 服务提供商标识 (openai, lm-studio, etc.)
   * @param {Object} config - 服务配置参数
   * @returns {Object} 装配完成的服务实例
   */
  registerChatService(provider, config) {
    console.log('[ServiceRegistry] Registering chat service:', provider);

    let ServiceClass = null;
    switch (provider) {
      case 'openai': ServiceClass = window.OpenAIService; break;
      case 'openrouter': ServiceClass = window.OpenRouterService; break;
      case 'lm-studio': ServiceClass = window.LMStudioService; break;
      default: throw new Error(`Unknown provider: ${provider}`);
    }

    if (!ServiceClass) {
      throw new Error(`Service class not found for provider: ${provider}`);
    }

    // 1. 实例化具体服务
    const serviceInstance = new ServiceClass();
    serviceInstance.configure(config);

    // 2. 装配标准交互能力 (Mixin IChatService UI Logic)
    this._mixinStandardCapabilities(serviceInstance);

    // 3. 缓存实例
    this._services.chat = serviceInstance;

    return serviceInstance;
  },

  /**
   * 获取已注册的服务实例
   * @param {string} name - 服务名称 (e.g., 'chat')
   * @returns {Object|null}
   */
  getService(name) {
    return this._services[name] || null;
  },

  /**
   * 为服务实例混入标准的 UI 交互方法
   * @param {Object} serviceInstance - 目标服务实例
   */
  _mixinStandardCapabilities(serviceInstance) {
    if (!window.IChatService) return;

    // 将 IChatService 中的通用交互逻辑绑定到当前实例
    Object.assign(serviceInstance, {
      handleStreamReasoning: window.IChatService.handleStreamReasoning.bind(window.IChatService),
      handleStreamStart: window.IChatService.handleStreamStart.bind(window.IChatService),
      handleStreamUpdate: window.IChatService.handleStreamUpdate.bind(window.IChatService),
      handleStreamComplete: window.IChatService.handleStreamComplete.bind(window.IChatService),
      handleStreamError: window.IChatService.handleStreamError.bind(window.IChatService),
      confirmDeleteMessage: window.IChatService.confirmDeleteMessage.bind(window.IChatService)
    });
  }
};

// 导出到全局
window.ServiceRegistry = ServiceRegistry;
