/**
 * Chat - 会话交互上下文
 * 
 * Chat 是 Session 的运行时增强包装器，内聚所有交互状态：
 * - 消息队列管理
 * - 流式请求状态
 * - 活动任务追踪
 * 
 * 设计原则：
 * 1. Chat 持有 Session 引用，所有数据操作委托给 SessionManager
 * 2. Chat 管理运行时状态（队列、流式），不持久化
 * 3. Chat 通过 EventBus 发出事件，UI 层监听更新
 * 4. 支持多实例独立管理（后台 Agent、前台聊天等）
 * 
 * 使用示例：
 * ```javascript
 * // 前台聊天
 * const chat = new Chat(session, chatService, sessionManager);
 * await chat.sendMessage({ content: 'Hello' });
 * 
 * // 后台 Agent（独立实例）
 * const agentChat = new Chat(agentSession, agentService, sessionManager);
 * await agentChat.sendMessage({ content: 'Execute task' });
 * ```
 */

class Chat {
  /**
   * @param {Session} session - 底层 Session 实例
   * @param {IChatService} chatService - 聊天服务实例
   * @param {SessionManager} sessionManager - SessionManager 实例（用于持久化）
   * @param {EventBus} [eventBus] - 事件总线（可选，默认使用全局）
   */
  constructor(session, chatService, sessionManager, eventBus = null) {
    if (!session) {
      throw new Error('Session is required');
    }
    if (!chatService) {
      throw new Error('ChatService is required');
    }
    if (!sessionManager) {
      throw new Error('SessionManager is required');
    }
    
    // 核心依赖
    this.session = session;
    this.chatService = chatService;
    this.sessionManager = sessionManager;
    this.eventBus = eventBus || window.EventBus;
    
    // 运行时状态（不持久化）
    this.messageQueue = [];      // 待处理消息队列
    this.taskQueue = [];         // 待处理任务队列
    this.activeStream = null;    // 当前活跃的流式请求控制器
    
    // 状态标志
    this.isStreaming = false;
    this.isProcessing = false;
    
    console.log('[Chat] Created for session:', session.id);
  }
  
  // ==================== 只读属性（代理到 Session）====================
  
  /**
   * 会话 ID
   */
  get id() {
    return this.session.id;
  }
  
  /**
   * 会话标题
   */
  get title() {
    return this.session.title;
  }
  
  /**
   * 消息列表（只读）
   */
  get messages() {
    return this.session.messages;
  }
  
  /**
   * 元数据
   */
  get metadata() {
    return this.session.metadata;
  }
  
  /**
   * Reasoning 是否启用
   */
  get reasoningEnabled() {
    return this.session.reasoningEnabled;
  }
  
  /**
   * Reasoning 强度
   */
  get reasoningEffort() {
    return this.session.reasoningEffort;
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
        
        // 发出消息更新事件
        this.eventBus.emit(window.Events.CHAT.MESSAGE_UPDATED, {
          messageId: assistantMsg.id,
          updater: (msg) => { msg.content = assistantMsg.content; }
        });
      }
      
      // 清理队列
      this.messageQueue = this.messageQueue.filter(item => item.id !== (assistantMsg?.id));
      this.isStreaming = false;
      this._notifyActivityState();
      
      console.error('[Chat] Send message failed:', error);
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
    
    this._notifyActivityState();
    console.log('[Chat] Generation stopped');
  }
  
  /**
   * 清空当前会话的消息
   */
  clearMessages() {
    this.session.messages = [];
    this.session.updatedAt = Date.now();
    
    // 发出会话清空事件
    this.eventBus.emit(window.Events.CHAT.SESSION_CLEARED, { sessionId: this.session.id });
    
    console.log('[Chat] Messages cleared for session:', this.session.id);
  }
  
  /**
   * 删除指定消息
   * @param {string} messageId - 消息 ID
   * @returns {boolean} 是否删除成功
   */
  deleteMessage(messageId) {
    const success = this.session.removeMessage(messageId);
    if (success) {
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, { 
        sessionId: this.session.id,
        messageId 
      });
    }
    return success;
  }
  
  // ==================== 服务管理 ====================
  
  /**
   * 设置聊天服务（支持动态切换）
   * @param {IChatService} chatService - 新的聊天服务
   */
  setService(chatService) {
    if (!chatService) {
      throw new Error('ChatService is required');
    }
    this.chatService = chatService;
    console.log('[Chat] Service updated');
  }
  
  /**
   * 获取当前聊天服务
   * @returns {IChatService}
   */
  getService() {
    return this.chatService;
  }
  
  // ==================== 内部方法 ====================
  
  /**
   * 发出消息添加事件
   * @param {Message} message - 消息对象
   */
  _emitMessageAdded(message) {
    this.eventBus.emit(window.Events.CHAT.MESSAGE_ADDED, { message });
  }
  
  /**
   * 通知活动状态变更
   */
  _notifyActivityState() {
    this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, this.getQueueStatus());
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Chat;
} else {
  window.Chat = Chat;
}
