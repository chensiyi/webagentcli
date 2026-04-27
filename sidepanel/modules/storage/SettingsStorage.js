// 设置存储管理器
// 负责设置的加载、保存、验证等业务逻辑

class SettingsStorage {
  constructor() {
    this.defaultSettings = {
      apiKey: '',
      apiEndpoint: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: '',
      theme: 'light',
      autoContextTruncation: true
    };
  }

  /**
   * 加载设置
   */
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings || {};
        resolve({ ...this.defaultSettings, ...settings });
      });
    });
  }

  /**
   * 保存设置
   */
  async saveSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ settings }, () => {
        console.log('[SettingsStorage] Settings saved:', settings);
        resolve();
      });
    });
  }

  /**
   * 验证设置
   */
  validateSettings(settings) {
    const errors = [];

    // 验证API端点
    if (settings.apiEndpoint && !this.isValidUrl(settings.apiEndpoint)) {
      errors.push('API 端点格式不正确');
    }

    // 验证温度
    if (settings.temperature < 0 || settings.temperature > 2) {
      errors.push('温度值必须在 0-2 之间');
    }

    // 验证最大Token
    if (settings.maxTokens < 100 || settings.maxTokens > 8000) {
      errors.push('最大 Token 必须在 100-8000 之间');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证URL格式
   */
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * 重置设置为默认值
   */
  resetToDefaults() {
    return { ...this.defaultSettings };
  }

  /**
   * 导出设置为JSON
   */
  exportSettings(settings) {
    return JSON.stringify(settings, null, 2);
  }

  /**
   * 从JSON导入设置
   */
  importSettings(jsonString) {
    try {
      const settings = JSON.parse(jsonString);
      return {
        success: true,
        settings: { ...this.defaultSettings, ...settings }
      };
    } catch (error) {
      return {
        success: false,
        error: 'JSON 格式错误'
      };
    }
  }

  /**
   * 初始化AI管理器
   */
  initializeAIManager(settings) {
    if (!window.Agent) return null;
    
    const ai = new window.Agent();
    ai.registerProvider('default', {
      endpoint: settings.apiEndpoint,
      apiKey: settings.apiKey || 'local',
      defaultModel: settings.model
    });
    ai.setProvider('default');
    
    return ai;
  }
}

// 导出
window.SettingsStorage = SettingsStorage;
