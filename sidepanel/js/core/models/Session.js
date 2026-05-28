/**
 * 会话模型
 */

class Session extends window.BaseModel {
  constructor(options = {}) {
    super(options);
    this.title = options.title || '新对话';
    this.messages = options.messages || [];
    this.metadata = options.metadata || {};
    
    // 思考模式配置（单一变量）
    // 'off' 表示关闭，其他值表示开启并使用对应强度
    this.reasoningEffort = options.reasoningEffort || 'medium'; // 'off' | 'low' | 'medium' | 'high'
    
    // 运行时状态（不持久化）
    this.port = null;
    this.isStreaming = false;
  }
  
  /**
   * 添加消息
   */
  addMessage(message) {
    this.messages.push(message);
    this.touch();
  }
  
  /**
   * 删除消息
   */
  removeMessage(messageId) {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages.splice(index, 1);
      this.touch();
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
    
    this.touch();
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
    this.touch();
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
      ...super.toJSON(),
      title: this.title,
      messages: this.messages.map(m => m.toJSON ? m.toJSON() : m),
      metadata: this.metadata,
      reasoningEffort: this.reasoningEffort
    };
  }
  
  /**
   * 从纯对象创建
   */
  static fromJSON(data) {
    const session = new Session(data);
    // 实例化消息对象
    if (data.messages && Array.isArray(data.messages)) {
      session.messages = data.messages.map(m => 
        m instanceof window.Message ? m : window.Message.fromJSON(m)
      );
    }
    return session;
  }
}

// 导出到全局
window.Session = Session;