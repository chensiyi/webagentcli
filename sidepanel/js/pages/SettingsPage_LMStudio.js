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
      systemPrompt: '',
      contextWindow: 8192
    };
  }

  renderExtraConfig(container, settings, onUpdate) {
    const { create } = window.DOM;
    
    container.appendChild(create('label', { 
      className: 'setting-label', 
      text: '上下文窗口大小' 
    }));
    
    container.appendChild(create('input', {
      className: 'input',
      attrs: { 
        type: 'number', 
        min: '512', 
        max: '32768',
        step: '512'
      },
      value: settings.contextWindow || 8192,
      onInput: (e) => onUpdate('contextWindow', parseInt(e.target.value))
    }));
    
    container.appendChild(create('p', {
      className: 'setting-hint',
      style: { fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' },
      text: 'LM Studio 本地运行的上下文窗口大小（tokens）'
    }));
  }
}

window.SettingsPage_LMStudio = SettingsPage_LMStudio;
