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

    // 监听批量消息添加事件
    this.eventBus.on('MESSAGES_ADDED', (data) => {
      console.log('[ChatEventHandler] MESSAGES_ADDED from SessionManager:', data);
      // 业务层如果依赖这个消息，可以订阅处理；如果不依赖，可以不订阅
      if (window.Pages && window.Pages.chat) {
        window.Pages.chat.render();
      }
    });
    
    // 监听 SessionManager 发出的消息更新事件（已禁用，避免与流式更新冲突）
    // ChatEventHandler 通过 STREAM_UPDATE 和 STREAM_REASONING 事件处理流式更新
    // ChatController 通过 sessionController.updateMessage 持久化，但不触发 UI 更新
    // this.eventBus.on('MESSAGE_UPDATED', (data) => {
    //   console.log('[ChatEventHandler] MESSAGE_UPDATED from SessionManager:', data);
    //   if (data.message) {
    //     this._updateMessageContent(data.message.id, data.message.content);
    //     if (data.message.reasoning_content) {
    //       this._updateMessageReasoning(data.message.id, data.message.reasoning_content);
    //     }
    //   }
    // });
    
    // 监听旧的事件（已禁用，避免与 MESSAGES_ADDED 重复）
    // 现在统一使用 MESSAGES_ADDED 批量处理，或通过 ACTIVITY_STATE_CHANGED 管理状态
    // this.eventBus.on(window.Events.CHAT.MESSAGE_ADDED, (data) => {
    //   this._handleMessageAdded(data);
    // });
    
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
    // ChatController 已经通过 EventBus 发送了 ACTIVITY_STATE_CHANGED 事件
    // ChatPage 会直接监听该事件来更新按钮状态
    // 这里不需要额外处理
  }
  
  /**
   * 处理流式请求开始
   */
  _handleStreamStart(data) {
    console.log('[ChatEventHandler] Stream started');
    
    // 立即更新按钮状态（防止 render() 后按钮状态不正确）
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    if (sendBtn) sendBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-block';
    console.log('[ChatEventHandler] Buttons updated - sendBtn:', sendBtn?.style.display, 'stopBtn:', stopBtn?.style.display);
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
   * 获取或创建思考容器
   */
  _getOrCreateReasoningContainer(messageElement) {
    let reasoningContainer = messageElement.querySelector('.message-reasoning');
    if (!reasoningContainer) {
      const messageBody = messageElement.querySelector('.message-body');
      
      if (!messageBody) {
        console.warn('[ChatEventHandler] .message-body not found in message element');
        return null;
      }
      
      // 直接在 message-body 的开头插入思考容器
      reasoningContainer = document.createElement('div');
      reasoningContainer.className = 'message-reasoning';
      reasoningContainer.style.cssText = 'margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea;';
        
      const reasoningHeader = document.createElement('div');
      reasoningHeader.className = 'reasoning-header';
      reasoningHeader.style.cssText = `
        font-size: 12px; color: #666; font-weight: 500; cursor: pointer;
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 6px;
      `;
        
      const titleSpan = document.createElement('span');
      titleSpan.textContent = '💭 思考过程';
        
      const toggleSpan = document.createElement('span');
      toggleSpan.className = 'reasoning-toggle';
      toggleSpan.textContent = '▼';
      toggleSpan.style.cssText = 'font-size: 10px; transition: transform 0.2s;';
        
      reasoningHeader.appendChild(titleSpan);
      reasoningHeader.appendChild(toggleSpan);
        
      const reasoningContent = document.createElement('div');
      reasoningContent.className = 'reasoning-content';
      reasoningContent.style.cssText = `
        font-size: 12px; color: #555; padding: 4px 0;
        white-space: pre-wrap; word-break: break-word; line-height: 1.6;
      `;
        
      reasoningContainer.appendChild(reasoningHeader);
      reasoningContainer.appendChild(reasoningContent);
      
      // 插入到 message-body 的最前面
      if (messageBody.firstChild) {
        messageBody.insertBefore(reasoningContainer, messageBody.firstChild);
      } else {
        messageBody.appendChild(reasoningContainer);
      }
        
      reasoningHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = reasoningContent.style.display === 'none';
        reasoningContent.style.display = isHidden ? 'block' : 'none';
        toggleSpan.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      });
    }
    return reasoningContainer;
  }
  
  /**
   * 更新消息推理内容
   */
  _updateMessageReasoning(messageId, content) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) {
      console.warn('[ChatEventHandler] Message element not found for reasoning update:', messageId);
      return;
    }
  
    const container = this._getOrCreateReasoningContainer(messageElement);
    if (container) {
      const contentEl = container.querySelector('.reasoning-content');
      if (contentEl) {
        // 显示容器（只在首次收到内容时显示）
        if (container.style.display === 'none') {
          container.style.display = 'block';
        }
        // MESSAGE_UPDATED 传递的是完整内容，使用覆盖模式
        contentEl.textContent = content;
        console.log('[ChatEventHandler] Reasoning updated:', content.substring(0, 50));
        const messageList = document.getElementById('message-list');
        if (messageList) messageList.scrollTop = messageList.scrollHeight;
      } else {
        console.warn('[ChatEventHandler] Reasoning content element not found');
      }
    } else {
      console.warn('[ChatEventHandler] Reasoning container not created');
    }
  }
  
  /**
   * 处理流式推理内容更新
   */
  _handleStreamReasoning(data) {
    const { messageId, reasoning_content } = data;
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const container = this._getOrCreateReasoningContainer(messageElement);
      if (container) {
        // 显示容器（只在首次收到内容时显示）
        if (container.style.display === 'none') {
          container.style.display = 'block';
        }
        
        const contentEl = container.querySelector('.reasoning-content');
        if (contentEl) {
          // 显示内容区域（如果之前是隐藏的）
          if (contentEl.style.display === 'none') {
            contentEl.style.display = 'block';
          }
          
          contentEl.textContent += reasoning_content;
          const messageList = document.getElementById('message-list');
          if (messageList) messageList.scrollTop = messageList.scrollHeight;
        } else {
          console.warn('[ChatEventHandler] Reasoning content element not found in container');
        }
      } else {
        console.warn('[ChatEventHandler] Reasoning container not created for message:', messageId);
      }
    } else {
      console.warn('[ChatEventHandler] Message element not found for stream reasoning:', messageId);
    }
  }
  
  /**
   * 处理流式请求完成
   */
  _handleStreamComplete(data) {
    const { message, duration } = data;
    console.log('[ChatEventHandler] Stream completed:', duration ? `${duration}ms` : '');
    
    // ChatController 已经通知了状态变更
    // 这里不需要额外处理
    
    // 保存最终消息到 SessionManager（流式过程中已增量更新 UI）
    if (message) {
      if (window.sessionController) {
        window.sessionController.updateMessage(message.id, (msg) => {
          msg.content = message.content;
          msg.reasoning_content = message.reasoning_content;
        });
      }
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
    
    // ChatController 已经通知了状态变更
    // 这里不需要额外处理
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
        // 获取当前完整内容
        let fullContent = contentElement.dataset.fullContent || '';
        if (append) {
          fullContent += content;
        } else {
          fullContent = content;
        }
        contentElement.dataset.fullContent = fullContent;
        contentElement.innerHTML = typeof marked !== 'undefined' ? marked.parse(fullContent) : fullContent;
        
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
