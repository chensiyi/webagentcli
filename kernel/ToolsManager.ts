/**
 * ToolsManager — 工具管理器（替代 ToolRegistry + IToolService）
 *
 * 职责：
 * - 工具的注册、查询、生命周期管理
 * - 工具执行的统一入口（invoke）
 * - 按权限查询工具
 * - 执行审计
 *
 * 设计原则：
 * - 每个工具是一个 Tool 实例，通过名称标识
 * - 工具与能力（capability）绑定，供 CapabilityManager 检查
 * - invoke 封装了执行、计时、日志、结果包装的公共逻辑
 */
import { Log } from './services/Log.js';
import { Tool, ToolCall, ToolResult } from './models/Tool.js';

export class ToolsManager {
  private _tools: Map<string, Tool>;
  private _invocationHistory: ToolResult[];
  private _maxHistory: number;
  private _beforeInvoke: ((toolCall: ToolCall, context: Record<string, unknown>) => boolean | Promise<boolean>) | null;
  private _afterInvoke: ((result: ToolResult, context: Record<string, unknown>) => void) | null;

  constructor(options: { maxHistory?: number; beforeInvoke?: (toolCall: ToolCall, context: Record<string, unknown>) => boolean | Promise<boolean>; afterInvoke?: (result: ToolResult, context: Record<string, unknown>) => void } = {}) {
    this._tools = new Map();
    this._invocationHistory = [];
    this._maxHistory = options.maxHistory ?? 500;
    this._beforeInvoke = options.beforeInvoke ?? null;
    this._afterInvoke = options.afterInvoke ?? null;
  }

  // ─── 注册/注销 ────────────────────────────────────

  register(tool: Tool): this {
    if (!tool || !tool.name) throw new Error('[ToolsManager] Invalid tool: missing name');
    if (this._tools.has(tool.name)) throw new Error(`[ToolsManager] Tool "${tool.name}" already registered`);
    this._tools.set(tool.name, tool);
    return this;
  }

  registerAll(tools: Tool[]): this {
    tools.forEach(t => { try { this.register(t); } catch (e) { Log.warn('ToolsManager', (e as Error).message); } });
    return this;
  }

  unregister(name: string): this {
    this._tools.delete(name);
    return this;
  }

  // ─── 查询 ──────────────────────────────────────────

  get(name: string): Tool | null {
    return this._tools.get(name) || null;
  }

  getAll(): Tool[] {
    return Array.from(this._tools.values());
  }

  getEnabled(): Tool[] {
    const tools = Array.from(this._tools.values());
    return tools.length ? tools.filter(t => t.enabled !== false) : [];
  }

  getDisabled(): Tool[] {
    return Array.from(this._tools.values()).filter(t => t.enabled === false);
  }

  has(name: string): boolean {
    return this._tools.has(name);
  }

  getEnabledCount(): number {
    return this.getEnabled().length;
  }

  getTotalCount(): number {
    return this._tools.size;
  }

  // ─── 启用/禁用 ────────────────────────────────────

  enable(name: string): void {
    const t = this._tools.get(name);
    if (t) t.enabled = true;
  }

  disable(name: string): void {
    const t = this._tools.get(name);
    if (t) t.enabled = false;
  }

  // ─── LLM 接口 ────────────────────────────────────

  getDefinitionsForLLM(format = 'openai'): unknown[] {
    const enabled = this.getEnabled();
    if (format === 'openai') {
      return enabled.map(t => t.toOpenAIFunction());
    }
    return enabled;
  }

  findByCapability(capability: string): Tool[] {
    return this.getEnabled().filter(t => (t.capabilities || []).includes(capability));
  }

  // ─── 执行 ──────────────────────────────────────────

  /**
   * 执行工具调用
   * 统一处理：预处理钩子 → handler 调用 → 计时 → 结果包装 → 后置钩子 → 记录历史
   */
  async invoke(toolCall: ToolCall | Record<string, unknown>, context: Record<string, unknown> = {}): Promise<ToolResult> {
    const tc = toolCall instanceof ToolCall ? toolCall : new ToolCall(
      (toolCall as any).id,
      (toolCall as any).toolName || (toolCall as any).name || '',
      (toolCall as any).input ?? (toolCall as any).arguments ?? {}
    );
    const toolCallId = tc.id;
    const toolName = tc.toolName;

    // 1. 查找工具
    const tool = toolName ? this._tools.get(toolName) : null;
    if (!tool) {
      const result = new ToolResult({ toolCallId, status: 'failed', error: `Unknown tool: ${toolName || '(empty)'}` });
      this._recordInvocation(result);
      return result;
    }

    // 2. 前置钩子
    if (this._beforeInvoke) {
      let proceed = true;
      try {
        proceed = await this._beforeInvoke(tc, context);
      } catch (e) {
        Log.error('ToolsManager', 'beforeInvoke error:', e);
        proceed = false;
      }
      if (!proceed) {
        const result = new ToolResult({ toolCallId, status: 'failed', error: 'Tool invocation rejected by beforeInvoke hook' });
        this._recordInvocation(result);
        return result;
      }
    }

    // 3. 执行 handler
    const start = Date.now();
    let result: ToolResult;
    try {
      Log.info('ToolsManager', `Invoking: ${toolName} (callId=${toolCallId})`);
      const output = await tool.handler!(tc.input, context);

      // handler 可能直接返回 ToolResult
      if (output && typeof (output as any).isSuccess === 'function') {
        result = output as ToolResult;
      } else {
        const duration = Date.now() - start;
        Log.info('ToolsManager', `Completed: ${toolName} in ${duration}ms`);
        result = new ToolResult({ toolCallId, status: 'success', output, duration });
      }
    } catch (err) {
      const duration = Date.now() - start;
      const errMsg = (err as Error)?.message || String(err);
      Log.error('ToolsManager', `Failed: ${toolName} — ${errMsg}`);
      result = new ToolResult({ toolCallId, status: 'failed', error: errMsg, duration });
    }

    // 4. 后置钩子
    if (this._afterInvoke) {
      try { this._afterInvoke(result, context); } catch (e) { Log.error('ToolsManager', 'afterInvoke error:', e); }
    }

    // 5. 记录历史
    this._recordInvocation(result);
    return result;
  }

  // ─── 钩子 ──────────────────────────────────────────

  setBeforeInvoke(mw: (toolCall: ToolCall, context: Record<string, unknown>) => boolean | Promise<boolean>): void {
    this._beforeInvoke = mw;
  }

  setAfterInvoke(mw: (result: ToolResult, context: Record<string, unknown>) => void): void {
    this._afterInvoke = mw;
  }

  // ─── 调用历史 ──────────────────────────────────────

  getInvocationHistory(filters: { toolName?: string; status?: string; since?: number; limit?: number } = {}): ToolResult[] {
    let r = [...this._invocationHistory];
    if (filters.toolName) r = r.filter(e => {
      const callId = e.toolCallId || '';
      // 通过历史记录匹配 toolName
      return callId.includes(filters.toolName!);
    });
    if (filters.status) r = r.filter(e => e.status === filters.status);
    if (filters.since) r = r.filter(e => e.toolCallId && (e as any).timestamp >= filters.since);
    if (filters.limit && r.length > filters.limit) r = r.slice(-filters.limit);
    return r;
  }

  private _recordInvocation(result: ToolResult): void {
    this._invocationHistory.push(result);
    if (this._invocationHistory.length > this._maxHistory) this._invocationHistory.shift();
  }

  // ─── 统计 ──────────────────────────────────────────

  getStats(): { totalTools: number; enabledTools: number; disabledTools: number; totalInvocations: number; completed: number; failed: number; successRate: string } {
    const total = this._invocationHistory.length;
    const completed = this._invocationHistory.filter(e => e.status === 'success').length;
    const failed = this._invocationHistory.filter(e => e.status === 'failed').length;
    return {
      totalTools: this._tools.size,
      enabledTools: this.getEnabledCount(),
      disabledTools: this.getDisabled().length,
      totalInvocations: total,
      completed,
      failed,
      successRate: total > 0 ? ((completed / total) * 100).toFixed(1) + '%' : 'N/A'
    };
  }

  // ─── 清理 ──────────────────────────────────────────

  clearHistory(): void {
    this._invocationHistory = [];
  }

  clear(): void {
    this._tools.clear();
    this._invocationHistory = [];
  }

  destroy(): void {
    this.clear();
    this._beforeInvoke = null;
    this._afterInvoke = null;
  }
}