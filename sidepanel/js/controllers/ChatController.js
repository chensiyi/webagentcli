/**
 * ChatController - 聊天控制器（适配层）
 * 
 * 职责：
 * 1. 作为 UI 层和 Chat 实例之间的适配层
 * 2. 从 SessionManager 获取当前 Chat 实例
 * 3. 委托所有操作给 Chat 实例
 * 
 * 设计原则：
 * - 不持有状态，所有状态在 Chat 实例中
 * - 不直接调用 Service，通过 Chat 实例
 * - 支持动态切换会话和服务
 */

class ChatController {
  constructor() {
    this.eventBus = window.EventBus;
    console.log('[ChatController] Initialized');
  }
  
  /**
   * 获取当前 Chat 实例
   * @returns {Chat|EphemeralChat} Chat 实例（如果没有会话则返回临时 Chat）
   */
  _getCurrentChat() {
    const sessionManager = window.sessionManagerInstance;
    const chatService = window.ChatService;
    
    if (!sessionManager) {
      throw new Error('SessionManager not available');
    }
    
    if (!chatService) {
      throw new Error('ChatService not configured');
    }
    
    return sessionManager.getCurrentChat(chatService);
  }
  
  /**
   * 发送消息
   * @param {Object} params - 发送参数
   * @param {string} params.content - 消息内容
   * @param {boolean} [params.reasoningEnabled] - 是否启用 reasoning
   * @param {string} [params.reasoningEffort] - reasoning 强度
   * @returns {Promise<Object>} 结果
   */
  async sendMessage(params) {
    const chat = this._getCurrentChat();
    return await chat.sendMessage(params);
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    const chat = this._getCurrentChat();
    if (!chat) {
      console.warn('[ChatController] No active chat to stop');
      return;
    }
    
    chat.stopGeneration();
  }
  
  /**
   * 清空当前会话
   */
  clearSession() {
    const chat = this._getCurrentChat();
    if (!chat) {
      console.warn('[ChatController] No active chat to clear');
      return;
    }
    
    chat.clearMessages();
  }
  
  /**
   * 删除指定消息
   * @param {string} messageId - 消息 ID
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    const chat = this._getCurrentChat();
    if (!chat) {
      return false;
    }
    
    return chat.deleteMessage(messageId);
  }
  
  /**
   * 检查是否有活跃活动
   * @returns {boolean}
   */
  hasActiveActivities() {
    const chat = this._getCurrentChat();
    if (!chat) {
      return false;
    }
    
    return chat.hasActiveActivities();
  }
  
  /**
   * 获取队列状态
   * @returns {Object}
   */
  getQueueStatus() {
    const chat = this._getCurrentChat();
    if (!chat) {
      return {
        isStreaming: false,
        messageQueueLength: 0,
        taskQueueLength: 0,
        hasActive: false
      };
    }
    
    return chat.getQueueStatus();
  }
  
  /**
   * 设置聊天服务（触发 Chat 实例更新）
   * @param {IChatService} service - 新的聊天服务
   */
  setService(service) {
    // 清除 Chat 缓存，下次获取时会创建新实例
    const sessionManager = window.sessionManagerInstance;
    if (sessionManager) {
      sessionManager.clearChatCache();
    }
    
    // 更新全局服务引用
    window.ChatService = service;
    
    console.log('[ChatController] Service updated, Chat cache cleared');
  }
}

// 导出单例
window.ChatController = new ChatController();
