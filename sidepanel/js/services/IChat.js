/**
 * IChat - 聊天交互接口（抽象基类）
 * 
 * 定义聊天交互的标准接口，所有具体实现必须继承此基类。
 * 
 * 职责：
 * - 定义聊天交互的标准方法签名
 * - 提供默认的空实现（便于子类继承）
 * - 不包含具体业务逻辑
 * 
 * 设计原则：
 * 1. I 前缀表示这是一个接口规范
 * 2. 使用者可以实现自己的 IChat 并替换
 * 3. 业务逻辑在具体实现类中（如 ChatController）
 * 
 * 使用示例：
 * ```javascript
 * class MyChatImpl extends IChat {
 *   async sendMessage(params) {
 *     // 实现具体逻辑
 *   }
 * }
 * ```
 */

class IChat {
  /**
   * @param {Session} session - 会话实例
   * @param {IProviderAPIService} chatService - Provider API 服务
   * @param {ISessionManager} sessionManager - 会话管理器
   * @param {EventBus} [eventBus] - 事件总线
   */
  constructor(session, chatService, sessionManager, eventBus = null) {
    if (new.target === IChat) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    
    this.session = session;
    this.chatService = chatService;
    this.sessionManager = sessionManager;
    this.eventBus = eventBus || window.EventBus;
  }
  
  // ==================== 只读属性 ====================
  
  get id() {
    return this.session?.id;
  }
  
  get title() {
    return this.session?.title;
  }
  
  get messages() {
    return this.session?.messages || [];
  }
  
  get metadata() {
    return this.session?.metadata || {};
  }
  
  get reasoningEnabled() {
    return this.session?.reasoningEnabled || false;
  }
  
  get reasoningEffort() {
    return this.session?.reasoningEffort || 'medium';
  }
  
  // ==================== 运行时状态查询 ====================
  
  /**
   * 是否有活跃的活动（流式或队列中有任务）
   * @returns {boolean}
   */
  hasActiveActivities() {
    throw new Error('Method not implemented: hasActiveActivities');
  }
  
  /**
   * 获取队列状态
   * @returns {Object}
   */
  getQueueStatus() {
    throw new Error('Method not implemented: getQueueStatus');
  }
  
  // ==================== 核心交互方法 ====================
  
  /**
   * 发送消息
   * @param {Object} params - 发送参数
   * @param {string} params.content - 消息内容
   * @param {boolean} [params.reasoningEnabled] - 是否启用 reasoning
   * @param {string} [params.reasoningEffort] - reasoning 强度
   * @returns {Promise<Object>} 结果
   */
  async sendMessage(params) {
    throw new Error('Method not implemented: sendMessage');
  }
  
  /**
   * 停止生成
   */
  stopGeneration() {
    throw new Error('Method not implemented: stopGeneration');
  }
  
  /**
   * 清空消息
   */
  clearMessages() {
    throw new Error('Method not implemented: clearMessages');
  }
  
  /**
   * 删除指定消息
   * @param {string} messageId - 消息 ID
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    throw new Error('Method not implemented: deleteMessage');
  }
  
  // ==================== 服务管理 ====================
  
  /**
   * 设置聊天服务
   * @param {IProviderAPIService} service - 新的服务实例
   */
  setService(service) {
    throw new Error('Method not implemented: setService');
  }
  
  /**
   * 获取当前服务
   * @returns {IProviderAPIService}
   */
  getService() {
    return this.chatService;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.IChat = IChat;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IChat;
}
