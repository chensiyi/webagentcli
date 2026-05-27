/**
 * 设置页面 UI（重构版）
 * 只负责渲染和用户交互事件发布，业务逻辑由 EventHandler 处理
 */

window.Pages = window.Pages || {};

window.Pages.settings = function(container, serviceCenter) {
  const { create, clear, setTheme, getTheme } = window.DOM;
  const eventBus = serviceCenter.getEventBus();
  
  if (!serviceCenter) {
    console.error('[SettingsPage] ServiceCenter not available');
    return;
  }
  
  // 通过 ServiceCenter 获取 SettingsManager
  const settingsManager = serviceCenter.getSettingsManager();
  
  // UI 状态管理（仅用于渲染）
  let isLoadingModels = false;
  let modelSearchValue = '';
  let modelDropdownVisible = false;
  let currentSettings = null; // 从 Controller 加载的设置
  let cachedModels = []; // 缓存的模型列表
  let currentSettingsUI = null; // 当前 Provider 的 SettingsUI 实例
  
  // 暴露 currentSettings 给 EventHandler 访问
  window.Pages.settings.currentSettings = null;

  /**
   * 渲染设置页面
   */
  async function render() {
    clear(container);
    
    // 从 Manager 获取当前设置
    if (settingsManager) {
      const settings = settingsManager.getSettings();
      if (settings) {
        currentSettings = settings.toJSON ? settings.toJSON() : settings;
        // 同步到暴露的属性
        window.Pages.settings.currentSettings = currentSettings;
      }
    }
    
    // 从设置中加载已保存的模型列表
    if (Array.isArray(currentSettings?.models) && currentSettings.models.length > 0) {
      cachedModels = currentSettings.models;
      console.log('[SettingsPage] Loaded persisted model list from settings:', cachedModels.length);
    }
    
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
    
    // Provider 特定配置区域（动态渲染，包含 API Key、Endpoint、Model、Temperature、MaxTokens、SystemPrompt）
    const providerConfigContainer = create('div', { id: 'provider-config-container' });
    content.appendChild(providerConfigContainer);
    
    // 模型选择（保留，因为需要搜索和下拉功能）
    content.appendChild(createModelSection());
    
    // 上下文管理
    content.appendChild(createContextSection());
    
    // 主题
    content.appendChild(createThemeSection());
    
    page.appendChild(content);
    
    // 底部保存按钮
    const footer = create('div', { className: 'page-footer' }, [
      window.UI.Button({
        className: 'btn-primary w-full',
        text: '保存设置',
        onClick: handleSaveSettings
      })
    ]);
    page.appendChild(footer);
    
    container.appendChild(page);
    
    // 填充表单数据 - 确保 DOM 元素已经插入
    if (currentSettings) {
      // 使用 requestAnimationFrame 确保 DOM 已完全渲染
      requestAnimationFrame(() => {
        fillForm(currentSettings);
        // 渲染 Provider 特定配置
        renderProviderConfig();
      });
    }
    
    // 绑定模型下拉列表事件
    setTimeout(() => {
      bindModelDropdown();
    }, 0);
  }

  /**
   * 渲染 Provider 特定配置
   */
  function renderProviderConfig() {
    const container = document.getElementById('provider-config-container');
    if (!container || !currentSettings) return;
    
    // 获取对应的 Settings 实例
    const apiStandard = currentSettings.apiStandard || 'openrouter';
    
    // 直接创建 Settings 实例
    let SettingsClass = null;
    switch (apiStandard) {
      case 'openai':
        SettingsClass = window.SettingsPage_OpenAI;
        break;
      case 'openrouter':
        SettingsClass = window.SettingsPage_OpenRouter;
        break;
      case 'lm-studio':
        SettingsClass = window.SettingsPage_LMStudio;
        break;
    }
    
    if (!SettingsClass) {
      console.warn('[SettingsPage] No Settings for:', apiStandard);
      return;
    }
    
    currentSettingsUI = new SettingsClass();
    
    // 清空容器
    container.innerHTML = '';
    
    // 创建分组标题
    const { create } = window.DOM;
    container.appendChild(create('h3', { 
      className: 'setting-group-title',
      style: { fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--color-text)' },
      text: `${currentSettingsUI.getProviderName()} 配置`
    }));
    
    // 渲染配置项 - 使用标准 ISettings 接口
    const configGroup = create('div', { className: 'setting-group' });
    currentSettingsUI.render(configGroup, currentSettings, (key, value) => {
      updateSettingField(key, value);
    });
    container.appendChild(configGroup);
  }

  /**
   * 创建 API 标准选择区
   */
  function createApiStandardSection() {
    const supportedStandards = [
      { value: 'openrouter', label: 'OpenRouter' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'lm-studio', label: 'LM Studio' }
    ];
    
    return window.UI.FormGroup({ label: 'API 标准' }, [
      window.UI.Select({
        id: 'api-standard-select',
        options: supportedStandards,
        value: currentSettings?.apiStandard || 'openrouter',
        onChange: (val) => handleApiStandardChange(val)
      })
    ]);
  }

  /**
   * 创建模型选择区
   */
  function createModelSection() {
    return window.UI.FormGroup({ 
      label: '模型',
      className: 'relative'
    }, [
      create('div', { className: 'flex gap-8' }, [
        window.UI.Input({
          id: 'model-search',
          placeholder: cachedModels.length === 0 ? '点击加载模型' : '选择或搜索模型...',
          onInput: (e) => { 
            modelSearchValue = e.target.value;
            updateModelDropdown();
          },
          onClick: handleModelSearchClick
        }),
        window.UI.Button({
          className: 'btn-secondary btn-small',
          id: 'load-models-btn',
          text: isLoadingModels ? '加载中...' : '加载模型',
          disabled: isLoadingModels,
          onClick: handleLoadModels
        })
      ]),
      // 缓存状态提示
      create('div', {
        id: 'model-cache-status',
        className: 'text-xs text-secondary mt-4',
        style: { display: cachedModels.length > 0 ? 'block' : 'none' },
        text: cachedModels.length > 0 ? `已缓存 ${cachedModels.length} 个模型` : ''
      }),
      create('div', {
        className: 'model-dropdown',
        id: 'model-dropdown',
        style: { display: 'none' }
      })
    ]);
  }

  /**
   * 创建上下文管理区
   */
  function createContextSection() {
    return window.UI.FormGroup({}, [
      window.UI.Checkbox({
        id: 'auto-context-checkbox',
        label: '自动调整上下文窗口（根据模型限制智能截断历史消息）',
        checked: currentSettings?.autoContextTruncation !== false,
        onChange: (checked) => updateSettingField('autoContextTruncation', checked)
      })
    ]);
  }

  /**
   * 创建主题设置区
   */
  function createThemeSection() {
    return window.UI.FormGroup({ label: '主题' }, [
      create('div', { className: 'flex gap-16' }, [
        create('label', { className: 'setting-radio-label' }, [
          create('input', {
            className: 'setting-radio',
            attrs: { type: 'radio', name: 'theme', value: 'light', id: 'theme-light' },
            onChange: () => handleThemeChange('light')
          }),
          '浅色'
        ]),
        create('label', { className: 'setting-radio-label' }, [
          create('input', {
            className: 'setting-radio',
            attrs: { type: 'radio', name: 'theme', value: 'dark', id: 'theme-dark' },
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
    // 确保 currentSettings 存在
    if (!currentSettings) {
      currentSettings = {};
    }
    
    console.log('[SettingsPage] API standard change requested:', apiStandard);
    console.log('[SettingsPage] Current settings before change:', { 
      apiStandard: currentSettings.apiStandard,
      apiEndpoint: currentSettings.apiEndpoint,
      temperature: currentSettings.temperature,
      maxTokens: currentSettings.maxTokens
    });
    
    // 注意：这里不直接修改 currentSettings，而是通过事件让 Controller 处理
    // Controller 会：
    // 1. 更新内部 settings 对象（包括 apiStandard, apiEndpoint）
    // 2. 保留通用参数（temperature, maxTokens 等）
    // 3. 发布 API_ENDPOINT_CHANGED 事件
    // EventHandler 会监听该事件并：
    // 1. 更新 window.Pages.settings.currentSettings
    // 2. 调用 rerenderProviderConfig() 重绘 UI
    
    // 发布 API 标准变更事件
    eventBus.emit(window.Events.SETTINGS.API_STANDARD_CHANGED, {
      apiStandard
    });
    
    // 不需要在这里手动重绘，EventHandler 会自动处理
    console.log('[SettingsPage] API standard change event emitted, waiting for EventHandler to update UI');
  }

  /**
   * 处理端点失去焦点
   */
  function handleEndpointBlur() {
    // 移除自动加载模型的逻辑，用户需要手动点击“加载模型”按钮
  }

  /**
   * 处理模型搜索框点击
   */
  function handleModelSearchClick() {
    const dropdown = document.getElementById('model-dropdown');
    if (!dropdown) return;
    
    // 如果没有缓存的模型，提示用户先加载
    if (cachedModels.length === 0) {
      window.Toast?.info('请先点击“加载模型”按钮获取模型列表');
      return;
    }
    
    // 如果输入框有内容且精确匹配某个模型 ID 或名称，则显示全部模型
    let forceShowAll = false;
    if (modelSearchValue) {
      const exactMatch = cachedModels.find((m) => {
        if (typeof m === 'string') {
          return m.toLowerCase() === modelSearchValue.toLowerCase();
        }
        const modelId = m.id || '';
        const modelName = m.name || '';
        return modelId.toLowerCase() === modelSearchValue.toLowerCase() ||
               modelName.toLowerCase() === modelSearchValue.toLowerCase();
      });

      if (exactMatch) {
        forceShowAll = true;
      }
    }

    if (forceShowAll) {
      updateModelDropdown(true);
      dropdown.style.display = 'block';
      modelDropdownVisible = true;
      return;
    }

    toggleModelDropdown();
  }

  // /**
  //  * 处理模型搜索框失去焦点
  //  */
  // function handleModelSearchBlur() {
    
  //   setTimeout(() => {
  //     const dropdown = document.getElementById('model-dropdown');
  //     if (dropdown) {
  //       dropdown.style.display = 'none';
  //       modelDropdownVisible = false;
  //     }
  //   }, 200);
    
  //   // 如果只有一条匹配，自动选中
  //   // const filtered = getFilteredModels();
  //   // if (filtered.length === 1) {
  //   //   selectModel(filtered[0]);
  //   // }
  // }

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
    if (!currentSettings) {
      console.error('[SettingsPage] currentSettings is null, cannot load models');
      return;
    }
    
    console.log('[SettingsPage] requestLoadModels - current settings:', {
      apiStandard: currentSettings.apiStandard,
      apiEndpoint: currentSettings.apiEndpoint,
      windowCurrentSettings: window.Pages.settings.currentSettings
    });
    
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
    console.log('[SettingsPage] handleSaveSettings called, currentSettings:', currentSettings);
    
    if (!currentSettings) {
      console.error('[SettingsPage] currentSettings is null, cannot save');
      window.Toast?.error('设置数据未加载，请稍后重试');
      return;
    }
    
    console.log('[SettingsPage] Emitting SAVE_REQUEST event with settings:', {
      apiStandard: currentSettings.apiStandard,
      apiEndpoint: currentSettings.apiEndpoint,
      model: currentSettings.model
    });
    
    // 发布保存请求事件
    eventBus.emit(window.Events.SETTINGS.SAVE_REQUEST, {
      settings: currentSettings
    });
  }

  /**
   * 填充表单（由 EventHandler 调用）
   */
  function fillForm(settings) {
    currentSettings = settings;
    // 同步到暴露的属性
    window.Pages.settings.currentSettings = currentSettings;
    
    const apiStandardSelect = document.getElementById('api-standard-select');
    const modelSearch = document.getElementById('model-search');
    const autoContextCheckbox = document.getElementById('auto-context-checkbox');
    const themeLight = document.getElementById('theme-light');
    const themeDark = document.getElementById('theme-dark');
    
    if (apiStandardSelect) apiStandardSelect.value = settings.apiStandard || 'openrouter';
    if (modelSearch) modelSearch.value = settings.model || '';
    if (autoContextCheckbox) autoContextCheckbox.checked = settings.autoContextTruncation !== false;
    if (themeLight) themeLight.checked = settings.theme === 'light';
    if (themeDark) themeDark.checked = settings.theme === 'dark';
    
    // 应用主题
    setTheme(settings.theme);
  }

  /**
   * 更新模型下拉列表
   */
  function updateModelDropdown(forceShowAll = false) {
    const dropdown = document.getElementById('model-dropdown');
    
    console.log('[SettingsPage] updateModelDropdown ',dropdown)
    if (!dropdown) return;
    
    const filtered = getFilteredModels(forceShowAll);
    
    dropdown.innerHTML = '';
    
    if (filtered.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    
    filtered.forEach(modelId => {
      const details = getModelDetailsFromCache(modelId);
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
        className: 'flex gap-8 flex-wrap text-xs'
      });
      
      // 上下文长度
      if (contextLength) {
        infoLine.appendChild(window.UI.Badge({
          text: `📝 ${formatContextLength(contextLength)}`,
          type: 'primary-light'
        }));
      }
      
      // 价格
      if (pricing) {
        const priceText = formatPricing(pricing);
        if (priceText) {
          infoLine.appendChild(window.UI.Badge({
            text: `💰 ${priceText}`,
            type: 'success-light'
          }));
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
        infoLine.appendChild(window.UI.Badge({
          text: `📥 ${icons}`,
          type: 'warning-light'
        }));
      }
      
      item.appendChild(infoLine);
      
      // 鼠标悬停显示详情
      let tooltipTimer = null;
      item.addEventListener('mouseenter', (e) => {
        if (!details) return;
        
        tooltipTimer = setTimeout(() => {
          showModelTooltip(e, details);
        }, 300); // 延迟300ms显示，避免快速移动时闪烁
      });
      
      item.addEventListener('mouseleave', () => {
        if (tooltipTimer) {
          clearTimeout(tooltipTimer);
        }
        hideModelTooltip();
      });
      
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
  function getAllModels() {
    if (cachedModels.length === 0) return [];
    return cachedModels.map(m => typeof m === 'object' ? m.id : m);
  }

  /**
   * 过滤模型列表
   */
  function getFilteredModels(forceShowAll = false) {
    if (cachedModels.length === 0) return [];
    
    const models = cachedModels.map(m => {
      if (typeof m === 'object') {
        return {
          id: m.id || '',
          name: m.name || m.id || '',
          raw: m
        };
      }
      return {
        id: m,
        name: m,
        raw: m
      };
    });
    
    if (!modelSearchValue || forceShowAll) {
      return models.map(m => m.id);
    }
    
    const keyword = modelSearchValue.toLowerCase();
    return models
      .filter(m => m.id.toLowerCase().includes(keyword) || m.name.toLowerCase().includes(keyword))
      .map(m => m.id);
  }

  /**
   * 从缓存获取模型详情
   */
  function getModelDetailsFromCache(modelId) {
    if (!cachedModels || cachedModels.length === 0) {
      return null;
    }
    
    // 在 cachedModels 中查找
    const model = cachedModels.find(m => {
      if (typeof m === 'object') {
        return m.id === modelId || m.name === modelId;
      }
      return m === modelId;
    });
    
    if (!model) {
      return null;
    }
    
    if (typeof model === 'string') {
      return {
        id: model,
        name: model,
        context_length: null,
        pricing: null,
        input_modalities: [],
        description: ''
      };
    }
    
    // 兼容 CamelCase 和 snake_case 字段
    return {
      id: model.id || '',
      name: model.name || model.id || '',
      context_length: model.contextLength || model.context_length || null,
      pricing: model.pricing || null,
      input_modalities: model.inputModalities || model.input_modalities || [],
      description: model.description || model.metadata?.description || '',
      supports_reasoning: model.capabilities?.reasoning || model.supports_reasoning || false,
      supports_tools: model.capabilities?.toolUse || model.supports_tools || model.supports_function_calling || false,
      supports_function_calling: model.capabilities?.toolUse || model.supports_function_calling || false,
      supports_json_mode: model.capabilities?.jsonMode || model.supports_json_mode || false,
      links: model.links || {}
    };
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
   * 显示模型详情浮窗
   */
  function showModelTooltip(event, details) {
    // 移除已存在的浮窗
    hideModelTooltip();
    
    const tooltip = create('div', {
      id: 'model-tooltip',
      style: {
        position: 'fixed',
        left: event.clientX + 10 + 'px',
        top: event.clientY + 10 + 'px',
        maxWidth: '400px',
        padding: '12px 16px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        fontSize: '12px',
        lineHeight: '1.6'
      }
    });
    
    // 模型名称
    const nameEl = create('div', {
      style: {
        fontWeight: '600',
        fontSize: '14px',
        marginBottom: '8px',
        color: 'var(--color-text)'
      },
      text: details.name || details.id
    });
    tooltip.appendChild(nameEl);
    
    // 描述
    if (details.description) {
      const descEl = create('div', {
        style: {
          marginBottom: '8px',
          color: 'var(--color-text-secondary)',
          fontSize: '11px'
        },
        text: details.description.length > 200 
          ? details.description.substring(0, 200) + '...' 
          : details.description
      });
      tooltip.appendChild(descEl);
    }
    
    // 详细信息
    const infoItems = [];
    
    if (details.context_length) {
      infoItems.push(`📝 上下文: ${formatContextLength(details.context_length)}`);
    }
    
    if (details.max_output_tokens) {
      infoItems.push(`⚡ 最大输出: ${formatContextLength(details.max_output_tokens)}`);
    }
    
    if (details.modality) {
      infoItems.push(`🔀 模态: ${details.modality}`);
    }
    
    if (details.pricing) {
      const priceText = formatPricing(details.pricing);
      if (priceText) {
        infoItems.push(`💰 价格: ${priceText}`);
      }
    }
    
    // 特性支持
    const features = [];
    if (details.supports_reasoning) features.push('思考模式');
    if (details.supports_tools || details.supports_function_calling) features.push('工具调用');
    if (details.supports_json_mode) features.push('JSON 模式');
    if (features.length > 0) {
      infoItems.push(`✨ 能力: ${features.join(', ')}`);
    }
    
    if (infoItems.length > 0) {
      const infoEl = create('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          color: 'var(--color-text-secondary)'
        }
      });
      infoItems.forEach(text => {
        infoEl.appendChild(create('div', { text }));
      });
      tooltip.appendChild(infoEl);
    }
    
    // 链接
    if (details.links?.details) {
      const linkContainer = create('div', {
        style: {
          marginTop: '8px',
          paddingTop: '8px',
          borderTop: '1px solid var(--color-border)'
        }
      });
      
      const linkEl = create('a', {
        attrs: {
          href: `https://openrouter.ai${details.links.details}`,
          target: '_blank'
        },
        text: '🔗 查看模型详情',
        style: {
          color: 'var(--color-primary)',
          textDecoration: 'none',
          fontSize: '11px'
        }
      });
      
      linkEl.onmouseenter = () => linkEl.style.textDecoration = 'underline';
      linkEl.onmouseleave = () => linkEl.style.textDecoration = 'none';
      
      linkContainer.appendChild(linkEl);
      tooltip.appendChild(linkContainer);
    }
    
    document.body.appendChild(tooltip);
    
    // 调整位置，确保不超出屏幕
    setTimeout(() => {
      const rect = tooltip.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        tooltip.style.left = (window.innerWidth - rect.width - 10) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        tooltip.style.top = (window.innerHeight - rect.height - 10) + 'px';
      }
    }, 0);
  }
  
  /**
   * 隐藏模型详情浮窗
   */
  function hideModelTooltip() {
    const existing = document.getElementById('model-tooltip');
    if (existing) {
      existing.remove();
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
  function updateLoadButtonState(loading = null) {
    const btn = document.getElementById('load-models-btn');
    if (btn) {
      if (loading !== null) {
        isLoadingModels = loading;
      }
      btn.textContent = isLoadingModels ? '加载中...' : '加载模型';
      btn.disabled = isLoadingModels;
    }
  }

  /**
   * 更新模型缓存（由 EventHandler 调用）
   */
  function updateModelCache(models) {
    cachedModels = models || [];
    if (currentSettings) {
      currentSettings.models = cachedModels;
      window.Pages.settings.currentSettings = currentSettings;
    }
    
    // 更新输入框 placeholder
    const modelSearch = document.getElementById('model-search');
    if (modelSearch) {
      modelSearch.placeholder = cachedModels.length === 0 ? '点击加载模型' : '选择或搜索模型...';
    }
    
    // 更新缓存状态提示
    const cacheStatus = document.getElementById('model-cache-status');
    if (cacheStatus) {
      if (cachedModels.length > 0) {
        cacheStatus.textContent = `已缓存 ${cachedModels.length} 个模型`;
        cacheStatus.style.display = 'block';
      } else {
        cacheStatus.style.display = 'none';
      }
    }
    
    console.log('[SettingsPage] Model cache updated:', cachedModels.length, 'models');
  }

  // 暴露方法供 EventHandler 调用
  window.Pages.settings.fillForm = fillForm;
  window.Pages.settings.updateModelDropdown = updateModelDropdown;
  window.Pages.settings.updateModelCache = updateModelCache;
  window.Pages.settings.updateLoadButtonState = updateLoadButtonState;
  window.Pages.settings.rerenderProviderConfig = renderProviderConfig;

  // 初始渲染
  render();
};
