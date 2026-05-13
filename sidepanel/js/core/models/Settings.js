/**
 * 设置模型
 */

class Settings {
  constructor(options = {}) {
    // API 配置
    this.provider = options.provider || 'lm-studio'; // 'openai' | 'lm-studio'
    this.openaiApiKey = options.openaiApiKey || '';
    this.openaiEndpoint = options.openaiEndpoint || 'https://api.openai.com/v1';
    this.openaiModel = options.openaiModel || 'gpt-3.5-turbo';
    
    this.lmstudioEndpoint = options.lmstudioEndpoint || 'http://localhost:1234';
    this.lmstudioModel = options.lmstudioModel || '';
    
    // UI 配置
    this.theme = options.theme || 'light'; // 'light' | 'dark'
    
    // 其他配置
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens || null;
  }
  
  /**
   * 转换为纯对象
   */
  toJSON() {
    return {
      provider: this.provider,
      openaiApiKey: this.openaiApiKey,
      openaiEndpoint: this.openaiEndpoint,
      openaiModel: this.openaiModel,
      lmstudioEndpoint: this.lmstudioEndpoint,
      lmstudioModel: this.lmstudioModel,
      theme: this.theme,
      temperature: this.temperature,
      maxTokens: this.maxTokens
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
