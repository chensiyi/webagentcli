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
   * @param {string} content - 消息内容
   * @returns {Promise<Object>} 结果
   */
  async sendMessage(content) {
    if (!this.currentService) {
      throw new Error('No chat service configured');
    }
    
    // 使用消息队列检查
    if (this.messageQueue.length > 0) {
      throw new Error('Message queue is busy');
    }
    
    let assistantMsg = null;
    
    try {
      // 1. & 2. 批量创建用户消息和助手消息，避免触发多次渲染
      const userMsg = new window.Message({ role: 'user', content: content });
      assistantMsg = new window.Message({ role: 'assistant', content: '' });
      
      this.sessionController.addMessages([userMsg, assistantMsg]);
      
      // 3. 加入消息队列
      const queueItem = { id: assistantMsg.id, status: 'pending' };
      this.messageQueue.push(queueItem);
      this.notifyActivityState();
      
      // 4. 准备请求参数
      const session = this.sessionController.getCurrentSession();
      
      // 从会话中读取 Reasoning 配置
      const reasoningEnabled = session.reasoningEnabled || false;
      const reasoningEffort = session.reasoningEffort || 'medium';
      
      const params = {
        messages: session.messages.map(m => ({ role: m.role, content: m.content })),
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
        params,
        (chunk) => {
          console.log('[ChatController] Received chunk:', {
            contentLength: chunk.content?.length || 0,
            reasoningLength: chunk.reasoning_content?.length || 0,
            hasContent: !!chunk.content,
            hasReasoning: !!chunk.reasoning_content
          });
          
          // 更新推理内容
          if (chunk.reasoning_content) {
            assistantMsg.reasoning_content += chunk.reasoning_content;
            console.log('[ChatController] Updated reasoning, total length:', assistantMsg.reasoning_content.length);
            
            // 持久化到存储（不会触发 UI 更新，因为 ChatEventHandler 不监听 MESSAGE_UPDATED）
            this.sessionController.updateMessage(assistantMsg.id, (msg) => {
              msg.reasoning_content = assistantMsg.reasoning_content;
            });
            
            // 通过 IChatService 接口处理流式推理更新（增量追加）
            if (this.currentService.handleStreamReasoning) {
              this.currentService.handleStreamReasoning({ 
                messageId: assistantMsg.id,
                reasoning_content: chunk.reasoning_content
              });
            }
          }

          // 更新最终回复内容
          if (chunk.content) {
            assistantMsg.content += chunk.content;
            console.log('[ChatController] Updated content, total length:', assistantMsg.content.length);
            
            // 持久化到存储（不会触发 UI 更新，因为 ChatEventHandler 不监听 MESSAGE_UPDATED）
            this.sessionController.updateMessage(assistantMsg.id, (msg) => {
              msg.content = assistantMsg.content;
            });
            
            // 通过 IChatService 接口处理流式内容更新
            if (this.currentService.handleStreamUpdate) {
              this.currentService.handleStreamUpdate({ 
                messageId: assistantMsg.id,
                content: chunk.content
              });
            }
          }
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
        this.sessionController.updateMessage(assistantMsg.id, (msg) => { 
          msg.content = assistantMsg.content; 
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
    this.sessionController.clearCurrentSession();
    this.eventBus.emit(Events.CHAT.SESSION_CLEARED, {});
    console.log('[ChatController] Session cleared');
  }
}

// 导出单例
window.ChatController = new ChatController();
