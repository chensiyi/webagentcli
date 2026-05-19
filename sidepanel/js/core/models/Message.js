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
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      timestamp: this.timestamp,
      tool_calls: this.tool_calls,
      tool_call_id: this.tool_call_id,
      reasoning_content: this.reasoning_content,
      metadata: this.metadata
    };
  }
  
  /**
   * 从纯对象创建
   */
  static fromJSON(data) {
    console.log('[Message] fromJSON called:', {
      id: data.id,
      role: data.role,
      contentLength: data.content?.length || 0,
      reasoningLength: data.reasoning_content?.length || 0,
      hasReasoningField: 'reasoning_content' in data
    });
    return new Message(data);
  }
}

// 导出到全局
window.Message = Message;
