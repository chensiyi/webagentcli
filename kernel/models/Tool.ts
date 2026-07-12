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
  toolName: string | null;
  timestamp: number;
  status: string;
  output: unknown;
  error: unknown;
  duration: number;
  metadata: Record<string, unknown>;

  constructor(opts: Record<string, unknown> = {}) {
    this.toolCallId = (opts.toolCallId as string) || null;
    this.toolName = (opts.toolName as string) || null;
    // 记录产生时间：未显式传入时取构造时刻，供调用历史按时间过滤
    this.timestamp = (opts.timestamp as number) || Date.now();
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
      toolCallId: this.toolCallId,
      toolName: this.toolName,
      timestamp: this.timestamp,
      status: this.status,
      output: this.output, error: this.error, duration: this.duration, metadata: this.metadata
    };
  }

  static fromJSON(data: Record<string, unknown>): ToolResult { return new ToolResult(data); }
  static success(toolCallId: string, output: unknown, duration = 0, toolName: string | null = null): ToolResult {
    return new ToolResult({ toolCallId, status: 'success', output, duration, toolName });
  }
  static failed(toolCallId: string, error: unknown, duration = 0, toolName: string | null = null): ToolResult {
    return new ToolResult({ toolCallId, status: 'failed', error, duration, toolName });
  }
}

// ─── Tool 来源（注册主体） ─────────────────────────
// 用于在「同一注册表」里区分工具从哪来，供 UI 分组、LLM 工具集裁剪、门控策略复用。
export const ToolSource = {
  /** 内核内置（RunUserScript / ManageUserScripts 等），启动即注册 */
  BUILTIN: 'builtin',
  /** 用户脚本经 @tool grant 自动注册（P2 预装/自动注册） */
  SCRIPT: 'script',
  /** 页内结构化工具（P1 in-page Playwright MCP 范式，由 content script 注入） */
  PAGE: 'page',
  /** 外部协议接入（WebMCP 等，当前未纳入计划，仅占位） */
  MCP: 'mcp',
} as const;
export type ToolSourceValue = typeof ToolSource[keyof typeof ToolSource];

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
  /** 来源：builtin / script / page / mcp（见 ToolSource） */
  source: string;
  /** 业务类别（如 'navigation' / 'extraction' / 'user-script'），UI 分组用 */
  category: string;
  /** 自由标签，便于按场景过滤 */
  tags: string[];
  /** 危险标记：为 true 时代表「可能改账户/破坏性」动作，必须人工确认（安全铁律） */
  danger: boolean;
  /** 工具版本，供自动注册场景做幂等更新判断 */
  version: string;

  constructor(opts: Record<string, unknown> = {}) {
    this.name = (opts.name as string) || '';
    this.description = (opts.description as string) || '';
    this.capabilities = (opts.capabilities as string[]) || [];
    this.inputSchema = opts.inputSchema || opts.parameters || null;
    this.outputSchema = opts.outputSchema || null;
    this.enabled = (opts.enabled as boolean) !== false;
    this.handler = (opts.handler as ((args: unknown, ctx: unknown) => Promise<unknown> | unknown)) || null;
    this.metadata = (opts.metadata as Record<string, unknown>) || {};
    this.source = (opts.source as string) || ToolSource.BUILTIN;
    this.category = (opts.category as string) || 'general';
    this.tags = (opts.tags as string[]) || [];
    this.danger = (opts.danger as boolean) === true;
    this.version = (opts.version as string) || '1.0';
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
      metadata: this.metadata,
      source: this.source,
      category: this.category,
      tags: this.tags,
      danger: this.danger,
      version: this.version,
    };
  }
}