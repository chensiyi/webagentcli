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
    
    // 思考模式配置
    this.thinkingEffort = options.thinkingEffort || 'off'; // 'off' | 'low' | 'medium' | 'high'
    
    //TODO: 增加工具配置
    //this.tools = options.tools || [];

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
      metadata: this.metadata,
      thinkingEffort: this.thinkingEffort
    };
  }
  
  /**
   * 从纯对象创建
   */
  static fromJSON(data) {
    return new Session(data);
  }
}

// 导出到全局
window.Session = Session;
