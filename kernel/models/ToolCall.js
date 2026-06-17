export class ToolCall {
  constructor(id = null, toolName = '', input = {}) {
    this.id = id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.toolName = toolName;
    this.input = input;
    this.status = 'pending';
    this.result = null;
    this.error = null;
    this.startedAt = null;
    this.completedAt = null;
  }

  markStarted() { this.status = 'running'; this.startedAt = Date.now(); return this; }
  markCompleted(result) { this.status = 'completed'; this.result = result; this.completedAt = Date.now(); return this; }
  markFailed(error) { this.status = 'failed'; this.error = error; this.completedAt = Date.now(); return this; }
  toJSON() { return { id: this.id, toolName: this.toolName, input: this.input, status: this.status, result: this.result, error: this.error, startedAt: this.startedAt, completedAt: this.completedAt }; }
  static fromJSON(data) { const tc = new ToolCall(data.id, data.toolName, data.input); tc.status = data.status; tc.result = data.result; tc.error = data.error; tc.startedAt = data.startedAt; tc.completedAt = data.completedAt; return tc; }
}

export default ToolCall;