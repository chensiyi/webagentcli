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
    
    // 2. 原地替换当前实例的所有属性和方法
    this._transformToRealChat(session);
    
    // 3. 现在 this 已经是真实的 ChatController，直接调用
    return await this.sendMessage(params);
  }
  
  /**
   * 将 EphemeralChat 原地转换为真实的 ChatController
   * @param {Session} session - 真实的会话对象
   */
  _transformToRealChat(session) {
    console.log('[EphemeralChat] Transforming to real ChatController...');
    
    // 替换核心属性
    this.session = session;
    this.messageQueue = [];
    this.taskQueue = [];
    this.activeStream = null;
    this.isStreaming = false;
    this.isProcessing = false;
    
    // 替换所有方法为 ChatController 的实现（像换零件一样）
    this.sendMessage = window.ChatController.prototype.sendMessage;
    this.stopGeneration = window.ChatController.prototype.stopGeneration;
    this.clearMessages = window.ChatController.prototype.clearMessages;
    this.deleteMessage = window.ChatController.prototype.deleteMessage;
    this.hasActiveActivities = window.ChatController.prototype.hasActiveActivities;
    this.getQueueStatus = window.ChatController.prototype.getQueueStatus;
    this.setService = window.ChatController.prototype.setService;
    
    // 移除临时标记
    delete this.isEphemeral;
    
    console.log('[EphemeralChat] Transformed successfully, session id:', this.session.id);
  }
  
  // 转换前这些方法提供默认行为
  // 转换后会被 _transformToRealChat 替换为 ChatController 的实现
  
  stopGeneration() {
    console.warn('[EphemeralChat] Cannot stop generation before initialization');
  }
  
  clearMessages() {
    console.warn('[EphemeralChat] Cannot clear messages before initialization');
  }
  
  deleteMessage() {
    console.warn('[EphemeralChat] Cannot delete message before initialization');
    return false;
  }
  
  hasActiveActivities() {
    return false;
  }
  
  getQueueStatus() {
    return {
      isStreaming: false,
      messageQueueLength: 0,
      taskQueueLength: 0,
      hasActive: false
    };
  }
  
  setService() {
    console.warn('[EphemeralChat] Cannot set service before initialization');
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.EphemeralChat = EphemeralChat;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EphemeralChat;
}
