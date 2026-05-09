// 流式消息处理器
// 负责处理来自 background 的流式响应

class StreamMessageHandler {
  constructor(sessionManager, streamState) {
    this.sessionManager = sessionManager;
    this.streamState = streamState;
    // 记录当前正在处理的消息 ID，避免异步场景下索引错位
    this.currentMessageId = null;
  }

  /**
   * 处理流式消息
   */
  async handleMessage(msg, sessionId, port, callbacks = {}) {
    const {
      onChunk,
      onReasoning,
      onToolCall,
      onComplete,
      onError
    } = callbacks;

    // 检查是否请求停止
    if (this.streamState.shouldStop()) {
      this.handleStop(sessionId, port);
      return;
    }

    // 检查会话是否存在
    const targetSession = this.sessionManager.getSession(sessionId);
    if (!targetSession) {
      port.disconnect();
      return;
    }

    // 如果是第一条消息，记录当前消息 ID
    // 在流式响应开始时，最后一条消息就是我们要更新的占位符
    if (!this.currentMessageId) {
      const lastMsg = targetSession.messages[targetSession.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        this.currentMessageId = lastMsg.id;
        console.log('[StreamMessageHandler] Tracking message:', this.currentMessageId);
      }
    }

    switch (msg.type) {
      case 'chunk':
        this.handleChunk(msg, targetSession, onChunk);
        break;
      
      case 'reasoning':
      case 'thinking':
        this.handleReasoning(msg, targetSession, onReasoning);
        break;
      
      case 'tool_call':
        this.handleToolCall(msg, targetSession, onToolCall);
        break;
      
      case 'complete':
        await this.handleComplete(msg, sessionId, targetSession, port, onComplete);
        break;
      
      case 'error':
        await this.handleError(msg, sessionId, targetSession, port, onError);
        break;
    }
  }

  /**
   * 通过 ID 查找消息
   */
  findMessageById(session, messageId) {
    if (!messageId) return null;
    return session.messages.find(msg => msg.id === messageId) || null;
  }

  /**
   * 处理文本块
   */
  handleChunk(msg, session, callback) {
    const currentMsg = this.currentMessageId 
      ? this.findMessageById(session, this.currentMessageId)
      : session.messages[session.messages.length - 1];
    
    if (currentMsg && currentMsg.role === 'assistant') {
      currentMsg.content += msg.content;
    }

    if (callback) {
      callback(currentMsg, session);
    }

    // 异步保存
    this.sessionManager.saveConversations();
  }

  /**
   * 处理思考过程
   */
  handleReasoning(msg, session, callback) {
    const currentMsg = this.currentMessageId 
      ? this.findMessageById(session, this.currentMessageId)
      : session.messages[session.messages.length - 1];
    
    if (currentMsg && currentMsg.role === 'assistant') {
      if (!currentMsg.additional_kwargs) {
        currentMsg.additional_kwargs = {};
      }
      currentMsg.additional_kwargs.reasoning_content = 
        (currentMsg.additional_kwargs.reasoning_content || '') + 
        (msg.reasoning_content || msg.content || '');
    }

    if (callback) {
      callback(currentMsg, session);
    }

    this.sessionManager.saveConversations();
  }

  /**
   * 处理工具调用
   */
  handleToolCall(msg, session, callback) {
    // 优先通过 ID 查找，如果失败则从后往前查找
    let currentMsg = this.currentMessageId 
      ? this.findMessageById(session, this.currentMessageId)
      : null;
    
    if (!currentMsg) {
      for (let i = session.messages.length - 1; i >= 0; i--) {
        if (session.messages[i].role === 'assistant') {
          currentMsg = session.messages[i];
          break;
        }
      }
    }
    
    if (currentMsg && currentMsg.role === 'assistant') {
      // 后端发送的是完整的 tool_calls，直接替换
      currentMsg.tool_calls = msg.tool_calls || [];
    }

    if (callback) {
      callback(currentMsg, session);
    }

    this.sessionManager.saveConversations();
  }

  /**
   * 处理完成
   */
  async handleComplete(msg, sessionId, session, port, callback) {
    port.disconnect();
    this.streamState.currentPort = null;
    this.sessionManager.completeStreamRequest(sessionId);
    this.streamState.updateButton(false);

    // 通过 ID 查找最终消息
    const finalMsg = this.currentMessageId 
      ? this.findMessageById(session, this.currentMessageId)
      : session.messages[session.messages.length - 1];
    
    console.log('[StreamMessageHandler] Stream completed - messageId:', this.currentMessageId, 'tool_calls:', finalMsg?.tool_calls?.length || 0);
    
    // 统一的空消息判断
    if (this.isEmptyMessage(finalMsg)) {
      // 通过 ID 查找索引并删除
      if (this.currentMessageId) {
        const idx = session.messages.findIndex(m => m.id === this.currentMessageId);
        if (idx !== -1) {
          session.messages.splice(idx, 1);
        }
      } else {
        session.messages.pop();
      }
      this.sessionManager.saveConversations();
      
      // 重置消息 ID 追踪
      this.currentMessageId = null;
      
      if (callback) {
        callback(null, session, true); // isEmpty = true
      }
      return;
    }

    // 重置消息 ID 追踪
    this.currentMessageId = null;

    if (callback) {
      await callback(finalMsg, session, false); // isEmpty = false
    }
  }

  /**
   * 检查消息是否为空
   */
  isEmptyMessage(msg) {
    if (!msg || msg.role !== 'assistant') return true;
    
    const hasContent = msg.content && (
      typeof msg.content === 'string' ? msg.content.trim() : 
      Array.isArray(msg.content) ? msg.content.length > 0 : 
      false
    );
    const hasReasoning = msg.additional_kwargs?.reasoning_content;
    const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
    
    return !hasContent && !hasReasoning && !hasToolCalls;
  }

  /**
   * 处理错误
   */
  async handleError(msg, sessionId, session, port, callback) {
    port.disconnect();
    this.streamState.currentPort = null;
    this.sessionManager.completeStreamRequest(sessionId);
    this.streamState.updateButton(false);

    // 清理空占位符消息（防止显示多余的"思考中..."气泡）
    if (this.currentMessageId) {
      const placeholderMsg = this.findMessageById(session, this.currentMessageId);
      if (placeholderMsg && this.isEmptyMessage(placeholderMsg)) {
        const idx = session.messages.findIndex(m => m.id === this.currentMessageId);
        if (idx !== -1) {
          session.messages.splice(idx, 1);
          console.log('[StreamMessageHandler] Removed empty placeholder before error');
        }
      }
    }

    // 重置消息 ID 追踪
    this.currentMessageId = null;

    // 构建详细的错误信息
    const errorDetails = [
      `❌ API 错误`,
      '',
      `错误信息: ${msg.error}`,
    ];

    // 如果有额外的错误详情，添加到消息中
    if (msg.code) {
      errorDetails.push(`错误码: ${msg.code}`);
    }
    if (msg.status) {
      errorDetails.push(`HTTP 状态: ${msg.status}`);
    }
    if (msg.stack) {
      errorDetails.push('', '堆栈跟踪:', msg.stack);
    }

    const errorMessage = {
      role: 'assistant',
      content: errorDetails.join('\n'),
      isError: true
    };

    this.sessionManager.addMessage(sessionId, errorMessage);
    await this.sessionManager.saveConversations();

    if (callback) {
      await callback(errorMessage, session);
    }
  }

  /**
   * 处理停止
   */
  handleStop(sessionId, port) {
    port.disconnect();
    this.streamState.currentPort = null;
    this.sessionManager.completeStreamRequest(sessionId);

    // 清理空消息
    const targetSession = this.sessionManager.getSession(sessionId);
    if (targetSession && this.currentMessageId) {
      const msg = this.findMessageById(targetSession, this.currentMessageId);
      if (msg && this.isEmptyMessage(msg)) {
        const idx = targetSession.messages.findIndex(m => m.id === this.currentMessageId);
        if (idx !== -1) {
          targetSession.messages.splice(idx, 1);
          console.log('[StreamMessageHandler] Removed empty message after stop');
          this.sessionManager.saveConversations();
        }
      }
    }

    // 重置消息 ID 追踪
    this.currentMessageId = null;
    this.streamState.updateButton(false);
    console.log('[StreamMessageHandler] Stream interrupted by stop request');
  }
}

// 导出
window.StreamMessageHandler = StreamMessageHandler;
