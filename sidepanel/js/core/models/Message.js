/**
 * 消息模型
 * 简化的消息数据结构
 */

class Message {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.role = options.role; // 'user' | 'assistant' | 'system' | 'tool'
    this.content = options.content || '';
    this.timestamp = options.timestamp || Date.now();
    
    // 可选字段
    this.tool_calls = options.tool_calls || null;
    this.tool_call_id = options.tool_call_id || null;
    this.reasoning_content = options.reasoning_content || ''; // 推理/思考内容
    this.metadata = options.metadata || {};
  }
  
  generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 判断是否为用户消息
   */
  isUser() {
    return this.role === 'user';
  }
  
  /**
   * 判断是否为助手消息
   */
  isAssistant() {
    return this.role === 'assistant';
  }
  
  /**
   * 判断是否有工具调用
   */
  hasToolCalls() {
    return this.role === 'assistant' && this.tool_calls && this.tool_calls.length > 0;
  }
  
  /**
   * 转换为纯对象（用于序列化）
   */
  toJSON() {
    const result = {
      id: this.id,
      role: this.role,
      content: this.content,
      timestamp: this.timestamp
    };
    
    // 只添加非 null/undefined 的字段
    if (this.tool_calls && this.tool_calls.length > 0) {
      result.tool_calls = this.tool_calls;
    }
    if (this.tool_call_id) {
      result.tool_call_id = this.tool_call_id;
    }
    if (this.reasoning_content) {
      result.reasoning_content = this.reasoning_content;
    }
    if (this.metadata && Object.keys(this.metadata).length > 0) {
      result.metadata = this.metadata;
    }
    
    return result;
  }
  
  /**
   * 从纯对象创建
   */
  static fromJSON(data) {
    return new Message(data);
  }
}

// 导出到全局
window.Message = Message;
