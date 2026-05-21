/**
 * ChatController - 聊天控制器（简化版）
 * 
 * 职责：
 * 1. 管理最小运行时状态（当前请求、流式状态）
 * 2. 协调 SessionManager 和 ProviderService
 * 3. 通过 EventBus 与 UI 层通信
 * 
 * 设计原则：
 * - 单一实例，由 ServiceCenter 管理
 * - 从 SessionManager 获取最新会话和配置
 * - 不持有 Session 引用，避免状态不一致
 */

class ChatController {
  /**
   * @param {ServiceCenter} serviceCenter - 服务中心
   */
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    
    // 运行时状态（不持久化）
    this.currentRequest = null;
    
    console.log('[ChatController] Initialized');
  }
  
  /**
   * 发送消息
   * @param {Object} params 
   * @param {string} params.content - 消息内容
   * @param {string} [params.sessionId] - 会话 ID
   * @param {IProviderAPIService} [params.chatService] - 可选：直接传递 Service 实例
   * @param {Model} [params.model] - 可选：直接传递 Model 对象
   */
  async sendMessage({ content, sessionId = null, chatService = null, model = null }) {
    if (!content || !content.trim()) {
      throw new Error('Message content is required');
    }
    
    // 检查队列状态
    if (this.currentRequest) {
      throw new Error('A message is already being generated');
    }
    
    const sessionManager = this.serviceCenter.getSessionManager();
    
    // 如果没有传递 chatService，则通过 ServiceCenter 获取
    const service = chatService || this.serviceCenter.getCurrentProviderService();
    
    // 获取或创建当前会话（懒加载）
    let session = sessionId ? sessionManager.getSession(sessionId) : sessionManager.getCurrentSession();
    if (!session) {
      console.log('[ChatController] No active session, creating new one...');
      session = sessionManager.createSession({ title: '新对话' });
    }

    console.log('[ChatController] Sending message via service:', service.constructor.name);
    
    // 使用 model 对象获取特定的配置（如果提供）
    const modelId = model ? model.id : service.config?.defaultModel;
    
    // 获取思考模式配置
    const thinkingEffort = session.thinkingEffort || 'off';
    
    let assistantMsgId = null;
    
    try {
      const { MessagesRequest, ThinkingConfig } = window.MessageContent;

      // 1. 创建并持久化用户消息
      const userMsg = new window.Message({ role: 'user', content: content.trim() });
      await sessionManager.addMessage(userMsg, session.id);

      // 2. 构造标准的 MessagesRequest 对象
      const request = new MessagesRequest({
        model: modelId,
        messages: session.messages, // 直接传递 Message 对象数组
        stream: true,
        thinking: thinkingEffort !== 'off' ? new ThinkingConfig(thinkingEffort) : null
      });
      
      // 3. 创建并持久化助手消息（空内容，等待流式填充）
      const assistantMsg = new window.Message({ role: 'assistant', content: '' });
      await sessionManager.addMessage(assistantMsg, session.id);
      assistantMsgId = assistantMsg.id;
      
      // 4. 标记当前请求
      this.currentRequest = {
        sessionId: session.id,
        assistantMessageId: assistantMsgId,
        startedAt: Date.now()
      };
      this._notifyActivityState();
      this.eventBus.emit(window.Events.CHAT.STREAM_START, {
        sessionId: session.id,
        messageId: assistantMsgId
      });
      
      // 5. 开始流式请求
      await service.chatStream(
        request,
        (chunk) => {
          // 流式分片：通过 SessionManager 持久化
          sessionManager.streamChunkMessage(assistantMsgId, {
            content: chunk.content || '',
            reasoning_content: chunk.reasoning_content || ''
          }, session.id);
          
          // 发出事件通知 UI 更新
          this.eventBus.emit(window.Events.CHAT.STREAM_CHUNK_APPEND, {
            sessionId: session.id,
            messageId: assistantMsgId,
            content: chunk.content || '',
            reasoning_content: chunk.reasoning_content || ''
          });
        },
        () => {
          // 流式完成：清理状态
          const duration = this.currentRequest ? Date.now() - this.currentRequest.startedAt : null;
          this.currentRequest = null;
          this._notifyActivityState();
          this.eventBus.emit(window.Events.CHAT.STREAM_COMPLETE, {
            sessionId: session.id,
            messageId: assistantMsgId,
            duration
          });
        }
      );
    } catch (error) {
      // 异常：更新助手消息显示错误信息
      if (assistantMsgId) {
        sessionManager.updateMessage(assistantMsgId, (msg) => {
          msg.content = `❌ 发送失败: ${error.message}`;
        }, session.id);
        
        this.eventBus.emit(window.Events.CHAT.MESSAGE_UPDATED, {
          message: sessionManager.getSession(session.id)?.messages.find(m => m.id === assistantMsgId)
        });
      }
      
      // 清理状态
      this.currentRequest = null;
      this._notifyActivityState();
      this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
        error,
        message: error.message,
        sessionId: session.id,
        messageId: assistantMsgId
      });
      
      throw error;
    }
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    if (!this.currentRequest) {
      console.warn('[ChatController] No active stream to stop');
      return;
    }
    
    const chatService = this.serviceCenter.getCurrentProviderService();
    if (chatService && typeof chatService.cancel === 'function') {
      chatService.cancel();
    }
    
    const stoppedRequest = this.currentRequest;
    this.currentRequest = null;
    this._notifyActivityState();
    this.eventBus.emit(window.Events.CHAT.STREAM_STOP, {
      sessionId: stoppedRequest.sessionId,
      messageId: stoppedRequest.assistantMessageId
    });
  }
  
  /**
   * 清空当前会话消息
   */
  clearMessages() {
    const sessionManager = this.serviceCenter.getSessionManager();
    const session = sessionManager.getCurrentSession();
    if (!session) {
      return false;
    }
    sessionManager.clearMessages(session.id);
    
    // 清理运行时状态
    this.currentRequest = null;
    this._notifyActivityState();
    return true;
  }
  
  /**
   * 删除指定消息
   * @param {string} messageId - 消息 ID
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const session = sessionManager.getCurrentSession();
    const result = session ? sessionManager.deleteMessage(messageId, session.id) : false;
    
    if (result) {
      // 发出删除事件
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, {
        messageId,
        sessionId: session.id
      });
    }
    
    return result;
  }
  
  /**
   * 是否有活跃活动
   * @returns {boolean}
   */
  hasActiveActivities() {
    return !!this.currentRequest;
  }
  
  /**
   * 获取队列状态
   * @returns {Object}
   */
  getQueueStatus() {
    return {
      messageQueueLength: this.currentRequest ? 1 : 0,
      sessionId: this.currentRequest?.sessionId || null,
      hasActive: this.hasActiveActivities()
    };
  }
  
  /**
   * 通知活动状态变更
   * @private
   */
  _notifyActivityState() {
    this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, this.getQueueStatus());
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ChatController = ChatController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatController;
}
