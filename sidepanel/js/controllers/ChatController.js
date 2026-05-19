/**
 * 聊天控制器
 * 负责聊天的核心业务逻辑：发送消息、接收响应、流式处理
 * 通过事件总线与 UI 层通信
 */

class ChatController {
  constructor() {
    this.eventBus = window.EventBus;
    this.currentService = null;
    
    // 维护消息队列和任务队列状态
    this.messageQueue = [];
    this.taskQueue = [];
  }
  
  /**
   * 检查是否存在活动中的任务
   * @returns {boolean}
   */
  hasActiveActivities() {
    return this.messageQueue.length > 0 || this.taskQueue.length > 0;
  }
  
  /**
   * 通知 UI 更新按钮状态
   */
  notifyActivityState() {
    const hasActive = this.hasActiveActivities();
    console.log('[ChatController] notifyActivityState:', { 
      hasActive,
      messageQueueLength: this.messageQueue.length,
      taskQueueLength: this.taskQueue.length
    });
    this.eventBus.emit(Events.CHAT.ACTIVITY_STATE_CHANGED, { 
      hasActive,
      messageQueueLength: this.messageQueue.length,
      taskQueueLength: this.taskQueue.length
    });
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
   * @param {Object} params - 发送参数
   * @param {string} params.content - 消息内容
   * @param {Array} params.messages - 历史消息数组
   * @param {boolean} [params.reasoningEnabled] - 是否启用 reasoning
   * @param {string} [params.reasoningEffort] - reasoning 强度 ('low' | 'medium' | 'high')
   * @returns {Promise<Object>} 结果
   */
  async sendMessage(params) {
    const { content, messages, reasoningEnabled = false, reasoningEffort = 'medium' } = params;
    
    if (!this.currentService) {
      throw new Error('No chat service configured');
    }
    
    // 使用消息队列检查
    if (this.messageQueue.length > 0) {
      throw new Error('Message queue is busy');
    }
    
    let assistantMsg = null;
    
    try {
      // 1. 创建用户消息并持久化
      const userMsg = new window.Message({ role: 'user', content: content });
      if (window.SessionController && window.SessionController.manager) {
        await window.SessionController.manager.addMessage(userMsg);
      }
      
      // 2. 创建助手消息并持久化（空内容，等待流式填充）
      assistantMsg = new window.Message({ role: 'assistant', content: '' });
      if (window.SessionController && window.SessionController.manager) {
        await window.SessionController.manager.addMessage(assistantMsg);
      }
      
      // 3. 加入消息队列
      const queueItem = { id: assistantMsg.id, status: 'pending' };
      this.messageQueue.push(queueItem);
      this.notifyActivityState();
      
      // 4. 准备请求参数
      const requestParams = {
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        reasoningEnabled: reasoningEnabled,
        reasoningEffort: reasoningEffort
      };
      
      // 5. 开始流式请求
      queueItem.status = 'streaming';
      
      // 通过 IChatService 接口触发 UI 交互
      if (this.currentService.handleStreamStart) {
        this.currentService.handleStreamStart({ messageId: assistantMsg.id });
      }
      this.notifyActivityState();
      
      await this.currentService.chatStream(
        requestParams,
        (chunk) => {          
          // 抛出流式分片追加事件（SessionController 监听并持久化，ChatEventHandler 监听并更新 UI）
          this.eventBus.emit(Events.CHAT.STREAM_CHUNK_APPEND, {
            messageId: assistantMsg.id,
            content: chunk.content || '',
            reasoning_content: chunk.reasoning_content || ''
          });
        },
        () => {
          // 完成：从队列移除
          this.messageQueue = this.messageQueue.filter(item => item.id !== assistantMsg.id);
          
          // 通过 IChatService 接口处理流式完成
          if (this.currentService.handleStreamComplete) {
            this.currentService.handleStreamComplete({ messageId: assistantMsg.id, message: assistantMsg });
          }
          this.notifyActivityState();
        }
      );
      
      return { success: true, message: assistantMsg };
    } catch (error) {
      // 异常：更新助手消息显示错误信息
      if (assistantMsg) {
        assistantMsg.content = `❌ 发送失败: ${error.message}`;
        
        // 通过 EventBus 发出消息更新事件（SessionController 监听并持久化）
        this.eventBus.emit(window.Events.CHAT.MESSAGE_UPDATED, {
          messageId: assistantMsg.id,
          updater: (msg) => { msg.content = assistantMsg.content; }
        });
      }
      
      // 从队列移除
      this.messageQueue = this.messageQueue.filter(item => item.id !== (assistantMsg?.id));
      
      // 通过 IChatService 接口处理流式错误
      if (this.currentService.handleStreamError) {
        this.currentService.handleStreamError({ error: error.message, stack: error.stack });
      }
      this.notifyActivityState();
      console.error('[ChatController] Send message failed:', error);
      throw error;
    }
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    if (this.currentService && this.messageQueue.length > 0) {
      if (this.currentService.cancel) this.currentService.cancel();
      
      // 清空消息队列并通知状态变更
      this.messageQueue = [];
      this.notifyActivityState();
      
      this.eventBus.emit(Events.CHAT.STREAM_STOP, {});
      console.log('[ChatController] Generation stopped');
    }
  }
  
  /**
   * 添加任务到任务队列（供 ToolCall 层调用）
   */
  addTask(task) {
    this.taskQueue.push(task);
    this.notifyActivityState();
  }
  
  /**
   * 完成任务并从队列移除（供 ToolCall 层调用）
   */
  completeTask(taskId) {
    this.taskQueue = this.taskQueue.filter(t => t.id !== taskId);
    this.notifyActivityState();
  }
  
  /**
   * 清空当前会话
   */
  clearSession() {
    // 通过 EventBus 发出清空会话事件（SessionController 监听并处理）
    this.eventBus.emit(window.Events.CHAT.SESSION_CLEAR_REQUEST, {});
    this.eventBus.emit(Events.CHAT.SESSION_CLEARED, {});
    console.log('[ChatController] Session cleared');
  }
}

// 导出单例
window.ChatController = new ChatController();
