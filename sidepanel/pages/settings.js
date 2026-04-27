// 设置页面
window.Pages = window.Pages || {};

window.Pages.settings = function(container) {
  const { create, clear, setTheme, getTheme } = window.DOM;
  const modelManager = window.ModelManager;
  
  // 创建设置存储管理器
  const settingsStorage = new window.SettingsStorage();
  
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
      
      // 加载成功后，验证当前配置的模型是否在列表中
      if (settings.model && modelManager.isLoaded()) {
        const allModels = modelManager.getModels();
        const modelExists = allModels.find(m => m === settings.model);
        
        if (!modelExists) {
          // 模型不存在，标红提示
          window.Toast.warning(`当前配置的模型 "${settings.model}" 不在模型列表中，请重新选择`);
        }
      }
      
      // 同步modelSearchValue与settings.model
      modelSearchValue = settings.model || '';
      
      // 更新搜索框显示
      const searchInput = document.getElementById('model-search');
      if (searchInput) {
        searchInput.value = settings.model || '';
      }
      
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
    
    filtered.forEach(modelId => {
      const details = modelManager.getModelDetails(modelId);
      const modelName = details?.name || modelId;
      const contextLength = details?.context_length;
      const pricing = details?.pricing;
      const inputModalities = details?.input_modalities || [];
      
      // 创建模型项容器
      const item = create('div', {
        className: 'model-dropdown-item' + (modelId === settings.model ? ' selected' : ''),
        style: {
          padding: '10px 12px',
          cursor: 'pointer',
          borderBottom: '1px solid var(--color-border)',
          transition: 'background 0.2s'
        }
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
        settings.model = modelId;
        modelSearchValue = modelId;
        
        // 同步更新隐藏的select
        const hiddenSelect = document.getElementById('model-select-hidden');
        if (hiddenSelect) {
          hiddenSelect.value = modelId;
        }
        
        // 更新输入框
        const searchInput = document.getElementById('model-search');
        if (searchInput) {
          searchInput.value = modelId;
        }
        
        dropdown.style.display = 'none';
        
        // 只更新模型能力提示
        updateModelCapabilityHint();
      });
      
      dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
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
    
    if (details.pricing) {
      const priceText = formatPricing(details.pricing);
      if (priceText) {
        infoItems.push(`💰 价格: ${priceText}`);
      }
    }
    
    if (details.input_modalities && details.input_modalities.length > 0) {
      const modalityMap = {
        'text': '文本',
        'image': '图片',
        'video': '视频',
        'audio': '音频'
      };
      const modalities = details.input_modalities.map(m => modalityMap[m] || m).join(', ');
      infoItems.push(`📥 输入: ${modalities}`);
    }
    
    if (details.output_modalities && details.output_modalities.length > 0) {
      const modalityMap = {
        'text': '文本',
        'image': '图片',
        'audio': '音频'
      };
      const modalities = details.output_modalities.map(m => modalityMap[m] || m).join(', ');
      infoItems.push(`📤 输出: ${modalities}`);
    }
    
    if (details.top_provider?.max_completion_tokens) {
      infoItems.push(`⚡ 最大输出: ${formatContextLength(details.top_provider.max_completion_tokens)}`);
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
          className: 'input setting-row-flex-1' + (
            settings.model && modelManager.isLoaded() && 
            !modelManager.getModels().find(m => m === settings.model)
              ? ' input-error'
              : ''
          ),
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
              const dropdown = document.getElementById('model-dropdown');
              
              // 如果下拉列表已经显示，则隐藏它（切换行为）
              if (dropdown && dropdown.style.display === 'block') {
                dropdown.style.display = 'none';
                return;
              }
              
              // 如果输入框有内容且精确匹配某个模型，则显示所有模型（不做筛选）
              if (modelSearchValue) {
                const allModels = modelManager.getModels();
                const exactMatch = allModels.find(m => m === modelSearchValue);
                
                if (exactMatch) {
                  // 精确匹配，临时保存搜索值并清空以显示所有模型
                  const savedSearchValue = modelSearchValue;
                  modelSearchValue = '';
                  
                  updateModelDropdown();
                  
                  // 恢复搜索值，保持输入框显示
                  modelSearchValue = savedSearchValue;
                  return; // 提前返回，避免再次调用updateModelDropdown
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
    settingsStorage.loadSettings().then((loadedSettings) => {
      settings = { ...settings, ...loadedSettings };
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
    });
    
    page.appendChild(content);
    
    // 底部
    page.appendChild(create('div', { className: 'page-footer' }, [
      create('button', {
        className: 'btn btn-primary setting-full-width',
        text: '保存设置',
        onClick: async () => {
          await settingsStorage.saveSettings(settings);
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
        }
      })
    ]));
    
    container.appendChild(page);
  }
  
  render();
};
