/**
 * ConsoleLogger - 控制台日志实现
 *
 * 职责：
 * - 将日志输出到浏览器 console
 * - 直接映射到 console.debug/log/warn/error 方法
 * - 无格式化（时间戳和 tag 由 Log 单例负责）
 *
 * 设计原则：
 * - 极简实现，仅做 console 方法映射
 * - 浏览器 console 自带级别着色，无需额外 CSS
 */
import { ILogger } from './ILogger.js';

export class ConsoleLogger implements ILogger {
  debug(...args: unknown[]): void {
    console.debug(...args);
  }

  info(...args: unknown[]): void {
    console.log(...args);
  }

  warn(...args: unknown[]): void {
    console.warn(...args);
  }

  error(...args: unknown[]): void {
    console.error(...args);
  }

  fatal(...args: unknown[]): void {
    console.error(...args);
  }

  destroy(): void {
    // 无状态需要清理
  }
}
