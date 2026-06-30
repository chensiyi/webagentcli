export class ToolResult {
  toolCallId: string | null;
  status: string;
  output: unknown;
  error: unknown;
  duration: number;
  metadata: Record<string, unknown>;

  constructor(opts: Record<string, unknown> = {}) {
    this.toolCallId = (opts.toolCallId as string) || null;
    this.status = (opts.status as string) || 'pending';
    this.output = opts.output ?? null;
    this.error = opts.error || null;
    this.duration = (opts.duration as number) || 0;
    this.metadata = (opts.metadata as Record<string, unknown>) || {};
  }

  isSuccess(): boolean { return this.status === 'success'; }
  isFailed(): boolean { return this.status === 'failed'; }
  isPending(): boolean { return this.status === 'pending'; }

  toJSON(): Record<string, unknown> {
    return {
      toolCallId: this.toolCallId, status: this.status,
      output: this.output, error: this.error, duration: this.duration, metadata: this.metadata
    };
  }

  static fromJSON(data: Record<string, unknown>): ToolResult { return new ToolResult(data); }
  static success(toolCallId: string, output: unknown, duration = 0): ToolResult { return new ToolResult({ toolCallId, status: 'success', output, duration }); }
  static failed(toolCallId: string, error: unknown, duration = 0): ToolResult { return new ToolResult({ toolCallId, status: 'failed', error, duration }); }
}