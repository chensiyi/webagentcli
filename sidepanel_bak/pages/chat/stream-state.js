// 聊天流式状态管理
// 负责管理流式请求的状态、停止控制等

class ChatStreamState {
  constructor() {
    this.isStreaming = false;
    this.currentPort = null;
    this.isStopRequested = false;
    this.sendBtn = null;
  }

  /**
   * 绑定发送按钮
   */
  bindSendButton(btn) {
    this.sendBtn = btn;
    window._chatSendBtn = btn;
  }

  /**
   * 更新发送按钮状态
   */
  updateButton(streaming) {
    this.isStreaming = streaming;
    const btn = window._chatSendBtn || this.sendBtn;
    
    if (!btn) {
      console.warn('[ChatStreamState] sendBtn not found');
      return;
    }

    if (streaming) {
      btn.textContent = '停止';
      btn.className = 'btn btn-danger';
    } else {
      btn.textContent = '发送';
      btn.className = 'btn btn-primary';
    }
  }

  /**
   * 开始流式请求
   */
  startStreaming(port, sessionId, sessionManager) {
    this.isStopRequested = false;
    this.currentPort = port;
    this.updateButton(true);
    sessionManager.startStreamRequest(sessionId, port);
  }

  /**
   * 停止流式请求
   */
  stopStreaming(sessionId, sessionManager, renderCallback) {
    this.isStopRequested = true;

    if (this.currentPort) {
      this.currentPort.disconnect();
      this.currentPort = null;
    }

    // 通知 SessionManager 停止
    if (sessionId) {
      sessionManager.completeStreamRequest(sessionId);

      // 清理空消息
      const currentSession = sessionManager.getCurrentSession();
      if (currentSession) {
        const lastMsg = currentSession.messages[currentSession.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          // 检查是否有内容（支持字符串和数组）
          const hasContent = lastMsg.content && (
            typeof lastMsg.content === 'string' ? lastMsg.content.trim() : 
            Array.isArray(lastMsg.content) ? lastMsg.content.length > 0 : 
            false
          );
          const hasReasoning = lastMsg.additional_kwargs?.reasoning_content;
          const hasToolCalls = lastMsg.tool_calls && lastMsg.tool_calls.length > 0;

          if (!hasContent && !hasReasoning && !hasToolCalls) {
            currentSession.messages.pop();
            console.log('[ChatStreamState] Removed empty assistant message after stop');
            sessionManager.saveConversations();
          }
        }
      }
    }

    this.updateButton(false);
    console.log('[ChatStreamState] Streaming stopped by user');

    // 重新渲染
    if (renderCallback) {
      renderCallback();
    }
  }

  /**
   * 检查是否请求停止
   */
  shouldStop() {
    return this.isStopRequested;
  }

  /**
   * 重置状态
   */
  reset() {
    this.isStreaming = false;
    this.currentPort = null;
    this.isStopRequested = false;
  }
}

// 导出单例
window.ChatStreamState = new ChatStreamState();
