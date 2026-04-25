// 设置页面
window.Pages = window.Pages || {};

window.Pages.settings = function(container) {
  const { create, clear, setTheme, getTheme } = window.DOM;
  
  let settings = {
    apiKey: '',
    apiEndpoint: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o',
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: '',
    theme: getTheme(),
    autoContextTruncation: true
  };
  
  let availableModels = [];
  let modelCapabilities = {}; // 模型能力 { modelName: { vision: true, ... } }
  let isLoadingModels = false;
  
  async function loadModels() {
    isLoadingModels = true;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_MODELS',
        payload: {
          apiKey: settings.apiKey || '',
          apiEndpoint: settings.apiEndpoint
        }
      });
      
      if (response.success) {
        availableModels = response.models;
        
        // 根据模型名称推断能力
        modelCapabilities = {};
        availableModels.forEach(modelName => {
          const lower = modelName.toLowerCase();
          modelCapabilities[modelName] = {
            vision: lower.includes('gpt-4o') || lower.includes('claude-3') || lower.includes('gemini') || lower.includes('vision'),
            streaming: true // 大部分模型都支持流式
          };
        });
        
        console.log('[Settings] Loaded', availableModels.length, 'models');
      } else {
        alert('加载失败: ' + response.error);
      }
    } catch (error) {
      console.error('[Settings] Load models error:', error);
      alert('加载失败: ' + error.message);
    } finally {
      isLoadingModels = false;
      render();
    }
  }
  
  function render() {
    clear(container);
    
    const page = create('div', { className: 'page' });
    
    // 头部
    page.appendChild(create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', text: '设置' })
    ]));
    
    // 内容
    const content = create('div', { className: 'page-content' });
    
    // API 配置
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: 'API Key（可选）' }),
      create('input', {
        className: 'input',
        attrs: { type: 'password', placeholder: '云服务需要，本地服务留空' },
        onInput: (e) => { settings.apiKey = e.target.value; }
      })
    ]));
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: 'API 端点' }),
      create('input', {
        className: 'input',
        attrs: { type: 'text', placeholder: 'https://openrouter.ai/api/v1' },
        onInput: (e) => { settings.apiEndpoint = e.target.value; }
      })
    ]));
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '模型' }),
      create('div', { style: { display: 'flex', gap: '8px' } }, [
        create('select', {
          className: 'input',
          style: { flex: 1 },
          onChange: (e) => { settings.model = e.target.value; }
        }, [
          create('option', { 
            attrs: { value: '' },
            text: availableModels.length === 0 ? '点击加载模型' : '选择模型'
          }),
          ...availableModels.map(m => 
            create('option', { 
              attrs: { value: m },
              text: m,
              selected: m === settings.model
            })
          )
        ]),
        create('button', {
          className: 'btn btn-primary',
          text: isLoadingModels ? '加载中...' : '加载模型',
          style: { whiteSpace: 'nowrap' },
          disabled: isLoadingModels,
          onClick: loadModels
        })
      ])
    ]));
    
    // 模型能力提示
    if (settings.model && modelCapabilities[settings.model]) {
      const caps = modelCapabilities[settings.model];
      const badges = [];
      if (caps.vision) badges.push('🖼️ 支持图片');
      if (caps.streaming) badges.push('⚡ 支持流式');
      
      if (badges.length > 0) {
        content.appendChild(create('div', { 
          className: 'setting-group',
          style: { fontSize: '12px', color: 'var(--color-text-secondary)' }
        }, [
          create('span', { text: '模型能力: ' + badges.join(' | ') })
        ]));
      }
    }
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '温度 (0-2)' }),
      create('input', {
        className: 'input',
        attrs: { type: 'number', min: '0', max: '2', step: '0.1' },
        onInput: (e) => { settings.temperature = parseFloat(e.target.value); }
      })
    ]));
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '最大 Token' }),
      create('input', {
        className: 'input',
        attrs: { type: 'number', min: '100', max: '8000' },
        onInput: (e) => { settings.maxTokens = parseInt(e.target.value); }
      })
    ]));
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '系统提示词' }),
      create('textarea', {
        className: 'input',
        style: { minHeight: '80px', resize: 'vertical' },
        attrs: { placeholder: '可选，设置 AI 的行为和角色' },
        onInput: (e) => { settings.systemPrompt = e.target.value; }
      })
    ]));
    
    // 上下文管理
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { style: { display: 'flex', alignItems: 'center', cursor: 'pointer' } }, [
        create('input', {
          attrs: { type: 'checkbox' },
          style: { marginRight: '8px' },
          onChange: (e) => { settings.autoContextTruncation = e.target.checked; }
        }),
        '自动调整上下文窗口（根据模型限制智能截断历史消息）'
      ])
    ]));
    
    // 主题选择
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '主题' }),
      create('div', {}, [
        create('label', { style: { marginRight: '16px', cursor: 'pointer' } }, [
          create('input', {
            attrs: { type: 'radio', name: 'theme', value: 'light' },
            style: { marginRight: '4px' },
            onChange: () => { settings.theme = 'light'; setTheme('light'); }
          }),
          '浅色'
        ]),
        create('label', { style: { cursor: 'pointer' } }, [
          create('input', {
            attrs: { type: 'radio', name: 'theme', value: 'dark' },
            style: { marginRight: '4px' },
            onChange: () => { settings.theme = 'dark'; setTheme('dark'); }
          }),
          '深色'
        ])
      ])
    ]));
    
    // 加载已保存的设置
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        settings = { ...settings, ...result.settings };
        setTheme(settings.theme);
        
        // 填充表单
        const inputs = content.querySelectorAll('.input');
        if (inputs[0]) inputs[0].value = settings.apiKey || '';
        if (inputs[1]) inputs[1].value = settings.apiEndpoint || '';
        if (inputs[2]) inputs[2].value = settings.model || '';
        if (inputs[3]) inputs[3].value = settings.temperature || 0.7;
        if (inputs[4]) inputs[4].value = settings.maxTokens || 2000;
        if (inputs[5]) inputs[5].value = settings.systemPrompt || '';
        
        // 更新复选框状态
        const checkbox = content.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = settings.autoContextTruncation !== false;
        }
        
        // 更新单选按钮状态
        const radios = content.querySelectorAll('input[name="theme"]');
        radios.forEach(radio => {
          radio.checked = radio.value === settings.theme;
        });
      }
    });
    
    page.appendChild(content);
    
    // 底部
    page.appendChild(create('div', { className: 'page-footer' }, [
      create('button', {
        className: 'btn btn-primary',
        text: '保存设置',
        style: { width: '100%' },
        onClick: () => {
          chrome.storage.local.set({ settings }, () => {
            console.log('[Settings] Saved:', settings);
            
            // 初始化 AI Manager
            if (window.AIManager) {
              const ai = new window.AIManager();
              ai.registerProvider('default', {
                endpoint: settings.apiEndpoint,
                apiKey: settings.apiKey || 'local',
                defaultModel: settings.model
              });
              ai.setProvider('default');
              window.aiManager = ai;
              console.log('[Settings] AI Manager initialized');
            }
            
            alert('已保存');
          });
        }
      })
    ]));
    
    container.appendChild(page);
  }
  
  render();
};
