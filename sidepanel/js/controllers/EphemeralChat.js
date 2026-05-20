/**
 * EphemeralChat - 临时聊天上下文（轻量级占位符）
 * 
 * 设计目的：
 * - 在没有会话时提供占位符，避免 null 检查
 * - 延迟初始化，只在第一次 sendMessage 时创建真实会话
 * - 自动替换为真实 ChatController 实例
 * 
 * 使用场景：
 * - 用户打开应用但没有选择会话
 * - 用户删除了最后一个会话
 * - 首次使用应用
 */

class EphemeralChat extends window.ChatController {
  /**
   * @param {ISessionManager} sessionManager - SessionManager 实例
   * @param {IProviderAPIService} chatService - 聊天服务实例
   * @param {EventBus} [eventBus] - 事件总线
   */
  constructor(sessionManager, chatService, eventBus = null) {
    // 创建一个临时的空 Session 对象用于继承
    const tempSession = {
      id: 'ephemeral',
      title: '新对话',  // 临时会话标题
      messages: [],
      metadata: {},
      reasoningEnabled: false,
      reasoningEffort: 'medium',
      addMessage: () => {},
      updateMessage: () => {},
      deleteMessage: () => false,
      clearMessages: () => {}
    };
    
    super(tempSession, chatService, sessionManager, eventBus);
    
    // 标记为临时实例
    this.isEphemeral = true;
    
    console.log('[EphemeralChat] Created (placeholder)');
  }
  
  /**
   * 发送消息（触发真实会话创建并原地替换）
   * @param {Object} params - 发送参数
   * @returns {Promise<Object>} 结果
   */
  async sendMessage(params) {
    console.log('[EphemeralChat] First message detected, creating real session...');
    
    // 1. 创建真实会话
    const session = this.sessionManager.createSession({
      title: '新对话',
      persist: false  // 稍后由第一条消息触发持久化
    });
    
    console.log('[EphemeralChat] Real session created:', session.id);
    
    // 2. 原地替换当前实例的所有属性为真实 ChatController 的属性
    this._transformToRealChat(session);
    
    // 3. 调用真实的 sendMessage
    return await window.ChatController.prototype.sendMessage.call(this, params);
  }
  
  /**
   * 将 EphemeralChat 原地转换为真实的 ChatController
   * @param {Session} session - 真实的会话对象
   */
  _transformToRealChat(session) {
    console.log('[EphemeralChat] Transforming to real ChatController...');
    
    // 替换 session
    this.session = session;
    
    // 初始化运行时状态
    this.messageQueue = [];
    this.taskQueue = [];
    this.activeStream = null;
    this.isStreaming = false;
    this.isProcessing = false;
    
    // 移除临时标记
    this.isEphemeral = false;
    
    console.log('[EphemeralChat] Transformed successfully, session id:', this.session.id);
  }
  
  /**
   * 停止生成（转换前不可用）
   */
  stopGeneration() {
    if (this.isEphemeral) {
      console.warn('[EphemeralChat] Cannot stop generation on ephemeral chat');
      return;
    }
    // 转换后调用父类方法
    return window.ChatController.prototype.stopGeneration.call(this);
  }
  
  /**
   * 清空消息（转换前不可用）
   */
  clearMessages() {
    if (this.isEphemeral) {
      console.warn('[EphemeralChat] Cannot clear messages on ephemeral chat');
      return;
    }
    // 转换后调用父类方法
    return window.ChatController.prototype.clearMessages.call(this);
  }
  
  /**
   * 删除消息（转换前不可用）
   */
  deleteMessage(messageId) {
    if (this.isEphemeral) {
      console.warn('[EphemeralChat] Cannot delete message on ephemeral chat');
      return false;
    }
    // 转换后调用父类方法
    return window.ChatController.prototype.deleteMessage.call(this, messageId);
  }
  
  /**
   * 检查是否有活跃活动
   */
  hasActiveActivities() {
    if (this.isEphemeral) {
      return false;
    }
    // 转换后调用父类方法
    return window.ChatController.prototype.hasActiveActivities.call(this);
  }
  
  /**
   * 获取队列状态
   */
  getQueueStatus() {
    if (this.isEphemeral) {
      return {
        isStreaming: false,
        messageQueueLength: 0,
        taskQueueLength: 0,
        hasActive: false
      };
    }
    // 转换后调用父类方法
    return window.ChatController.prototype.getQueueStatus.call(this);
  }
  
  /**
   * 设置服务（转换前不可用）
   */
  setService(chatService) {
    if (this.isEphemeral) {
      console.warn('[EphemeralChat] Cannot set service on ephemeral chat');
      return;
    }
    // 转换后调用父类方法
    return window.ChatController.prototype.setService.call(this, chatService);
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.EphemeralChat = EphemeralChat;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EphemeralChat;
}
