/**
 * Message - 消息原型定义
 *
 * 职责：
 * 1. 定义消息的角色枚举 (Role)
 * 2. 定义核心消息数据结构，支持纯文本和富媒体块内容
 * 3. 工具调用作为子对象（toolCalls: ToolCall[]）随消息持久化
 *
 * 设计原则：
 * - 工具相关字段是消息的子对象，不是独立的 Session 索引
 * - 协议字段 (OpenAI tool_calls) 隔离在 MessageContent.MessageStructure
 * - role 一旦设置不可修改
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
   * @param {Array<ToolCall>} [options.toolCalls] - 工具调用列表（子对象数组）
   * @param {string} [options.toolCallId] - 工具调用 ID (Role.TOOL 时使用)
   * @param {Object} [options.metadata] - 额外元数据
   */
  constructor(options = {}) {
    super(options);
    this._role = options.role || Role.USER;
    this.content = options.content || '';
    this.timestamp = options.timestamp || this.createdAt;

    // 扩展字段
    this.reasoning_content = options.reasoning_content || null;
    this.toolCallId = options.toolCallId || null;
    this.metadata = options.metadata || {};

    // 工具调用列表（子对象数组）
    this.toolCalls = [];
    if (Array.isArray(options.toolCalls)) {
      options.toolCalls.forEach(tc => this.addToolCall(tc));
    }
  }

  /** 角色：只读，构造时设定 */
  get role() { return this._role; }

  /**
   * 添加工具调用
   * @param {ToolCall|Object} toolCall
   */
  addToolCall(toolCall) {
    if (!toolCall) return;
    const tc = toolCall instanceof window.ToolCall
      ? toolCall
      : window.ToolCall.fromJSON(toolCall);
    if (!tc) return;
    if (this.toolCalls.some(existing => existing.id === tc.id)) return; // 防止重复
    this.toolCalls.push(tc);
    this.touch();
  }

  /**
   * 通过 ID 获取工具调用
   */
  getToolCall(id) {
    return this.toolCalls.find(tc => tc.id === id) || null;
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
    return this.toolCalls.length > 0;
  }

  /**
   * 状态判断
   */
  isUser() { return this._role === Role.USER; }
  isAssistant() { return this._role === Role.ASSISTANT; }
  isSystem() { return this._role === Role.SYSTEM; }
  isTool() { return this._role === Role.TOOL; }

  /**
   * 序列化（toolCalls 作为子对象数组嵌套写入）
   */
  toJSON() {
    return {
      ...super.toJSON(),
      ...(this._role && { role: this._role }),
      ...(this.content && { content: this.content }),
      ...(this.timestamp && { timestamp: this.timestamp }),
      ...(this.reasoning_content && { reasoning_content: this.reasoning_content }),
      ...(this.toolCallId && { toolCallId: this.toolCallId }),
      ...(this.toolCalls.length > 0 && { toolCalls: this.toolCalls.map(tc => tc.toJSON()) }),
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