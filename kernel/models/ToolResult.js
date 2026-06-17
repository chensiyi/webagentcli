export class ToolResult {
  constructor(opts = {}) {
    this.toolCallId = opts.toolCallId || null;
    this.status = opts.status || 'pending';
    this.output = opts.output ?? null;
    this.error = opts.error || null;
    this.duration = opts.duration || 0;
    this.metadata = opts.metadata || {};
  }

  isSuccess() { return this.status === 'success'; }
  isFailed() { return this.status === 'failed'; }
  isPending() { return this.status === 'pending'; }

  toJSON() {
    return {
      toolCallId: this.toolCallId, status: this.status,
      output: this.output, error: this.error, duration: this.duration, metadata: this.metadata
    };
  }

  static fromJSON(data) { return new ToolResult(data); }
  static success(toolCallId, output, duration = 0) { return new ToolResult({ toolCallId, status: 'success', output, duration }); }
  static failed(toolCallId, error, duration = 0) { return new ToolResult({ toolCallId, status: 'failed', error, duration }); }
}

export default ToolResult;