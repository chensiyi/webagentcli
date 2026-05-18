/**
 * 服务注册中心 (Service Registry)
 * 
 * 负责统一管理应用内所有核心服务的声明、实例化与装配。
 * 采用依赖注入（DI）思想，将具体实现与业务逻辑解耦。
 */

const ServiceRegistry = {
  // 存储服务类映射: providerId -> ServiceClass
  _registry: new Map(),
  // 存储已实例化的服务对象: serviceName -> instance
  _services: {},

  /**
   * 注册服务提供者（由开发者在各自的服务文件中调用）
   * @param {string} providerId - 唯一标识 (e.g., 'openai', 'lm-studio')
   * @param {Function} ServiceClass - 服务构造函数
   */
  registerProvider(providerId, ServiceClass) {
    if (this._registry.has(providerId)) {
      console.warn(`[ServiceRegistry] Provider '${providerId}' already registered, overwriting.`);
    }
    this._registry.set(providerId, ServiceClass);
    console.log(`[ServiceRegistry] Provider registered: ${providerId}`);
  },

  /**
   * 注册并初始化聊天服务
   * @param {string} providerId - 已注册的提供商标识
   * @param {Object} config - 服务配置参数
   * @returns {Object} 原始的服务实例（仅包含 API 能力）
   */
  registerChatService(providerId, config) {
    console.log('[ServiceRegistry] Instantiating chat service:', providerId);

    const ServiceClass = this._registry.get(providerId);
    if (!ServiceClass) {
      throw new Error(`Unknown provider: '${providerId}'. Did you call registerProvider?`);
    }

    // 1. 实例化具体服务
    const serviceInstance = new ServiceClass();
    serviceInstance.configure(config);

    // 2. 缓存实例
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
  }
};

// 导出到全局
window.ServiceRegistry = ServiceRegistry;
