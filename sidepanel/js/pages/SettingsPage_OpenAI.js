/**
 * SettingsPage_OpenAI - OpenAI Provider 设置页面
 */

class SettingsPage_OpenAI extends window.SettingsPage_Base {
  getProviderName() {
    return 'OpenAI';
  }

  getDefaultSettings() {
    return {
      apiEndpoint: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 4000,
      systemPrompt: ''
    };
  }
}

window.SettingsPage_OpenAI = SettingsPage_OpenAI;
