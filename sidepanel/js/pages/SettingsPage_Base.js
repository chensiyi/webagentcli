/**
 * SettingsPage_Base - 设置页面基类
 * 
 * 实现通用的 Provider 配置项渲染逻辑
 */

import { Log } from '../../../kernel/services/Log.js';
import { ISettings } from './ISettings.js';
import { DOM } from '../utils/dom.js';
import { UI } from '../components/UI.js';

class SettingsPage_Base extends ISettings {
  constructor() {
    super();
  }

  /**
   * 获取 Provider 名称（子类需覆盖）
   */
  getProviderName() {
    return 'Base';
  }

  /**
   * 渲染设置表单
   */
  render(container, settings, onUpdate) {
    const { create } = DOM;
    
    // API Key（如果需要）
    if (this.requiresApiKey()) {
      container.appendChild(this._createApiKeySection(settings, onUpdate));
    }
    
    // API Endpoint
    container.appendChild(this._createApiEndpointSection(settings, onUpdate));
    
    // Temperature
    container.appendChild(this._createTemperatureSection(settings, onUpdate));
    
    // Max Tokens
    container.appendChild(this._createMaxTokensSection(settings, onUpdate));
    
    // System Prompt
    container.appendChild(this._createSystemPromptSection(settings, onUpdate));
    
    // Thinking Effort
    container.appendChild(this._createThinkingEffortSection(settings, onUpdate));
    
    // 额外配置（如果子类有）
    this.renderExtraConfig(container, settings, onUpdate);
  }

  /**
   * 验证设置
   */
  validate(settings) {
    if (!settings.apiEndpoint) {
      Log.warn('SettingsPage_Base', 'API Endpoint is required');
      return false;
    }
    
    if (this.requiresApiKey() && !settings.apiKey) {
      Log.warn('SettingsPage_Base', 'API Key is required for this provider');
      return false;
    }
    
    return true;
  }

  /**
   * 获取默认设置
   */
  getDefaultSettings() {
    return {
      apiEndpoint: '',
      apiKey: '',
      model: '',
      temperature: 0.7,
      maxTokens: 4000,
      systemPrompt: '',
      reasoningEffort: 'medium'
    };
  }

  /**
   * 是否需要 API Key
   */
  requiresApiKey() {
    return true;
  }

  /**
   * 渲染额外配置（子类可覆盖）
   */
  renderExtraConfig(container, settings, onUpdate) {
    // 默认不渲染额外配置
  }

  // ==================== 通用配置项创建方法 ====================

  _createApiKeySection(settings, onUpdate) {
    return UI.FormGroup({ label: 'API Key' }, [
      UI.Input({
        id: 'settings-api-key',
        type: 'password',
        placeholder: '输入 API Key（保密内容不显示）',
        value: '', // 注意：不填充已保存的 API Key，保护隐私
        onInput: (e) => onUpdate('apiKey', e.target.value)
      })
    ]);
  }

  _createApiEndpointSection(settings, onUpdate) {
    return UI.FormGroup({ label: 'API Endpoint' }, [
      UI.Input({
        id: 'settings-api-endpoint',
        placeholder: 'https://api.example.com/v1',
        value: settings.apiEndpoint || '',
        onInput: (e) => onUpdate('apiEndpoint', e.target.value)
      })
    ]);
  }

  _createTemperatureSection(settings, onUpdate) {
    return UI.FormGroup({ label: '温度 (0-2)' }, [
      UI.Input({
        id: 'settings-temperature',
        type: 'number',
        placeholder: '0.7',
        value: settings.temperature || 0.7,
        onInput: (e) => onUpdate('temperature', parseFloat(e.target.value))
      })
    ]);
  }

  _createMaxTokensSection(settings, onUpdate) {
    return UI.FormGroup({ label: '最大 Token' }, [
      UI.Input({
        id: 'settings-max-tokens',
        type: 'number',
        placeholder: '4000',
        value: settings.maxTokens || 4000,
        onInput: (e) => onUpdate('maxTokens', parseInt(e.target.value))
      })
    ]);
  }

  _createSystemPromptSection(settings, onUpdate) {
    return UI.FormGroup({ label: '系统提示词' }, [
      UI.Textarea({
        id: 'settings-system-prompt',
        placeholder: '可选，设置 AI 的行为和角色',
        value: settings.systemPrompt || '',
        onInput: (e) => onUpdate('systemPrompt', e.target.value)
      })
    ]);
  }

  _createThinkingEffortSection(settings, onUpdate) {
    const options = [
      { value: 'off', label: '关闭' },
      { value: 'low', label: '低 (快速)' },
      { value: 'medium', label: '中 (平衡)' },
      { value: 'high', label: '高 (深入)' }
    ];

    return UI.FormGroup({ label: '默认思考强度 (Reasoning Effort)' }, [
      UI.Select({
        id: 'settings-reasoning-effort',
        options: options,
        value: settings.reasoningEffort || 'medium',
        onChange: (val) => onUpdate('reasoningEffort', val)
      })
    ]);
  }
}

// 导出到全局
export { SettingsPage_Base };
