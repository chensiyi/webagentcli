/**
 * SettingsPage_LMStudio - LM Studio Provider 设置页面
 * 
 * LM Studio 是本地服务，不需要 API Key，额外支持上下文窗口配置
 */

class SettingsPage_LMStudio extends window.SettingsPage_Base {
  getProviderName() {
    return 'LM Studio';
  }

  requiresApiKey() {
    return false; // 本地服务不需要 API Key
  }

  getDefaultSettings() {
    return {
      apiEndpoint: 'http://localhost:1234',
      apiKey: '',
      model: '',
      temperature: 0.7,
      maxTokens: 4000,
      systemPrompt: ''
      // 注意：LM Studio 使用标准的 maxTokens 参数，不需要额外的 contextWindow
    };
  }

  renderExtraConfig(container, settings, onUpdate) {
    // LM Studio 不需要额外配置，所有参数都通过基类提供
    // 如果需要添加 LM Studio 特有的配置（如 GPU 层数、量化等），可以在这里扩展
  }
}

window.SettingsPage_LMStudio = SettingsPage_LMStudio;
