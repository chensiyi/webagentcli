/**
 * 聊天页面 UI
 * 基于新的核心架构重写，复用 theme 样式
 */

window.Pages = window.Pages || {};

window.Pages.chat = function(container) {
  const { create, clear } = window.DOM;
  const sessionController = window.SessionController;
  const chatController = window.ChatController;
  
  // 获取当前会话
  let currentSession = sessionController.getCurrentSession();
  let isStreaming = false;
  let modelSupportsReasoning = false; // 缓存模型是否支持 reasoning
  
  /**
   * 渲染聊天页面
   */
  function render() {
    clear(container);
    
    currentSession = sessionController.getCurrentSession();
    const messages = currentSession ? currentSession.messages : [];
    
    const page = create('div', { className: 'page' });
    
    // 头部 - 使用 theme 中的 page-header 样式
    const headerActions = [];
    
    // Reasoning 模式切换按钮（仅当模型支持时显示）
    if (currentSession && modelSupportsReasoning) {
      headerActions.push(create('button', {
        className: `btn ${currentSession.reasoningEnabled ? 'btn-primary' : 'btn-secondary'}`,
        style: { marginRight: '8px' },
        text: currentSession.reasoningEnabled ? '💭 思考中' : '💭 思考',
        onClick: () => toggleReasoning()
      }));
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
    const messageList = createMessageList(messages);
    page.appendChild(messageList);
    
    // 输入区 - 使用 theme 中的 page-footer 样式
    const inputArea = createInputArea();
    page.appendChild(inputArea);
    
    container.appendChild(page);
    
    // 滚动到底部
    scrollToBottom(messageList);
  }
  
  // 将 render 方法暴露出去，供 EventHandler 调用
  window.Pages.chat.render = render;
  
  /**
   * 创建消息列表
   */
  function createMessageList(messages) {
    const list = create('div', { 
      className: 'page-content',
      id: 'message-list'
    });
    
    if (messages.length === 0) {
      list.appendChild(createEmptyState());
    } else {
      messages.forEach(msg => {
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
    const isUser = msg.role === 'user';
    
    const bubble = create('div', {
      className: `message-bubble message-${msg.role}`,
      attrs: { 'data-message-id': msg.id }  // 添加消息 ID 用于流式更新
    }, [
      create('div', { 
        className: 'message-avatar',
        text: isUser ? '' : '🤖'
      }),
      create('div', { className: 'message-body' }, [
        create('div', { 
          className: 'message-role',
          text: isUser ? '用户' : 'AI 助手'
        }),
        create('div', { 
          className: 'message-content',
          text: msg.content || ''
        })
      ])
    ]);

    // 添加删除按钮（默认隐藏，鼠标悬停显示）
    const deleteBtn = create('button', {
      className: 'message-delete-btn',
      text: '×',
      style: {
        position: 'absolute',
        top: '4px',
        right: '4px',
        background: 'transparent',
        border: 'none',
        color: '#999',
        fontSize: '16px',
        cursor: 'pointer',
        opacity: '0',
        transition: 'opacity 0.2s',
        padding: '0 4px',
        lineHeight: '1'
      },
      onMouseEnter: (e) => e.target.style.opacity = '1',
      onMouseLeave: (e) => e.target.style.opacity = '0',
      onClick: () => {
        if (window.ChatService) {
          window.ChatService.confirmDeleteMessage(msg.id, () => {
            sessionController.deleteMessage(msg.id);
          });
        }
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
    let inputValue = '';
      
    const textarea = create('textarea', {
      className: 'textarea',
      id: 'message-input',
      attrs: { 
        placeholder: '输入消息',
        rows: 1
      },
      style: { 
        flex: 1, 
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
      style: { marginLeft: '8px', whiteSpace: 'nowrap' }
    });
      
    const stopBtn = create('button', {
      className: 'btn btn-error',
      id: 'stop-btn',
      text: '停止',
      style: { display: isStreaming ? 'inline-block' : 'none', marginLeft: '8px', whiteSpace: 'nowrap' },
      onClick: () => {
        chatController.stopGeneration();
        isStreaming = false;
        render();
      }
    });
      
    function sendMessage() {
      if (!inputValue.trim()) return;
      
      const content = inputValue.trim();
      
      // 清空输入
      inputValue = '';
      textarea.value = '';
      textarea.style.height = 'auto';
      
      // 禁用发送按钮，显示停止按钮
      sendBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      isStreaming = true;
      
      console.log('[ChatPage] Sending message:', content);
      
      // 调用 ChatController 发送消息
      chatController.sendMessage(content)
        .then(() => {
          console.log('[ChatPage] Message sent successfully');
        })
        .catch((error) => {
          console.error('[ChatPage] Send message failed:', error);
          window.Toast?.error('发送失败: ' + error.message);
        })
        .finally(() => {
          // 恢复按钮状态
          isStreaming = false;
          sendBtn.style.display = 'inline-block';
          stopBtn.style.display = 'none';
        });
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
   * 检查当前模型是否支持 reasoning（同步，使用全局缓存）
   */
  function checkModelSupportsReasoning() {
    // 从全局缓存读取
    if (window.modelCapabilities) {
      modelSupportsReasoning = window.modelCapabilities.supportsReasoning || false;
    } else {
      modelSupportsReasoning = false;
    }
  }

  /**
   * 切换 Reasoning 模式
   */
  function toggleReasoning() {
    if (!currentSession) return;
    
    // 切换 reasoningEnabled 状态
    currentSession.reasoningEnabled = !currentSession.reasoningEnabled;
    
    // 保存会话
    if (window.SessionController) {
      window.SessionController.updateSession(currentSession.id, (session) => {
        session.reasoningEnabled = currentSession.reasoningEnabled;
      });
    }
    
    // 重新渲染页面以更新按钮状态
    render();
    
    console.log('[ChatPage] Reasoning mode:', currentSession.reasoningEnabled ? 'enabled' : 'disabled');
  }
  
  /**
   * 滚动到底部
   */
  function scrollToBottom(element) {
    setTimeout(() => {
      element.scrollTop = element.scrollHeight;
    }, 0);
  }
  
  // 加载模型能力
  function initModelCapabilities() {
    if (!window.SettingsController || !window.StorageModel) return;
    
    try {
      const settings = window.SettingsController.getSettings();
      if (!settings || !settings.apiEndpoint || !settings.model) return;
      
      const cacheKey = `models:${settings.apiEndpoint}`;
      const cachedModels = await window.StorageModel.getCache(cacheKey);
      
      if (!cachedModels || !Array.isArray(cachedModels)) return;
      
      const currentModel = cachedModels.find(m => m.id === settings.model);
      if (!currentModel) return;
      
      // 将模型支持信息存储到全局
      window.modelCapabilities = {
        supportsReasoning: currentModel.supports_reasoning === true,
        modelId: settings.model
      };
      
      console.log('[ChatPage] Model capabilities loaded:', window.modelCapabilities);
    } catch (error) {
      console.error('[ChatPage] Failed to load model capabilities:', error);
    }
  }
  
  // 初始渲染（先加载模型能力，再渲染）
  initModelCapabilities();
  render();
};
