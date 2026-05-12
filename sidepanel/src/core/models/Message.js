/**
 * Message - 核心业务模型（协议无关）
 * 
 * 表示聊天中的一条消息，不包含任何 API 标准相关的字段。
 * 所有协议转换由 Adapter 层负责。
 * 
 * 支持两种内容格式：
 * 1. 纯文本：content 为字符串
 * 2. 多模态：content 为 MediaContent 数组
 */

class Message {
  /**
   * @param {Object} params
   * @param {string} [params.id] - 唯一标识（可选，自动生成）
   * @param {'user'|'assistant'|'system'|'tool'} params.role - 消息角色
   * @param {string|Array} params.content - 消息内容（文本或多模态数组）
   * @param {Array} [params.tool_calls] - 工具调用列表
   * @param {string} [params.tool_call_id] - 工具结果关联ID（仅 tool 角色）
   * @param {Object} [params.metadata] - 元数据（思考过程、时间戳等）
   */
  constructor({
    id = crypto.randomUUID(),
    role,
    content,
    tool_calls = [],
    tool_call_id = null,
    metadata = {}
  }) {
    // 验证必填字段
    if (!role || !['user', 'assistant', 'system', 'tool'].includes(role)) {
      throw new Error(`Invalid message role: ${role}`);
    }
    
    if (content === undefined || content === null) {
      throw new Error('Message content is required');
    }

    this.id = id;
    this.role = role;
    this.content = content;
    this.tool_calls = tool_calls;
    this.tool_call_id = tool_call_id;
    this.metadata = {
      timestamp: Date.now(),
      ...metadata
    };

    // 冻结对象，防止意外修改
    Object.freeze(this);
  }

  /**
   * 判断是否为文本消息
   */
  isText() {
    return typeof this.content === 'string';
  }

  /**
   * 判断是否为多模态消息
   */
  isMultimodal() {
    return Array.isArray(this.content) && this.content.length > 0;
  }

  /**
   * 获取多媒体内容列表
   * @returns {Array<MediaContent>}
   */
  getMediaContents() {
    if (this.isMultimodal()) {
      return this.content;
    }
    // 如果是纯文本，转换为单个 MediaContent
    if (typeof window !== 'undefined' && window.MediaContent) {
      return [window.MediaContent.createText(this.content)];
    }
    return [];
  }

  /**
   * 判断是否包含工具调用
   */
  hasToolCalls() {
    return this.tool_calls && this.tool_calls.length > 0;
  }

  /**
   * 判断是否为工具结果消息
   */
  isToolResult() {
    return this.role === 'tool' && !!this.tool_call_id;
  }

  /**
   * 获取纯文本内容（多模态消息提取文本部分）
   */
  getTextContent() {
    if (typeof this.content === 'string') {
      return this.content;
    }
    
    if (Array.isArray(this.content)) {
      return this.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    }
    
    return '';
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      tool_calls: this.tool_calls,
      tool_call_id: this.tool_call_id,
      metadata: this.metadata
    };
  }

  /**
   * 从普通对象创建 Message 实例
   */
  static fromJSON(obj) {
    return new Message(obj);
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.Message = Message;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Message;
}
