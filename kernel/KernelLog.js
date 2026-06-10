/**
 * KernelLog - 统一内核日志系统
 * 
 * 职责：
 * - 提供等级化日志记录（DEBUG / INFO / WARN / ERROR / FATAL）
 * - 支持标签分类
 * - 日志缓冲与查询
 * - 事件驱动：其他模块可订阅特定级别的日志
 * - 零外部依赖，可在任何 JS 环境运行
 * 
 * 标签规范：
 * [KERNEL] [IPC] [TOOL] [CAP] [BOOT] [SESSION] [STORAGE] [SETTINGS] [MODEL] [SCRIPT]
 */

class KernelLog {
  static LEVELS = Object.freeze({
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4
  });

  static LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

  constructor(options = {}) {
    this.maxBufferSize = options.maxBufferSize || 500;
    this.minLevel = options.minLevel || KernelLog.LEVELS.DEBUG;
    this.buffer = [];
    this.listeners = new Map(); // level → Set<callback>
  }

  /**
   * 记录调试日志
   * @param {string} tag - 标签（如 'KERNEL', 'IPC'）
   * @param {string} message - 日志消息
   * @param {*} [data] - 附加数据
   */
  debug(tag, message, data) {
    this._log(KernelLog.LEVELS.DEBUG, tag, message, data);
  }

  /**
   * 记录信息日志
   * @param {string} tag - 标签
   * @param {string} message - 日志消息
   * @param {*} [data] - 附加数据
   */
  info(tag, message, data) {
    this._log(KernelLog.LEVELS.INFO, tag, message, data);
  }

  /**
   * 记录警告日志
   * @param {string} tag - 标签
   * @param {string} message - 日志消息
   * @param {*} [data] - 附加数据
   */
  warn(tag, message, data) {
    this._log(KernelLog.LEVELS.WARN, tag, message, data);
  }

  /**
   * 记录错误日志
   * @param {string} tag - 标签
   * @param {string} message - 日志消息
   * @param {Error|*} [error] - 错误对象
   */
  error(tag, message, error) {
    this._log(KernelLog.LEVELS.ERROR, tag, message, error);
  }

  /**
   * 记录致命错误日志
   * @param {string} tag - 标签
   * @param {string} message - 日志消息
   * @param {Error|*} [error] - 错误对象
   */
  fatal(tag, message, error) {
    this._log(KernelLog.LEVELS.FATAL, tag, message, error);
  }

  /**
   * 统一的日志记录方法
   * @private
   */
  _log(level, tag, message, data) {
    if (level < this.minLevel) return;

    const entry = {
      level,
      levelName: KernelLog.LEVEL_NAMES[level],
      tag: `[${tag}]`,
      message,
      data: data || null,
      timestamp: Date.now(),
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    };

    this.buffer.push(entry);

    // 限制缓冲大小
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // 输出到控制台
    const prefix = `${entry.levelName} ${entry.tag}`;
    switch (level) {
      case KernelLog.LEVELS.DEBUG:
        console.debug(prefix, entry.message, entry.data || '');
        break;
      case KernelLog.LEVELS.INFO:
        console.info(prefix, entry.message, entry.data || '');
        break;
      case KernelLog.LEVELS.WARN:
        console.warn(prefix, entry.message, entry.data || '');
        break;
      case KernelLog.LEVELS.ERROR:
      case KernelLog.LEVELS.FATAL:
        console.error(prefix, entry.message, entry.data || '');
        break;
    }

    // 通知监听器
    this._notifyListeners(entry);
  }

  /**
   * 通知日志监听器
   * @private
   */
  _notifyListeners(entry) {
    // 通知精确级别监听器
    const levelListeners = this.listeners.get(entry.level);
    if (levelListeners) {
      levelListeners.forEach(cb => {
        try { cb(entry); } catch (e) { console.error('[KernelLog] Listener error:', e); }
      });
    }

    // 通知通配监听器 (监听所有级别)
    const allListeners = this.listeners.get(-1);
    if (allListeners) {
      allListeners.forEach(cb => {
        try { cb(entry); } catch (e) { console.error('[KernelLog] Listener error:', e); }
      });
    }
  }

  /**
   * 订阅特定级别的日志
   * @param {number} level - 日志级别（或 -1 监听全部）
   * @param {Function} callback - 回调 function(entry)
   * @returns {Function} 取消订阅函数
   */
  onLog(level, callback) {
    if (!this.listeners.has(level)) {
      this.listeners.set(level, new Set());
    }
    this.listeners.get(level).add(callback);
    return () => {
      const s = this.listeners.get(level);
      if (s) s.delete(callback);
    };
  }

  /**
   * 查询日志缓冲
   * @param {Object} [filters]
   * @param {number} [filters.minLevel] - 最低级别
   * @param {string} [filters.tag] - 标签过滤
   * @param {number} [filters.since] - 起始时间戳
   * @param {number} [filters.limit] - 返回条数上限
   * @returns {Array} 日志条目数组
   */
  getBuffer(filters = {}) {
    let result = this.buffer;

    if (filters.minLevel !== undefined) {
      result = result.filter(e => e.level >= filters.minLevel);
    }
    if (filters.tag) {
      result = result.filter(e => e.tag === `[${filters.tag}]`);
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
   * 导出日志为字符串
   * @returns {string}
   */
  export() {
    return this.buffer.map(e => {
      const time = new Date(e.timestamp).toISOString();
      return `[${time}] ${e.levelName} ${e.tag} ${e.message}${e.data ? ' ' + JSON.stringify(e.data) : ''}`;
    }).join('\n');
  }

  /**
   * 清空日志缓冲
   */
  clear() {
    this.buffer = [];
  }

  /**
   * 设置最低日志级别
   * @param {number} level
   */
  setMinLevel(level) {
    this.minLevel = level;
  }

  /**
   * 销毁日志系统
   */
  destroy() {
    this.listeners.clear();
    this.buffer = [];
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KernelLog;
}
if (typeof window !== 'undefined') {
  window.KernelLog = KernelLog;
}
