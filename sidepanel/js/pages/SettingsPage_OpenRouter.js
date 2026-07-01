/**
 * SettingsPage_OpenRouter - OpenRouter Provider 设置页面
 */

import { SettingsPage_Base } from './SettingsPage_Base.js';

class SettingsPage_OpenRouter extends SettingsPage_Base {
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

export { SettingsPage_OpenRouter };
