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
    const header = create('div', { className: 'page-header' }, [
      create('h2', { 
        className: 'page-title',
        text: currentSession ? currentSession.title : '新对话'
      }),
      create('button', {
        className: 'btn btn-primary',
        text: '+ 新对话',
        onClick: () => {
          sessionController.createSession();
          render();
        }
      })
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
    
    return create('div', {
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
  }
  
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
