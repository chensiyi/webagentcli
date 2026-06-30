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
  constructor(kernel) {
    this.kernel = kernel;
    this.ipc = kernel.getIPC();
    this.chatChannel = this.ipc?.getOrCreateChannel('chat') || this.ipc;
    this._listening = false;

    this._registerEventListeners();
  }

  destroy() {
    this._listening = false;
    if (this.chatChannel) {
      this.chatChannel.off(window.Events.CHAT.USER_APPLY_SEND);
      this.chatChannel.off(window.Events.CHAT.USER_APPLY_STOP);
      this.chatChannel.off(window.Events.CHAT.USER_APPLY_DELETE_MESSAGE);
      this.chatChannel.off(window.Events.CHAT.MESSAGE_UPDATED);
      this.chatChannel.off(window.Events.CHAT.STREAM_CHUNK_APPEND);
      this.chatChannel.off(window.Events.CHAT.STREAM_COMPLETE);
      this.chatChannel.off(window.Events.CHAT.STREAM_ERROR);
      this.chatChannel.off(window.Events.CHAT.STREAM_START);
      this.chatChannel.off(window.Events.TOOL.EXECUTING);
      this.chatChannel.off(window.Events.TOOL.COMPLETED);
      this.chatChannel.off(window.Events.TOOL.ALL_COMPLETED);
    }
  }

  _registerEventListeners() {
    this._listening = true;
    if (!this.chatChannel) return;

    this.chatChannel.on(window.Events.CHAT.USER_APPLY_SEND, (data) => this._handleApplySend(data));
    this.chatChannel.on(window.Events.CHAT.USER_APPLY_STOP, () => this._handleApplyStop());
    this.chatChannel.on(window.Events.CHAT.USER_APPLY_DELETE_MESSAGE, (data) => this._handleApplyDeleteMessage(data));

    this.chatChannel.on(window.Events.CHAT.MESSAGE_UPDATED, (data) => this._handleMessageUpdated(data));
    this.chatChannel.on(window.Events.CHAT.STREAM_CHUNK_APPEND, (data) => this._handleStreamChunkAppend(data));
    this.chatChannel.on(window.Events.CHAT.STREAM_START, () => console.log('[ChatEventHandler] Stream started'));
    this.chatChannel.on(window.Events.CHAT.STREAM_COMPLETE, (data) => console.log('[ChatEventHandler] Stream completed:', data.duration ? `${data.duration}ms` : ''));
    this.chatChannel.on(window.Events.CHAT.STREAM_ERROR, (data) => {
      console.error('[ChatEventHandler] Stream error:', data.error);
      window.Toast?.error(data.message || '发送消息失败');
    });

    this.chatChannel.on(window.Events.TOOL.EXECUTING, (data) => this._handleToolExecuting(data));
    this.chatChannel.on(window.Events.TOOL.COMPLETED, (data) => this._handleToolCompleted(data));
    this.chatChannel.on(window.Events.TOOL.ALL_COMPLETED, () => console.log('[ChatEventHandler] All tools completed'));

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        this._scrollToUserMessage(e.key === 'ArrowUp' ? -1 : 1);
      }
    });
  }

  _emit(event, data) {
    if (this.chatChannel) this.chatChannel.emit(event, data);
  }

  _handleApplySend(data) {
    const { content, reasoningEffort } = data;
    if (!this.kernel) { console.error('[ChatEventHandler] Kernel not available'); return; }
    if (!content?.trim()) { console.warn('[ChatEventHandler] Empty content blocked'); return; }
    const chatProgram = window.chatProgram || this.kernel?.chatProgram;
    if (chatProgram && typeof chatProgram.sendMessage === 'function') {
      chatProgram.sendMessage({ content, reasoningEffort });
    } else {
      this.chatChannel?.emit('chat:cmd:send', { content, reasoningEffort });
    }
  }

  _handleApplyStop() {
    const chatProgram = window.chatProgram || this.kernel?.chatProgram;
    if (chatProgram && typeof chatProgram.cancel === 'function') {
      chatProgram.cancel();
    } else {
      this.chatChannel?.emit('chat:cmd:stop');
    }
  }

  _handleApplyDeleteMessage(data) {
    if (!data?.messageId) { console.warn('[ChatEventHandler] Missing messageId'); return; }
    const chatProgram = window.chatProgram || this.kernel?.chatProgram;
    if (chatProgram && typeof chatProgram.deleteMessage === 'function') {
      chatProgram.deleteMessage(data.messageId);
    } else {
      this.chatChannel?.emit('chat:cmd:deleteMessage', { messageId: data.messageId });
    }
  }

  _handleMessageUpdated(data) { const { message } = data; if (!message) return; this._updateMessageContent(message.id, window.extractText ? window.extractText(message.content) : message.content); if (message.reasoning_content) this._updateMessageReasoning(message.id, window.extractText ? window.extractText(message.reasoning_content) : message.reasoning_content); }
  _handleStreamChunkAppend(data) { const { messageId, content, reasoning_content } = data; if (reasoning_content) this._handleStreamReasoning({ messageId, reasoning_content }); if (content) this._updateMessageContent(messageId, content, true); }

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
    const header = document.createElement('div'); header.className = 'reasoning-header';
    const title = document.createElement('span'); title.textContent = '💭 思考过程';
    const toggle = document.createElement('span'); toggle.className = 'reasoning-toggle'; toggle.textContent = '▼';
    header.appendChild(title); header.appendChild(toggle);
    const content = document.createElement('div'); content.className = 'reasoning-content';
    container.appendChild(header); container.appendChild(content);
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
      if (contentEl) { contentEl.textContent = content; const list = document.getElementById('message-list'); if (list) list.scrollTop = list.scrollHeight; }
    }
  }

  _handleToolExecuting(data) {
    const { toolCallId } = data;
    const card = document.querySelector(`.tool-card[data-tool-call-id="${toolCallId}"]`);
    if (!card) return;
    const header = card.querySelector('.tool-card-header');
    if (!header) return;
    let spinner = header.querySelector('.tool-spinner');
    if (!spinner) { spinner = document.createElement('span'); spinner.className = 'tool-spinner'; header.appendChild(spinner); }
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
      const timeSpan = document.createElement('span'); timeSpan.className = 'tool-duration'; timeSpan.textContent = `${duration}ms`;
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
    if (window.marked) { contentDiv.innerHTML = window.marked.parse(fullContent); } else { contentDiv.textContent = fullContent; }
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
      if (rect.top >= targetTop - 50) { currentIndex = i; break; }
    }
    let nextIndex;
    if (direction === -1) { nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1; }
    else { nextIndex = currentIndex === -1 ? 0 : (currentIndex >= userMessages.length - 1 ? userMessages.length - 1 : currentIndex + 1); }
    const targetElement = userMessages[nextIndex];
    if (targetElement) { targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
}

// 不导出到全局，仅在 app.js 中通过 new ChatEventHandler(kernel) 创建实例
