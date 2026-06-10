/**
 * CapabilityManager - 权限门控系统
 * 
 * 职责：
 * - 声明式权限定义
 * - 运行时权限检查
 * - 动态授权/撤销
 * - 权限审计日志
 * 
 * 设计原则：
 * - 默认拒绝（deny by default）
 * - 权限粒度：系统调用级
 * - 可组合：一个模块可声明多种权限
 * - 零外部依赖
 */

class CapabilityManager {
  constructor(options = {}) {
    this._grants = new Map();      // key → Set<capability>
    this._auditLog = [];
    this._maxAuditSize = options.maxAuditSize || 1000;
    this._onDeny = options.onDeny || null; // (key, capability, context) => boolean (可动态授权)
  }

  /**
   * 声明一组权限（用于注册时声明）
   * @param {string} key - 模块/工具标识（如 'tool:run_user_script'）
   * @param {string[]} capabilities - 所需权限列表
   */
  declare(key, capabilities) {
    if (!this._grants.has(key)) {
      this._grants.set(key, new Set());
    }
    const grants = this._grants.get(key);
    capabilities.forEach(cap => grants.add(cap));
    this._audit('DECLARE', key, capabilities, true);
  }

  /**
   * 运行时检查是否拥有某权限
   * @param {string} key - 模块/工具标识
   * @param {string} capability - 权限名
   * @param {Object} [context] - 调用上下文（用于审计）
   * @returns {boolean}
   */
  check(key, capability, context = {}) {
    const grants = this._grants.get(key);
    const hasCap = grants ? grants.has(capability) : false;

    if (!hasCap && this._onDeny) {
      try {
        const granted = this._onDeny(key, capability, context);
        if (granted === true) {
          this.grant(key, capability);
          this._audit('GRANT_DYNAMIC', key, [capability], true, context);
          return true;
        }
      } catch (e) {
        console.error('[CapabilityManager] onDeny error:', e);
      }
    }

    const result = hasCap || false;
    this._audit('CHECK', key, [capability], result, context);
    return result;
  }

  /**
   * 检查权限，无权限则抛异常
   * @param {string} key - 模块/工具标识
   * @param {string} capability - 权限名
   * @param {Object} [context] - 调用上下文
   * @throws {CapabilityError}
   */
  require(key, capability, context = {}) {
    if (!this.check(key, capability, context)) {
      const error = new CapabilityError(
        `Capability denied: "${key}" requires "${capability}"`,
        key,
        capability
      );
      this._audit('DENY', key, [capability], false, context);
      throw error;
    }
  }

  /**
   * 动态授权
   * @param {string} key - 模块/工具标识
   * @param {string} capability - 权限名
   */
  grant(key, capability) {
    if (!this._grants.has(key)) {
      this._grants.set(key, new Set());
    }
    this._grants.get(key).add(capability);
    this._audit('GRANT', key, [capability], true);
  }

  /**
   * 批量授权
   * @param {string} key - 模块/工具标识
   * @param {string[]} capabilities - 权限列表
   */
  grantAll(key, capabilities) {
    capabilities.forEach(cap => this.grant(key, cap));
  }

  /**
   * 撤销权限
   * @param {string} key - 模块/工具标识
   * @param {string} capability - 权限名
   */
  revoke(key, capability) {
    const grants = this._grants.get(key);
    if (grants) {
      grants.delete(capability);
      this._audit('REVOKE', key, [capability], false);
    }
  }

  /**
   * 获取某模块的所有权限
   * @param {string} key
   * @returns {string[]}
   */
  getCapabilities(key) {
    const grants = this._grants.get(key);
    return grants ? Array.from(grants) : [];
  }

  /**
   * 获取所有已注册的权限声明
   * @returns {Object} key → capabilities[]
   */
  getAllDeclarations() {
    const result = {};
    this._grants.forEach((caps, key) => {
      result[key] = Array.from(caps);
    });
    return result;
  }

  /**
   * 获取审计日志
   * @param {Object} [filters]
   * @param {string} [filters.action] - 过滤动作类型
   * @param {string} [filters.key] - 过滤模块标识
   * @param {number} [filters.since] - 起始时间戳
   * @param {number} [filters.limit] - 返回条数上限
   * @returns {Array}
   */
  getAuditLog(filters = {}) {
    let result = [...this._auditLog];

    if (filters.action) {
      result = result.filter(e => e.action === filters.action);
    }
    if (filters.key) {
      result = result.filter(e => e.key === filters.key);
    }
    if (filters.since) {
      result = result.filter(e => e.timestamp >= filters.since);
    }
    if (filters.limit && result.length > filters.limit) {
      result = result.slice(-filters.limit);
    }

    return result;
  }

  /**
   * 清空审计日志
   */
  clearAuditLog() {
    this._auditLog = [];
  }

  /**
   * 重置所有权限
   */
  reset() {
    this._grants.clear();
    this._auditLog = [];
  }

  /**
   * 销毁
   */
  destroy() {
    this._grants.clear();
    this._auditLog = [];
    this._onDeny = null;
  }

  /**
   * 记录审计条目
   * @private
   */
  _audit(action, key, capabilities, result, context = {}) {
    const entry = {
      action,
      key,
      capabilities,
      result,
      context,
      timestamp: Date.now(),
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    };
    this._auditLog.push(entry);
    if (this._auditLog.length > this._maxAuditSize) {
      this._auditLog.shift();
    }
  }
}

/**
 * 权限错误
 */
class CapabilityError extends Error {
  constructor(message, key, capability) {
    super(message);
    this.name = 'CapabilityError';
    this.key = key;
    this.capability = capability;
  }
}

/**
 * 预定义权限常量
 */
CapabilityManager.CAPABILITIES = Object.freeze({
  NETWORK: 'network',           // 网络访问
  STORAGE_READ: 'storage:read', // 存储读
  STORAGE_WRITE: 'storage:write', // 存储写
  EXECUTE: 'execute',           // 代码执行
  FILESYSTEM: 'filesystem',     // 文件系统
  USER_SCRIPT: 'user_script',   // 用户脚本管理
  PROVIDER: 'provider',         // AI Provider 访问
  SETTINGS: 'settings',         // 设置修改
  TOOL: 'tool',                 // 工具注册/注销
  IPC: 'ipc'                    // IPC 总线操作
});

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CapabilityManager, CapabilityError };
}
if (typeof window !== 'undefined') {
  window.CapabilityManager = CapabilityManager;
  window.CapabilityError = CapabilityError;
}
