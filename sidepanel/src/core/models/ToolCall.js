/**
 * ToolCall - 工具调用业务模型（协议无关）
 */

class ToolCall {
  constructor({
    id = crypto.randomUUID(),
    name,
    arguments: args = {},
    status = 'pending',
    result = null,
    error = null
  }) {
    this.id = id;
    this.name = name;
    this.arguments = args;
    this.status = status; // pending | executing | completed | failed
    this.result = result;
    this.error = error;
    this.created_at = Date.now();
    this.updated_at = Date.now();
  }

  markExecuting() {
    this.status = 'executing';
    this.updated_at = Date.now();
  }

  markCompleted(result) {
    this.status = 'completed';
    this.result = result;
    this.updated_at = Date.now();
  }

  markFailed(error) {
    this.status = 'failed';
    this.error = error;
    this.updated_at = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      arguments: this.arguments,
      status: this.status,
      result: this.result,
      error: this.error,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  static fromJSON(obj) {
    return new ToolCall(obj);
  }
}

if (typeof window !== 'undefined') {
  window.ToolCall = ToolCall;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ToolCall;
}
