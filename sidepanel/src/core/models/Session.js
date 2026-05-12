/**
 * Session - 核心业务模型（协议无关）
 * 
 * 表示一个聊天会话，包含多条消息。
 * 不包含任何 UI 或协议相关的字段。
 */

class Session {
  /**
   * @param {Object} params
   * @param {string} [params.id] - 唯一标识（可选，自动生成）
   * @param {string} [params.title] - 会话标题
   * @param {Array<Message>} [params.messages] - 消息列表
   * @param {number} [params.created_at] - 创建时间戳
   * @param {number} [params.updated_at] - 更新时间戳
   * @param {Object} [params.metadata] - 元数据
   */
  constructor({
    id = crypto.randomUUID(),
    title = '新会话',
    messages = [],
    created_at = Date.now(),
    updated_at = Date.now(),
    metadata = {}
  } = {}) {
    this.id = id;
    this.title = title;
    this.messages = messages;
    this.created_at = created_at;
    this.updated_at = updated_at;
    this.metadata = metadata;
  }

  /**
   * 添加消息
   * @param {Message} message 
   */
  addMessage(message) {
    this.messages.push(message);
    this.updated_at = Date.now();
  }

  /**
   * 更新消息
   * @param {string} messageId 
   * @param {Function} updater - 更新函数，接收原消息返回新消息
   */
  updateMessage(messageId, updater) {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages[index] = updater(this.messages[index]);
      this.updated_at = Date.now();
      return true;
    }
    return false;
  }

  /**
   * 删除消息
   * @param {string} messageId 
   */
  deleteMessage(messageId) {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages.splice(index, 1);
      this.updated_at = Date.now();
      return true;
    }
    return false;
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage() {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  /**
   * 获取消息数量
   */
  getMessageCount() {
    return this.messages.length;
  }

  /**
   * 清空所有消息
   */
  clearMessages() {
    this.messages = [];
    this.updated_at = Date.now();
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      messages: this.messages.map(m => m.toJSON ? m.toJSON() : m),
      created_at: this.created_at,
      updated_at: this.updated_at,
      metadata: this.metadata
    };
  }

  /**
   * 从普通对象创建 Session 实例
   * @param {Object} obj 
   * @param {typeof Message} MessageClass - Message 构造函数
   */
  static fromJSON(obj, MessageClass) {
    const messages = (obj.messages || []).map(m => 
      MessageClass ? MessageClass.fromJSON(m) : m
    );
    
    return new Session({
      ...obj,
      messages
    });
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.Session = Session;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Session;
}
