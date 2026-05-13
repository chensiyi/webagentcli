/**
 * 会话模型
 */

class Session {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.title = options.title || '新对话';
    this.messages = options.messages || [];
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || Date.now();
    this.metadata = options.metadata || {};
    
    // 运行时状态（不持久化）
    this.port = null;
    this.isStreaming = false;
  }
  
  generateId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 添加消息
   */
  addMessage(message) {
    this.messages.push(message);
    this.updatedAt = Date.now();
  }
  
  /**
   * 删除消息
   */
  removeMessage(messageId) {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages.splice(index, 1);
      this.updatedAt = Date.now();
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
   * 清空消息
   */
  clearMessages() {
    this.messages = [];
    this.updatedAt = Date.now();
  }
  
  /**
   * 判断是否有消息
   */
  hasMessages() {
    return this.messages.length > 0;
  }
  
  /**
   * 转换为纯对象（用于序列化）
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      messages: this.messages.map(m => m.toJSON ? m.toJSON() : m),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata
    };
  }
  
  /**
   * 从纯对象创建
   */
  static fromJSON(data) {
    const session = new Session(data);
    // 恢复消息为 Message 对象
    if (data.messages && Array.isArray(data.messages)) {
      session.messages = data.messages.map(m => 
        window.Message ? window.Message.fromJSON(m) : m
      );
    }
    return session;
  }
}

// 导出到全局
window.Session = Session;
