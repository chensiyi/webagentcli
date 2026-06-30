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

export class KernelLog {
  static LEVELS = Object.freeze({
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4
  });

  static LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

  maxBufferSize: number;
  minLevel: number;
  buffer: { level: number; levelName: string; tag: string; message: unknown; data: unknown; timestamp: number; id: string }[];
  listeners: Map<number, Set<(entry: unknown) => void>>;

  constructor(options: { maxBufferSize?: number; minLevel?: number } = {}) {
    this.maxBufferSize = options.maxBufferSize ?? 500;
    this.minLevel = options.minLevel ?? KernelLog.LEVELS.DEBUG;
    this.buffer = [];
    this.listeners = new Map();
  }

  debug(tag: string, message: unknown, data?: unknown): void { this._log(KernelLog.LEVELS.DEBUG, tag, message, data); }
  info(tag: string, message: unknown, data?: unknown): void  { this._log(KernelLog.LEVELS.INFO, tag, message, data); }
  warn(tag: string, message: unknown, data?: unknown): void  { this._log(KernelLog.LEVELS.WARN, tag, message, data); }
  error(tag: string, message: unknown, error?: unknown): void { this._log(KernelLog.LEVELS.ERROR, tag, message, error); }
  fatal(tag: string, message: unknown, error?: unknown): void { this._log(KernelLog.LEVELS.FATAL, tag, message, error); }

  _log(level, tag, message, data) {
    if (level < this.minLevel) return;
    const entry = {
      level, levelName: KernelLog.LEVEL_NAMES[level], tag: `[${tag}]`,
      message, data: data || null, timestamp: Date.now(),
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) this.buffer.shift();

    const prefix = `${entry.levelName} ${entry.tag}`;
    switch (level) {
      case KernelLog.LEVELS.DEBUG: console.debug(prefix, entry.message, entry.data || ''); break;
      case KernelLog.LEVELS.INFO:  console.info(prefix, entry.message, entry.data || ''); break;
      case KernelLog.LEVELS.WARN:  console.warn(prefix, entry.message, entry.data || ''); break;
      case KernelLog.LEVELS.ERROR:
      case KernelLog.LEVELS.FATAL: console.error(prefix, entry.message, entry.data || ''); break;
    }
    this._notifyListeners(entry);
  }

  _notifyListeners(entry: { level: number }): void {
    const ls = this.listeners.get(entry.level);
    if (ls) ls.forEach(cb => { try { cb(entry); } catch (e) {} });
    const all = this.listeners.get(-1);
    if (all) all.forEach(cb => { try { cb(entry); } catch (e) {} });
  }

  onLog(level: number, callback: (entry: unknown) => void): () => void {
    if (!this.listeners.has(level)) this.listeners.set(level, new Set());
    this.listeners.get(level)!.add(callback);
    return () => { const s = this.listeners.get(level); if (s) s.delete(callback); };
  }

  getBuffer(filters: { minLevel?: number; tag?: string; since?: number; limit?: number } = {}): { level: number; levelName: string; tag: string; message: unknown; data: unknown; timestamp: number; id: string }[] {
    let r = this.buffer;
    if (filters.minLevel !== undefined) r = r.filter(e => e.level >= filters.minLevel);
    if (filters.tag) r = r.filter(e => e.tag === `[${filters.tag}]`);
    const since = filters.since ?? 0;
    r = r.filter(e => e.timestamp >= since);
    if (filters.limit && r.length > filters.limit) r = r.slice(-filters.limit);
    return r;
  }

  export(): string {
    return this.buffer.map(e => {
      const t = new Date(e.timestamp).toISOString();
      return `[${t}] ${e.levelName} ${e.tag} ${e.message}${e.data ? ' ' + JSON.stringify(e.data) : ''}`;
    }).join('\n');
  }

  clear(): void { this.buffer = []; }
  setMinLevel(level: number): void { this.minLevel = level; }
  destroy(): void { this.listeners.clear(); this.buffer = []; }
}