/**
 * ILogger - 日志输出接口
 * 
 * 职责：
 * - 定义日志输出的最小契约
 * - 具体实现可对接 console、文件、远程服务等
 */

export interface ILogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(...args: unknown[]): void;
  destroy(): void;
}
