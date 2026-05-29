/**
 * 设置模型
 * 支持多 API 标准配置
 */

class Settings extends window.BaseModel {
  constructor(options = {}) {
    // 设置通常是单例，ID 可以固定
    options.id = options.id || 'global_settings';
    super(options);

    // API 配置
    this.apiStandard = options.apiStandard || 'openrouter'; // 'openai' | 'openrouter' | 'lm-studio' | 'ollama' | 'anthropic'
    this.apiKey = options.apiKey || '';
    this.apiEndpoint = options.apiEndpoint || 'https://openrouter.ai/api/v1';
    this.model = options.model || '';
    this.models = Array.isArray(options.models) ? options.models : [];
    
    // 模型参数
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens ?? 2000;
    this.systemPrompt = options.systemPrompt || '';
    
    // 上下文管理
    this.autoContextTruncation = options.autoContextTruncation !== false;
    
    // 思考模式配置（单一变量）
    // 'off' 表示关闭，其他值表示开启并使用对应强度
    this.reasoningEffort = options.reasoningEffort || 'medium'; // 'off' | 'low' | 'medium' | 'high'
    
    // UI 配置
    this.theme = options.theme || 'light'; // 'light' | 'dark'
  }
  
  /**
   * 思考模式是否开启
   */
  isReasoningEnabled() {
    return this.reasoningEffort !== 'off';
  }
  
  /**
   * 获取默认端点
   */
  static getDefaultEndpoint(apiStandard) {
    const endpoints = {
      'openai': 'https://api.openai.com/v1',
      'openrouter': 'https://openrouter.ai/api/v1',
      'lm-studio': 'http://localhost:1234',
      'ollama': 'http://localhost:11434',
      'anthropic': 'https://api.anthropic.com'
    };
    return endpoints[apiStandard] || '';
  }
  
  /**
   * 转换为纯对象
   */
  toJSON() {
    return {
      ...super.toJSON(),
      ...this.apiStandard && { apiStandard: this.apiStandard },
      ...this.apiKey && { apiKey: this.apiKey },
      ...this.apiEndpoint && { apiEndpoint: this.apiEndpoint },
      ...this.model && { model: this.model },
      ...this.temperature !== undefined && { temperature: this.temperature },
      ...this.maxTokens !== undefined && { maxTokens: this.maxTokens },
      ...this.systemPrompt && { systemPrompt: this.systemPrompt },
      ...this.autoContextTruncation !== undefined && { autoContextTruncation: this.autoContextTruncation },
      ...this.reasoningEffort && { reasoningEffort: this.reasoningEffort },
      ...this.theme && { theme: this.theme },
      ...this.models && { models: this.models }
    };
  }
  
  /**
   * 从纯对象创建
   */
  static fromJSON(data) {
    return new Settings(data);
  }
}

// 导出到全局
window.Settings = Settings;
