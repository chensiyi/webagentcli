/**
 * SettingsPage_OpenRouter - OpenRouter Provider 设置页面
 */

class SettingsPage_OpenRouter extends window.SettingsPage_Base {
  getProviderName() {
    return 'OpenRouter';
  }

  getDefaultSettings() {
    return {
      apiEndpoint: 'https://openrouter.ai/api/v1',
      apiKey: '',
      model: '',
      temperature: 0.7,
      maxTokens: 4000,
      systemPrompt: ''
    };
  }
}

window.SettingsPage_OpenRouter = SettingsPage_OpenRouter;
