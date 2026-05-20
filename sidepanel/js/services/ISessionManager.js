/**
 * ISessionManager - 会话管理器接口（抽象基类）
 * 
 * 定义会话管理的标准接口，所有具体实现必须继承此基类。
 * 
 * 职责：
 * - 定义会话管理的标准方法签名
 * - 提供默认的空实现（便于子类继承）
 * - 不包含具体业务逻辑
 * 
 * 设计原则：
 * 1. I 前缀表示这是一个接口规范
 * 2. 使用者可以实现自己的 ISessionManager 并替换
 * 3. 业务逻辑在具体实现类中（如 SessionController）
 * 
 * 使用示例：
 * ```javascript
 * class MySessionManagerImpl extends ISessionManager {
 *   createSession(options) {
 *     // 实现具体逻辑
 *   }
 * }
 * ```
 */

class ISessionManager {
  /**
   * @param {EventBus} eventBus - 事件总线实例
   * @param {Object} storage - 存储接口（默认使用 chrome.storage.local）
   */
  constructor(eventBus, storage = null) {
    if (new.target === ISessionManager) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    
    this.eventBus = eventBus;
    this.storage = storage || chrome.storage.local;
  }

  // ==================== 会话管理 ====================

  /**
   * 创建新会话
   * @param {Object} options 
   * @param {string} [options.title] - 会话标题
   * @param {boolean} [options.persist=true] - 是否立即持久化
   * @returns {Session} 新创建的会话
   */
  createSession(options = {}) {
    throw new Error('Method not implemented: createSession');
  }

  /**
   * 加载指定会话
   * @param {string} sessionId 
   * @returns {Session|null}
   */
  loadSession(sessionId) {
    throw new Error('Method not implemented: loadSession');
  }

  /**
   * 删除会话
   * @param {string} sessionId 
   * @returns {boolean}
   */
  deleteSession(sessionId) {
    throw new Error('Method not implemented: deleteSession');
  }

  /**
   * 获取当前会话
   * @returns {Session|null}
   */
  getCurrentSession() {
    throw new Error('Method not implemented: getCurrentSession');
  }

  /**
   * 获取所有会话列表
   * @returns {Array<Session>}
   */
  getAllSessions() {
    throw new Error('Method not implemented: getAllSessions');
  }

  /**
   * 更新会话标题
   * @param {string} sessionId 
   * @param {string} title 
   * @returns {boolean}
   */
  updateSessionTitle(sessionId, title) {
    throw new Error('Method not implemented: updateSessionTitle');
  }

  /**
   * 更新会话（通用）
   * @param {string} sessionId 
   * @param {Function} updater - 接收会话对象并执行修改
   * @returns {boolean}
   */
  updateSession(sessionId, updater) {
    throw new Error('Method not implemented: updateSession');
  }

  // ==================== Chat 实例管理 ====================

  /**
   * ⚠️ TODO: 待清理 - Chat 管理已移至 ServiceCenter
   * 
   * 获取或创建 Chat 实例
   * @param {string} sessionId - 会话 ID
   * @param {IProviderAPIService} chatService - Provider API 服务实例
   * @returns {IChat} Chat 实例
   */
  getOrCreateChat(sessionId, chatService) {
    throw new Error('Method not implemented: getOrCreateChat');
  }

  /**
   * ⚠️ TODO: 待清理 - Chat 管理已移至 ServiceCenter
   * 
   * 获取当前会话的 Chat 实例
   * @param {IProviderAPIService} chatService - Provider API 服务实例
   * @returns {IChat} Chat 实例
   */
  getCurrentChat(chatService) {
    throw new Error('Method not implemented: getCurrentChat');
  }

  /**
   * 清除 Chat 实例缓存
   * @param {string} [sessionId] - 可选，指定清除某个会话的 Chat
   */
  clearChatCache(sessionId = null) {
    throw new Error('Method not implemented: clearChatCache');
  }

  // ==================== 消息管理 ====================

  /**
   * 添加消息到当前会话
   * @param {Message} message 
   * @returns {Promise<boolean>}
   */
  async addMessage(message) {
    throw new Error('Method not implemented: addMessage');
  }

  /**
   * 批量添加消息
   * @param {Array<Message>} messages 
   * @returns {Promise<boolean>}
   */
  async addMessages(messages) {
    throw new Error('Method not implemented: addMessages');
  }

  /**
   * 更新消息
   * @param {string} messageId 
   * @param {Function} updater 
   * @returns {boolean}
   */
  updateMessage(messageId, updater) {
    throw new Error('Method not implemented: updateMessage');
  }

  /**
   * 流式分片更新消息内容
   * @param {string} messageId 
   * @param {Object} chunk - { content?: string, reasoning_content?: string }
   * @returns {boolean}
   */
  streamChunkMessage(messageId, chunk) {
    throw new Error('Method not implemented: streamChunkMessage');
  }

  /**
   * 删除消息
   * @param {string} messageId 
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    throw new Error('Method not implemented: deleteMessage');
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ISessionManager = ISessionManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ISessionManager;
}
