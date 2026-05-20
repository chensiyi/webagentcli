/**
 * 聊天页面 UI
 * 基于新的核心架构重写，复用 theme 样式
 */

window.Pages = window.Pages || {};

window.Pages.chat = function(container, serviceCenter) {
  const { create, clear } = window.DOM;
  
  if (!serviceCenter) {
    console.error('[ChatPage] ServiceCenter not available');
    return;
  }
  
  const sessionController = serviceCenter.getSessionManager();
  
  // 获取当前会话（页面加载时绑定）
  let currentSession = sessionController.getCurrentSession();
  
  /**
   * 渲染聊天页面
   */
  function render() {
    console.log('[ChatPage] Render called');
    clear(container);
    
    currentSession = sessionController.getCurrentSession();
    const messages = currentSession ? currentSession.messages : [];
    
    console.log('[ChatPage] Current session:', currentSession?.id, 'Messages count:', messages.length);
    
    const page = create('div', { className: 'page' });
    
    // 头部 - 使用 theme 中的 page-header 样式
    const headerActions = [];
    
    // Reasoning 模式切换按钮（仅当模型支持时显示）
    const modelSupportsReasoning = checkModelSupportsReasoning();
    if (modelSupportsReasoning) {
      const reasoningButtonContainer = create('div', {
        className: 'reasoning-control',
        style: { position: 'relative', display: 'inline-block' }
      });
      
      // 思考强度选择器（默认隐藏）
      const effortSelector = create('div', {
        className: 'reasoning-effort-selector',
        style: {
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '8px',
          background: 'var(--bg-secondary, #2a2a2a)',
          border: '1px solid var(--border-color, #444)',
          borderRadius: '8px',
          padding: '8px',
          display: 'none',
          zIndex: '1000',
          minWidth: '120px'
        }
      });
      
      // 强度选项（从高到低排列，符合滚轮直觉）
      const efforts = [
        { value: 'high', label: '高', icon: '🚀' },
        { value: 'medium', label: '中', icon: '🔥' },
        { value: 'low', label: '低', icon: '⚡' }
      ];
      
      efforts.forEach(effort => {
        const option = create('div', {
          className: `effort-option ${(!currentSession || currentSession.reasoningEffort === effort.value) ? 'active' : ''}`,
          style: {
            padding: '6px 12px',
            cursor: 'pointer',
            borderRadius: '4px',
            marginBottom: '4px',
            background: (!currentSession || currentSession.reasoningEffort === effort.value) ? 'var(--primary-color, #4CAF50)' : 'transparent',
            color: (!currentSession || currentSession.reasoningEffort === effort.value) ? '#fff' : 'inherit',
            textAlign: 'center',
            fontSize: '13px'
          },
          text: `${effort.icon} ${effort.label}`,
          onClick: (e) => {
            e.stopPropagation();
            updateReasoningEffort(effort.value);
          }
        });
        
        // 悬停效果
        option.addEventListener('mouseenter', () => {
          if (!currentSession || currentSession.reasoningEffort !== effort.value) {
            option.style.background = 'rgba(255, 255, 255, 0.1)';
          }
        });
        option.addEventListener('mouseleave', () => {
          if (!currentSession || currentSession.reasoningEffort !== effort.value) {
            option.style.background = 'transparent';
          }
        });
        
        effortSelector.appendChild(option);
      });
      
      // 主按钮
      const reasoningEnabled = currentSession ? currentSession.reasoningEnabled : true; // 默认开启
      const reasoningBtn = create('button', {
        className: `btn ${reasoningEnabled ? 'btn-primary' : 'btn-secondary'}`,
        style: { marginRight: '8px' },
        text: reasoningEnabled ? 'think💡' : 'think',
        onClick: () => toggleReasoning()
      });
      
      // 鼠标悬停显示/隐藏强度选择器
      let hideTimeout = null;
      
      const showSelector = () => {
        if (hideTimeout) clearTimeout(hideTimeout);
        effortSelector.style.display = 'block';
      };
      
      const hideSelector = () => {
        hideTimeout = setTimeout(() => {
          effortSelector.style.display = 'none';
        }, 200);
      };
      
      reasoningBtn.addEventListener('mouseenter', showSelector);
      reasoningBtn.addEventListener('mouseleave', hideSelector);
      effortSelector.addEventListener('mouseenter', showSelector);
      effortSelector.addEventListener('mouseleave', hideSelector);
      
      // 鼠标滚轮调整强度
      effortSelector.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const currentEffort = currentSession ? currentSession.reasoningEffort : 'medium';
        const currentIndex = efforts.findIndex(eff => eff.value === currentEffort);
        let newIndex;
        
        if (e.deltaY < 0) {
          // 向上滚动 - 序号缩小（向列表顶部移动）
          newIndex = Math.max(0, currentIndex - 1);
        } else {
          // 向下滚动 - 序号增大（向列表底部移动）
          newIndex = Math.min(efforts.length - 1, currentIndex + 1);
        }
        
        if (newIndex !== currentIndex) {
          updateReasoningEffort(efforts[newIndex].value, false); // 不重新渲染
        }
      }, { passive: false }); // 需要调用 preventDefault，必须设为 false
      
      reasoningButtonContainer.appendChild(reasoningBtn);
      reasoningButtonContainer.appendChild(effortSelector);
      headerActions.push(reasoningButtonContainer);
    }
    
    headerActions.push(create('button', {
      className: 'btn btn-primary',
      text: '+ 新对话',
      onClick: () => {
        sessionController.createSession();
        render();
      }
    }));
    
    const header = create('div', { className: 'page-header' }, [
      create('h2', { 
        className: 'page-title',
        text: currentSession ? currentSession.title : '新对话'
      }),
      ...headerActions
    ]);
    page.appendChild(header);
    
    // 消息列表 - 使用 theme 中的 page-content 样式
    console.log('[ChatPage] Creating message list with', messages.length, 'messages');
    const messageList = createMessageList(messages);
    page.appendChild(messageList);
    
    // 输入区 - 使用 theme 中的 page-footer 样式
    const inputArea = createInputArea();
    page.appendChild(inputArea);
    
    container.appendChild(page);
    
    // 滚动到底部
    scrollToBottom(messageList);
    
    // 渲染后检查是否有活动任务，恢复按钮状态（解决切换页面后按钮丢失的问题）
    if (serviceCenter && sessionController.currentSessionId) {
      const settingsController = serviceCenter.getSettingsController();
      const settings = settingsController.getSettings();
      
      if (settings && settings.apiStandard) {
        const chatService = serviceCenter.createChatService(settings.apiStandard, {
          endpoint: settings.apiEndpoint,
          apiKey: settings.apiKey,
          defaultModel: settings.model || 'default'
        });
        
        const chat = serviceCenter.getChatController(chatService);
        if (chat.hasActiveActivities()) {
          const sendBtn = document.getElementById('send-btn');
          const stopBtn = document.getElementById('stop-btn');
          if (sendBtn) sendBtn.style.display = 'none';
          if (stopBtn) stopBtn.style.display = 'inline-block';
          console.log('[ChatPage] Buttons restored after render - hasActive:', true);
        }
      }
    }
  }
  
  // 将 render 方法暴露出去，供 EventHandler 调用
  window.Pages.chat.render = render;
  
  /**
   * 创建消息列表
   */
  function createMessageList(messages) {
    console.log('[ChatPage] createMessageList called with', messages.length, 'messages');
    const list = create('div', { 
      className: 'page-content',
      id: 'message-list'
    });
    
    if (messages.length === 0) {
      console.log('[ChatPage] No messages, showing empty state');
      list.appendChild(createEmptyState());
    } else {
      messages.forEach((msg, index) => {
        const bubble = createMessageBubble(msg);
        list.appendChild(bubble);
      });
    }
    
    return list;
  }
  
  /**
   * 创建空状态
   */
  function createEmptyState() {
    return create('div', { className: 'empty-state' }, [
      create('div', { className: 'empty-state-icon', text: '💬' }),
      create('div', { className: 'empty-state-title', text: '开始对话' }),
      create('div', { className: 'empty-state-desc', text: '输入消息开始聊天' })
    ]);
  }
  
  /**
   * 创建消息气泡 - 复用 theme 中的 message 样式
   */
  function createMessageBubble(msg) {
    console.log('[ChatPage] Creating message bubble:', {
      id: msg.id,
      role: msg.role,
      contentLength: msg.content?.length || 0,
      reasoningLength: msg.reasoning_content?.length || 0,
      hasContent: !!msg.content,
      hasReasoning: !!msg.reasoning_content
    });
    
    const isUser = msg.role === 'user';
    const hasReasoning = msg.reasoning_content && msg.reasoning_content.trim();
    
    // 构建消息主体内容
    const bodyChildren = [];
    
    // assistant 消息始终预留思考容器（初始隐藏，收到 reasoning 时显示）
    if (!isUser) {
      console.log('[ChatPage] Creating reasoning container for assistant message:', msg.id);
      const reasoningContainer = create('div', { 
        className: 'message-reasoning',
        style: { display: hasReasoning ? 'block' : 'none' }
      });
      
      // 思考区域头部
      const reasoningHeader = create('div', {
        className: 'reasoning-header'
      }, [
        create('span', { text: '💭 思考过程' }),
        create('span', { className: 'reasoning-toggle', text: '▼' })
      ]);
      
      // 思考内容（默认收缩）
      const reasoningContent = create('div', {
        className: 'reasoning-content',
        text: msg.reasoning_content || '',
        style: { display: 'none' }
      });
      
      console.log('[ChatPage] Reasoning content element created, initial text length:', (msg.reasoning_content || '').length);
      
      reasoningContainer.appendChild(reasoningHeader);
      reasoningContainer.appendChild(reasoningContent);
      
      // 点击切换展开/折叠
      reasoningHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = reasoningContent.style.display === 'none';
        reasoningContent.style.display = isHidden ? 'block' : 'none';
        reasoningHeader.querySelector('.reasoning-toggle').style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      });
      
      bodyChildren.push(reasoningContainer);
    }
    
    // 添加主要内容区域
    const contentDiv = create('div', { 
      className: 'message-content',
      html: typeof marked !== 'undefined' ? marked.parse(msg.content || '') : (msg.content || '')
    });
    // 保存原始内容用于流式追加
    contentDiv.dataset.fullContent = msg.content || '';
    bodyChildren.push(contentDiv);
    
    console.log('[ChatPage] Content div created, fullContent length:', (msg.content || '').length);
    
    const bubble = create('div', {
      className: `message-bubble message-${msg.role}`,
      attrs: { 'data-message-id': msg.id }
    }, [
      create('div', { className: 'message-body' }, bodyChildren)
    ]);

    console.log('[ChatPage] Message bubble created successfully');

    // 添加删除按钮（默认隐藏，鼠标悬停显示）
    const deleteBtn = create('button', {
      className: 'message-delete-btn',
      text: '×',
      onMouseEnter: (e) => e.target.style.opacity = '1',
      onMouseLeave: (e) => e.target.style.opacity = '0',
      onClick: (e) => {
        e.stopPropagation();
        // 通过 serviceCenter 获取服务
        const sessionManager = serviceCenter.getSessionManager();
        
        if (!sessionManager.currentSessionId) {
          console.error('[ChatPage] Cannot delete message: no active session');
          return;
        }
        
        // 获取 Settings 和 ChatService
        const settingsController = serviceCenter.getSettingsController();
        const settings = settingsController.getSettings();
        
        if (!settings || !settings.apiStandard) {
          console.error('[ChatPage] Cannot delete message: chat service not configured');
          return;
        }
        
        const chatService = serviceCenter.createChatService(settings.apiStandard, {
          endpoint: settings.apiEndpoint,
          apiKey: settings.apiKey,
          defaultModel: settings.model || 'default'
        });
        
        const chat = sessionManager.getOrCreateChat(sessionManager.currentSessionId, chatService);
        chat.deleteMessage(msg.id);
      }
    });

    // 鼠标进入气泡时显示删除按钮
    bubble.addEventListener('mouseenter', () => {
      deleteBtn.style.opacity = '1';
    });
    bubble.addEventListener('mouseleave', () => {
      deleteBtn.style.opacity = '0';
    });

    bubble.appendChild(deleteBtn);
    return bubble;
  }
  
  // 暴露 createMessageBubble 给 EventHandler 使用
  window.Pages.chat.createMessageBubble = createMessageBubble;
  
  /**
   * 创建输入区 - 使用 theme 中的 page-footer 样式
   */
  function createInputArea() {
    console.log('[ChatPage] createInputArea called');
    let inputValue = '';
    const chatController = window.ChatController;
      
    const textarea = create('textarea', {
      className: 'textarea',
      id: 'message-input',
      attrs: { 
        placeholder: '输入消息',
        rows: 1
      },
      style: { 
        flex: '1 1 auto',  // 允许收缩和扩展
        minWidth: '0',     // 防止 flex 子项溢出
        width: 'auto',     // 覆盖 CSS 中的 width: 100%
        resize: 'none',
        overflow: 'hidden',
        minHeight: '36px',
        maxHeight: '120px'
      },
      onInput: (e) => {
        inputValue = e.target.value;
        // 自动调整高度
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
      },
      onKeyDown: (e) => {
        // Ctrl/Cmd + Enter 发送消息
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          sendMessage();
        }
        // Shift + Enter 换行（默认行为）
      }
    });
      
    const sendBtn = create('button', {
      className: 'btn btn-primary',
      id: 'send-btn',
      text: '发送',
      onClick: sendMessage,
      style: { 
        marginLeft: '8px', 
        whiteSpace: 'nowrap',
        flexShrink: '0'  // 防止按钮被压缩
      }
    });
      
    const stopBtn = create('button', {
      className: 'btn btn-error',
      id: 'stop-btn',
      text: '停止',
      style: { 
        display: 'none', 
        marginLeft: '8px', 
        whiteSpace: 'nowrap',
        flexShrink: '0'  // 防止按钮被压缩
      },
      onClick: () => {
        chatController.stopGeneration();
      }
    });
    
    // 初始化事件监听（只注册一次）
    if (!window.Pages.chat._activityListenerRegistered && window.EventBus && window.Events) {
      window.Pages.chat._activityListenerRegistered = true;
      window.EventBus.on(window.Events.CHAT.ACTIVITY_STATE_CHANGED, (data) => {
        console.log('[ChatPage] ACTIVITY_STATE_CHANGED received:', data);
        const hasActive = data.hasActive || data.messageQueueLength > 0;
        console.log('[ChatPage] Updating buttons - hasActive:', hasActive);
        
        // 每次都通过 ID 获取最新的按钮元素
        const currentSendBtn = document.getElementById('send-btn');
        const currentStopBtn = document.getElementById('stop-btn');
        
        if (currentSendBtn) currentSendBtn.style.display = hasActive ? 'none' : 'inline-block';
        if (currentStopBtn) currentStopBtn.style.display = hasActive ? 'inline-block' : 'none';
        
        console.log('[ChatPage] Buttons updated - sendBtn.display:', currentSendBtn?.style.display, 'stopBtn.display:', currentStopBtn?.style.display);
        
        // 额外调试信息
        if (currentStopBtn) {
          const rect = currentStopBtn.getBoundingClientRect();
          console.log('[ChatPage] Stop button details:', {
            element: currentStopBtn,
            inDOM: document.contains(currentStopBtn),
            computedDisplay: getComputedStyle(currentStopBtn).display,
            offsetWidth: currentStopBtn.offsetWidth,
            offsetHeight: currentStopBtn.offsetHeight,
            parentElement: currentStopBtn.parentElement,
            boundingRect: rect,
            isVisible: rect.width > 0 && rect.height > 0,
            zIndex: getComputedStyle(currentStopBtn).zIndex
          });
        }
      });
    }
      
    function sendMessage() {
      if (!inputValue.trim()) return;
      
      const content = inputValue.trim();
      
      // 清空输入
      inputValue = '';
      textarea.value = '';
      textarea.style.height = 'auto';
      
      // 通过 EventBus 发出用户消息事件（ChatEventHandler 监听并处理）
      window.EventBus.emit(window.Events.CHAT.USER_MESSAGE_SENT, { content });
    }
      
    return create('div', { 
      className: 'page-footer',
      id: 'input-area'
    }, [
      create('div', { className: 'input-row' }, [
        textarea,
        sendBtn,
        stopBtn
      ])
    ]);
  }

  /**
   * 检查当前模型是否支持 reasoning（同步，从缓存读取）
   */
  function checkModelSupportsReasoning() {
    // 从 Settings 获取当前模型
    const settingsController = serviceCenter.getSettingsController();
    const settings = settingsController.getSettings();
    if (!settings || !settings.apiEndpoint || !settings.model) return false;
    
    // 从 StorageModel 同步读取缓存
    const cacheKey = `models:${settings.apiEndpoint}`;
    const cachedModels = window.StorageModel.getCacheSync ? 
      window.StorageModel.getCacheSync(cacheKey) : null;
    
    if (!cachedModels || !Array.isArray(cachedModels)) {
      // 如果缓存还没加载出来，默认认为支持（因为 Model 原型默认开启）
      return true;
    }
    
    const currentModel = cachedModels.find(m => m.id === settings.model);
    if (!currentModel) return true; // 没找到具体模型信息时，也默认支持
    
    // 兼容 Model 对象的方法调用和旧版字段
    if (typeof currentModel.supportsReasoning === 'function') {
      return currentModel.supportsReasoning();
    }
    return currentModel.capabilities?.reasoning !== false && currentModel.supports_reasoning !== false;
  }

  /**
   * 切换 Reasoning 模式
   */
  function toggleReasoning() {
    if (!currentSession) return;
    
    // 切换 reasoningEnabled 状态
    currentSession.reasoningEnabled = !currentSession.reasoningEnabled;
    
    // 保存会话
    const sessionManager = serviceCenter.getSessionManager();
    sessionManager.updateSession(currentSession.id, (session) => {
      session.reasoningEnabled = currentSession.reasoningEnabled;
    });
    
    // 重新渲染页面以更新按钮状态
    render();
    
    console.log('[ChatPage] Reasoning mode:', currentSession.reasoningEnabled ? 'enabled' : 'disabled');
  }

  /**
   * 更新 Reasoning 强度
   * @param {string} effort - 强度值
   * @param {boolean} shouldRerender - 是否重新渲染整个页面（默认 true）
   */
  function updateReasoningEffort(effort, shouldRerender = true) {
    if (!currentSession) return;
    
    // 验证强度值
    const validEfforts = ['low', 'medium', 'high'];
    if (!validEfforts.includes(effort)) {
      console.warn('[ChatPage] Invalid reasoning effort:', effort);
      return;
    }
    
    // 更新强度
    currentSession.reasoningEffort = effort;
    
    // 保存会话
    const sessionManager = serviceCenter.getSessionManager();
    sessionManager.updateSession(currentSession.id, (session) => {
      session.reasoningEffort = effort;
    });
    
    // 如果需要，重新渲染页面以更新选择器状态
    if (shouldRerender) {
      render();
    } else {
      // 否则只更新选择器的视觉状态
      updateEffortSelectorUI();
    }
    
    console.log('[ChatPage] Reasoning effort updated to:', effort);
  }

  /**
   * 更新强度选择器的 UI 状态（不重新渲染整个页面）
   */
  function updateEffortSelectorUI() {
    const selector = document.querySelector('.reasoning-effort-selector');
    if (!selector) return;
    
    const options = selector.querySelectorAll('.effort-option');
    options.forEach(option => {
      const optionEffort = option.textContent.trim().includes('高') ? 'high' :
                          option.textContent.trim().includes('中') ? 'medium' : 'low';
      
      if (optionEffort === currentSession.reasoningEffort) {
        option.style.background = 'var(--primary-color, #4CAF50)';
        option.style.color = '#fff';
      } else {
        option.style.background = 'transparent';
        option.style.color = 'inherit';
      }
    });
  }
  
  /**
   * 滚动到底部
   */
  function scrollToBottom(element) {
    setTimeout(() => {
      element.scrollTop = element.scrollHeight;
    }, 0);
  }
  
  // 初始渲染
  render();
};
