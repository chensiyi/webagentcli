/**
 * 设置页面 UI（重构版）
 * 只负责渲染和用户交互事件发布，业务逻辑由 EventHandler 处理
 */

window.Pages = window.Pages || {};

window.Pages.settings = function(container) {
  const { create, clear, setTheme, getTheme } = window.DOM;
  const eventBus = window.EventBus;
  
  // UI 状态管理（仅用于渲染）
  let isLoadingModels = false;
  let modelSearchValue = '';
  let modelDropdownVisible = false;
  let currentSettings = null; // 从 Controller 加载的设置

  /**
   * 渲染设置页面
   */
  function render() {
    clear(container);
    
    const page = create('div', { className: 'page' });
    
    // 头部
    const header = create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', text: '设置' })
    ]);
    page.appendChild(header);
    
    // 内容区
    const content = create('div', { className: 'page-content' });
    
    // API 标准选择
    content.appendChild(createApiStandardSection());
    
    // API Key
    content.appendChild(createApiKeySection());
    
    // API 端点
    content.appendChild(createApiEndpointSection());
    
    // 模型选择
    content.appendChild(createModelSection());
    
    // 温度
    content.appendChild(createTemperatureSection());
    
    // 最大 Token
    content.appendChild(createMaxTokensSection());
    
    // 系统提示词
    content.appendChild(createSystemPromptSection());
    
    // 上下文管理
    content.appendChild(createContextSection());
    
    // 主题
    content.appendChild(createThemeSection());
    
    page.appendChild(content);
    
    // 底部保存按钮
    const footer = create('div', { className: 'page-footer' }, [
      create('button', {
        className: 'btn btn-primary',
        style: { width: '100%' },
        text: '保存设置',
        onClick: handleSaveSettings
      })
    ]);
    page.appendChild(footer);
    
    container.appendChild(page);
    
    // 绑定模型下拉列表事件
    setTimeout(() => {
      bindModelDropdown();
    }, 0);
  }

  /**
   * 创建 API 标准选择区
   */
  function createApiStandardSection() {
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: 'API 标准' }),
      create('select', {
        className: 'input',
        id: 'api-standard-select',
        onChange: (e) => handleApiStandardChange(e.target.value)
      }, [
        create('option', { attrs: { value: 'openrouter' }, text: 'OpenRouter' }),
        create('option', { attrs: { value: 'openai' }, text: 'OpenAI' }),
        create('option', { attrs: { value: 'lm-studio' }, text: 'LM Studio' }),
        create('option', { attrs: { value: 'ollama' }, text: 'Ollama' }),
        create('option', { attrs: { value: 'anthropic' }, text: 'Anthropic Claude' })
      ])
    ]);
  }

  /**
   * 创建 API Key 区
   */
  function createApiKeySection() {
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: 'API Key（可选）' }),
      create('input', {
        className: 'input',
        attrs: { 
          type: 'password', 
          id: 'api-key-input',
          placeholder: '本地服务留空,无需更改留空' 
        },
        onInput: (e) => updateSettingField('apiKey', e.target.value)
      })
    ]);
  }

  /**
   * 创建 API 端点区
   */
  function createApiEndpointSection() {
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: 'API 端点' }),
      create('input', {
        className: 'input',
        id: 'api-endpoint-input',
        attrs: { 
          type: 'text', 
          placeholder: 'https://openrouter.ai/api/v1' 
        },
        onInput: (e) => updateSettingField('apiEndpoint', e.target.value),
        onBlur: handleEndpointBlur
      })
    ]);
  }

  /**
   * 创建模型选择区
   */
  function createModelSection() {
    return create('div', { 
      className: 'setting-group',
      style: { position: 'relative' }
    }, [
      create('label', { 
        className: 'setting-label',
        style: { display: 'inline-flex', alignItems: 'center', gap: '6px' }
      }, [
        '模型',
        create('span', {
          className: 'help-icon',
          style: {
            cursor: 'help',
            fontSize: '14px',
            color: 'var(--color-text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            border: '1px solid var(--color-border)',
            fontWeight: 'bold'
          },
          text: '?',
          attrs: {
            title: '选择 API 标准后点击"加载模型"按钮从 API 获取可用模型列表\n\n支持的 API 标准：\n• OpenAI: https://api.openai.com/v1\n• LM Studio: http://localhost:1234\n• Ollama: http://localhost:11434\n• OpenRouter: https://openrouter.ai/api/v1\n• Anthropic: https://api.anthropic.com\n\n加载后可搜索和选择模型'
          }
        })
      ]),
      create('div', { className: 'setting-row' }, [
        create('input', {
          className: 'input',
          id: 'model-search',
          attrs: { 
            type: 'text', 
            placeholder: !window.ModelManager || !window.ModelManager.isLoaded() ? '点击加载模型' : '选择或搜索模型...',
          },
          onInput: (e) => { 
            modelSearchValue = e.target.value;
            updateModelDropdown();
          },
          onClick: handleModelSearchClick,
          onBlur: handleModelSearchBlur
        }),
        create('button', {
          className: 'btn btn-primary',
          id: 'load-models-btn',
          text: isLoadingModels ? '加载中...' : '加载模型',
          disabled: isLoadingModels,
          onClick: handleLoadModels
        })
      ]),
      create('div', {
        className: 'model-dropdown',
        id: 'model-dropdown',
        style: { display: 'none' }
      })
    ]);
  }

  /**
   * 创建温度设置区
   */
  function createTemperatureSection() {
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '温度 (0-2)' }),
      create('input', {
        className: 'input',
        attrs: { 
          type: 'number', 
          id: 'temperature-input',
          min: '0', 
          max: '2', 
          step: '0.1' 
        },
        onInput: (e) => updateSettingField('temperature', parseFloat(e.target.value))
      })
    ]);
  }

  /**
   * 创建最大 Token 设置区
   */
  function createMaxTokensSection() {
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '最大 Token' }),
      create('input', {
        className: 'input',
        attrs: { 
          type: 'number', 
          id: 'max-tokens-input',
          min: '100', 
          max: '8000' 
        },
        onInput: (e) => updateSettingField('maxTokens', parseInt(e.target.value))
      })
    ]);
  }

  /**
   * 创建系统提示词区
   */
  function createSystemPromptSection() {
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '系统提示词' }),
      create('textarea', {
        className: 'input setting-textarea',
        id: 'system-prompt-input',
        attrs: { placeholder: '可选，设置 AI 的行为和角色' },
        onInput: (e) => updateSettingField('systemPrompt', e.target.value)
      })
    ]);
  }

  /**
   * 创建上下文管理区
   */
  function createContextSection() {
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label-inline' }, [
        create('input', {
          className: 'setting-checkbox',
          id: 'auto-context-checkbox',
          attrs: { type: 'checkbox' },
          onChange: (e) => updateSettingField('autoContextTruncation', e.target.checked)
        }),
        '自动调整上下文窗口（根据模型限制智能截断历史消息）'
      ])
    ]);
  }

  /**
   * 创建主题设置区
   */
  function createThemeSection() {
    return create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '主题' }),
      create('div', {}, [
        create('label', { className: 'setting-radio-label' }, [
          create('input', {
            className: 'setting-radio',
            attrs: { 
              type: 'radio', 
              name: 'theme', 
              value: 'light',
              id: 'theme-light'
            },
            onChange: () => handleThemeChange('light')
          }),
          '浅色'
        ]),
        create('label', { className: 'setting-radio-label' }, [
          create('input', {
            className: 'setting-radio',
            attrs: { 
              type: 'radio', 
              name: 'theme', 
              value: 'dark',
              id: 'theme-dark'
            },
            onChange: () => handleThemeChange('dark')
          }),
          '深色'
        ])
      ])
    ]);
  }

  // ==================== 事件处理函数 ====================

  /**
   * 更新设置字段并发布事件
   */
  function updateSettingField(field, value) {
    if (!currentSettings) return;
    
    currentSettings[field] = value;
    
    // 发布设置更新事件
    eventBus.emit(window.Events.SETTINGS.UPDATED, {
      updates: { [field]: value },
      newSettings: currentSettings
    });
  }

  /**
   * 处理 API 标准变更
   */
  function handleApiStandardChange(apiStandard) {
    if (!currentSettings) return;
    
    currentSettings.apiStandard = apiStandard;
    
    // 发布 API 标准变更事件
    eventBus.emit(window.Events.SETTINGS.API_STANDARD_CHANGED, {
      apiStandard
    });
  }

  /**
   * 处理端点失去焦点
   */
  function handleEndpointBlur() {
    if (!currentSettings || !currentSettings.apiEndpoint) return;
    
    // 如果模型列表为空，请求加载模型
    if (window.ModelManager && !window.ModelManager.isLoaded()) {
      requestLoadModels();
    }
  }

  /**
   * 处理模型搜索框点击
   */
  function handleModelSearchClick() {
    if (window.ModelManager && window.ModelManager.isLoaded()) {
      // 如果输入框有内容且精确匹配某个模型，则显示所有模型
      if (modelSearchValue) {
        const allModels = window.ModelManager.getModels();
        const exactMatch = allModels.find(m => m === modelSearchValue);
        
        if (exactMatch) {
          const savedSearchValue = modelSearchValue;
          modelSearchValue = '';
          updateModelDropdown();
          modelSearchValue = savedSearchValue;
          return;
        }
      }
      toggleModelDropdown();
    }
  }

  /**
   * 处理模型搜索框失去焦点
   */
  function handleModelSearchBlur() {
    setTimeout(() => {
      const dropdown = document.getElementById('model-dropdown');
      if (dropdown) {
        dropdown.style.display = 'none';
        modelDropdownVisible = false;
      }
    }, 200);
    
    // 如果只有一条匹配，自动选中
    const filtered = getFilteredModels();
    if (filtered.length === 1) {
      selectModel(filtered[0]);
    }
  }

  /**
   * 处理加载模型按钮点击
   */
  function handleLoadModels() {
    requestLoadModels();
  }

  /**
   * 请求加载模型（通过 EventBus）
   */
  function requestLoadModels() {
    if (!currentSettings) return;
    
    isLoadingModels = true;
    updateLoadButtonState();
    
    // 发布模型加载请求事件
    eventBus.emit(window.Events.SETTINGS.MODELS_REQUEST, {
      apiKey: currentSettings.apiKey,
      apiEndpoint: currentSettings.apiEndpoint,
      apiStandard: currentSettings.apiStandard
    });
  }

  /**
   * 处理主题变更
   */
  function handleThemeChange(theme) {
    if (!currentSettings) return;
    
    currentSettings.theme = theme;
    setTheme(theme);
    
    // 发布主题变更事件
    eventBus.emit(window.Events.UI.THEME_CHANGED, { theme });
  }

  /**
   * 处理保存设置
   */
  function handleSaveSettings() {
    if (!currentSettings) return;
    
    // 发布保存请求事件
    eventBus.emit(window.Events.SETTINGS.SAVED, {
      settings: currentSettings
    });
  }

  /**
   * 填充表单（由 EventHandler 调用）
   */
  function fillForm(settings) {
    currentSettings = settings;
    
    const apiStandardSelect = document.getElementById('api-standard-select');
    const apiKeyInput = document.getElementById('api-key-input');
    const endpointInput = document.getElementById('api-endpoint-input');
    const modelSearch = document.getElementById('model-search');
    const tempInput = document.getElementById('temperature-input');
    const maxTokensInput = document.getElementById('max-tokens-input');
    const systemPromptInput = document.getElementById('system-prompt-input');
    const autoContextCheckbox = document.getElementById('auto-context-checkbox');
    const themeLight = document.getElementById('theme-light');
    const themeDark = document.getElementById('theme-dark');
    
    if (apiStandardSelect) apiStandardSelect.value = settings.apiStandard || 'openrouter';
    if (apiKeyInput) apiKeyInput.value = settings.apiKey || '';
    if (endpointInput) endpointInput.value = settings.apiEndpoint || '';
    if (modelSearch) modelSearch.value = settings.model || '';
    if (tempInput) tempInput.value = settings.temperature ?? 0.7;
    if (maxTokensInput) maxTokensInput.value = settings.maxTokens ?? 2000;
    if (systemPromptInput) systemPromptInput.value = settings.systemPrompt || '';
    if (autoContextCheckbox) autoContextCheckbox.checked = settings.autoContextTruncation !== false;
    if (themeLight) themeLight.checked = settings.theme === 'light';
    if (themeDark) themeDark.checked = settings.theme === 'dark';
    
    // 应用主题
    setTheme(settings.theme);
  }

  /**
   * 更新模型下拉列表
   */
  function updateModelDropdown() {
    const dropdown = document.getElementById('model-dropdown');
    if (!dropdown || !window.ModelManager) return;
    
    const filtered = getFilteredModels();
    
    dropdown.innerHTML = '';
    
    if (filtered.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    
    filtered.forEach(modelId => {
      const details = window.ModelManager.getModelDetails(modelId);
      const modelName = details?.name || modelId;
      const contextLength = details?.context_length;
      const pricing = details?.pricing;
      const inputModalities = details?.input_modalities || [];
      
      const item = create('div', {
        className: 'model-dropdown-item' + (modelId === currentSettings?.model ? ' selected' : '')
      });
      
      // 第一行：模型名称
      const nameLine = create('div', {
        style: {
          fontWeight: '500',
          fontSize: '13px',
          marginBottom: '4px',
          color: 'var(--color-text)'
        },
        text: modelName
      });
      item.appendChild(nameLine);
      
      // 第二行：详细信息
      const infoLine = create('div', {
        style: {
          fontSize: '11px',
          color: 'var(--color-text-secondary)',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }
      });
      
      // 上下文长度
      if (contextLength) {
        const ctxBadge = create('span', {
          style: {
            padding: '2px 6px',
            background: 'var(--color-primary-light)',
            borderRadius: '4px',
            fontSize: '10px'
          },
          text: `📝 ${formatContextLength(contextLength)}`
        });
        infoLine.appendChild(ctxBadge);
      }
      
      // 价格
      if (pricing) {
        const priceText = formatPricing(pricing);
        if (priceText) {
          const priceBadge = create('span', {
            style: {
              padding: '2px 6px',
              background: 'var(--color-success-light)',
              borderRadius: '4px',
              fontSize: '10px'
            },
            text: `💰 ${priceText}`
          });
          infoLine.appendChild(priceBadge);
        }
      }
      
      // 输入模态
      if (inputModalities.length > 0) {
        const modalityIcons = {
          'text': '📝',
          'image': '🖼️',
          'video': '🎥',
          'audio': '🎤'
        };
        const icons = inputModalities.map(m => modalityIcons[m] || m).join(' ');
        const modalBadge = create('span', {
          style: {
            padding: '2px 6px',
            background: 'var(--color-warning-light)',
            borderRadius: '4px',
            fontSize: '10px'
          },
          text: `📥 ${icons}`
        });
        infoLine.appendChild(modalBadge);
      }
      
      item.appendChild(infoLine);
      
      // 点击事件
      item.addEventListener('click', () => {
        selectModel(modelId);
      });
      
      dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
  }

  /**
   * 选择模型
   */
  function selectModel(modelId) {
    if (!currentSettings) return;
    
    currentSettings.model = modelId;
    modelSearchValue = modelId;
    
    const searchInput = document.getElementById('model-search');
    if (searchInput) {
      searchInput.value = modelId;
    }
    
    const dropdown = document.getElementById('model-dropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
      modelDropdownVisible = false;
    }
    
    // 更新模型能力提示
    updateModelCapabilityHint();
  }

  /**
   * 切换模型下拉列表
   */
  function toggleModelDropdown() {
    const dropdown = document.getElementById('model-dropdown');
    if (!dropdown) return;
    
    if (dropdown.style.display === 'block') {
      dropdown.style.display = 'none';
      modelDropdownVisible = false;
    } else {
      updateModelDropdown();
      dropdown.style.display = 'block';
      modelDropdownVisible = true;
    }
  }

  /**
   * 过滤模型列表
   */
  function getFilteredModels() {
    if (!window.ModelManager) return [];
    const allModels = window.ModelManager.getModels();
    if (!modelSearchValue) {
      return allModels;
    }
    
    const keyword = modelSearchValue.toLowerCase();
    return allModels.filter(m => m.toLowerCase().includes(keyword));
  }

  /**
   * 格式化上下文长度
   */
  function formatContextLength(length) {
    if (length >= 1000000) {
      return `${(length / 1000000).toFixed(0)}M`;
    } else if (length >= 1000) {
      return `${(length / 1000).toFixed(0)}K`;
    }
    return length.toString();
  }

  /**
   * 格式化价格
   */
  function formatPricing(pricing) {
    if (!pricing) return '';
    
    const parts = [];
    if (pricing.prompt) {
      const price = parseFloat(pricing.prompt);
      if (price > 0) {
        parts.push(`$${(price * 1000000).toFixed(2)}/M`);
      }
    }
    
    return parts.join(' | ') || '免费';
  }

  /**
   * 更新模型能力提示
   */
  function updateModelCapabilityHint() {
    const pageContent = document.querySelector('.page-content');
    if (!pageContent) return;
    
    // 移除旧的能力提示
    const oldHint = pageContent.querySelector('.setting-hint');
    if (oldHint) {
      oldHint.remove();
    }
    
    // 添加新的能力提示
    if (currentSettings?.model && window.ModelManager && window.ModelManager.isLoaded()) {
      const caps = window.ModelManager.getCapability(currentSettings.model);
      if (!caps) return;
      
      const badges = [];
      if (caps.vision) badges.push('🖼️ 支持图片');
      if (caps.audio) badges.push('🎤 支持音频');
      if (caps.streaming) badges.push('⚡ 支持流式');
      if (caps.tools) badges.push('🔧 支持工具');
      
      if (badges.length === 0) return;
      
      const capabilityHint = create('div', { 
        className: 'setting-group setting-hint'
      }, [
        create('span', { text: '模型能力: ' + badges.join(' | ') })
      ]);
      
      // 在模型选择区后面插入
      const modelSection = pageContent.querySelectorAll('.setting-group')[3];
      if (modelSection) {
        modelSection.after(capabilityHint);
      }
    }
  }

  /**
   * 绑定模型下拉列表事件
   */
  function bindModelDropdown() {
    const dropdown = document.getElementById('model-dropdown');
    if (!dropdown) return;
    
    // 防止点击下拉列表时输入框失去焦点
    dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });
    
    // 点击外部关闭下拉列表
    document.addEventListener('click', (e) => {
      const searchInput = document.getElementById('model-search');
      if (searchInput && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
        modelDropdownVisible = false;
      }
    });
  }

  /**
   * 更新加载按钮状态
   */
  function updateLoadButtonState() {
    const btn = document.getElementById('load-models-btn');
    if (btn) {
      btn.textContent = isLoadingModels ? '加载中...' : '加载模型';
      btn.disabled = isLoadingModels;
    }
  }

  // 暴露方法供 EventHandler 调用
  window.Pages.settings.fillForm = fillForm;
  window.Pages.settings.updateModelDropdown = updateModelDropdown;

  // 初始渲染
  render();
};
