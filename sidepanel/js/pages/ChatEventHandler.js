/**
 * 聊天页面事件处理器
 * 负责注册聊天页面的事件监听器，连接 View 和 Controller
 */

class ChatEventHandler {
  constructor() {
    this.eventBus = window.EventBus;
    this.chatController = window.ChatController;
    this.sessionController = window.SessionController;
    
    // 注册事件监听
    this._registerEventListeners();
  }
  
  /**
   * 注册事件监听器
   */
  _registerEventListeners() {
    // 监听 SessionManager 发出的消息添加事件
    this.eventBus.on('MESSAGE_ADDED', (data) => {
      console.log('[ChatEventHandler] MESSAGE_ADDED from SessionManager:', data);
      // 通知页面重新渲染（用于非流式场景，如历史加载）
      if (window.Pages && window.Pages.chat) {
        window.Pages.chat.render();
      }
    });

    // 监听批量消息添加事件（用于流式交互初始化）
    this.eventBus.on('MESSAGES_ADDED', (data) => {
      console.log('[ChatEventHandler] MESSAGES_ADDED from SessionManager:', data);
      // 仅渲染一次，包含用户消息和空的助手气泡
      if (window.Pages && window.Pages.chat) {
        window.Pages.chat.render();
      }
    });
    
    // 监听 SessionManager 发出的消息更新事件
    this.eventBus.on('MESSAGE_UPDATED', (data) => {
      console.log('[ChatEventHandler] MESSAGE_UPDATED from SessionManager:', data);
      // 更新 UI 中的消息内容
      if (data.message) {
        this._updateMessageContent(data.message.id, data.message.content);
      }
    });
    
    // 监听旧的事件（保持兼容）
    this.eventBus.on(window.Events.CHAT.MESSAGE_ADDED, (data) => {
      this._handleMessageAdded(data);
    });
    
    this.eventBus.on(window.Events.CHAT.MESSAGE_UPDATED, (data) => {
      this._handleMessageUpdated(data);
    });
    
    // 监听活动状态变更（控制按钮显示）
    this.eventBus.on(window.Events.CHAT.ACTIVITY_STATE_CHANGED, (data) => {
      this._handleActivityStateChanged(data);
    });
    
    // 监听流式请求开始
    this.eventBus.on(window.Events.CHAT.STREAM_START, (data) => {
      this._handleStreamStart(data);
    });
    
    // 监听流式更新（实时文本更新）
    this.eventBus.on(window.Events.CHAT.STREAM_UPDATE, (data) => {
      this._handleStreamUpdate(data);
    });
    
    // 监听流式请求完成
    this.eventBus.on(window.Events.CHAT.STREAM_COMPLETE, (data) => {
      this._handleStreamComplete(data);
    });
    
    // 监听流式错误
    this.eventBus.on(window.Events.CHAT.STREAM_ERROR, (data) => {
      this._handleStreamError(data);
    });
    
    // 监听会话切换
    this.eventBus.on(window.Events.CHAT.SESSION_SWITCHED, (data) => {
      this._handleSessionSwitched(data);
    });
    
    // 监听会话创建
    this.eventBus.on(window.Events.CHAT.SESSION_CREATED, (data) => {
      this._handleSessionCreated(data);
    });

    // 监听消息删除事件，更新 UI
    this.eventBus.on('MESSAGE_DELETED', (data) => {
      console.log('[ChatEventHandler] MESSAGE_DELETED:', data);
      if (window.Pages && window.Pages.chat) {
        window.Pages.chat.render();
      }
    });

    // 注册键盘快捷键：Ctrl + ArrowUp/Down 快速滑动用户消息
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        this._scrollToUserMessage(e.key === 'ArrowUp' ? -1 : 1);
      }
    });
  }
  
  /**
   * 处理消息添加
   */
  _handleMessageAdded(data) {
    const { message } = data;
    console.log('[ChatEventHandler] Message added:', message);
    
    // 通知页面重新渲染
    if (window.Pages && window.Pages.chat) {
      window.Pages.chat.render();
    }
  }
  
  /**
   * 处理消息更新（流式更新）
   */
  _handleMessageUpdated(data) {
    const { message, content } = data;
    console.log('[ChatEventHandler] Message updated:', message.id, content);
    
    // 更新 UI 中的消息内容
    this._updateMessageContent(message.id, content);
  }
  
  /**
   * 处理活动状态变更
   */
  _handleActivityStateChanged(data) {
    console.log('[ChatEventHandler] Activity state changed:', data);
    // 动态更新按钮状态
    this._updateSendButtonState(!data.hasActive);
  }
  
  /**
   * 处理流式请求开始
   */
  _handleStreamStart(data) {
    console.log('[ChatEventHandler] Stream started');
    
    // 更新发送按钮状态
    this._updateSendButtonState(false);
  }
  
  /**
   * 处理流式更新（实时文本更新）
   */
  _handleStreamUpdate(data) {
    const { messageId, content } = data;
    // console.log('[ChatEventHandler] Stream update:', messageId, content);
    
    // 实时更新 UI 中的消息内容
    this._updateMessageContent(messageId, content, true); // true 表示追加模式
  }

  /**
   * 处理流式推理内容更新
   */
  _handleStreamReasoning(data) {
    const { messageId, reasoning_content } = data;
    console.log('[ChatEventHandler] Stream reasoning:', messageId, reasoning_content);
    
    // 这里可以扩展：在 UI 中显示“思考中...”或折叠的思考过程
    // 目前先只记录到模型对象中，后续可以在气泡中增加一个专门的区域来展示
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      // 示例：在 role 标签后添加一个思考指示器
      let thinkingIndicator = messageElement.querySelector('.thinking-indicator');
      if (!thinkingIndicator) {
        const roleEl = messageElement.querySelector('.message-role');
        if (roleEl) {
          thinkingIndicator = document.createElement('span');
          thinkingIndicator.className = 'thinking-indicator';
          thinkingIndicator.textContent = ' 💭 思考中...';
          thinkingIndicator.style.fontSize = '12px';
          thinkingIndicator.style.color = '#888';
          roleEl.appendChild(thinkingIndicator);
        }
      }
    }
  }
  
  /**
   * 处理流式请求完成
   */
  _handleStreamComplete(data) {
    const { message, duration } = data;
    console.log('[ChatEventHandler] Stream completed:', duration ? `${duration}ms` : '');
    
    // 恢复发送按钮状态
    this._updateSendButtonState(true);
    
    // 重新渲染该消息气泡以进行格式化等最终处理
    if (message) {
      this._rerenderMessageBubble(message);
    }
  }
  
  /**
   * 处理流式错误
   */
  _handleStreamError(data) {
    const { error, message } = data;
    console.error('[ChatEventHandler] Stream error:', error);
    
    // 显示错误提示
    window.Toast?.error(message || '发送消息失败');
    
    // 恢复发送按钮状态
    this._updateSendButtonState(true);
  }
  
  /**
   * 处理会话切换
   */
  _handleSessionSwitched(data) {
    const { sessionId, session } = data;
    console.log('[ChatEventHandler] Session switched:', sessionId);
    
    // 重新渲染聊天页面
    if (window.Pages && window.Pages.chat) {
      window.Pages.chat.render();
    }
  }
  
  /**
   * 处理会话创建
   */
  _handleSessionCreated(data) {
    const { session } = data;
    console.log('[ChatEventHandler] Session created:', session.id);
    
    // 重新渲染聊天页面
    if (window.Pages && window.Pages.chat) {
      window.Pages.chat.render();
    }
  }
  
  /**
   * 更新消息内容（用于流式更新）
   * @param {string} messageId - 消息 ID
   * @param {string} content - 新内容
   * @param {boolean} append - 是否追加模式（流式更新时为 true）
   */
  _updateMessageContent(messageId, content, append = false) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const contentElement = messageElement.querySelector('.message-content');
      if (contentElement) {
        if (append) {
          // 追加模式：在现有内容后添加新内容
          contentElement.textContent += content;
        } else {
          // 替换模式：完全替换内容
          contentElement.textContent = content;
        }
        
        // 滚动到底部
        const messageList = document.getElementById('message-list');
        if (messageList) {
          messageList.scrollTop = messageList.scrollHeight;
        }
      }
    }
  }
  
  /**
   * 重新渲染单个消息气泡
   * @param {Object} message - 消息对象
   */
  _rerenderMessageBubble(message) {
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    if (messageElement && window.DOM) {
      const newBubble = window.Pages.chat.createMessageBubble(message);
      messageElement.replaceWith(newBubble);
      
      // 滚动到底部
      const messageList = document.getElementById('message-list');
      if (messageList) {
        messageList.scrollTop = messageList.scrollHeight;
      }
    }
  }
  
  /**
   * 更新发送按钮状态
   */
  _updateSendButtonState(enabled) {
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    if (sendBtn) {
      sendBtn.style.display = enabled ? 'inline-block' : 'none';
    }
    
    if (stopBtn) {
      stopBtn.style.display = enabled ? 'none' : 'inline-block';
    }
  }
  
  /**
   * 处理发送消息（由页面调用）
   */
  handleSendMessage(content) {
    if (!content.trim()) return;
    
    // 创建用户消息
    const userMsg = new window.Message({
      role: 'user',
      content: content
    });
    
    // 添加到会话
    this.sessionController.addMessage(userMsg);
    
    console.log('[ChatEventHandler] Sent message:', userMsg);
  }
  
  /**
   * 处理停止生成（由页面调用）
   */
  handleStopGeneration() {
    this.chatController.stopGeneration();
  }
  
  /**
   * 处理创建新会话（由页面调用）
   */
  handleCreateSession() {
    this.sessionController.createSession();
  }

  /**
   * 滚动到上/下一条用户消息
   * @param {number} direction - -1 为向上，1 为向下
   */
  _scrollToUserMessage(direction) {
    const messageList = document.getElementById('message-list');
    if (!messageList) return;

    const userMessages = Array.from(messageList.querySelectorAll('.message-bubble.message-user'));
    if (userMessages.length === 0) return;

    const listRect = messageList.getBoundingClientRect();
    // 以当前窗口顶部为对准线，考虑一点偏移量以便识别
    const targetTop = listRect.top + 10; 

    let currentIndex = -1;
    // 找到当前视口顶部最近的一条用户消息
    for (let i = 0; i < userMessages.length; i++) {
      const rect = userMessages[i].getBoundingClientRect();
      if (rect.top >= targetTop - 50) { // 稍微宽容一点的判定范围
        currentIndex = i;
        break;
      }
    }

    let nextIndex;
    if (direction === -1) {
      // 向上：找上一条
      nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    } else {
      // 向下：找下一条
      nextIndex = currentIndex === -1 ? 0 : (currentIndex >= userMessages.length - 1 ? userMessages.length - 1 : currentIndex + 1);
    }

    const targetElement = userMessages[nextIndex];
    if (targetElement) {
      // 计算滚动位置：使目标元素顶部与列表顶部对齐
      const scrollOffset = targetElement.offsetTop - messageList.offsetTop;
      messageList.scrollTo({ top: scrollOffset, behavior: 'smooth' });
    }
  }
}

// 导出单例
window.ChatEventHandler = new ChatEventHandler();
