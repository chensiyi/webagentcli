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
    const modelSupportsReasoning = checkModelSupportsReasoning();
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
    const hasReasoning = msg.reasoning_content && msg.reasoning_content.trim();
    
    // 构建消息主体内容
    const bodyChildren = [
      create('div', { 
        className: 'message-role',
        style: { 
          fontWeight: 'bold', 
          marginBottom: '6px',
          fontSize: '14px'
        },
        text: isUser ? '用户' : 'AI 助手'
      })
    ];
    
    // 如果有思考内容，添加可折叠的思考区域
    if (!isUser && hasReasoning) {
      let isExpanded = false;
      
      const reasoningContainer = create('div', { 
        className: 'message-reasoning',
        style: {
          marginBottom: '8px',
          cursor: 'pointer'
        }
      });
      
      // 思考区域头部（始终显示）
      const reasoningHeader = create('div', {
        style: {
          fontSize: '12px',
          color: '#888',
          padding: '8px',
          background: '#f5f5f5',
          borderRadius: '6px',
          borderLeft: '3px solid #667eea',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }
      }, [
        create('span', {
          text: '💭 思考过程'
        }),
        create('span', {
          className: 'reasoning-toggle',
          text: '▼',
          style: {
            fontSize: '10px',
            transition: 'transform 0.2s'
          }
        })
      ]);
      
      // 思考内容（默认隐藏）
      const reasoningContent = create('div', {
        className: 'reasoning-content',
        style: {
          display: 'none',
          fontSize: '12px',
          color: '#666',
          padding: '8px',
          background: '#fafafa',
          borderRadius: '0 0 6px 6px',
          borderLeft: '3px solid #667eea',
          marginTop: '-1px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        },
        text: msg.reasoning_content
      });
      
      reasoningContainer.appendChild(reasoningHeader);
      reasoningContainer.appendChild(reasoningContent);
      
      // 点击切换展开/折叠
      reasoningHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        isExpanded = !isExpanded;
        
        if (isExpanded) {
          reasoningContent.style.display = 'block';
          reasoningHeader.querySelector('.reasoning-toggle').style.transform = 'rotate(180deg)';
        } else {
          reasoningContent.style.display = 'none';
          reasoningHeader.querySelector('.reasoning-toggle').style.transform = 'rotate(0deg)';
        }
      });
      
      bodyChildren.push(reasoningContainer);
    }
    
    // 添加主要内容区域
    bodyChildren.push(create('div', { 
      className: 'message-content',
      text: msg.content || ''
    }));
    
    const bubble = create('div', {
      className: `message-bubble message-${msg.role}`,
      attrs: { 'data-message-id': msg.id },  // 添加消息 ID 用于流式更新
      style: { position: 'relative' }  // 关键：为绝对定位的子元素提供定位上下文
    }, [
      create('div', { className: 'message-body' }, bodyChildren)
    ]);

    // 添加删除按钮（默认隐藏，鼠标悬停显示）
    const deleteBtn = create('button', {
      className: 'message-delete-btn',
      text: '×',
      style: {
        position: 'absolute',
        top: '6px',
        right: '6px',
        background: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid #ddd',
        borderRadius: '50%',
        width: '20px',
        height: '20px',
        color: '#d9534f',
        fontSize: '14px',
        fontWeight: 'bold',
        cursor: 'pointer',
        opacity: '0',
        zIndex: '10',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0',
        lineHeight: '1'
      },
      onMouseEnter: (e) => {
        e.target.style.opacity = '1';
        e.target.style.background = '#d9534f';
        e.target.style.color = '#fff';
        e.target.style.borderColor = '#d9534f';
      },
      onMouseLeave: (e) => {
        e.target.style.opacity = '0';
        e.target.style.background = 'rgba(255, 255, 255, 0.9)';
        e.target.style.color = '#d9534f';
        e.target.style.borderColor = '#ddd';
      },
      onClick: (e) => {
        e.stopPropagation();
        // 通过 ChatService 实例调用交互接口，保持页面与底层实现的解耦
        if (window.ChatService && typeof window.ChatService.confirmDeleteMessage === 'function') {
          window.ChatService.confirmDeleteMessage(msg.id, () => {
            console.log('[ChatPage] Executing delete for:', msg.id);
            sessionController.deleteMessage(msg.id);
          });
        } else {
          console.error('[ChatPage] confirmDeleteMessage not found on ChatService');
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
   * 检查当前模型是否支持 reasoning（同步，从缓存读取）
   */
  function checkModelSupportsReasoning() {
    if (!currentSession) return false;
    
    // 从 Settings 获取当前模型
    const settings = window.SettingsController ? window.SettingsController.getSettings() : null;
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
  
  // 初始渲染
  render();
};
