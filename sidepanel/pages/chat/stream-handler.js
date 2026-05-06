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
    console.log('[StreamMessageHandler] handleToolCall - currentMsg:', currentMsg?.role, 'tool_calls:', msg.tool_calls?.length);
    
    if (currentMsg && currentMsg.role === 'assistant') {
      // 后端发送的是完整的 tool_calls，直接替换
      currentMsg.tool_calls = msg.tool_calls || [];
      console.log('[StreamMessageHandler] Set tool_calls on currentMsg:', currentMsg.tool_calls?.length);
    } else {
      console.warn('[StreamMessageHandler] No assistant message found for tool_call');
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

    const finalMsg = session.messages[session.messages.length - 1];
    
    // 统一的空消息判断
    if (this.isEmptyMessage(finalMsg)) {
      session.messages.pop();
      console.log('[StreamMessageHandler] Removed empty assistant message');
      this.sessionManager.saveConversations();
      
      if (callback) {
        callback(null, session, true); // isEmpty = true
      }
      return;
    }

    // 打印完整消息内容
    console.log('[StreamMessageHandler] ===== Stream completed =====');
    console.log('[StreamMessageHandler] Role:', finalMsg?.role);
    console.log('[StreamMessageHandler] Content:', finalMsg?.content?.substring(0, 100));
    console.log('[StreamMessageHandler] Reasoning:', !!finalMsg?.additional_kwargs?.reasoning_content);
    console.log('[StreamMessageHandler] Tool calls:', finalMsg?.tool_calls?.length || 0);
    console.log('[StreamMessageHandler] =================================');

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
    
    console.log('[StreamMessageHandler] isEmptyMessage check - hasContent:', hasContent, 'hasReasoning:', !!hasReasoning, 'hasToolCalls:', hasToolCalls);
    console.log('[StreamMessageHandler] isEmptyMessage check - tool_calls:', msg.tool_calls);
    
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

    // 优化错误信息，将技术性错误转换为用户友好的提示
    let userFriendlyError = msg.error;
    
    if (msg.error.includes('Cannot read properties of undefined')) {
      userFriendlyError = '服务器响应异常，请稍后重试';
    } else if (msg.error.includes('rate-limited') || msg.error.includes('rate limit')) {
      userFriendlyError = '请求过于频繁，请稍后再试';
    } else if (msg.error.includes('timeout')) {
      userFriendlyError = '请求超时，请检查网络连接';
    } else if (msg.error.includes('network') || msg.error.includes('fetch')) {
      userFriendlyError = '网络连接失败，请检查网络后重试';
    } else if (msg.error.includes('API key') || msg.error.includes('authentication')) {
      userFriendlyError = 'API 密钥无效，请检查设置';
    } else if (msg.error.length > 200) {
      // 过长的错误信息截断
      userFriendlyError = msg.error.substring(0, 200) + '...';
    }

    const errorMessage = {
      role: 'assistant',
      content: '❌ ' + userFriendlyError,
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
      if (this.isEmptyMessage(lastMsg)) {
        targetSession.messages.pop();
        console.log('[StreamMessageHandler] Removed empty message after stop');
        this.sessionManager.saveConversations();
      }
    }

    this.streamState.updateButton(false);
    console.log('[StreamMessageHandler] Stream interrupted by stop request');
  }
}

// 导出
window.StreamMessageHandler = StreamMessageHandler;
