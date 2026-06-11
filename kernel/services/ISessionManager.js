/**
 * ISessionManager - 会话存储接口（抽象基类）
 * 
 * 定义会话管理的标准接口，所有具体实现必须继承此基类。
 * 
 * 职责：
 * - 定义会话存储与消息持久化的标准方法签名
 * - 提供默认的空实现（便于子类继承）
 * - 不包含具体业务逻辑
 * 
 * 设计原则：
 * 1. I 前缀表示这是一个接口规范
 * 2. 使用者可以实现自己的 ISessionManager 并替换
 * 3. 业务逻辑在具体实现类中（如 SessionManager）
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
   * @param {IStorageManager} storage - 存储后端（必须实现 IStorageManager 接口）
   */
  constructor(eventBus, storage = null) {
    if (new.target === ISessionManager) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    
    this.eventBus = eventBus;
    this.storage = storage;
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
   * 获取指定会话
   * @param {string} sessionId
   * @returns {Session|null}
   */
  getSession(sessionId) {
    throw new Error('Method not implemented: getSession');
  }

  /**
   * 获取当前会话
   * @returns {Session|null}
   */
  getCurrentSession() {
    throw new Error('Method not implemented: getCurrentSession');
  }

  /**
   * 设置当前会话
   * @param {string|null} sessionId
   * @returns {Session|null}
   */
  setCurrentSession(sessionId) {
    throw new Error('Method not implemented: setCurrentSession');
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

  // ==================== 消息管理 ====================

  /**
   * 添加消息到目标会话
   * @param {Message} message 
   * @param {string|null} [sessionId]
   * @returns {Promise<boolean>}
   */
  async addMessage(message, sessionId = null) {
    throw new Error('Method not implemented: addMessage');
  }

  /**
   * 批量添加消息到目标会话
   * @param {Array<Message>} messages 
   * @param {string|null} [sessionId]
   * @returns {Promise<boolean>}
   */
  async addMessages(messages, sessionId = null) {
    throw new Error('Method not implemented: addMessages');
  }

  /**
   * 更新目标会话中的消息
   * @param {string} messageId 
   * @param {Function} updater 
   * @param {string|null} [sessionId]
   * @returns {boolean}
   */
  updateMessage(messageId, updater, sessionId = null) {
    throw new Error('Method not implemented: updateMessage');
  }

  /**
   * 流式分片更新目标会话中的消息内容
   * @param {string} messageId 
   * @param {Object} chunk - { content?: string, reasoning_content?: string }
   * @param {string|null} [sessionId]
   * @returns {boolean}
   */
  streamChunkMessage(messageId, chunk, sessionId = null) {
    throw new Error('Method not implemented: streamChunkMessage');
  }

  /**
   * 清空目标会话中的所有消息
   * @param {string|null} [sessionId]
   * @returns {boolean}
   */
  clearMessages(sessionId = null) {
    throw new Error('Method not implemented: clearMessages');
  }

  /**
   * 删除目标会话中的消息
   * @param {string} messageId 
   * @param {string|null} [sessionId]
   * @returns {boolean}
   */
  deleteMessage(messageId, sessionId = null) {
    throw new Error('Method not implemented: deleteMessage');
  }

  // ==================== 上下文管理 ====================

  /**
   * 获取用于 API 请求的消息窗口
   * @param {Session} session - 会话对象
   * @param {Object} settings - { autoContextTruncation: boolean, contextWindowSize?: number }
   * @returns {Array<Message>}
   */
  getContextWindow(session, settings = {}) {
    throw new Error('Method not implemented: getContextWindow');
  }

  /**
   * 基于 token 预算的消息截断（用于无 Provider 缓存的场景）
   * @param {Session} session - 会话对象
   * @param {Object} options - { contextLength, maxTokens, contextWindowRatio }
   * @returns {Array<Message>}
   */
  getMessagesByTokenBudget(session, options = {}) {
    throw new Error('Method not implemented: getMessagesByTokenBudget');
  }

  /**
   * 准备用于 API 发送的消息列表（应用上下文截断）
   * @param {Session} session - 会话对象
   * @param {Object} settings - 应用设置
   * @returns {Array<Message>}
   */
  getMessagesForAPI(session, settings = {}) {
    throw new Error('Method not implemented: getMessagesForAPI');
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ISessionManager = ISessionManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ISessionManager;
}
