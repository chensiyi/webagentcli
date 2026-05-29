/**
 * Message - 消息原型定义
 * 
 * 职责：
 * 1. 定义消息的角色枚举 (Role)
 * 2. 定义核心消息数据结构，支持纯文本和富媒体块内容
 * 3. 提供基础的消息状态判断逻辑
 */

// =============================================================================
// 角色枚举
// =============================================================================
const Role = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool'
};

// =============================================================================
// 消息类
// =============================================================================
class Message extends window.BaseModel {
  /**
   * @param {Object} options
   * @param {string} options.role - 角色 (Role)
   * @param {string|Array} options.content - 消息内容（字符串或富媒体块数组）
   * @param {string} [options.id] - 消息唯一 ID
   * @param {number} [options.timestamp] - 时间戳
   * @param {string} [options.reasoning_content] - 推理/思考内容
   * @param {Array} [options.tool_calls] - 工具调用列表 (OpenAI 格式兼容)
   * @param {string} [options.tool_call_id] - 工具调用 ID (Role.TOOL 时使用)
   * @param {Object} [options.metadata] - 额外元数据
   */
  constructor(options = {}) {
    super(options);
    this.role = options.role || Role.USER;
    this.content = options.content || '';
    this.timestamp = options.timestamp || this.createdAt;
    
    // 扩展字段
    this.reasoning_content = options.reasoning_content || null;
    this.tool_calls = options.tool_calls || null;
    this.tool_call_id = options.tool_call_id || null;
    this.metadata = options.metadata || {};
  }
  
  /**
   * 判断内容是否为富媒体块数组
   */
  isRichContent() {
    return Array.isArray(this.content);
  }
  
  /**
   * 获取纯文本内容
   */
  getText() {
    if (typeof this.content === 'string') {
      return this.content;
    }
    if (Array.isArray(this.content)) {
      return this.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n\n');
    }
    return '';
  }

  /**
   * 判断是否包含工具调用
   */
  hasToolCalls() {
    if (this.tool_calls && this.tool_calls.length > 0) return true;
    if (this.isRichContent()) {
      return this.content.some(block => block.type === 'tool_use');
    }
    return false;
  }
  
  /**
   * 状态判断
   */
  isUser() { return this.role === Role.USER; }
  isAssistant() { return this.role === Role.ASSISTANT; }
  isSystem() { return this.role === Role.SYSTEM; }
  isTool() { return this.role === Role.TOOL; }
  
  /**
   * 序列化
   */
  toJSON() {
    return {
      ...super.toJSON(),
    ...(this.role && { role: this.role }),
    ...(this.content && { content: this.content }),
    ...(this.timestamp && { timestamp: this.timestamp }),
    ...(this.reasoning_content && { reasoning_content: this.reasoning_content }),
    ...(this.tool_calls && { tool_calls: this.tool_calls }),
    ...(this.tool_call_id && { tool_call_id: this.tool_call_id }),
    ...((Object.keys(this.metadata || {}).length > 0) && { metadata: this.metadata })
    };
  }
  
  /**
   * 反序列化
   */
  static fromJSON(data) {
    return new Message(data);
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.Role = Role;
  window.Message = Message;
}
