// 流式消息处理器
// 负责处理来自 background 的流式响应

class StreamMessageHandler {
  constructor(sessionManager, streamState) {
    this.sessionManager = sessionManager;
    this.streamState = streamState;
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
   * 处理文本块
   */
  handleChunk(msg, session, callback) {
    const currentMsg = session.messages[session.messages.length - 1];
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
    const currentMsg = session.messages[session.messages.length - 1];
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
    const currentMsg = session.messages[session.messages.length - 1];
    if (currentMsg && currentMsg.role === 'assistant') {
      if (!currentMsg.tool_calls) {
        currentMsg.tool_calls = [];
      }
      currentMsg.tool_calls.push(...(msg.tool_calls || []));
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

    // 清理空消息
    const finalMsg = session.messages[session.messages.length - 1];
    if (finalMsg && finalMsg.role === 'assistant') {
      const hasContent = finalMsg.content && finalMsg.content.trim();
      const hasReasoning = finalMsg.additional_kwargs?.reasoning_content;
      const hasToolCalls = finalMsg.tool_calls && finalMsg.tool_calls.length > 0;

      if (!hasContent && !hasReasoning && !hasToolCalls) {
        session.messages.pop();
        console.log('[StreamMessageHandler] Removed empty assistant message');
        this.sessionManager.saveConversations();
        
        if (callback) {
          callback(null, session, true); // isEmpty = true
        }
        return;
      }
    }

    // 打印完整消息内容
    console.log('[StreamMessageHandler] ===== Stream completed =====');
    console.log('[StreamMessageHandler] Role:', finalMsg?.role);
    console.log('[StreamMessageHandler] Content:', finalMsg?.content);
    console.log('[StreamMessageHandler] Reasoning:', finalMsg?.additional_kwargs?.reasoning_content);
    console.log('[StreamMessageHandler] Tool calls:', finalMsg?.tool_calls);
    console.log('[StreamMessageHandler] =================================');

    if (callback) {
      await callback(finalMsg, session, false); // isEmpty = false
    }
  }

  /**
   * 处理错误
   */
  async handleError(msg, sessionId, session, port, callback) {
    port.disconnect();
    this.streamState.currentPort = null;
    this.sessionManager.completeStreamRequest(sessionId);
    this.streamState.updateButton(false);

    const errorMessage = {
      role: 'assistant',
      content: '❌ 请求失败: ' + msg.error,
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
    if (targetSession) {
      const lastMsg = targetSession.messages[targetSession.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        const hasContent = lastMsg.content && lastMsg.content.trim();
        const hasReasoning = lastMsg.additional_kwargs?.reasoning_content;
        const hasToolCalls = lastMsg.tool_calls && lastMsg.tool_calls.length > 0;

        if (!hasContent && !hasReasoning && !hasToolCalls) {
          targetSession.messages.pop();
          console.log('[StreamMessageHandler] Removed empty message after stop');
          this.sessionManager.saveConversations();
        }
      }
    }

    this.streamState.updateButton(false);
    console.log('[StreamMessageHandler] Stream interrupted by stop request');
  }
}

// 导出
window.StreamMessageHandler = StreamMessageHandler;
