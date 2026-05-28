/**
 * 聊天页面事件处理器
 * 负责注册聊天页面的事件监听器，连接 View 和 Controller
 */

class ChatEventHandler {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    
    // 注册事件监听
    this._registerEventListeners();
  }
  
  /**
   * 注册事件监听器
   */
  _registerEventListeners() {
    // 监听用户发送消息事件，收集上下文并调用 ChatController
    this.eventBus.on(window.Events.CHAT.USER_MESSAGE_SENT, (data) => {
      this._handleUserMessageSent(data);
    });
    // 监听消息更新事件（错误更新等）
    this.eventBus.on(window.Events.CHAT.MESSAGE_UPDATED, (data) => {
      this._handleMessageUpdated(data);
    });
    
    // 监听流式分片追加事件（UI 更新）
    this.eventBus.on(window.Events.CHAT.STREAM_CHUNK_APPEND, (data) => {
      this._handleStreamChunkAppend(data);
    });
    
    // 监听 SessionManager 发出的消息更新事件（已禁用，避免与流式更新冲突）
    
    // 监听活动状态变更（控制按钮显示）
    this.eventBus.on(window.Events.CHAT.ACTIVITY_STATE_CHANGED, (data) => {
      this._handleActivityStateChanged(data);
    });
    
    // 监听流式请求开始
    this.eventBus.on(window.Events.CHAT.STREAM_START, (data) => {
      this._handleStreamStart(data);
    });
    
    // 监听流式请求完成
    this.eventBus.on(window.Events.CHAT.STREAM_COMPLETE, (data) => {
      this._handleStreamComplete(data);
    });
    
    // 监听流式错误
    this.eventBus.on(window.Events.CHAT.STREAM_ERROR, (data) => {
      this._handleStreamError(data);
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
   * 处理消息更新（流式更新或错误更新）
   */
  _handleMessageUpdated(data) {
    const { message } = data;
    if (!message) return;
    
    console.log('[ChatEventHandler] Message updated:', message.id);
    
    // 直接更新 UI
    this._updateMessageContent(message.id, message.content);
    
    // 如果有推理内容，也更新
    if (message.reasoning_content) {
      this._updateMessageReasoning(message.id, message.reasoning_content);
    }
  }
  
  /**
   * 处理活动状态变更
   */
  _handleActivityStateChanged(data) {
    console.log('[ChatEventHandler] Activity state changed:', data.state);
    // 转发给页面进行状态更新
    if (window.Pages.chat.updateUIState) {
      window.Pages.chat.updateUIState(data);
    }
  }
  
  /**
   * 处理用户发送消息事件（收集上下文并调用 Controller）
   */
  _handleUserMessageSent(data) {
    const { content, reasoningEffort } = data;
    
    if (!this.serviceCenter) {
      console.error('[ChatEventHandler] ServiceCenter not available');
      return;
    }
    
    // 获取当前聊天控制器单例
    const chat = this.serviceCenter.getChatController();
    
    // 调用 ChatController 执行业务逻辑
    chat.sendMessage({
      content,
      reasoningEffort
    }).catch(error => {
      console.error('[ChatEventHandler] Send message failed:', error);
      window.Toast?.error(`发送失败: ${error.message}`);
    });
  }
  
  /**
   * 处理流式请求开始
   */
  _handleStreamStart(data) {
    console.log('[ChatEventHandler] Stream started');
    // UI 状态由 _handleActivityStateChanged 统一处理
  }
  
  /**
   * 处理流式分片追加（统一处理数据持久化和 UI 更新）
   */
  _handleStreamChunkAppend(data) {
    const { messageId, content, reasoning_content } = data;
    
    // UI 更新 - 推理内容
    if (reasoning_content) {
      this._handleStreamReasoning({ messageId, reasoning_content });
    }
    
    // UI 更新 - 最终回复内容
    if (content) {
      this._updateMessageContent(messageId, content, true); // true 表示追加模式
    }
  }
  
  /**
   * 处理流式更新（实时文本更新）- 已废弃，改用 _handleStreamChunkAppend
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
        
      const reasoningHeader = document.createElement('div');
      reasoningHeader.className = 'reasoning-header';
        
      const titleSpan = document.createElement('span');
      titleSpan.textContent = '💭 思考过程';
        
      const toggleSpan = document.createElement('span');
      toggleSpan.className = 'reasoning-toggle';
      toggleSpan.textContent = '▼';
        
      reasoningHeader.appendChild(titleSpan);
      reasoningHeader.appendChild(toggleSpan);
        
      const reasoningContent = document.createElement('div');
      reasoningContent.className = 'reasoning-content';
        
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
          // 安静地追加内容，不改变用户的展开/折叠状态
          contentEl.textContent += reasoning_content;
          
          // 滚动到底部（仅在用户未手动滚动时）
          const messageList = document.getElementById('message-list');
          if (messageList) {
            // 检查是否在底部附近（50px 内）
            const isNearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 50;
            if (isNearBottom) {
              messageList.scrollTop = messageList.scrollHeight;
            }
          }
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
    
    // ChatController 已经通过 streamChunkMessage 持久化了所有内容
    // 这里不需要再次保存，只需要通知 UI 更新按钮状态
    // ChatController 已经通知了 ACTIVITY_STATE_CHANGED
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
   * 更新消息内容（流式追加）
   */
  _updateMessageContent(messageId, content, isAppend = false) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const contentDiv = messageElement.querySelector('.message-content');
    if (!contentDiv) return;

    // 获取并更新原始内容
    let fullContent = isAppend ? (contentDiv.dataset.fullContent || '') + content : content;
    contentDiv.dataset.fullContent = fullContent;

    // 渲染 Markdown
    if (window.marked) {
      contentDiv.innerHTML = window.marked.parse(fullContent);
    } else {
      contentDiv.textContent = fullContent;
    }

    // 自动滚动到底部
    const list = document.getElementById('message-list');
    if (list) {
      const isNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
      if (isNearBottom || !isAppend) {
        list.scrollTop = list.scrollHeight;
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

// 不导出到全局，仅在 app.js 中通过 new ChatEventHandler(serviceCenter) 创建实例
