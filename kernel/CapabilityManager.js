export class CapabilityError extends Error {
  constructor(message, key, capability) { super(message); this.name = 'CapabilityError'; this.key = key; this.capability = capability; }
}

CapabilityError.CAPABILITIES = Object.freeze({
  NETWORK: 'network', STORAGE_READ: 'storage:read', STORAGE_WRITE: 'storage:write',
  EXECUTE: 'execute', FILESYSTEM: 'filesystem', USER_SCRIPT: 'user_script',
  PROVIDER: 'provider', SETTINGS: 'settings', TOOL: 'tool', IPC: 'ipc'
});

export class CapabilityManager {
  constructor(opts = {}) {
    this._grants = new Map();
    this._auditLog = [];
    this._maxAuditSize = opts.maxAuditSize || 1000;
    this._onDeny = opts.onDeny || null;
  }
  declare(key, capabilities) { if (!this._grants.has(key)) this._grants.set(key, new Set()); capabilities.forEach(c => this._grants.get(key).add(c)); return this; }
  grant(key, capability) { if (!this._grants.has(key)) this._grants.set(key, new Set()); this._grants.get(key).add(capability); return this; }
  grantAll(key, caps) { caps.forEach(c => this.grant(key, c)); return this; }
  revoke(key, capability) { const g = this._grants.get(key); if (g) g.delete(capability); return this; }
  check(key, capability, ctx = {}) {
    const has = (this._grants.get(key) || new Set()).has(capability);
    if (!has && this._onDeny) { try { if (this._onDeny(key, capability, ctx) === true) { this.grant(key, capability); return true; } } catch (e) {} }
    return has;
  }
  require(key, capability, ctx = {}) { if (!this.check(key, capability, ctx)) throw new CapabilityError(`Capability denied: "${key}" requires "${capability}"`, key, capability); }
  getCapabilities(key) { return Array.from(this._grants.get(key) || []); }
  getAllDeclarations() { const r = {}; this._grants.forEach((v, k) => r[k] = Array.from(v)); return r; }
  getAuditLog(flt = {}) { let r = [...this._auditLog]; if (flt.action) r = r.filter(e => e.action === flt.action); if (flt.key) r = r.filter(e => e.key === flt.key); if (flt.since) r = r.filter(e => e.timestamp >= flt.since); if (flt.limit && r.length > flt.limit) r = r.slice(-flt.limit); return r; }
  clearAuditLog() { this._auditLog = []; }
  reset() { this._grants.clear(); this._auditLog = []; return this; }
  destroy() { this._grants.clear(); this._auditLog = []; this._onDeny = null; }
  _audit(action, key, capabilities, result, context = {}) {
    this._auditLog.push({ action, key, capabilities, result, context, timestamp: Date.now(), id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` });
    if (this._auditLog.length > this._maxAuditSize) this._auditLog.shift();
  }
}

export default CapabilityManager;