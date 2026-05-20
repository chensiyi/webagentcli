/**
 * ChatController - 聊天控制器（IChat 的具体实现）
 * 
 * 职责：
 * 1. 实现 IChat 接口定义的所有方法
 * 2. 处理聊天业务逻辑（消息队列、流式状态、持久化协调）
 * 3. 通过 EventBus 与 UI 层通信
 * 
 * 设计原则：
 * - 继承 IChat 基类
 * - 包含完整的业务逻辑实现
 * - 管理运行时状态（队列、流式等）
 */

class ChatController extends window.IChat {
  /**
   * @param {Session} session - 会话实例
   * @param {IProviderAPIService} chatService - Provider API 服务
   * @param {ISessionManager} sessionManager - 会话管理器
   * @param {EventBus} [eventBus] - 事件总线
   */
  constructor(session, chatService, sessionManager, eventBus = null) {
    super(session, chatService, sessionManager, eventBus);
    
    // 运行时状态（不持久化）
    this.messageQueue = [];      // 待处理消息队列
    this.taskQueue = [];         // 待处理任务队列
    this.activeStream = null;    // 当前活跃的流式请求控制器
    
    // 状态标志
    this.isStreaming = false;
    this.isProcessing = false;
    
    console.log('[ChatController] Created for session:', session.id);
  }
  
  // ==================== 运行时状态查询 ====================
  
  /**
   * 是否有活跃的活动（流式或队列中有任务）
   * @returns {boolean}
   */
  hasActiveActivities() {
    return this.isStreaming || this.messageQueue.length > 0 || this.taskQueue.length > 0;
  }
  
  /**
   * 获取队列状态
   * @returns {Object}
   */
  getQueueStatus() {
    return {
      isStreaming: this.isStreaming,
      messageQueueLength: this.messageQueue.length,
      taskQueueLength: this.taskQueue.length,
      hasActive: this.hasActiveActivities()
    };
  }
  
  // ==================== 核心交互方法 ====================
  
  /**
   * 发送消息
   * @param {Object} params - 发送参数
   * @param {string} params.content - 消息内容
   * @param {boolean} [params.reasoningEnabled] - 是否启用 reasoning（可选，覆盖会话默认值）
   * @param {string} [params.reasoningEffort] - reasoning 强度（可选，覆盖会话默认值）
   * @returns {Promise<Object>} 结果
   */
  async sendMessage(params) {
    const { content, reasoningEnabled, reasoningEffort } = params;
    
    if (!content || !content.trim()) {
      throw new Error('Message content is required');
    }
    
    // 检查队列状态
    if (this.messageQueue.length > 0) {
      throw new Error('Message queue is busy');
    }
    
    let assistantMsg = null;
    
    try {
      // 1. 创建并持久化用户消息
      const userMsg = new window.Message({ role: 'user', content: content.trim() });
      this.session.addMessage(userMsg);
      this._emitMessageAdded(userMsg);
      
      // 2. 创建并持久化助手消息（空内容，等待流式填充）
      assistantMsg = new window.Message({ role: 'assistant', content: '' });
      this.session.addMessage(assistantMsg);
      this._emitMessageAdded(assistantMsg);
      
      // 3. 加入消息队列
      const queueItem = { id: assistantMsg.id, status: 'pending' };
      this.messageQueue.push(queueItem);
      this._notifyActivityState();
      
      // 4. 准备请求参数
      const requestParams = {
        messages: this.session.messages.map(m => ({ 
          role: m.role, 
          content: m.content,
          tool_calls: m.tool_calls // 保留工具调用信息
        })),
        stream: true,
        reasoningEnabled: reasoningEnabled !== undefined ? reasoningEnabled : this.session.reasoningEnabled,
        reasoningEffort: reasoningEffort || this.session.reasoningEffort
      };
      
      // 5. 开始流式请求
      queueItem.status = 'streaming';
      this.isStreaming = true;
      this._notifyActivityState();
      
      // 6. 调用聊天服务
      await this.chatService.chatStream(
        requestParams,
        (chunk) => {
          // 流式分片：通过 SessionManager 持久化并发出事件
          this.sessionManager.streamChunkMessage(assistantMsg.id, {
            content: chunk.content || '',
            reasoning_content: chunk.reasoning_content || ''
          });
          
          // 发出流式分片事件（UI 层监听更新）
          this.eventBus.emit(window.Events.CHAT.STREAM_CHUNK_APPEND, {
            messageId: assistantMsg.id,
            content: chunk.content || '',
            reasoning_content: chunk.reasoning_content || ''
          });
        },
        () => {
          // 流式完成：清理状态
          this.messageQueue = this.messageQueue.filter(item => item.id !== assistantMsg.id);
          this.isStreaming = false;
          this._notifyActivityState();
        }
      );
      
      return { success: true, message: assistantMsg };
    } catch (error) {
      // 异常处理：更新助手消息显示错误
      if (assistantMsg) {
        assistantMsg.content = `❌ 发送失败: ${error.message}`;
        this.session.updateMessage(assistantMsg.id, (msg) => {
          msg.content = assistantMsg.content;
        });
        
        // 发出消息更新事件（直接传递 message 对象）
        this.eventBus.emit(window.Events.CHAT.MESSAGE_UPDATED, {
          message: assistantMsg
        });
      }
      
      // 清理队列
      this.messageQueue = this.messageQueue.filter(item => item.id !== (assistantMsg?.id));
      this.isStreaming = false;
      this._notifyActivityState();
      
      console.error('[ChatController] Send message failed:', error);
      throw error;
    }
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    if (this.chatService && typeof this.chatService.cancel === 'function') {
      this.chatService.cancel();
    }
    
    // 清空队列
    this.messageQueue = [];
    this.taskQueue = [];
    this.isStreaming = false;
    this.isProcessing = false;
    
    this._notifyActivityState();
    console.log('[ChatController] Generation stopped');
  }
  
  /**
   * 清空消息
   */
  clearMessages() {
    this.session.clearMessages();
    this.messageQueue = [];
    this.taskQueue = [];
    this.isStreaming = false;
    this.isProcessing = false;
    
    this._notifyActivityState();
    console.log('[ChatController] Messages cleared');
  }
  
  /**
   * 删除指定消息
   * @param {string} messageId - 消息 ID
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    // Session 使用 removeMessage 方法
    const deleted = this.session.removeMessage(messageId);
    if (deleted) {
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, { messageId });
    }
    return deleted;
  }
  
  // ==================== 服务管理 ====================
  
  /**
   * 设置聊天服务
   * @param {IProviderAPIService} service - 新的服务实例
   */
  setService(service) {
    this.chatService = service;
    console.log('[ChatController] Service updated');
  }
  
  // ==================== 内部方法 ====================
  
  /**
   * 发出消息添加事件
   * @private
   */
  _emitMessageAdded(message) {
    this.eventBus.emit(window.Events.CHAT.MESSAGE_ADDED, {
      sessionId: this.session.id,
      message
    });
  }
  
  /**
   * 通知活动状态变化
   * @private
   */
  _notifyActivityState() {
    this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, this.getQueueStatus());
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ChatController = ChatController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatController;
}
