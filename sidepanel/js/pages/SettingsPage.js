/**
 * 设置页面 UI
 */

window.Pages = window.Pages || {};

window.Pages.settings = function(container) {
  const { create, clear } = window.DOM;
  const settingsController = window.SettingsController;
  
  /**
   * 渲染设置页面
   */
  function render() {
    clear(container);
    
    const settings = settingsController.getSettings();
    
    const page = create('div', { className: 'page' });
    
    // 头部
    const header = create('div', { className: 'page-header' }, [
      create('h2', { 
        className: 'page-title',
        text: '设置'
      })
    ]);
    page.appendChild(header);
    
    // 内容区
    const content = create('div', { className: 'page-content' }, [
      createProviderSection(settings),
      createOpenAISection(settings),
      createLMStudioSection(settings),
      createUISettingsSection(settings)
    ]);
    page.appendChild(content);
    
    // 底部按钮
    const footer = create('div', { className: 'page-footer' }, [
      create('button', {
        className: 'btn btn-primary',
        text: '保存设置',
        onClick: saveSettings
      }),
      create('button', {
        className: 'btn btn-secondary',
        text: '重置',
        style: { marginLeft: '8px' },
        onClick: resetSettings
      })
    ]);
    page.appendChild(footer);
    
    container.appendChild(page);
  }
  
  /**
   * 创建提供商选择区
   */
  function createProviderSection(settings) {
    const section = create('div', { className: 'section' }, [
      create('h3', { text: 'AI 服务商' }),
      create('div', { className: 'setting-row' }, [
        create('label', { text: '选择提供商:' }),
        create('select', {
          id: 'provider-select',
          attrs: { value: settings.provider },
          style: { marginLeft: '8px', flex: 1 },
          onChange: (e) => {
            updateSetting('provider', e.target.value);
          }
        }, [
          create('option', { attrs: { value: 'openai' }, text: 'OpenAI' }),
          create('option', { attrs: { value: 'lm-studio' }, text: 'LM Studio' })
        ])
      ])
    ]);
    
    return section;
  }
  
  /**
   * 创建 OpenAI 设置区
   */
  function createOpenAISection(settings) {
    const isVisible = settings.provider === 'openai';
    
    const section = create('div', { 
      className: 'section',
      style: { display: isVisible ? 'block' : 'none' }
    }, [
      create('h3', { text: 'OpenAI 设置' }),
      create('div', { className: 'setting-row' }, [
        create('label', { text: 'API Key:' }),
        create('input', {
          type: 'password',
          id: 'openai-api-key',
          attrs: { 
            value: settings.openaiApiKey,
            placeholder: 'sk-...'
          },
          style: { marginLeft: '8px', flex: 1 },
          onInput: (e) => {
            updateSetting('openaiApiKey', e.target.value);
          }
        })
      ]),
      create('div', { className: 'setting-row' }, [
        create('label', { text: 'API 端点:' }),
        create('input', {
          type: 'text',
          id: 'openai-endpoint',
          attrs: { 
            value: settings.openaiEndpoint,
            placeholder: 'https://api.openai.com/v1'
          },
          style: { marginLeft: '8px', flex: 1 },
          onInput: (e) => {
            updateSetting('openaiEndpoint', e.target.value);
          }
        })
      ]),
      create('div', { className: 'setting-row' }, [
        create('label', { text: '模型:' }),
        create('input', {
          type: 'text',
          id: 'openai-model',
          attrs: { 
            value: settings.openaiModel,
            placeholder: 'gpt-3.5-turbo'
          },
          style: { marginLeft: '8px', flex: 1 },
          onInput: (e) => {
            updateSetting('openaiModel', e.target.value);
          }
        })
      ])
    ]);
    
    return section;
  }
  
  /**
   * 创建 LM Studio 设置区
   */
  function createLMStudioSection(settings) {
    const isVisible = settings.provider === 'lm-studio';
    
    const section = create('div', { 
      className: 'section',
      style: { display: isVisible ? 'block' : 'none' }
    }, [
      create('h3', { text: 'LM Studio 设置' }),
      create('div', { className: 'setting-row' }, [
        create('label', { text: '服务器地址:' }),
        create('input', {
          type: 'text',
          id: 'lmstudio-endpoint',
          attrs: { 
            value: settings.lmstudioEndpoint,
            placeholder: 'http://localhost:1234'
          },
          style: { marginLeft: '8px', flex: 1 },
          onInput: (e) => {
            updateSetting('lmstudioEndpoint', e.target.value);
          }
        })
      ]),
      create('div', { className: 'setting-row' }, [
        create('label', { text: '模型:' }),
        create('input', {
          type: 'text',
          id: 'lmstudio-model',
          attrs: { 
            value: settings.lmstudioModel,
            placeholder: '留空使用默认模型'
          },
          style: { marginLeft: '8px', flex: 1 },
          onInput: (e) => {
            updateSetting('lmstudioModel', e.target.value);
          }
        })
      ])
    ]);
    
    return section;
  }
  
  /**
   * 创建 UI 设置区
   */
  function createUISettingsSection(settings) {
    const section = create('div', { className: 'section' }, [
      create('h3', { text: '界面设置' }),
      create('div', { className: 'setting-row' }, [
        create('label', { text: '主题:' }),
        create('select', {
          id: 'theme-select',
          attrs: { value: settings.theme },
          style: { marginLeft: '8px', flex: 1 },
          onChange: (e) => {
            updateSetting('theme', e.target.value);
            applyTheme(e.target.value);
          }
        }, [
          create('option', { attrs: { value: 'light' }, text: '浅色' }),
          create('option', { attrs: { value: 'dark' }, text: '深色' })
        ])
      ]),
      create('div', { className: 'setting-row' }, [
        create('label', { text: '温度 (0-2):' }),
        create('input', {
          type: 'number',
          id: 'temperature',
          attrs: { 
            value: settings.temperature,
            min: 0,
            max: 2,
            step: 0.1
          },
          style: { marginLeft: '8px', width: '100px' },
          onInput: (e) => {
            updateSetting('temperature', parseFloat(e.target.value) || 0.7);
          }
        })
      ]),
      create('div', { className: 'setting-row' }, [
        create('label', { text: '最大 Token 数:' }),
        create('input', {
          type: 'number',
          id: 'max-tokens',
          attrs: { 
            value: settings.maxTokens || '',
            placeholder: '留空表示不限制'
          },
          style: { marginLeft: '8px', width: '100px' },
          onInput: (e) => {
            const val = e.target.value ? parseInt(e.target.value) : null;
            updateSetting('maxTokens', val);
          }
        })
      ])
    ]);
    
    return section;
  }
  
  /**
   * 更新设置
   */
  function updateSetting(key, value) {
    const updates = {};
    updates[key] = value;
    settingsController.updateSettings(updates);
  }
  
  /**
   * 保存设置
   */
  function saveSettings() {
    // 设置已自动保存，这里只是通知用户
    alert('设置已保存！');
  }
  
  /**
   * 重置设置
   */
  function resetSettings() {
    if (confirm('确定要重置所有设置吗？')) {
      settingsController.resetSettings();
      render();
    }
  }
  
  /**
   * 应用主题
   */
  function applyTheme(theme) {
    window.DOM.setTheme(theme);
  }
  
  // 初始渲染
  render();
  
  // 监听提供商变化，显示/隐藏相应设置
  setInterval(() => {
    const providerSelect = document.getElementById('provider-select');
    if (providerSelect) {
      const selectedProvider = providerSelect.value;
      const openaiSection = document.querySelector('#root div .section:nth-child(2)');
      const lmstudioSection = document.querySelector('#root div .section:nth-child(3)');
      
      if (openaiSection) {
        openaiSection.style.display = selectedProvider === 'openai' ? 'block' : 'none';
      }
      if (lmstudioSection) {
        lmstudioSection.style.display = selectedProvider === 'lm-studio' ? 'block' : 'none';
      }
    }
  }, 100);
};
