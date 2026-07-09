/**
 * Tool — 工具统一模型
 *
 * 替代 ToolDefinition + IToolService 的组合。
 * 一个 Tool 对象即包含工具定义（供 LLM 识别），也包含执行能力。
 * ToolCall 和 ToolResult 作为工具调用的生命周期记录，整合在此。
 */

// ─── ToolCall（工具调用记录） ──────────────────────────

import { genId } from '../utils/id.js';

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
    this.id = id || genId('tool');
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

// ─── ToolResult（工具执行结果） ────────────────────────

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

// ─── Tool（工具定义 + 执行器） ─────────────────────────

export class Tool {
  name: string;
  description: string;
  capabilities: string[];
  inputSchema: unknown;
  outputSchema: unknown;
  enabled: boolean;
  handler: ((args: unknown, ctx: unknown) => Promise<unknown> | unknown) | null;
  metadata: Record<string, unknown>;

  constructor(opts: Record<string, unknown> = {}) {
    this.name = (opts.name as string) || '';
    this.description = (opts.description as string) || '';
    this.capabilities = (opts.capabilities as string[]) || [];
    this.inputSchema = opts.inputSchema || opts.parameters || null;
    this.outputSchema = opts.outputSchema || null;
    this.enabled = (opts.enabled as boolean) !== false;
    this.handler = (opts.handler as ((args: unknown, ctx: unknown) => Promise<unknown> | unknown)) || null;
    this.metadata = (opts.metadata as Record<string, unknown>) || {};
  }

  /**
   * 转换为 OpenAI function calling 格式
   */
  toOpenAIFunction(): { type: string; function: { name: string; description: string; parameters: unknown } } {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.inputSchema || { type: 'object', properties: {} }
      }
    };
  }

  /**
   * 可序列化快照（用于跨进程 RPC 响应）。
   * 显式排除 handler 等函数字段——否则 chrome.runtime.sendMessage
   * 用结构化克隆会抛 "Could not serialize message"。
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      capabilities: this.capabilities,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      enabled: this.enabled,
      metadata: this.metadata
    };
  }
}