/**
 * Log - 全局日志单例
 *
 * 职责：
 * - 提供统一日志入口，所有模块通过 `import { Log } from '../services/Log.js'` 使用
 * - 默认后端为 ConsoleLogger（模块加载即可用，无需 Kernel 启动）
 * - 支持 setLogger() 升级后端、setLevel() 级别过滤
 * - 统一格式：[HH:mm:ss] [TAG] message
 *
 * 设计原则：
 * - 日志是横切关注点（cross-cutting concern），不需要 DI 注入
 * - 单例模式让任意模块零配置即可打日志
 * - Kernel boot 时可升级后端（如替换为 IPC-based logger）
 *
 * 使用方式：
 *   import { Log } from '../services/Log.js';
 *   Log.info('KERNEL', 'Booting...', someObj);
 *   Log.error('CHAT', 'Failed to send', err);
 */
import { ILogger } from './ILogger.js';
import { ConsoleLogger } from './ConsoleLogger.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, fatal: 4, silent: 5
};

class LogService implements ILogger {
  private _backend: ILogger;
  private _minLevel: LogLevel;

  constructor(logger: ILogger | null = null, minLevel: LogLevel = 'debug') {
    this._backend = logger || new ConsoleLogger();
    this._minLevel = minLevel;
  }

  /** 替换日志后端（Kernel boot 时调用） */
  setLogger(logger: ILogger): void {
    this._backend.destroy?.();
    this._backend = logger;
  }

  /** 设置最低输出级别，低于此级别的日志将被丢弃 */
  setLevel(level: LogLevel): void {
    this._minLevel = level;
  }

  /** 获取当前后端（供调试用） */
  getLogger(): ILogger {
    return this._backend;
  }

  // ---- 公共 API ----

  debug(tag: string, ...args: unknown[]): void {
    this._log('debug', tag, ...args);
  }

  info(tag: string, ...args: unknown[]): void {
    this._log('info', tag, ...args);
  }

  warn(tag: string, ...args: unknown[]): void {
    this._log('warn', tag, ...args);
  }

  error(tag: string, ...args: unknown[]): void {
    this._log('error', tag, ...args);
  }

  fatal(tag: string, ...args: unknown[]): void {
    this._log('fatal', tag, ...args);
  }

  destroy(): void {
    this._backend.destroy?.();
  }

  // ---- 内部 ----

  private _log(level: LogLevel, tag: string, ...args: unknown[]): void {
    if (level === 'silent') return;
    if (LEVEL_RANK[level] < LEVEL_RANK[this._minLevel]) return;
    const d = new Date();
    const ts = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    this._backend[level](`[${ts}] [${tag}]`, ...args);
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 全局日志单例 */
export const Log = new LogService();
