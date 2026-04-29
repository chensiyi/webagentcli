// 流式消息处理器
// 按照 OpenAI Tool Calling 标准处理流式响应

class StreamMessageProcessor {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * 处理流式消息
   * @param {Object} responseMsg - 响应消息
   * @param {string} sessionId - 会话 ID
   * @param {Object} callbacks - 回调函数集合
   * @param {Function} callbacks.onChunk - 文本块回调
   * @param {Function} callbacks.onReasoning - 思考内容回调
   * @param {Function} callbacks.onToolCall - 工具调用回调
   * @param {Function} callbacks.onComplete - 完成回调
   * @param {Function} callbacks.onError - 错误回调
   */
  async processMessage(responseMsg, sessionId, callbacks) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return;
    }

    switch (responseMsg.type) {
      case 'chunk':
        this.handleChunk(responseMsg, session, callbacks.onChunk);
        break;

      case 'reasoning':
      case 'thinking':
        this.handleReasoning(responseMsg, session, callbacks.onReasoning);
        break;

      case 'tool_call':
        this.handleToolCall(responseMsg, session, callbacks.onToolCall);
        break;

      case 'complete':
        await this.handleComplete(responseMsg, session, callbacks.onComplete);
        break;

      case 'error':
        await this.handleError(responseMsg, session, callbacks.onError);
        break;
    }

    // 异步保存
    this.sessionManager.saveConversations();
  }

  /**
   * 处理文本块
   */
  handleChunk(msg, session, callback) {
    const currentMsg = this.getLastAssistantMessage(session);
    if (currentMsg) {
      currentMsg.content += msg.content;
      
      if (callback) {
        callback(currentMsg, session);
      }
    }
  }

  /**
   * 处理思考内容
   */
  handleReasoning(msg, session, callback) {
    const currentMsg = this.getLastAssistantMessage(session);
    if (currentMsg) {
      if (!currentMsg.additional_kwargs) {
        currentMsg.additional_kwargs = {};
      }
      currentMsg.additional_kwargs.reasoning_content = 
        (currentMsg.additional_kwargs.reasoning_content || '') + 
        (msg.reasoning_content || msg.content || '');
      
      if (callback) {
        callback(currentMsg, session);
      }
    }
  }

  /**
   * 处理工具调用
   * 按照 OpenAI 标准：tool_calls 是完整的数组，直接替换
   */
  handleToolCall(msg, session, callback) {
    const currentMsg = this.getLastAssistantMessage(session);
    if (currentMsg) {
      // 后端发送的是完整的 tool_calls，直接替换
      currentMsg.tool_calls = msg.tool_calls || [];
      
      console.log('[StreamMessageProcessor] Tool calls updated:', currentMsg.tool_calls);
      
      if (callback) {
        callback(currentMsg, session);
      }
    }
  }

  /**
   * 处理完成
   */
  async handleComplete(msg, session, callback) {
    const finalMsg = this.getLastAssistantMessage(session);
    
    console.log('[StreamMessageProcessor] ===== Stream completed =====');
    console.log('[StreamMessageProcessor] Role:', finalMsg?.role);
    console.log('[StreamMessageProcessor] Content:', finalMsg?.content?.substring(0, 100));
    console.log('[StreamMessageProcessor] Tool calls:', finalMsg?.tool_calls?.length || 0);
    console.log('[StreamMessageProcessor] =================================');

    // 清理空消息
    if (finalMsg && finalMsg.role === 'assistant') {
      const hasContent = finalMsg.content && (
        typeof finalMsg.content === 'string' ? finalMsg.content.trim() : 
        Array.isArray(finalMsg.content) ? finalMsg.content.length > 0 : 
        false
      );
      const hasReasoning = finalMsg.additional_kwargs?.reasoning_content;
      const hasToolCalls = finalMsg.tool_calls && finalMsg.tool_calls.length > 0;

      if (!hasContent && !hasReasoning && !hasToolCalls) {
        session.messages.pop();
        console.log('[StreamMessageProcessor] Removed empty assistant message');
        this.sessionManager.saveConversations();
        
        if (callback) {
          callback(null, session, true); // isEmpty = true
        }
        return;
      }
    }

    if (callback) {
      await callback(finalMsg, session, false); // isEmpty = false
    }
  }

  /**
   * 处理错误
   */
  async handleError(msg, session, callback) {
    console.error('[StreamMessageProcessor] Error:', msg.error);

    const errorMessage = {
      role: 'assistant',
      content: `❌ ${msg.error}`
    };

    this.sessionManager.addMessage(session.id, errorMessage);
    this.sessionManager.completeStreamRequest(session.id);

    if (callback) {
      await callback(errorMessage, session);
    }
  }

  /**
   * 获取最后一个 assistant 消息
   */
  getLastAssistantMessage(session) {
    const messages = session.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return null;
  }
}

// 导出到全局
window.StreamMessageProcessor = StreamMessageProcessor;
