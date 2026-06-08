/**
 * ToolResult - 工具执行结果（事实记录）
 *
 * 职责：
 * 1. 记录某个 ToolCall 的执行结果
 * 2. 不可变：一旦写入不再修改（修正需创建新的 ToolResult）
 *
 * 设计原则：
 * - 纯数据：仅表达"工具执行得到什么结果"
 * - 不可变：创建后字段不再变更
 * - 引用完整：toolCallId 必须对应一个已存在的 ToolCall
 */
class ToolResult {
  /**
   * @param {Object} params
   * @param {string} params.toolCallId - 关联的 ToolCall.id
   * @param {'success'|'failed'|'cancelled'} params.status - 执行状态
   * @param {*} [params.output=null] - 执行输出（任意可序列化值）
   * @param {string|null} [params.error=null] - 错误消息
   * @param {number} [params.duration=0] - 执行耗时（毫秒）
   */
  constructor({ toolCallId, status, output = null, error = null, duration = 0 } = {}) {
    if (!toolCallId || typeof toolCallId !== 'string') {
      throw new Error('ToolResult: toolCallId must be a non-empty string');
    }
    if (!['success', 'failed', 'cancelled'].includes(status)) {
      throw new Error('ToolResult: status must be one of success|failed|cancelled');
    }
    if (typeof duration !== 'number' || duration < 0) {
      throw new Error('ToolResult: duration must be a non-negative number');
    }
    if (status === 'success' && error) {
      throw new Error('ToolResult: success result cannot have error');
    }

    this.toolCallId = toolCallId;
    this.status = status;
    this.output = output;
    this.error = error;
    this.duration = duration;

    Object.freeze(this);
  }

  isSuccess() { return this.status === 'success'; }
  isFailed() { return this.status === 'failed'; }
  isCancelled() { return this.status === 'cancelled'; }

  toJSON() {
    return {
      toolCallId: this.toolCallId,
      status: this.status,
      ...(this.output !== null && { output: this.output }),
      ...(this.error && { error: this.error }),
      duration: this.duration
    };
  }

  static fromJSON(obj) {
    if (!obj) return null;
    return new ToolResult(obj);
  }
}

if (typeof window !== 'undefined') {
  window.ToolResult = ToolResult;
}