/**
 * ToolRegistry - 系统调用注册表
 * 
 * 职责：
 * - 系统调用（工具）的注册、查询、生命周期管理
 * - 标准化工具契约（ToolDefinition）
 * - 按权限查询工具
 * - 执行审计
 * 
 * 设计原则：
 * - 每个工具是一个"系统调用"，通过名称标识
 * - 工具与能力（capability）绑定，供 CapabilityManager 检查
 * - 零外部依赖
 */

export class ToolRegistry {
  private _tools: Map<string, unknown>;
  private _invocationHistory: Record<string, unknown>[];
  private _maxHistory: number;
  private _beforeInvoke: ((...args: unknown[]) => unknown) | null;
  private _afterInvoke: ((...args: unknown[]) => unknown) | null;

  constructor(options: { maxHistory?: number; beforeInvoke?: (...args: unknown[]) => unknown; afterInvoke?: (...args: unknown[]) => unknown } = {}) {
    this._tools = new Map();
    this._invocationHistory = [];
    this._maxHistory = options.maxHistory ?? 500;
    this._beforeInvoke = options.beforeInvoke ?? null;
    this._afterInvoke = options.afterInvoke ?? null;
  }

  register(tool) {
    if (!tool || !tool.definition || !tool.definition.name) throw new Error('[ToolRegistry] Invalid tool');
    const name = tool.definition.name;
    if (this._tools.has(name)) throw new Error(`[ToolRegistry] Tool "${name}" already registered`);
    this._tools.set(name, tool);
    return this;
  }

  registerAll(tools) { tools.forEach(t => { try { this.register(t); } catch (e) { console.warn(e.message); } }); return this; }
  unregister(name) { this._tools.delete(name); return this; }
  get(name) { return this._tools.get(name) || null; }
  getAll() { return Array.from(this._tools.values()); }
  getEnabled() { return this._tools.size ? Array.from(this._tools.values()).filter(t => t.enabled !== false) : []; }
  getDisabled() { return Array.from(this._tools.values()).filter(t => t.enabled === false); }
  enable(name) { const t = this._tools.get(name); if (t) t.enabled = true; }
  disable(name) { const t = this._tools.get(name); if (t) t.enabled = false; }
  has(name) { return this._tools.has(name); }
  getEnabledCount() { return this.getEnabled().length; }
  getTotalCount() { return this._tools.size; }

  getDefinitionsForLLM(format = 'openai') {
    const enabled = this.getEnabled();
    if (format === 'openai') return enabled.filter(t => t.definition && typeof t.definition.toOpenAIFunction === 'function').map(t => t.definition.toOpenAIFunction());
    return enabled.map(t => t.definition);
  }

  findByCapability(capability) { return this.getEnabled().filter(t => (t.definition?.capabilities || []).includes(capability)); }

  getInvocationHistory(filters = {}) {
    let r = [...this._invocationHistory];
    if (filters.toolName) r = r.filter(e => e.toolName === filters.toolName);
    if (filters.status) r = r.filter(e => e.status === filters.status);
    if (filters.since) r = r.filter(e => e.timestamp >= filters.since);
    if (filters.limit && r.length > filters.limit) r = r.slice(-filters.limit);
    return r;
  }

  recordInvocation(record: Record<string, unknown>): void {
    this._invocationHistory.push({ ...record, timestamp: Date.now(), id: `invoke_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` });
    if (this._invocationHistory.length > this._maxHistory) this._invocationHistory.shift();
  }

  setBeforeInvoke(mw: (...args: unknown[]) => unknown): void { this._beforeInvoke = mw; }
  setAfterInvoke(mw: (...args: unknown[]) => unknown): void { this._afterInvoke = mw; }
  runBeforeInvoke(toolCall: unknown, context: Record<string, unknown> = {}): boolean {
    if (!this._beforeInvoke) return true;
    try { const r = this._beforeInvoke(toolCall, context); return r !== false; }
    catch (e) { console.error('[ToolRegistry] beforeInvoke error:', e); return false; }
  }
  runAfterInvoke(result: unknown, context: Record<string, unknown> = {}): void {
    if (this._afterInvoke) { try { this._afterInvoke(result, context); } catch (e) { console.error('[ToolRegistry] afterInvoke error:', e); } }
  }

  getStats(): { totalTools: number; enabledTools: number; disabledTools: number; totalInvocations: number; completed: number; failed: number; successRate: string } {
    const total = this._invocationHistory.length, completed = this._invocationHistory.filter(e => e.status === 'completed').length, failed = this._invocationHistory.filter(e => e.status === 'failed').length;
    return { totalTools: this._tools.size, enabledTools: this.getEnabledCount(), disabledTools: this.getDisabled().length, totalInvocations: total, completed, failed, successRate: total > 0 ? (completed / total * 100).toFixed(1) + '%' : 'N/A' };
  }
  clearHistory(): void { this._invocationHistory = []; }
  clear(): void { this._tools.clear(); this._invocationHistory = []; }
  destroy(): void { this.clear(); this._beforeInvoke = null; this._afterInvoke = null; }
}