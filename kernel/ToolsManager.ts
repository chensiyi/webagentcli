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
    tools.forEach(t => { try { this.register(t); } catch (e) { Log.warn('ToolsManager', (e).message); } });
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
  async invoke(toolCall: ToolCall , context: Record<string, unknown> = {}): Promise<ToolResult> {
    const toolCallId = toolCall.id;
    const toolName = toolCall.toolName;

    // 1. 查找工具
    const tool = toolName ? this._tools.get(toolName) : null;
    if (!tool) {
      const result = new ToolResult({ toolCallId, status: 'failed', error: `Unknown tool: ${toolName || '(empty)'}` });
      this._recordInvocation(result);
      return result;
    }

    // 2. 参数类型校验（根据 inputSchema 校验参数类型）
    const validationError = this._validateArgs(toolCall.input, tool.inputSchema);
    if (validationError) {
      const result = new ToolResult({ toolCallId, status: 'failed', error: `参数校验失败：${validationError}` });
      this._recordInvocation(result);
      return result;
    }

    // 3. 前置钩子
    if (this._beforeInvoke) {
      let proceed = true;
      try {
        proceed = await this._beforeInvoke(toolCall, context);
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
      const output = await tool.handler!(toolCall.input, context);

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
      const errMsg = (err)?.message || String(err);
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

  // ─── 参数校验 ──────────────────────────────────────

  /**
   * 根据 inputSchema 校验参数类型。
   * 校验规则：
   * - 检查 required 字段是否存在
   * - 检查每个字段的类型是否匹配（number / string / boolean / array / object）
   * - 如果是 enum 类型，检查值是否在枚举中
   * @returns 错误信息字符串，无错误返回 null
   */
  private _validateArgs(args: unknown, schema: any): string | null {
    if (!schema || !schema.properties) return null;
    const input = (args || {}) as Record<string, unknown>;
    const props = schema.properties as Record<string, any>;

    // 检查 required 字段
    if (Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (input[req] === undefined || input[req] === null) {
          return `缺少必填参数 "${req}"`;
        }
      }
    }

    // 检查每个传入参数的类型
    for (const [key, value] of Object.entries(input)) {
      const def = props[key];
      if (!def) continue; // 未定义的参数，跳过（由 handler 自行处理）

      const expectedType = def.type as string;
      if (!expectedType) continue;

      if (value === null || value === undefined) continue;

      let actualType: string;
      if (Array.isArray(value)) actualType = 'array';
      else if (typeof value === 'number' && Number.isInteger(value) && expectedType === 'integer') actualType = 'integer';
      else actualType = typeof value;

      // 检查类型
      if (expectedType === 'integer') {
        if (actualType !== 'number' && actualType !== 'integer') {
          return `参数 "${key}" 类型错误：期望 ${expectedType}，实际 ${actualType}`;
        }
      } else if (expectedType === 'array') {
        if (!Array.isArray(value)) {
          return `参数 "${key}" 类型错误：期望 array，实际 ${typeof value}`;
        }
      } else if (expectedType === 'object') {
        if (actualType !== 'object' || Array.isArray(value)) {
          return `参数 "${key}" 类型错误：期望 object，实际 ${actualType}`;
        }
      } else if (expectedType !== actualType) {
        return `参数 "${key}" 类型错误：期望 ${expectedType}，实际 ${actualType}`;
      }

      // 检查 enum
      if (Array.isArray(def.enum) && def.enum.length > 0) {
        if (!def.enum.includes(value)) {
          return `参数 "${key}" 值无效：期望 ${def.enum.join(' | ')}，实际 ${value}`;
        }
      }
    }

    return null;
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