/**
 * ServiceManager - 服务管理器（单例）
 * 
 * 统一管理所有 Service 实例的创建和访问
 * 提供类似依赖注入的功能，业务代码通过此管理器获取 Service
 */

class ServiceManager {
  constructor() {
    // Service 实例缓存
    this.services = new Map();
    
    // Service 类映射
    this.serviceClasses = {
      'openai': window.OpenAIService,
      'openrouter': window.OpenRouterService,
      'lm-studio': window.LMStudioService
      // TODO: 添加其他服务
      // 'ollama': window.OllamaService,
      // 'anthropic': window.AnthropicService,
    };
  }

  /**
   * 获取或创建 Service 实例
   * @param {string} apiStandard - API 标准
   * @returns {IProviderAPIService|null} Service 实例
   */
  getService(apiStandard) {
    // 如果已经存在实例，直接返回
    if (this.services.has(apiStandard)) {
      return this.services.get(apiStandard);
    }

    // 获取 Service 类
    const ServiceClass = this.serviceClasses[apiStandard];
    if (!ServiceClass) {
      console.warn(`[ServiceManager] No service class found for: ${apiStandard}`);
      return null;
    }

    // 创建新实例并缓存
    const service = new ServiceClass();
    this.services.set(apiStandard, service);
    
    console.log(`[ServiceManager] Created service: ${apiStandard}`);
    return service;
  }

  /**
   * 注册新的 Service 类
   * @param {string} apiStandard - API 标准
   * @param {Function} ServiceClass - Service 类
   */
  registerService(apiStandard, ServiceClass) {
    this.serviceClasses[apiStandard] = ServiceClass;
    // 清除已缓存的实例（如果有）
    this.services.delete(apiStandard);
    console.log(`[ServiceManager] Registered service: ${apiStandard}`);
  }

  /**
   * 清除指定的 Service 实例
   * @param {string} apiStandard - API 标准
   */
  clearService(apiStandard) {
    this.services.delete(apiStandard);
    console.log(`[ServiceManager] Cleared service: ${apiStandard}`);
  }

  /**
   * 清除所有 Service 实例
   */
  clearAll() {
    this.services.clear();
    console.log('[ServiceManager] Cleared all services');
  }

  /**
   * 获取所有支持的 API 标准
   * @returns {string[]}
   */
  getSupportedStandards() {
    return Object.keys(this.serviceClasses);
  }

  /**
   * 检查是否支持某个 API 标准
   * @param {string} apiStandard - API 标准
   * @returns {boolean}
   */
  isSupported(apiStandard) {
    return apiStandard in this.serviceClasses;
  }
}

// 不导出全局单例，由 app.js 创建实例
