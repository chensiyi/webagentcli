/**
 * IPC — 模块间消息总线
 *
 * 精简后的核心职责：
 * - 事件订阅/发布：on / off / once / emit
 * - 中间件链：use（用于调试日志、消息转换等）
 * - 命名空间通道：getOrCreateChannel（子 IPC 实例）
 * - 基本查询：getRegisteredEvents / getListenerCount / removeAllListeners
 *
 * 移除的特性（设计审查 Phase 3 清理）：
 * - 消息优先级系统（PRIORITY / emitHigh / emitLow）— 从未有意义使用
 * - request/response 模式（request / onRequest / respond）— 从未使用
 * - 消息统计（stats / getStats）— 从未读取
 * - 消息历史（messageHistory / getHistory / clearHistory）— 从未在代码中调用
 *
 * 设计原则：
 * - 零外部依赖
 * - 可在任何 JS 环境运行
 * - IPC 的核心作用是"模块间解耦通信"，不需要 OS 级消息队列特性
 */

import { Log } from './services/Log.js';
import { genId } from './utils/id.js';

/** IPC 消息结构 */
export interface IPCMessage {
  event: string;
  data: unknown;
  timestamp: number;
  id: string;
  origin: string;
}

export type IPCCallback = (data: unknown, message: IPCMessage) => void;
export type IPCMiddleware = (message: IPCMessage, next: () => boolean) => boolean | void | Promise<boolean | void>;

export class IPC {
  private listeners: Map<string, IPCCallback[]> = new Map();
  private middlewares: IPCMiddleware[] = [];
  private subChannels: Map<string, IPC> = new Map();
  private origin: string;

  constructor(options: { origin?: string } = {}) {
    this.origin = options.origin ?? 'unknown';
  }

  /** 订阅事件，返回取消订阅函数 */
  on(event: string, callback: IPCCallback): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const list = this.listeners.get(event);
    if (list) list.push(callback);
    return () => this.off(event, callback);
  }

  /** 订阅一次 */
  once(event: string, callback: IPCCallback): void {
    const wrapper: IPCCallback = (data, message) => { callback(data, message); this.off(event, wrapper); };
    this.on(event, wrapper);
  }

  /** 取消订阅 */
  off(event: string, callback: IPCCallback): void {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    const i = cbs.indexOf(callback);
    if (i !== -1) cbs.splice(i, 1);
  }

  /** 发布事件 */
  emit(event: string, data: unknown = {}): IPCMessage {
    const message: IPCMessage = {
      event, data, timestamp: Date.now(), id: this._generateId(),
      origin: this.origin
    };

    // 区分本地发出 vs 远端接收（远端消息由 IPCTransport 注入 __remote 标记）
    const isRemote = data != null && typeof data === 'object' && (data as any).__remote === true;
    Log.debug('IPC', `${isRemote ? '← recv' : '→ emit'} ${this.origin} · ${event}`, data ?? null);

    if (this._runMiddleware(message) === false) return message;

    const cbs = this.listeners.get(event);
    if (cbs) {
      const callbacks = [...cbs];
      callbacks.forEach(callback => {
        try { callback(message.data, message); }
        catch (error) { Log.error('IPC', `Error in listener for "${event}":`, error); }
      });
    }
    return message;
  }

  /** 注册中间件，返回取消注册函数 */
  use(middleware: IPCMiddleware): () => void {
    this.middlewares.push(middleware);
    return () => { const i = this.middlewares.indexOf(middleware); if (i !== -1) this.middlewares.splice(i, 1); };
  }

  /** 获取或创建命名空间通道（子 IPC 实例） */
  getOrCreateChannel(name: string): IPC {
    const existing = this.subChannels.get(name);
    if (existing) return existing;
    const next = new IPC({ origin: `${this.origin}:${name}` });
    this.subChannels.set(name, next);
    return next;
  }

  getRegisteredEvents(): string[] { return Array.from(this.listeners.keys()); }

  getListenerCount(event: string | null = null): number {
    if (event) { const l = this.listeners.get(event); return l ? l.length : 0; }
    let c = 0; this.listeners.forEach(l => c += l.length); return c;
  }

  removeAllListeners(): void { this.listeners.clear(); }

  destroy(): void {
    this.listeners.clear();
    this.middlewares = [];
    this.subChannels.clear();
  }

  private _generateId(): string { return genId('msg'); }

  private _runMiddleware(message: IPCMessage): boolean {
    if (this.middlewares.length === 0) return true;
    let index = 0;
    const middlewares = [...this.middlewares];
    const next = () => {
      if (index >= middlewares.length) return true;
      const mw = middlewares[index++];
      try { const r = mw(message, next); return r !== false; }
      catch (error) { Log.error('IPC', 'Middleware error:', error); return true; }
    };
    return next() !== false;
  }
}
