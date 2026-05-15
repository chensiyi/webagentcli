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
      // 通知页面重新渲染
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
   * 处理流式请求完成
   */
  _handleStreamComplete(data) {
    const { message, duration } = data;
    console.log('[ChatEventHandler] Stream completed:', duration ? `${duration}ms` : '');
    
    // 恢复发送按钮状态
    this._updateSendButtonState(true);
    
    // 重新渲染以显示完整消息
    if (window.Pages && window.Pages.chat) {
      window.Pages.chat.render();
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
}

// 导出单例
window.ChatEventHandler = new ChatEventHandler();
