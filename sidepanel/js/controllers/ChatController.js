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
    this.state = window.Events.CHAT.STATE.IDLE;
    
    console.log('[ChatController] Initialized');
  }

  /**
   * 更新并广播状态
   * @private
   */
  _setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    console.log(`[ChatController] State changed to: ${newState}`);
    this._notifyActivityState();
  }
  
  /**
   * 发送消息
   * @param {Object} params 
   */
  async sendMessage({ content, sessionId = null, chatService = null, model = null, reasoningEffort = undefined }) {
    if (!content || !content.trim()) {
      throw new Error('Message content is required');
    }
    
    // 检查队列状态
    if (this.currentRequest) {
      throw new Error('A message is already being generated');
    }
    
    const sessionManager = this.serviceCenter.getSessionManager();
    const service = chatService || this.serviceCenter.getCurrentProviderService();
    const settings = this.serviceCenter.getSettingsManager().getSettings();
    const defaultEffort = settings?.reasoningEffort || 'medium';
    let assistantMsgId = null;
    let session = null;

    try {
      this._setState(window.Events.CHAT.STATE.WAITING);
      
      // 获取或创建当前会话
      session = sessionId ? sessionManager.getSession(sessionId) : sessionManager.getCurrentSession();
      if (!session) {
        session = sessionManager.createSession({
          title: '新对话',
          reasoningEffort: reasoningEffort || defaultEffort
        });
      } else if (reasoningEffort && session.reasoningEffort !== reasoningEffort) {
        session.reasoningEffort = reasoningEffort;
      }

      const modelId = model ? model.id : service.config?.defaultModel;
      const thinkingEffort = session.reasoningEffort || 'off';
      const { MessagesRequest, ThinkingConfig } = window.MessageContent;

      // 1. 持久化用户消息
      const userMsg = new window.Message({ role: 'user', content: content.trim() });
      await sessionManager.addMessage(userMsg, session.id);

      // 2. 构造请求
      const request = new MessagesRequest({
        model: modelId,
        messages: session.messages,
        stream: true,
        thinking: thinkingEffort !== 'off' ? new ThinkingConfig(thinkingEffort) : null
      });
      
      // 3. 持久化助手消息
      const assistantMsg = new window.Message({ role: 'assistant', content: '' });
      await sessionManager.addMessage(assistantMsg, session.id);
      assistantMsgId = assistantMsg.id;
      
      // 4. 设置运行时状态
      this.currentRequest = {
        sessionId: session.id,
        assistantMessageId: assistantMsgId,
        startedAt: Date.now(),
        lastActiveAt: Date.now()
      };

      this.eventBus.emit(window.Events.CHAT.STREAM_START, {
        sessionId: session.id,
        messageId: assistantMsgId
      });
      
      // 5. 执行流式请求
      const isThinkingEnabled = thinkingEffort !== 'off';
      
      await service.chatStream(
        request,
        (chunk) => {
          // 更新活跃时间（看门狗依据）
          if (this.currentRequest) this.currentRequest.lastActiveAt = Date.now();

          // 提取内容
          const content = chunk.content || '';
          // 仅在开启思考模式时提取推理内容，否则忽略模型返回的推理分片
          const reasoning = isThinkingEnabled ? (chunk.reasoning_content || '') : '';

          // 状态流转：根据内容自动切换 THINKING/GENERATING
          if (reasoning && this.state !== window.Events.CHAT.STATE.THINKING) {
            this._setState(window.Events.CHAT.STATE.THINKING);
          } else if (content && this.state !== window.Events.CHAT.STATE.GENERATING) {
            this._setState(window.Events.CHAT.STATE.GENERATING);
          }

          // 数据持久化
          sessionManager.streamChunkMessage(assistantMsgId, {
            content: content,
            reasoning_content: reasoning
          }, session.id);
          
          // 通知 UI
          this.eventBus.emit(window.Events.CHAT.STREAM_CHUNK_APPEND, {
            sessionId: session.id,
            messageId: assistantMsgId,
            content: content,
            reasoning_content: reasoning
          });
        },
        () => {
          // 正常结束
          this._setState(window.Events.CHAT.STATE.COMPLETED);
          const duration = this.currentRequest ? Date.now() - this.currentRequest.startedAt : null;
          this.eventBus.emit(window.Events.CHAT.STREAM_COMPLETE, {
            sessionId: session.id,
            messageId: assistantMsgId,
            duration
          });
        }
      );
    } catch (error) {
      this._setState(window.Events.CHAT.STATE.FAILED);
      
      // 错误持久化
      if (assistantMsgId && session) {
        sessionManager.updateMessage(assistantMsgId, (msg) => {
          msg.content = `❌ 发送失败: ${error.message}`;
        }, session.id);
      }
      
      // 统一错误通知：仅通过事件广播，不再 throw（EventBus 驱动一切）
      this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
        error,
        message: error.message,
        sessionId: session?.id,
        messageId: assistantMsgId
      });
    } finally {
      // 清理运行时状态
      this.currentRequest = null;
      setTimeout(() => {
        if (!this.currentRequest) {
          this._setState(window.Events.CHAT.STATE.IDLE);
        }
      }, 50);
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
    this._setState(window.Events.CHAT.STATE.STOPPED);
    
    this.eventBus.emit(window.Events.CHAT.STREAM_STOP, {
      sessionId: stoppedRequest.sessionId,
      messageId: stoppedRequest.assistantMessageId
    });

    // 停止后重置回空闲状态
    setTimeout(() => this._setState(window.Events.CHAT.STATE.IDLE), 50);
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
    this._setState(window.Events.CHAT.STATE.IDLE);
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
    return this.state !== window.Events.CHAT.STATE.IDLE;
  }
  
  /**
   * 获取队列状态
   * @returns {Object}
   */
  getQueueStatus() {
    return {
      state: this.state,
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