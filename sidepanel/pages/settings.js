// 设置页面
window.Pages = window.Pages || {};

window.Pages.settings = function(container) {
  const { create, clear, setTheme, getTheme } = window.DOM;
  const modelManager = window.ModelManager;
  
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
  
  let isLoadingModels = false;
  let modelSearchValue = ''; // 模型搜索关键词
  
  async function loadModels() {
    if (isLoadingModels) return;
    
    // 如果已经加载过模型，询问用户是否重新拉取
    if (modelManager.isLoaded()) {
      const { close } = window.ConfirmDialog.show({
        title: '刷新模型',
        message: '确定要重新从 API 拉取模型列表吗？这将覆盖当前已缓存的模型。',
        confirmText: '确定',
        cancelText: '取消',
        onConfirm: () => {
          modelManager.clearCache();
          performLoad();
        }
      });
      return;
    }
    
    performLoad();
  }
  
  async function performLoad() {
    if (isLoadingModels) return;
    
    isLoadingModels = true;
    
    // 只更新按钮文本，不重绘整个页面
    const loadBtn = document.querySelector('.setting-group button');
    if (loadBtn) {
      loadBtn.textContent = '加载中...';
      loadBtn.disabled = true;
    }
    
    try {
      await modelManager.fetchModels(settings.apiKey, settings.apiEndpoint);
      
      // 加载成功后，只重绘一次
      render();
    } catch (error) {
      window.Toast.error('加载失败: ' + error.message);
    } finally {
      isLoadingModels = false;
      
      // 恢复按钮状态
      const loadBtn = document.querySelector('.setting-group button');
      if (loadBtn) {
        loadBtn.textContent = '加载模型';
        loadBtn.disabled = false;
      }
    }
  }
  
  /**
   * 过滤模型列表
   */
  function getFilteredModels() {
    const allModels = modelManager.getModels();
    if (!modelSearchValue) {
      return allModels;
    }
    
    const keyword = modelSearchValue.toLowerCase();
    return allModels.filter(m => m.toLowerCase().includes(keyword));
  }
  
  /**
   * 更新模型下拉列表
   */
  function updateModelDropdown() {
    const dropdown = document.getElementById('model-dropdown');
    if (!dropdown) return;
    
    const filtered = getFilteredModels();
    
    // 清空并重新填充
    dropdown.innerHTML = '';
    
    if (filtered.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    
    filtered.forEach(model => {
      const item = create('div', {
        className: 'model-dropdown-item' + (model === settings.model ? ' selected' : ''),
        text: model,
        onClick: () => {
          settings.model = model;
          modelSearchValue = model;
          
          // 同步更新隐藏的select
          const hiddenSelect = document.getElementById('model-select-hidden');
          if (hiddenSelect) {
            hiddenSelect.value = model;
          }
          
          // 更新输入框
          const searchInput = document.getElementById('model-search');
          if (searchInput) {
            searchInput.value = model;
          }
          
          dropdown.style.display = 'none';
          
          // 只更新模型能力提示
          updateModelCapabilityHint();
        }
      });
      dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
  }
  
  /**
   * 绑定模型下拉列表事件
   */
  function bindModelDropdown() {
    const searchInput = document.getElementById('model-search');
    const dropdown = document.getElementById('model-dropdown');
    
    if (!searchInput || !dropdown) {
      console.log('[Settings] Dropdown elements not found');
      return;
    }
    
    console.log('[Settings] Binding dropdown events');
    
    // 点击下拉列表项时不触发blur
    dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 防止输入框失去焦点
    });
  }
  
  /**
   * 只更新模型能力提示，不重绘整个页面
   */
  function updateModelCapabilityHint() {
    // 查找现有的能力提示元素
    const pageContent = document.querySelector('.page-content');
    if (!pageContent) return;
    
    // 移除旧的能力提示
    const oldHint = pageContent.querySelector('.setting-hint');
    if (oldHint) {
      oldHint.remove();
    }
    
    // 添加新的能力提示
    if (settings.model && modelManager.isLoaded()) {
      const caps = modelManager.getCapability(settings.model);
      if (caps) {
        const badges = [];
        if (caps.vision) badges.push('🖼️ 支持图片');
        if (caps.audio) badges.push('🎤 支持音频');
        if (caps.streaming) badges.push('⚡ 支持流式');
        if (caps.tools) badges.push('🔧 支持工具');
        
        if (badges.length > 0) {
          // 在模型选择组后面插入
          const modelGroup = pageContent.querySelector('.setting-group');
          const hint = create('div', { 
            className: 'setting-group setting-hint'
          }, [
            create('span', { text: '模型能力: ' + badges.join(' | ') })
          ]);
          modelGroup.after(hint);
        }
      }
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
        attrs: { type: 'password', placeholder: '本地服务留空,无需更改留空' },
        onInput: (e) => { settings.apiKey = e.target.value; }
      })
    ]));
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: 'API 端点' }),
      create('input', {
        className: 'input',
        attrs: { type: 'text', placeholder: 'https://openrouter.ai/api/v1' },
        value: settings.apiEndpoint,
        onInput: (e) => { settings.apiEndpoint = e.target.value; },
        onBlur: async () => {
          // 失去焦点时，如果有base url且模型列表为空，自动加载
          if (settings.apiEndpoint && !modelManager.isLoaded()) {
            await performLoad();
          }
        }
      })
    ]));
    
    content.appendChild(create('div', { className: 'setting-group', style: { position: 'relative' } }, [
      create('label', { className: 'setting-label', text: '模型' }),
      // 隐藏的原始select，用于保存真实选择
      create('select', {
        className: 'hidden-select',
        id: 'model-select-hidden',
        attrs: { style: 'display: none;' },
        onChange: (e) => {
          settings.model = e.target.value;
          modelSearchValue = e.target.value;
          const searchInput = document.getElementById('model-search');
          if (searchInput) {
            searchInput.value = e.target.value;
          }
        }
      }, modelManager.getModels().map(model => 
        create('option', {
          attrs: { value: model },
          text: model,
          selected: model === settings.model
        })
      )),
      create('div', { className: 'setting-row' }, [
        // 模型搜索输入框
        create('input', {
          className: 'input setting-row-flex-1',
          attrs: { 
            type: 'text', 
            id: 'model-search',
            placeholder: !modelManager.isLoaded() ? '点击加载模型' : '选择或搜索模型...',
            value: settings.model || ''
          },
          onInput: (e) => { 
            modelSearchValue = e.target.value;
            // 更新下拉选项
            updateModelDropdown();
          },
          onClick: () => {
            // 点击时显示下拉列表
            if (modelManager.isLoaded()) {
              // 如果输入框有内容且精确匹配某个模型，则显示所有模型
              if (modelSearchValue) {
                const allModels = modelManager.getModels();
                const exactMatch = allModels.find(m => m === modelSearchValue);
                
                if (exactMatch) {
                  // 精确匹配，清空搜索值以显示所有模型
                  modelSearchValue = '';
                  const searchInput = document.getElementById('model-search');
                  if (searchInput) {
                    searchInput.value = '';
                  }
                }
              }
              
              updateModelDropdown();
            }
          },
          onBlur: () => {
            // 延迟隐藏，让点击事件先执行
            setTimeout(() => {
              const dropdown = document.getElementById('model-dropdown');
              if (dropdown) {
                dropdown.style.display = 'none';
              }
            }, 200);
            
            // 失去焦点时的处理
            const hiddenSelect = document.getElementById('model-select-hidden');
            const searchInput = document.getElementById('model-search');
            const filtered = getFilteredModels();
            
            if (filtered.length === 1) {
              // 如果只有一条匹配，自动选中
              settings.model = filtered[0];
              modelSearchValue = filtered[0];
              if (hiddenSelect) {
                hiddenSelect.value = filtered[0];
              }
              if (searchInput) {
                searchInput.value = filtered[0];
              }
              // 只更新能力提示
              updateModelCapabilityHint();
            }
          }
        }),
        // 加载模型按钮
        create('button', {
          className: 'btn btn-primary nowrap',
          text: isLoadingModels ? '加载中...' : '加载模型',
          disabled: isLoadingModels,
          onClick: loadModels
        })
      ]),
      // 模型下拉列表（始终创建，初始隐藏）
      create('div', {
        className: 'model-dropdown',
        id: 'model-dropdown',
        style: { display: 'none' }
      })
    ]));
    
    // 渲染后绑定下拉逻辑
    setTimeout(() => {
      bindModelDropdown();
    }, 0);
    
    // 模型能力提示
    if (settings.model && modelManager.isLoaded()) {
      const caps = modelManager.getCapability(settings.model);
      if (caps) {
        const badges = [];
        if (caps.vision) badges.push('🖼️ 支持图片');
        if (caps.audio) badges.push('🎤 支持音频');
        if (caps.streaming) badges.push('⚡ 支持流式');
        if (caps.tools) badges.push('🔧 支持工具');
        
        if (badges.length > 0) {
          content.appendChild(create('div', { 
            className: 'setting-group setting-hint'
          }, [
            create('span', { text: '模型能力: ' + badges.join(' | ') })
          ]));
        }
      }
    }
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '温度 (0-2)' }),
      create('input', {
        className: 'input',
        attrs: { type: 'number', min: '0', max: '2', step: '0.1' },
        value: settings.temperature,
        onInput: (e) => { settings.temperature = parseFloat(e.target.value); }
      })
    ]));
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '最大 Token' }),
      create('input', {
        className: 'input',
        attrs: { type: 'number', min: '100', max: '8000' },
        value: settings.maxTokens,
        onInput: (e) => { settings.maxTokens = parseInt(e.target.value); }
      })
    ]));
    
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '系统提示词' }),
      create('textarea', {
        className: 'input setting-textarea',
        value: settings.systemPrompt,
        attrs: { placeholder: '可选，设置 AI 的行为和角色' },
        onInput: (e) => { settings.systemPrompt = e.target.value; }
      })
    ]));
    
    // 上下文管理
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label-inline' }, [
        create('input', {
          className: 'setting-checkbox',
          attrs: { type: 'checkbox' },
          onChange: (e) => { settings.autoContextTruncation = e.target.checked; }
        }),
        '自动调整上下文窗口（根据模型限制智能截断历史消息）'
      ])
    ]));
    
    // 主题选择
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '主题' }),
      create('div', {}, [
        create('label', { className: 'setting-radio-label' }, [
          create('input', {
            className: 'setting-radio',
            attrs: { type: 'radio', name: 'theme', value: 'light' },
            onChange: () => { settings.theme = 'light'; setTheme('light'); }
          }),
          '浅色'
        ]),
        create('label', { className: 'setting-label-inline' }, [
          create('input', {
            className: 'setting-radio',
            attrs: { type: 'radio', name: 'theme', value: 'dark' },
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
        const apiKeyInput = content.querySelector('input[placeholder*="API Key"]');
        const endpointInput = content.querySelector('input[placeholder*="端点"]');
        const modelSearch = content.querySelector('#model-search');
        const tempInput = content.querySelector('input[type="number"][max="2"]');
        const tokenInput = content.querySelector('input[type="number"][max="8000"]');
        const promptInput = content.querySelector('textarea');

        if (apiKeyInput) apiKeyInput.value = settings.apiKey || '';
        if (endpointInput) endpointInput.value = settings.apiEndpoint || '';
        if (modelSearch) {
          modelSearch.value = settings.model || '';
          modelSearchValue = settings.model || '';
        }
        if (tempInput) tempInput.value = settings.temperature ?? 0.7;
        if (tokenInput) tokenInput.value = settings.maxTokens ?? 2000;
        if (promptInput) promptInput.value = settings.systemPrompt || '';
        
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
        
        // 如果base url有内容且模型列表为空，自动加载
        if (settings.apiEndpoint && !modelManager.isLoaded()) {
          setTimeout(() => {
            performLoad();
          }, 100);
        }
      }
    });
    
    page.appendChild(content);
    
    // 底部
    page.appendChild(create('div', { className: 'page-footer' }, [
      create('button', {
        className: 'btn btn-primary setting-full-width',
        text: '保存设置',
        onClick: () => {
          chrome.storage.local.set({ settings }, () => {
            console.log('[Settings] Saved:', settings);
            
            // 初始化 Agent
            if (window.Agent) {
              const ai = new window.Agent();
              ai.registerProvider('default', {
                endpoint: settings.apiEndpoint,
                apiKey: settings.apiKey || 'local',
                defaultModel: settings.model
              });
              ai.setProvider('default');
              window.aiManager = ai;
              console.log('[Settings] AI Manager initialized');
            }
            
            window.Toast.success('设置已保存');
          });
        }
      })
    ]));
    
    container.appendChild(page);
  }
  
  render();
};
