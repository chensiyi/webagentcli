/**
 * 聊天控制器
 * 负责聊天的核心业务逻辑：发送消息、接收响应、流式处理
 * 通过事件总线与 UI 层通信
 */

class ChatController {
  constructor() {
    this.sessionController = window.SessionController;
    this.eventBus = window.EventBus;
    this.currentService = null;
    this.isStreaming = false;
  }
  
  /**
   * 设置聊天服务
   * @param {Object} service - OpenAIService 或 LMStudioService 实例
   */
  setService(service) {
    this.currentService = service;
    console.log('[ChatController] Service set:', service.name);
  }
  
  /**
   * 发送消息
   * @param {string} content - 消息内容
   * @returns {Promise<Object>} 结果
   */
  async sendMessage(content) {
    if (!this.currentService) {
      throw new Error('No chat service configured');
    }
    
    if (this.isStreaming) {
      throw new Error('Already streaming');
    }
    
    try {
      // 1. 创建用户消息
      const userMsg = new window.Message({
        role: 'user',
        content: content
      });
      
      // 2. 添加到会话
      this.sessionController.addMessage(userMsg);
      
      // 3. 抛出消息：用户消息已添加（传递引用）
      this.eventBus.emit(Events.CHAT.MESSAGE_ADDED, { 
        message: userMsg,
        type: 'user' 
      });
      
      // 4. 创建空的助手消息（用于流式更新）
      const assistantMsg = new window.Message({
        role: 'assistant',
        content: ''
      });
      this.sessionController.addMessage(assistantMsg);
      
      // 5. 抛出消息：助手消息已创建（传递引用）
      this.eventBus.emit(Events.CHAT.MESSAGE_ADDED, { 
        message: assistantMsg,
        type: 'assistant' 
      });
      
      // 6. 准备请求参数
      const session = this.sessionController.getCurrentSession();
      const params = {
        messages: session.messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: true
      };
      
      // 7. 开始流式请求
      this.isStreaming = true;
      this.eventBus.emit(Events.CHAT.STREAM_START, { 
        messageId: assistantMsg.id 
      });
      
      await this.currentService.chatStream(
        params,
        // onChunk 回调
        (chunk) => {
          assistantMsg.content += chunk.content || '';
          this.sessionController.saveSessions();
          
          // 抛出消息：流式更新
          this.eventBus.emit(Events.CHAT.STREAM_UPDATE, { 
            messageId: assistantMsg.id,
            content: chunk.content || '',
            reasoning_content: chunk.reasoning_content || ''
          });
        },
        // onComplete 回调
        () => {
          this.isStreaming = false;
          // 流式完成时传递完整消息引用
          this.eventBus.emit(Events.CHAT.STREAM_COMPLETE, { 
            messageId: assistantMsg.id,
            message: assistantMsg
          });
        }
      );
      
      return { success: true, message: assistantMsg };
    } catch (error) {
      this.isStreaming = false;
      this.eventBus.emit(Events.CHAT.STREAM_ERROR, { 
        error: error.message,
        stack: error.stack
      });
      console.error('[ChatController] Send message failed:', error);
      throw error;
    }
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    if (this.currentService && this.isStreaming) {
      this.currentService.cancel();
      this.isStreaming = false;
      this.eventBus.emit(Events.CHAT.STREAM_STOP, {});
      console.log('[ChatController] Generation stopped');
    }
  }
  
  /**
   * 清空当前会话
   */
  clearSession() {
    this.sessionController.clearCurrentSession();
    this.eventBus.emit(Events.CHAT.SESSION_CLEARED, {});
    console.log('[ChatController] Session cleared');
  }
}

// 导出单例
window.ChatController = new ChatController();
