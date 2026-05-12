// 适配器管理器
// 统一管理所有 API 适配器，提供简单的接口来选择和使用适配器

class AdapterManager {
  constructor() {
    // 适配器注册表
    this.adapters = new Map();
    
    // 当前使用的适配器实例
    this.currentAdapter = null;
    this.currentAdapterName = null;
    
    // 注册内置适配器
    this.registerBuiltInAdapters();
  }

  /**
   * 注册内置适配器
   */
  registerBuiltInAdapters() {
    // 检查各个适配器类是否存在
    if (typeof window.OpenAIAdapter !== 'undefined') {
      this.register('openai', new window.OpenAIAdapter());
    }
    
    // LM Studio 适配器已整合到 ProviderAdapter 中，不再单独注册
    // if (typeof window.LMStudioAdapter !== 'undefined') {
    //   this.register('lm-studio', new window.LMStudioAdapter());
    // }
    
    if (typeof window.OllamaAdapter !== 'undefined') {
      this.register('ollama', new window.OllamaAdapter());
    }
    
    if (typeof window.OpenRouterAdapter !== 'undefined') {
      this.register('openrouter', new window.OpenRouterAdapter());
    }
    
    if (typeof window.AnthropicAdapter !== 'undefined') {
      this.register('anthropic', new window.AnthropicAdapter());
    }
    
    console.log('[AdapterManager] Registered adapters:', Array.from(this.adapters.keys()));
  }

  /**
   * 注册适配器
   * @param {string} name - 适配器名称
   * @param {Object} adapter - 适配器实例
   */
  register(name, adapter) {
    if (!adapter || typeof adapter.configure !== 'function') {
      throw new Error(`Invalid adapter for ${name}`);
    }
    
    this.adapters.set(name, adapter);
    console.log(`[AdapterManager] Registered adapter: ${name}`);
  }

  /**
   * 选择适配器
   * @param {string} name - 适配器名称
   * @returns {Object} 适配器实例
   */
  select(name) {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${name}. Available: ${Array.from(this.adapters.keys()).join(', ')}`);
    }
    
    this.currentAdapter = adapter;
    this.currentAdapterName = name;
    console.log(`[AdapterManager] Selected adapter: ${name}`);
    
    return adapter;
  }

  /**
   * 获取当前适配器
   * @returns {Object} 当前适配器实例
   */
  getCurrentAdapter() {
    if (!this.currentAdapter) {
      throw new Error('No adapter selected. Call select() first.');
    }
    return this.currentAdapter;
  }

  /**
   * 配置当前适配器
   * @param {Object} config - 配置对象
   */
  configure(config) {
    const adapter = this.getCurrentAdapter();
    adapter.configure(config);
  }

  /**
   * 获取所有可用的适配器名称
   * @returns {Array<string>} 适配器名称列表
   */
  getAvailableAdapters() {
    return Array.from(this.adapters.keys());
  }

  /**
   * 检查适配器是否已注册
   * @param {string} name - 适配器名称
   * @returns {boolean}
   */
  hasAdapter(name) {
    return this.adapters.has(name);
  }

  /**
   * 获取适配器实例（不设置为当前）
   * @param {string} name - 适配器名称
   * @returns {Object} 适配器实例
   */
  getAdapter(name) {
    return this.adapters.get(name);
  }

  /**
   * 使用指定适配器执行操作
   * @param {string} name - 适配器名称
   * @param {Function} callback - 回调函数，接收适配器实例作为参数
   * @returns {*} 回调函数的返回值
   */
  withAdapter(name, callback) {
    const adapter = this.getAdapter(name);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${name}`);
    }
    return callback(adapter);
  }

  /**
   * 拉取模型列表（使用当前适配器）
   * @param {string} apiEndpoint - API 端点
   * @param {string} apiKey - API Key（可选）
   * @returns {Promise<Array>} 模型列表
   */
  async fetchModels(apiEndpoint, apiKey) {
    const adapter = this.getCurrentAdapter();
    
    if (typeof adapter.fetchModels !== 'function') {
      throw new Error(`Adapter ${this.currentAdapterName} does not support fetchModels`);
    }
    
    return await adapter.fetchModels(apiEndpoint, apiKey);
  }

  /**
   * 检测模型能力（使用当前适配器）
   * @param {string} modelName - 模型名称
   * @returns {Promise<Object|null>} 模型能力
   */
  async detectCapabilities(modelName) {
    const adapter = this.getCurrentAdapter();
    
    if (typeof adapter.detectCapabilities !== 'function') {
      return null;
    }
    
    return await adapter.detectCapabilities(modelName);
  }
}

// 创建全局单例
window.AdapterManager = new AdapterManager();
