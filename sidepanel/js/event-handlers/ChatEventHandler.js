/**
 * 聊天页面事件处理器
 * 负责监听 ChatProgram 发射的事件，更新 UI。
 * USER_MESSAGE_SENT 等业务事件已由 ChatProgram 自行订阅。
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
   * 注意：USER_MESSAGE_SENT 已由 ChatProgram 自行订阅，此处不再监听
   */
  _registerEventListeners() {
    // 监听消息更新事件（错误更新等）
    this.eventBus.on(window.Events.CHAT.MESSAGE_UPDATED, (data) => {
      this._handleMessageUpdated(data);
    });
    
    // 监听流式分片追加事件（UI 更新）
    this.eventBus.on(window.Events.CHAT.STREAM_CHUNK_APPEND, (data) => {
      this._handleStreamChunkAppend(data);
    });
    
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

    // 监听工具执行进度
    this.eventBus.on(window.Events.TOOL.EXECUTING, (data) => {
      this._handleToolExecuting(data);
    });
    this.eventBus.on(window.Events.TOOL.COMPLETED, (data) => {
      this._handleToolCompleted(data);
    });
    this.eventBus.on(window.Events.TOOL.ALL_COMPLETED, (data) => {
      this._handleToolAllCompleted(data);
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
   * 处理流式请求开始
   */
  _handleStreamStart(data) {
    console.log('[ChatEventHandler] Stream started');
  }
  
  /**
   * 处理流式分片追加
   */
  _handleStreamChunkAppend(data) {
    const { messageId, content, reasoning_content } = data;
    
    if (reasoning_content) {
      this._handleStreamReasoning({ messageId, reasoning_content });
    }
    
    if (content) {
      this._updateMessageContent(messageId, content, true);
    }
  }
  
  /**
   * 处理流式更新（废弃）
   */
  _handleStreamUpdate(data) {
    const { messageId, content } = data;
    this._updateMessageContent(messageId, content, true);
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
    if (!messageElement) return;
  
    const container = this._getOrCreateReasoningContainer(messageElement);
    if (container) {
      const contentEl = container.querySelector('.reasoning-content');
      if (contentEl) {
        if (container.style.display === 'none') container.style.display = 'block';
        contentEl.textContent = content;
        const messageList = document.getElementById('message-list');
        if (messageList) messageList.scrollTop = messageList.scrollHeight;
      }
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
        if (container.style.display === 'none') container.style.display = 'block';
        
        const contentEl = container.querySelector('.reasoning-content');
        if (contentEl) {
          contentEl.textContent += reasoning_content;
          
          const messageList = document.getElementById('message-list');
          if (messageList) {
            const isNearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 50;
            if (isNearBottom) messageList.scrollTop = messageList.scrollHeight;
          }
        }
      }
    }
  }
  
  /**
   * 处理流式请求完成
   */
  _handleStreamComplete(data) {
    console.log('[ChatEventHandler] Stream completed:', data.duration ? `${data.duration}ms` : '');
  }
  
  /**
   * 处理流式错误
   */
  _handleStreamError(data) {
    console.error('[ChatEventHandler] Stream error:', data.error);
    window.Toast?.error(data.message || '发送消息失败');
  }
  
  /**
   * 处理工具开始执行
   */
  _handleToolExecuting(data) {
    const { toolCallId, toolName } = data;
    const card = document.querySelector(`.tool-card[data-tool-call-id="${toolCallId}"]`);
    if (!card) return;

    const header = card.querySelector('.tool-card-header');
    if (!header) return;

    let spinner = header.querySelector('.tool-spinner');
    if (!spinner) {
      spinner = document.createElement('span');
      spinner.className = 'tool-spinner';
      header.appendChild(spinner);
    }

    const nameEl = header.querySelector('.tool-card-name');
    if (nameEl) nameEl.style.color = 'var(--color-text-secondary, #999)';
  }

  /**
   * 处理工具执行完成
   */
  _handleToolCompleted(data) {
    const { toolCallId, toolName, status, duration } = data;
    const card = document.querySelector(`.tool-card[data-tool-call-id="${toolCallId}"]`);
    if (!card) return;

    const header = card.querySelector('.tool-card-header');
    const nameEl = header?.querySelector('.tool-card-name');
    if (nameEl) nameEl.style.color = '';

    const spinner = header?.querySelector('.tool-spinner');
    if (spinner) spinner.remove();

    const statusIcon = document.createElement('span');
    statusIcon.className = `tool-status tool-status-${status}`;
    statusIcon.textContent = status === 'success' ? '✅' : status === 'failed' ? '❌' : '⚠️';
    header?.appendChild(statusIcon);

    if (duration !== undefined) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'tool-duration';
      timeSpan.textContent = `${duration}ms`;
      header?.appendChild(timeSpan);
    }
  }

  /**
   * 处理本轮所有工具执行完毕
   */
  _handleToolAllCompleted(data) {
    console.log('[ChatEventHandler] All tools completed, waiting for LLM response');
  }
  
  /**
   * 更新消息内容（流式追加）
   */
  _updateMessageContent(messageId, content, isAppend = false) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const contentDiv = messageElement.querySelector('.message-content');
    if (!contentDiv) return;

    let fullContent = isAppend ? (contentDiv.dataset.fullContent || '') + content : content;
    contentDiv.dataset.fullContent = fullContent;

    if (window.marked) {
      contentDiv.innerHTML = window.marked.parse(fullContent);
    } else {
      contentDiv.textContent = fullContent;
    }

    const list = document.getElementById('message-list');
    if (list) {
      const isNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
      if (isNearBottom || !isAppend) list.scrollTop = list.scrollHeight;
    }
  }

  /**
   * 滚动到上/下一条用户消息
   */
  _scrollToUserMessage(direction) {
    const messageList = document.getElementById('message-list');
    if (!messageList) return;

    const userMessages = Array.from(messageList.querySelectorAll('.message-bubble.message-user'));
    if (userMessages.length === 0) return;

    const listRect = messageList.getBoundingClientRect();
    const targetTop = listRect.top + 10;

    let currentIndex = -1;
    for (let i = 0; i < userMessages.length; i++) {
      const rect = userMessages[i].getBoundingClientRect();
      if (rect.top >= targetTop - 50) {
        currentIndex = i;
        break;
      }
    }

    let nextIndex;
    if (direction === -1) {
      nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    } else {
      nextIndex = currentIndex === -1 ? 0 : (currentIndex >= userMessages.length - 1 ? userMessages.length - 1 : currentIndex + 1);
    }

    const targetElement = userMessages[nextIndex];
    if (targetElement) {
      const scrollOffset = targetElement.offsetTop - messageList.offsetTop;
      messageList.scrollTo({ top: scrollOffset, behavior: 'smooth' });
    }
  }
}

// 不导出到全局，仅在 app.js 中通过 new ChatEventHandler(serviceCenter) 创建实例