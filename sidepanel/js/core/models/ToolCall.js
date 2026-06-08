/**
 * ToolCall - AI 工具调用意图（事实记录）
 *
 * 职责：
 * 1. 记录 AI 在某轮希望执行的工具调用
 * 2. 不含执行结果（结果由 ToolResult 独立记录）
 * 3. 不含协议字段（OpenAI 协议转换在 MessageStructure 中）
 *
 * 设计原则：
 * - 纯数据：仅表达"AI 想用什么工具、参数是什么"
 * - 不可变：创建后字段不再变更
 * - 生命周期：随 Message 一同持久化（作为 Message 的子对象）
 */
class ToolCall {
  /**
   * @param {Object} params
   * @param {string} params.id - 唯一标识（如 'call_abc123'）
   * @param {string} params.toolName - 工具名（对应 ToolDefinition.name）
   * @param {Object} [params.arguments={}] - 工具参数（对象形式，非 JSON 字符串）
   */
  constructor({ id, toolName, arguments: args = {} } = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('ToolCall: id must be a non-empty string');
    }
    if (!toolName || typeof toolName !== 'string') {
      throw new Error('ToolCall: toolName must be a non-empty string');
    }
    if (args && typeof args !== 'object') {
      throw new Error('ToolCall: arguments must be an object');
    }

    this.id = id;
    this.toolName = toolName;
    this.arguments = args;

    Object.freeze(this.arguments);
    Object.freeze(this);
  }

  toJSON() {
    return {
      id: this.id,
      toolName: this.toolName,
      arguments: this.arguments
    };
  }

  static fromJSON(obj) {
    if (!obj) return null;
    return new ToolCall(obj);
  }
}

if (typeof window !== 'undefined') {
  window.ToolCall = ToolCall;
}