/**
 * SettingsPage_OpenAI - OpenAI Provider 设置页面
 */

import { SettingsPage_Base } from './SettingsPage_Base.js';

class SettingsPage_OpenAI extends SettingsPage_Base {
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

export { SettingsPage_OpenAI };
