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
import { Log } from './Log.js';
import { Tool, ToolCall, ToolResult } from '../models/Tool.js';
import { KernelEvents, KernelChannels } from '../Events.js';
import { StorageKeys } from '../Keys.js';
import { IStorageManager } from './IStorageManager.js';
import { IPC } from '../IPC.js';
import { genId } from '../utils/id.js';

/**
 * 危险工具（Tool.danger===true）确认请求载荷（内核→Shell）。
 * - 内核在 invoke 危险工具前，经 requestConfirm() 向 Shell 广播 CONFIRM.REQUEST 事件；
 * - Shell 弹确认框，用户决策后经专用 RPC `confirm.resolve` 回写内核 resolveConfirm()。
 */
export interface ToolConfirmRequest {
  /** 本次确认请求唯一 ID（由内核生成），Shell 回写时带回 */
  requestId: string;
  /** 关联会话 ID（可为 null，用于 Shell 在对应对话聚焦） */
  sessionId: string | null;
  /** 工具名（如 run_user_script） */
  toolName: string;
  /** 工具调用 ID */
  toolCallId: string | null;
  /** 工具入参快照（供 UI 展示「将要执行什么」，如 run_user_script 的 code） */
  args: unknown;
  /** 危险原因（工具自述，如「将执行任意 JavaScript」） */
  reason: string;
}

export type ToolConfirmInput = Omit<ToolConfirmRequest, 'requestId'>;

/** 确认超时（毫秒）：超时视为用户未响应，安全默认拒绝 */
const DEFAULT_CONFIRM_TIMEOUT_MS = 120_000;

/** 最小 IPC 引用，避免与 Kernel.ts 循环依赖 */
interface IPCLike {
  getOrCreateChannel(name: string): { emit(event: string, payload?: unknown): void } | null;
  emit(event: string, payload?: unknown): unknown;
}

export class ToolsManager {
  private _tools: Map<string, Tool>;
  private _invocationHistory: ToolResult[];
  private _maxHistory: number;
  private _beforeInvoke: ((toolCall: ToolCall, context: Record<string, unknown>) => boolean | Promise<boolean>) | null;
  private _afterInvoke: ((result: ToolResult, context: Record<string, unknown>) => void) | null;
  /**
   * 危险工具人工确认闸门（Tool.danger===true 必须用户确认才执行）。
   * 闸门逻辑内聚在本管理器：invoke 危险工具前 await requestConfirm()，向 Shell 广播
   * CONFIRM.REQUEST 事件；Shell 决策后经专用 RPC `confirm.resolve` 回写 resolveConfirm()。
   */
  private _pendingConfirm = new Map<
    string,
    { resolve: (approved: boolean) => void; timer: ReturnType<typeof setTimeout>; toolCallId: string | null }
  >();
  private _confirmTimeoutMs: number;
  /** 可选 IPC：用于广播 TOOL.* 注册表变更事件与 CONFIRM.REQUEST 确认请求，使 UI / LLM 工具集可实时反映 */
  private _ipc: IPCLike | null;
  private _channel: { emit(event: string, payload?: unknown): void } | null;
  /** 可选存储：持久化工具启用/禁用状态，使 SW 重启后恢复用户选择 */
  private _storage: IStorageManager | null;
  /** 启动期从存储加载的启用覆盖表（name → enabled），register 时应用到对应工具 */
  private _overrides: Map<string, boolean>;
  private _storageKey: string;

  constructor(options: {
    maxHistory?: number;
    beforeInvoke?: (toolCall: ToolCall, context: Record<string, unknown>) => boolean | Promise<boolean>;
    afterInvoke?: (result: ToolResult, context: Record<string, unknown>) => void;
    /** 危险工具确认请求超时（毫秒），超时按安全默认拒绝 */
    confirmTimeoutMs?: number;
    ipc?: IPCLike;
    storage?: IStorageManager | null;
  } = {}) {
    this._tools = new Map();
    this._invocationHistory = [];
    this._maxHistory = options.maxHistory ?? 500;
    this._beforeInvoke = options.beforeInvoke ?? null;
    this._afterInvoke = options.afterInvoke ?? null;
    this._confirmTimeoutMs = options.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS;
    this._ipc = options.ipc ?? null;
    this._channel = null;
    this._storage = options.storage ?? null;
    this._overrides = new Map();
    this._storageKey = StorageKeys.TOOLS_ENABLED;
  }

  /**
   * 启动初始化：从存储加载各工具启用覆盖表。
   * 必须在工具注册（register）之前 await 完成，使 register 时能直接应用已保存的启用/禁用状态。
   * 无 storage 时静默跳过（内存态，测试/无存储环境）。
   */
  async init(): Promise<this> {
    if (!this._storage) return this;
    try {
      const stored = await this._storage.get(this._storageKey);
      if (stored && typeof stored === 'object') {
        for (const [name, enabled] of Object.entries(stored as Record<string, unknown>)) {
          this._overrides.set(name, enabled === true);
        }
        Log.info('ToolsManager', `Restored enabled state for ${this._overrides.size} tool(s)`);
      }
    } catch (e) {
      Log.warn('ToolsManager', `init load error: ${(e as any)?.message}`);
    }
    return this;
  }

  /** 懒初始化工具通道（仅在注入 ipc 时） */
  private _toolChannel(): { emit(event: string, payload?: unknown): void } | null {
    if (!this._ipc) return null;
    if (!this._channel) this._channel = this._ipc.getOrCreateChannel(KernelChannels.TOOL) || null;
    return this._channel;
  }

  /** 广播注册表变更：REGISTERED/UNREGISTERED 同时发 CHANGED（CHANGED 是 UI 唯一订阅点） */
  private _emitChange(event: string, payload: Record<string, unknown>): void {
    const ch = this._toolChannel();
    if (!ch) return;
    ch.emit(event, payload);
    ch.emit(KernelEvents.TOOL.CHANGED, { ...payload, event });
  }

  // ─── 注册/注销 ────────────────────────────────────

  register(tool: Tool): this {
    if (!tool || !tool.name) throw new Error('[ToolsManager] Invalid tool: missing name');
    if (this._tools.has(tool.name)) throw new Error(`[ToolsManager] Tool "${tool.name}" already registered`);
    this._tools.set(tool.name, tool);
    // 启动期恢复的启用覆盖：仅当存储中存在该工具的记录时才覆盖默认 enabled
    if (this._overrides.has(tool.name)) {
      tool.enabled = this._overrides.get(tool.name) === true;
    }
    this._emitChange(KernelEvents.TOOL.REGISTERED, { name: tool.name, source: tool.source });
    return this;
  }

  registerAll(tools: Tool[]): this {
    tools.forEach(t => { try { this.register(t); } catch (e) { Log.warn('ToolsManager', (e).message); } });
    return this;
  }

  unregister(name: string): this {
    if (!this._tools.has(name)) return this;
    this._tools.delete(name);
    this._emitChange(KernelEvents.TOOL.UNREGISTERED, { name });
    return this;
  }

  /**
   * 原地更新已注册工具的定义（handler / source / category / tags / danger / version 等）。
   * 相比「先 unregister 再 register」，本方法保留同一 Tool 实例引用，
   * 适合 P1/P2 在运行时对既有工具做幂等刷新（如脚本 @tool 重注册）。
   * @param name   工具名（不可改）
   * @param patch  要覆盖的字段（name 字段被忽略）
   */
  update(name: string, patch: Partial<Record<string, unknown>>): this {
    const tool = this._tools.get(name);
    if (!tool) throw new Error(`[ToolsManager] Tool "${name}" not found, cannot update`);
    const allowed = ['description', 'capabilities', 'inputSchema', 'outputSchema', 'enabled', 'handler', 'metadata', 'source', 'category', 'tags', 'danger', 'version'];
    for (const key of allowed) {
      if (key in patch) (tool as any)[key] = patch[key];
    }
    this._emitChange(KernelEvents.TOOL.CHANGED, { name, reason: 'update' });
    if ('enabled' in patch) void this._persist();
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

  /** 按来源过滤（builtin / script / page / mcp） */
  getBySource(source: string): Tool[] {
    return Array.from(this._tools.values()).filter(t => t.source === source);
  }

  /** 按业务类别过滤 */
  getByCategory(category: string): Tool[] {
    return Array.from(this._tools.values()).filter(t => t.category === category);
  }

  /** 启用且标记为危险（可能改账户/破坏性）的工具——供人工确认门控使用 */
  getDangerous(): Tool[] {
    return this.getEnabled().filter(t => t.danger === true);
  }

  /** 启用工具的 LLM 函数定义集（openai 格式），与 getDefinitionsForLLM('openai') 等价 */
  getEnabledDefinitions(): unknown[] {
    return this.getEnabled().map(t => t.toOpenAIFunction());
  }

  // ─── 启用/禁用 ────────────────────────────────────

  /**
   * 启用工具并持久化（覆盖表 + 存储）。SW 重启后由 init() 读回、register() 应用。
   */
  async enable(name: string): Promise<void> {
    const t = this._tools.get(name);
    if (t && !t.enabled) {
      t.enabled = true;
      this._overrides.set(name, true);
      this._emitChange(KernelEvents.TOOL.CHANGED, { name, enabled: true, reason: 'toggle' });
      await this._persist();
    }
  }

  /**
   * 禁用工具并持久化（覆盖表 + 存储）。SW 重启后保持禁用，直至用户再次启用。
   */
  async disable(name: string): Promise<void> {
    const t = this._tools.get(name);
    if (t && t.enabled) {
      t.enabled = false;
      this._overrides.set(name, false);
      this._emitChange(KernelEvents.TOOL.CHANGED, { name, enabled: false, reason: 'toggle' });
      await this._persist();
    }
  }

  /** 持久化全部工具的启用状态到存储（key = StorageKeys.TOOLS_ENABLED，值 { [name]: boolean }）。 */
  private async _persist(): Promise<void> {
    if (!this._storage) return;
    const map: Record<string, boolean> = {};
    for (const t of this._tools.values()) map[t.name] = t.enabled !== false;
    try {
      await this._storage.set(this._storageKey, map);
    } catch (e) {
      Log.warn('ToolsManager', `persist error: ${(e as any)?.message}`);
    }
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
      const result = new ToolResult({ toolCallId, toolName, status: 'failed', error: `Unknown tool: ${toolName || '(empty)'}` });
      this._recordInvocation(result);
      return result;
    }

    // 2. 参数类型校验（根据 inputSchema 校验参数类型）
    const validationError = this._validateArgs(toolCall.input, tool.inputSchema);
    if (validationError) {
      const result = new ToolResult({ toolCallId, toolName, status: 'failed', error: `参数校验失败：${validationError}` });
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
        const result = new ToolResult({ toolCallId, toolName, status: 'failed', error: 'Tool invocation rejected by beforeInvoke hook' });
        this._recordInvocation(result);
        return result;
      }
    }

    // 4. 会话级开关 / 危险确认闸门（三层会话覆盖，依据用户设计：全局为天花板）
    //    override===false（本会话显式关闭）→ 直接拒绝，不弹确认、不执行（覆盖危险与非危险）
    //    tool.danger && override===true（本会话显式开启）→ 跳过确认，直接执行
    //    tool.danger && override===undefined（未定义，继承全局）→ 弹确认
    //    非 danger 的 undefined → 正常执行（继承全局开启态）
    const rawOverride = (context as Record<string, unknown>)?.toolEnabledOverride;
    const override: boolean | undefined = (rawOverride === true || rawOverride === false) ? (rawOverride as boolean) : undefined;

    if (override === false) {
      const result = new ToolResult({ toolCallId, toolName, status: 'rejected', error: '该工具已在当前会话中被禁用' });
      this._recordInvocation(result);
      return result;
    }

    if (tool.danger) {
      if (override === true) {
        // 本会话已显式开启：跳过确认，直接执行
      } else {
        // 未定义（继承全局）：必须用户确认，安全默认拒绝
        let approved = false;
        try {
          approved = await this.requestConfirm({
            sessionId: ((context?.sessionId as string) || null),
            toolName,
            toolCallId,
            args: toolCall.input,
            reason: ((tool.metadata?.dangerReason as string) || '该工具被标记为危险操作，执行前需人工确认'),
          });
        } catch (e) {
          Log.error('ToolsManager', 'requestConfirm error:', e);
          approved = false;
        }
        if (!approved) {
          const result = new ToolResult({ toolCallId, toolName, status: 'rejected', error: '用户取消了危险工具的执行' });
          this._recordInvocation(result);
          return result;
        }
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
        result = new ToolResult({ toolCallId, toolName, status: 'success', output, duration });
      }
    } catch (err) {
      const duration = Date.now() - start;
      const errMsg = (err)?.message || String(err);
      Log.error('ToolsManager', `Failed: ${toolName} — ${errMsg}`);
      result = new ToolResult({ toolCallId, toolName, status: 'failed', error: errMsg, duration });
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

  /**
   * 内核侧：向 Shell 请求一次危险工具执行确认（闸门核心）。
   * @returns Promise<boolean> true=用户允许；false=拒绝 / 超时 / 无 Shell（无 IPC）
   *
   * 这是 kernel→shell 的请求/响应（RPC 方向相反，RPC 是 shell→kernel）：
   * 用 _pendingConfirm Map 把「事件通知」桥接成「await 的 Promise」。
   * 安全默认：无 IPC（测试 / 无 Shell 环境）或超时（默认 120s）→ 拒绝执行。
   */
  async requestConfirm(req: ToolConfirmInput): Promise<boolean> {
    const requestId = genId('cfm');
    const payload: ToolConfirmRequest = { requestId, ...req };

    if (!this._ipc) {
      // 无 IPC（测试 / 无 Shell 环境）：安全默认拒绝，绝不静默放行危险操作
      Log.warn('ToolsManager', 'No IPC channel, denying danger tool by default');
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this._pendingConfirm.delete(requestId);
        Log.warn('ToolsManager', `Confirm timed out for ${req.toolName}, denying`);
        // 通知 Shell 移除气泡内待确认态
        if (this._ipc && req.toolCallId) {
          this._ipc.emit(KernelEvents.CONFIRM.RESOLVED, { requestId, toolCallId: req.toolCallId });
        }
        resolve(false);
      }, this._confirmTimeoutMs);

      this._pendingConfirm.set(requestId, { resolve, timer, toolCallId: req.toolCallId ?? null });
      // 经内核 IPC 广播；IPCTransport 中间件把事件转发到 Shell 的 IPC 实例
      this._ipc!.emit(KernelEvents.CONFIRM.REQUEST, payload);
    });
  }

  /**
   * 由专用 RPC `confirm.resolve` 回调：解除对应请求的挂起态，回写用户决策。
   * 迟到 / 未知的 requestId 直接忽略（已被超时回收）。
   */
  resolveConfirm(requestId: string, approved: boolean): void {
    const entry = this._pendingConfirm.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this._pendingConfirm.delete(requestId);
    // 通知 Shell 移除气泡内待确认态
    if (this._ipc && entry.toolCallId) {
      this._ipc.emit(KernelEvents.CONFIRM.RESOLVED, { requestId, toolCallId: entry.toolCallId });
    }
    entry.resolve(approved === true);
  }

  setAfterInvoke(mw: (result: ToolResult, context: Record<string, unknown>) => void): void {
    this._afterInvoke = mw;
  }

  // ─── 调用历史 ──────────────────────────────────────

  getInvocationHistory(filters: { toolName?: string; status?: string; since?: number; limit?: number } = {}): ToolResult[] {
    let r = [...this._invocationHistory];
    if (filters.toolName) r = r.filter(e => e.toolName === filters.toolName);
    if (filters.status) r = r.filter(e => e.status === filters.status);
    if (filters.since) r = r.filter(e => e.timestamp >= (filters.since as number));
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
    // 内核关闭：所有挂起的确认一律按拒绝处理（安全默认）
    this._pendingConfirm.forEach((e) => {
      clearTimeout(e.timer);
      e.resolve(false);
    });
    this._pendingConfirm.clear();
    this.clear();
    this._beforeInvoke = null;
    this._afterInvoke = null;
  }
}