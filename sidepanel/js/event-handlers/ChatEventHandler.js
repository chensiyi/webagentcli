/**
 * ChatEventHandler - 聊天事件处理（应用层）
 * 
 * 职责：
 * 1. 监听 UI 层发出的 USER_APPLY_* 消息
 * 2. 鉴权、参数校验
 * 3. 转译为 ChatProgram.CMD.* 指令转发
 * 
 * 事件流：UI → ChatEventHandler（转译）→ ChatProgram.CMD.*（执行）
 */
class ChatEventHandler {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();

    this._registerEventListeners();
  }

  /**
   * 注册事件监听
   */
  _registerEventListeners() {
    // ★ 用户请求 → ChatProgram 指令 转译层
    this.eventBus.on(window.Events.CHAT.USER_APPLY_SEND, (data) => {
      this._handleApplySend(data);
    });
    this.eventBus.on(window.Events.CHAT.USER_APPLY_STOP, () => {
      this._handleApplyStop();
    });
    this.eventBus.on(window.Events.CHAT.USER_APPLY_DELETE_MESSAGE, (data) => {
      this._handleApplyDeleteMessage(data);
    });

    // ★ ChatProgram 输出事件 → UI 更新
    this.eventBus.on(window.Events.CHAT.MESSAGE_UPDATED, (data) => {
      this._handleMessageUpdated(data);
    });
    this.eventBus.on(window.Events.CHAT.STREAM_CHUNK_APPEND, (data) => {
      this._handleStreamChunkAppend(data);
    });
    this.eventBus.on(window.Events.CHAT.STREAM_START, () => {
      console.log('[ChatEventHandler] Stream started');
    });
    this.eventBus.on(window.Events.CHAT.STREAM_COMPLETE, (data) => {
      console.log('[ChatEventHandler] Stream completed:', data.duration ? `${data.duration}ms` : '');
    });
    this.eventBus.on(window.Events.CHAT.STREAM_ERROR, (data) => {
      console.error('[ChatEventHandler] Stream error:', data.error);
      window.Toast?.error(data.message || '发送消息失败');
    });

    // 工具执行进度
    this.eventBus.on(window.Events.TOOL.EXECUTING, (data) => {
      this._handleToolExecuting(data);
    });
    this.eventBus.on(window.Events.TOOL.COMPLETED, (data) => {
      this._handleToolCompleted(data);
    });
    this.eventBus.on(window.Events.TOOL.ALL_COMPLETED, (data) => {
      console.log('[ChatEventHandler] All tools completed');
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        this._scrollToUserMessage(e.key === 'ArrowUp' ? -1 : 1);
      }
    });
  }

  // ==================== 转译层：USER_APPLY → ChatProgram.CMD ====================

  /**
   * USER_APPLY_SEND → ChatProgram.CMD.SEND
   */
  _handleApplySend(data) {
    const { content, reasoningEffort } = data;
    
    // 鉴权：检查 serviceCenter 是否可用
    if (!this.serviceCenter) {
      console.error('[ChatEventHandler] ServiceCenter not available');
      return;
    }

    // 参数校验
    if (!content?.trim()) {
      console.warn('[ChatEventHandler] Empty content blocked');
      return;
    }

    // 转译 → ChatProgram 指令
    this.eventBus.emit(window.webagent.programs.ChatProgram.CMD.SEND, {
      content,
      reasoningEffort,
    });
  }

  /**
   * USER_APPLY_STOP → ChatProgram.CMD.STOP
   */
  _handleApplyStop() {
    this.eventBus.emit(window.webagent.programs.ChatProgram.CMD.STOP);
  }

  /**
   * USER_APPLY_DELETE_MESSAGE → ChatProgram.CMD.DELETE_MESSAGE
   */
  _handleApplyDeleteMessage(data) {
    if (!data?.messageId) {
      console.warn('[ChatEventHandler] Missing messageId');
      return;
    }

    this.eventBus.emit(window.webagent.programs.ChatProgram.CMD.DELETE_MESSAGE, {
      messageId: data.messageId,
    });
  }

  // ==================== UI 更新：ChatProgram 输出事件 → DOM ====================

  _handleMessageUpdated(data) {
    const { message } = data;
    if (!message) return;
    this._updateMessageContent(message.id, message.content);
    if (message.reasoning_content) {
      this._updateMessageReasoning(message.id, message.reasoning_content);
    }
  }

  _handleStreamChunkAppend(data) {
    const { messageId, content, reasoning_content } = data;
    if (reasoning_content) {
      this._handleStreamReasoning({ messageId, reasoning_content });
    }
    if (content) {
      this._updateMessageContent(messageId, content, true);
    }
  }

  _handleStreamReasoning(data) {
    const { messageId, reasoning_content } = data;
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const container = this._getOrCreateReasoningContainer(messageElement);
    if (!container) return;
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

  _getOrCreateReasoningContainer(messageElement) {
    let container = messageElement.querySelector('.message-reasoning');
    if (container) return container;

    const messageBody = messageElement.querySelector('.message-body');
    if (!messageBody) return null;

    container = document.createElement('div');
    container.className = 'message-reasoning';

    const header = document.createElement('div');
    header.className = 'reasoning-header';

    const title = document.createElement('span');
    title.textContent = '💭 思考过程';

    const toggle = document.createElement('span');
    toggle.className = 'reasoning-toggle';
    toggle.textContent = '▼';

    header.appendChild(title);
    header.appendChild(toggle);

    const content = document.createElement('div');
    content.className = 'reasoning-content';

    container.appendChild(header);
    container.appendChild(content);

    messageBody.insertBefore(container, messageBody.firstChild);

    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      toggle.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    });

    return container;
  }

  _updateMessageReasoning(messageId, content) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const container = this._getOrCreateReasoningContainer(messageElement);
    if (container) {
      if (container.style.display === 'none') container.style.display = 'block';
      const contentEl = container.querySelector('.reasoning-content');
      if (contentEl) {
        contentEl.textContent = content;
        const messageList = document.getElementById('message-list');
        if (messageList) messageList.scrollTop = messageList.scrollHeight;
      }
    }
  }

  _handleToolExecuting(data) {
    const { toolCallId } = data;
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

  _handleToolCompleted(data) {
    const { toolCallId, status, duration } = data;
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