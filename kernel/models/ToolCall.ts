export class ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  status: string;
  result: unknown;
  error: unknown;
  startedAt: number | null;
  completedAt: number | null;

  constructor(id: string | null = null, toolName: string = '', input: unknown = {}) {
    this.id = id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.toolName = toolName;
    this.input = input;
    this.status = 'pending';
    this.result = null;
    this.error = null;
    this.startedAt = null;
    this.completedAt = null;
  }

  markStarted(): this { this.status = 'running'; this.startedAt = Date.now(); return this; }
  markCompleted(result: unknown): this { this.status = 'completed'; this.result = result; this.completedAt = Date.now(); return this; }
  markFailed(error: unknown): this { this.status = 'failed'; this.error = error; this.completedAt = Date.now(); return this; }
  toJSON(): Record<string, unknown> { return { id: this.id, toolName: this.toolName, input: this.input, status: this.status, result: this.result, error: this.error, startedAt: this.startedAt, completedAt: this.completedAt }; }
  static fromJSON(data: Record<string, unknown>): ToolCall { const tc = new ToolCall(data.id as string, data.toolName as string, data.input); tc.status = data.status as string; tc.result = data.result; tc.error = data.error; tc.startedAt = data.startedAt as number; tc.completedAt = data.completedAt as number; return tc; }
}