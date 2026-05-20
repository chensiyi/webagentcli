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
   * 发送消息（触发真实会话创建）
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
    
    // 2. 获取真实的 ChatController 实例（会自动缓存）
    const realChat = this.sessionManager.getOrCreateChat(session.id, this.chatService);
    
    // 3. 委托给真实 ChatController 处理
    return await realChat.sendMessage(params);
  }
  
  /**
   * 其他方法均为空操作或抛出错误（因为这是临时实例）
   */
  stopGeneration() {
    console.warn('[EphemeralChat] Cannot stop generation on ephemeral chat');
  }
  
  clearMessages() {
    console.warn('[EphemeralChat] Cannot clear messages on ephemeral chat');
  }
  
  deleteMessage() {
    console.warn('[EphemeralChat] Cannot delete message on ephemeral chat');
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
    console.warn('[EphemeralChat] Cannot set service on ephemeral chat');
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.EphemeralChat = EphemeralChat;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EphemeralChat;
}
