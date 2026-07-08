/**
 * CapabilityManager — 能力/权限管理器
 *
 * 职责：
 * - 声明（declare）和授权（grant）模块的能力
 * - 运行时检查（check/require）模块是否有某项能力
 * - 审计日志记录
 * - 拒绝回调（onDeny）支持动态授权
 *
 * 设计原则：
 * - 能力是字符串标识（如 'network', 'storage:read', 'user_script'）
 * - 每个 key（通常是服务名或工具名）拥有一组 capabilities
 * - 与 ToolRegistry 配合：工具定义声明需要的能力，调用前通过 CapabilityManager 检查
 * - 零外部依赖
 */
export type Capability = 'network' | 'storage:read' | 'storage:write' | 'execute' | 'filesystem' | 'user_script' | 'provider' | 'settings' | 'tool' | 'ipc';
export type CapabilityDenyHandler = (key: string, capability: Capability, ctx: Record<string, unknown>) => boolean | void;
export interface AuditEntry { action: string; key: string; capabilities: string[]; result: boolean; context: Record<string, unknown>; timestamp: number; id: string; }

export class CapabilityError extends Error {
  key: string;
  capability: Capability;
  constructor(message: string, key: string, capability: Capability) { super(message); this.name = 'CapabilityError'; this.key = key; this.capability = capability; }
}

(CapabilityError as unknown as Record<string, unknown>).CAPABILITIES = Object.freeze({
  NETWORK: 'network', STORAGE_READ: 'storage:read', STORAGE_WRITE: 'storage:write',
  EXECUTE: 'execute', FILESYSTEM: 'filesystem', USER_SCRIPT: 'user_script',
  PROVIDER: 'provider', SETTINGS: 'settings', TOOL: 'tool', IPC: 'ipc'
} as const);

export class CapabilityManager {
  private _grants: Map<string, Set<Capability>> = new Map();
  private _auditLog: AuditEntry[] = [];
  private _maxAuditSize: number;
  private _onDeny: CapabilityDenyHandler | null;

  constructor(opts: { maxAuditSize?: number; onDeny?: CapabilityDenyHandler } = {}) {
    this._maxAuditSize = opts.maxAuditSize ?? 1000;
    this._onDeny = opts.onDeny ?? null;
  }
  declare(key: string, capabilities: Capability[]): this { if (!this._grants.has(key)) this._grants.set(key, new Set()); capabilities.forEach(c => this._grants.get(key)!.add(c)); return this; }
  grant(key: string, capability: Capability): this { if (!this._grants.has(key)) this._grants.set(key, new Set()); this._grants.get(key)!.add(capability); return this; }
  grantAll(key: string, caps: Capability[]): this { caps.forEach(c => this.grant(key, c)); return this; }
  revoke(key: string, capability: Capability): this { const g = this._grants.get(key); if (g) g.delete(capability); return this; }
  check(key: string, capability: Capability, ctx: Record<string, unknown> = {}): boolean {
    const has = (this._grants.get(key) || new Set()).has(capability);
    this._audit('check', key, [capability], has, ctx);
    if (!has && this._onDeny) { try { if (this._onDeny(key, capability, ctx) === true) { this.grant(key, capability); return true; } } catch (e) {} }
    return has;
  }
  require(key: string, capability: Capability, ctx: Record<string, unknown> = {}): void { if (!this.check(key, capability, ctx)) { this._audit('deny', key, [capability], false, ctx); throw new CapabilityError(`Capability denied: "${key}" requires "${capability}"`, key, capability); } }
  getCapabilities(key: string): Capability[] { return Array.from(this._grants.get(key) || []); }
  getAllDeclarations(): Record<string, Capability[]> { const r: Record<string, Capability[]> = {}; this._grants.forEach((v, k) => r[k] = Array.from(v)); return r; }
  getAuditLog(flt: { action?: string; key?: string; since?: number; limit?: number } = {}): AuditEntry[] { let r: AuditEntry[] = [...this._auditLog]; if (flt.action) r = r.filter(e => e.action === flt.action); if (flt.key) r = r.filter(e => e.key === flt.key); const since = flt.since ?? 0; r = r.filter(e => e.timestamp >= since); if (flt.limit && r.length > flt.limit) r = r.slice(-flt.limit); return r; }
  /**
   * 公开审计入口。供 RPC expose 等远程调用层记录「谁调了什么方法」，
   * 与 RpcCapabilityHook.audit 契约对齐（结构化接口，bridge 不反向依赖 kernel）。
   * 后期可在此叠加 per-method 能力映射与授权决策。
   */
  audit(action: string, key: string, capabilities: string[], result: boolean, context: Record<string, unknown> = {}): void {
    this._audit(action, key, capabilities as Capability[], result, context);
  }
  clearAuditLog(): void { this._auditLog = []; }
  reset(): this { this._grants.clear(); this._auditLog = []; return this; }
  destroy(): void { this._grants.clear(); this._auditLog = []; this._onDeny = null; }
  _audit(action: string, key: string, capabilities: Capability[], result: boolean, context: Record<string, unknown> = {}): void {
    this._auditLog.push({ action, key, capabilities, result, context, timestamp: Date.now(), id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` });
    if (this._auditLog.length > this._maxAuditSize) this._auditLog.shift();
  }
}