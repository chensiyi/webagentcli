/**
 * SettingsPage_Base - 设置页面基类
 * 
 * 实现通用的 Provider 配置项渲染逻辑
 */

class SettingsPage_Base extends window.ISettings {
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
    const { create } = window.DOM;
    
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
    
    // 额外配置（如果子类有）
    this.renderExtraConfig(container, settings, onUpdate);
  }

  /**
   * 验证设置
   */
  validate(settings) {
    if (!settings.apiEndpoint) {
      console.warn('[SettingsPage_Base] API Endpoint is required');
      return false;
    }
    
    if (this.requiresApiKey() && !settings.apiKey) {
      console.warn('[SettingsPage_Base] API Key is required for this provider');
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
      systemPrompt: ''
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
    const { create } = window.DOM;
    
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: 'API Key' }),
      create('input', {
        className: 'input',
        attrs: { 
          type: 'password', 
          placeholder: '输入 API Key' 
        },
        value: settings.apiKey || '',
        onInput: (e) => onUpdate('apiKey', e.target.value)
      })
    ]);
  }

  _createApiEndpointSection(settings, onUpdate) {
    const { create } = window.DOM;
    
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: 'API Endpoint' }),
      create('input', {
        className: 'input',
        attrs: { 
          type: 'text', 
          placeholder: 'https://api.example.com/v1' 
        },
        value: settings.apiEndpoint || '',
        onInput: (e) => onUpdate('apiEndpoint', e.target.value)
      })
    ]);
  }

  _createTemperatureSection(settings, onUpdate) {
    const { create } = window.DOM;
    
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '温度 (0-2)' }),
      create('input', {
        className: 'input',
        attrs: { 
          type: 'number', 
          min: '0', 
          max: '2', 
          step: '0.1' 
        },
        value: settings.temperature || 0.7,
        onInput: (e) => onUpdate('temperature', parseFloat(e.target.value))
      })
    ]);
  }

  _createMaxTokensSection(settings, onUpdate) {
    const { create } = window.DOM;
    
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '最大 Token' }),
      create('input', {
        className: 'input',
        attrs: { 
          type: 'number', 
          min: '100', 
          max: '32000' 
        },
        value: settings.maxTokens || 4000,
        onInput: (e) => onUpdate('maxTokens', parseInt(e.target.value))
      })
    ]);
  }

  _createSystemPromptSection(settings, onUpdate) {
    const { create } = window.DOM;
    
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '系统提示词' }),
      create('textarea', {
        className: 'input setting-textarea',
        attrs: { placeholder: '可选，设置 AI 的行为和角色' },
        value: settings.systemPrompt || '',
        onInput: (e) => onUpdate('systemPrompt', e.target.value)
      })
    ]);
  }
}

// 导出到全局
window.SettingsPage_Base = SettingsPage_Base;
