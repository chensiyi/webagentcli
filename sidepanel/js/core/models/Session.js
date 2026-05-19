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
    this.updated_at = this.updatedAt; // 兼容旧版命名
    this.metadata = options.metadata || {};
    
    // Reasoning 配置（持久化）
    this.reasoningEnabled = options.reasoningEnabled || false;
    this.reasoningEffort = options.reasoningEffort || 'medium'; // 'low' | 'medium' | 'high'
    
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
    this.updated_at = this.updatedAt;
  }
  
  /**
   * 删除消息
   */
  removeMessage(messageId) {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages.splice(index, 1);
      this.updatedAt = Date.now();
      this.updated_at = this.updatedAt;
      return true;
    }
    return false;
  }
  
  /**
   * 更新消息（用于流式更新等场景）
   * @param {string} messageId 
   * @param {Function} updater - 接收消息对象并返回更新后的消息
   * @returns {boolean}
   */
  updateMessage(messageId, updater) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) return false;
    
    // 调用 updater 函数更新消息
    const result = updater(message);
    
    // 如果 updater 返回了新对象，替换原消息
    if (result && result !== message) {
      const index = this.messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        this.messages[index] = result;
      }
    }
    
    this.updatedAt = Date.now();
    this.updated_at = this.updatedAt;
    return true;
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
    this.updated_at = this.updatedAt;
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
      updated_at: this.updated_at,
      metadata: this.metadata,
      reasoningEnabled: this.reasoningEnabled,
      reasoningEffort: this.reasoningEffort
    };
  }
  
  /**
   * 从纯对象创建
   */
  static fromJSON(data) {
    const session = new Session({
      ...data,
      // 确保 reasoningEnabled 有默认值。如果模型支持，新会话默认开启；旧数据保持原样
      reasoningEnabled: data.reasoningEnabled !== undefined ? data.reasoningEnabled : true
    });
    // 恢复消息为 Message 对象
    if (data.messages && Array.isArray(data.messages)) {
      session.messages = data.messages.map(m => 
        window.Message ? window.Message.fromJSON(m) : m
      );
    }
    // 确保 updated_at 同步
    session.updated_at = session.updatedAt;
    return session;
  }
}

// 导出到全局
window.Session = Session;
