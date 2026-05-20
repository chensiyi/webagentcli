/**
 * ChatController - 聊天控制器（简化版）
 * 
 * 职责：
 * 1. 管理运行时状态（消息队列、流式状态）
 * 2. 协调 SessionManager 和 ChatService
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
    this.messageQueue = [];
    
    console.log('[ChatController] Initialized');
  }
  
  /**
   * 发送消息
   * @param {Object} params - 发送参数
   * @param {string} params.content - 消息内容
   * @returns {Promise<void>}
   */
  async sendMessage({ content }) {
    if (!content || !content.trim()) {
      throw new Error('Message content is required');
    }
    
    // 检查队列状态
    if (this.messageQueue.length > 0) {
      throw new Error('Message queue is busy');
    }
    
    const sessionManager = this.serviceCenter.getSessionManager();
    const chatService = this.serviceCenter.getChatService();
    
    // 获取或创建当前会话
    let session = sessionManager.getCurrentSession();
    if (!session) {
      session = sessionManager.createSession({ title: '新对话' });
    }
    
    // 从 Session 获取 reasoning 配置
    const reasoningEnabled = session.reasoningEnabled;
    const reasoningEffort = session.reasoningEffort;
    
    let assistantMsgId = null;
    
    try {
      // 1. 创建并持久化用户消息
      const userMsg = new window.Message({ role: 'user', content: content.trim() });
      await sessionManager.addMessage(userMsg);
      
      // 2. 创建并持久化助手消息（空内容，等待流式填充）
      const assistantMsg = new window.Message({ role: 'assistant', content: '' });
      await sessionManager.addMessage(assistantMsg);
      assistantMsgId = assistantMsg.id;
      
      // 3. 加入消息队列
      this.messageQueue.push(assistantMsgId);
      this._notifyActivityState();
      
      // 4. 准备请求参数
      const requestParams = {
        messages: session.messages.map(m => ({ 
          role: m.role, 
          content: m.content,
          tool_calls: m.tool_calls
        })),
        stream: true,
        reasoningEnabled,
        reasoningEffort
      };
      
      // 5. 开始流式请求
      await chatService.chatStream(
        requestParams,
        (chunk) => {
          // 流式分片：通过 SessionManager 持久化
          sessionManager.streamChunkMessage(assistantMsgId, {
            content: chunk.content || '',
            reasoning_content: chunk.reasoning_content || ''
          });
          
          // 发出事件通知 UI 更新
          this.eventBus.emit(window.Events.CHAT.STREAM_CHUNK_APPEND, {
            messageId: assistantMsgId,
            content: chunk.content || '',
            reasoning_content: chunk.reasoning_content || ''
          });
        },
        () => {
          // 流式完成：清理状态
          this.messageQueue = this.messageQueue.filter(id => id !== assistantMsgId);
          this._notifyActivityState();
        }
      );
    } catch (error) {
      // 异常：更新助手消息显示错误信息
      if (assistantMsgId) {
        sessionManager.updateMessage(assistantMsgId, (msg) => {
          msg.content = `❌ 发送失败: ${error.message}`;
        });
        
        this.eventBus.emit(window.Events.CHAT.MESSAGE_UPDATED, {
          message: sessionManager.getCurrentSession().messages.find(m => m.id === assistantMsgId)
        });
      }
      
      // 清理队列
      this.messageQueue = this.messageQueue.filter(id => id !== assistantMsgId);
      this._notifyActivityState();
      
      throw error;
    }
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    if (this.messageQueue.length === 0) {
      console.warn('[ChatController] No active stream to stop');
      return;
    }
    
    const chatService = this.serviceCenter.getChatService();
    if (chatService && typeof chatService.cancel === 'function') {
      chatService.cancel();
    }
    
    this.messageQueue = [];
    this._notifyActivityState();
  }
  
  /**
   * 清空当前会话消息
   */
  clearMessages() {
    const sessionManager = this.serviceCenter.getSessionManager();
    sessionManager.clearCurrentSession();
    
    // 清理运行时状态
    this.messageQueue = [];
    this._notifyActivityState();
  }
  
  /**
   * 删除指定消息
   * @param {string} messageId - 消息 ID
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const result = sessionManager.deleteMessage(messageId);
    
    if (result) {
      // 发出删除事件
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, { messageId });
    }
    
    return result;
  }
  
  /**
   * 是否有活跃活动
   * @returns {boolean}
   */
  hasActiveActivities() {
    return this.messageQueue.length > 0;
  }
  
  /**
   * 获取队列状态
   * @returns {Object}
   */
  getQueueStatus() {
    return {
      messageQueueLength: this.messageQueue.length,
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
