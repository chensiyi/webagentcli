// ==================== SettingsView - 设置页面 ====================

(function() {
  'use strict';
  
  const { createElement, clearElement, createButton, createInput } = window.DOMUtils;
  
  let settings = {
    apiKey: '',
    apiEndpoint: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o',
    temperature: 0.7,
    maxTokens: 4096
  };
  let saved = false;
  let container = null;
  
  function init(rootElement) {
    container = rootElement;
    loadSettings();
    render();
  }
  
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        settings = { ...settings, ...result.settings };
      }
    } catch (error) {
      console.error('[SettingsView] Failed to load settings:', error);
    }
  }
  
  async function handleSave() {
    try {
      await chrome.storage.local.set({ settings });
      saved = true;
      render();
      setTimeout(() => {
        saved = false;
        render();
      }, 2000);
    } catch (error) {
      console.error('[SettingsView] Failed to save settings:', error);
      alert('保存失败: ' + error.message);
    }
  }
  
  function handleChange(key, value) {
    settings[key] = value;
  }
  
  function render() {
    clearElement(container);
    container.style.height = '100%';
    container.style.overflowY = 'auto';
    container.style.background = '#f5f5f5';
    container.style.padding = '16px';
    
    // Header
    const header = createElement('div', { style: { marginBottom: '20px' } });
    header.appendChild(createElement('h2', {
      style: { fontSize: '18px', fontWeight: '600', color: '#333' },
      children: ['设置']
    }));
    header.appendChild(createElement('p', {
      style: { fontSize: '12px', color: '#999', marginTop: '4px' },
      children: ['配置 AI API 和模型参数']
    }));
    container.appendChild(header);
    
    // API 配置
    const apiSection = createElement('div', {
      style: { 
        background: '#fff', 
        borderRadius: '8px', 
        padding: '16px', 
        marginBottom: '16px', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
      }
    });
    
    apiSection.appendChild(createElement('h3', {
      style: { fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' },
      children: ['API 配置']
    }));
    
    // API Key
    const apiKeyGroup = createElement('div', { style: { marginBottom: '12px' } });
    apiKeyGroup.appendChild(createElement('label', {
      style: { display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' },
      children: ['API Key']
    }));
    const apiKeyInput = createInput({
      type: 'password',
      value: settings.apiKey,
      placeholder: 'sk-...',
      style: { 
        width: '100%', 
        padding: '8px 12px', 
        border: '1px solid #ddd', 
        borderRadius: '6px', 
        fontSize: '13px', 
        outline: 'none' 
      }
    });
    apiKeyInput.addEventListener('input', (e) => handleChange('apiKey', e.target.value));
    apiKeyGroup.appendChild(apiKeyInput);
    apiSection.appendChild(apiKeyGroup);
    
    // API Endpoint
    const endpointGroup = createElement('div', { style: { marginBottom: '12px' } });
    endpointGroup.appendChild(createElement('label', {
      style: { display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' },
      children: ['API 端点']
    }));
    const endpointInput = createInput({
      type: 'text',
      value: settings.apiEndpoint,
      placeholder: 'https://...',
      style: { 
        width: '100%', 
        padding: '8px 12px', 
        border: '1px solid #ddd', 
        borderRadius: '6px', 
        fontSize: '13px', 
        outline: 'none' 
      }
    });
    endpointInput.addEventListener('input', (e) => handleChange('apiEndpoint', e.target.value));
    endpointGroup.appendChild(endpointInput);
    apiSection.appendChild(endpointGroup);
    
    container.appendChild(apiSection);
    
    // 模型配置
    const modelSection = createElement('div', {
      style: { 
        background: '#fff', 
        borderRadius: '8px', 
        padding: '16px', 
        marginBottom: '16px', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
      }
    });
    
    modelSection.appendChild(createElement('h3', {
      style: { fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' },
      children: ['模型配置']
    }));
    
    const modelGroup = createElement('div', { style: { marginBottom: '12px' } });
    modelGroup.appendChild(createElement('label', {
      style: { display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' },
      children: ['模型名称']
    }));
    const modelInput = createInput({
      type: 'text',
      value: settings.model,
      placeholder: 'openai/gpt-4o',
      style: { 
        width: '100%', 
        padding: '8px 12px', 
        border: '1px solid #ddd', 
        borderRadius: '6px', 
        fontSize: '13px', 
        outline: 'none' 
      }
    });
    modelInput.addEventListener('input', (e) => handleChange('model', e.target.value));
    modelGroup.appendChild(modelInput);
    modelSection.appendChild(modelGroup);
    
    container.appendChild(modelSection);
    
    // 保存按钮
    const saveBtn = createButton(saved ? '✓ 已保存' : '保存设置', {
      width: '100%',
      padding: '12px',
      background: saved ? '#4caf50' : '#1976d2',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '600'
    }, handleSave);
    container.appendChild(saveBtn);
    
    // 提示
    const tipBox = createElement('div', {
      style: { 
        marginTop: '20px', 
        padding: '12px', 
        background: '#fff3e0', 
        borderRadius: '6px', 
        fontSize: '11px', 
        color: '#e65100', 
        lineHeight: '1.6' 
      }
    });
    
    tipBox.appendChild(createElement('strong', { children: ['提示：'] }));
    tipBox.appendChild(createElement('br'));
    tipBox.appendChild(document.createTextNode('• 推荐使用 OpenRouter: https://openrouter.ai'));
    tipBox.appendChild(createElement('br'));
    tipBox.appendChild(document.createTextNode('• API Key 仅存储在本地浏览器中'));
    tipBox.appendChild(createElement('br'));
    tipBox.appendChild(document.createTextNode('• AI 集成功能即将上线'));
    
    container.appendChild(tipBox);
  }
  
  window.SettingsView = { init };
})();
