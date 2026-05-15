/**
 * ProviderServiceFactory
 * 
 * 根据 API 标准创建对应的 Provider Service 实例
 * 业务代码通过此工厂获取 Service，直接调用其方法
 */

class ProviderServiceFactory {
  /**
   * 根据 API 标准创建 Service 实例
   * @param {string} apiStandard - API 标准（openai, lm-studio, ollama, openrouter, anthropic）
   * @returns {IProviderAPIService|null} Service 实例
   */
  static create(apiStandard) {
    const serviceMap = {
      'openai': window.OpenAIService,
      'lm-studio': window.LMStudioService
      // TODO: 添加其他服务
      // 'ollama': window.OllamaService,
      // 'openrouter': window.OpenRouterService,
      // 'anthropic': window.AnthropicService,
    };

    const ServiceClass = serviceMap[apiStandard];
    
    if (!ServiceClass) {
      console.warn(`[ProviderServiceFactory] No service found for standard: ${apiStandard}`);
      return null;
    }

    return new ServiceClass();
  }

  /**
   * 获取所有支持的 API 标准
   * @returns {string[]} 支持的 API 标准列表
   */
  static getSupportedStandards() {
    return ['openai', 'lm-studio'];
  }
}

// 导出到全局
window.ProviderServiceFactory = ProviderServiceFactory;
