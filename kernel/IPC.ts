/**
 * IPC - 进程间消息总线（操作系统级）
 * 
 * 继承 EventBus 的全部功能，新增 OS 级特性：
 * - 消息优先级：HIGH > NORMAL > LOW
 * - 消息来源追踪（sender origin）
 * - 中间件链（middleware）
 * - 命名空间通道
 * - 消息统计
 * 
 * 设计原则：
 * - 完全向后兼容 EventBus API
 * - 零外部依赖
 * - 可在任何 JS 环境运行
 */

import { Log } from './services/Log.js';

/** IPC 消息结构统一定义 */
export interface IPCMessage {
  event: string;
  data: unknown;
  timestamp: number;
  id: string;
  priority: number;
  origin: string;
  priorityName: string;
}

export type IPCCallback = (data: unknown, message: IPCMessage) => void;
export type IPCMiddleware = (message: IPCMessage & { next: () => boolean }, next: () => boolean) => boolean | void | Promise<boolean | void>;

export class IPC {
  static PRIORITY = Object.freeze({ LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 });
  static PRIORITY_NAMES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

  private listeners: Map<string, IPCCallback[]> = new Map();
  private messageHistory: IPCMessage[] = [];
  private maxHistory: number;
  private middlewares: IPCMiddleware[] = [];
  private subChannels: Map<string, IPC> = new Map();
  private origin: string;
  private stats: { totalEmitted: number; totalDelivered: number; totalFiltered: number; totalErrors: number; byEvent: Map<string, { emitted: number; delivered: number }> };

  constructor(options: { maxHistory?: number; origin?: string } = {}) {
    this.maxHistory = options.maxHistory ?? 100;
    this.origin = options.origin ?? 'unknown';
    this.stats = { totalEmitted: 0, totalDelivered: 0, totalFiltered: 0, totalErrors: 0, byEvent: new Map() };
  }

  on(event: string, callback: IPCCallback): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const list = this.listeners.get(event);
    if (list) list.push(callback);
    return () => this.off(event, callback);
  }

  once(event: string, callback: IPCCallback): void {
    const wrapper: IPCCallback = (data, message) => { callback(data, message); this.off(event, wrapper); };
    this.on(event, wrapper);
  }

  off(event: string, callback: IPCCallback): void {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    const i = cbs.indexOf(callback);
    if (i !== -1) cbs.splice(i, 1);
  }

  emit(event: string, data: unknown = {}, options: { priority?: number; origin?: string } = {}): IPCMessage {
    const message: IPCMessage = {
      event, data, timestamp: Date.now(), id: this._generateId(),
      priority: options.priority !== undefined ? options.priority : IPC.PRIORITY.NORMAL,
      origin: options.origin || this.origin,
      priorityName: IPC.PRIORITY_NAMES[options.priority] || 'NORMAL'
    };
    this.stats.totalEmitted++;
    const statsEvent = this.stats.byEvent.get(event) ?? { emitted: 0, delivered: 0 };
    if (!this.stats.byEvent.has(event)) this.stats.byEvent.set(event, statsEvent);
    statsEvent.emitted++;

    if (this._runMiddleware(Object.assign({}, message, { next: () => true })) === false) { this.stats.totalFiltered++; return message; }
    this._recordMessage(message);

    const cbs = this.listeners.get(event);
    if (cbs) {
      const callbacks = [...cbs];
      callbacks.forEach(callback => {
        try { callback(message.data, message); this.stats.totalDelivered++; statsEvent.delivered++; }
        catch (error) { this.stats.totalErrors++; Log.error('IPC', `Error in listener for "${event}":`, error); }
      });
    }
    return message;
  }

  use(middleware: IPCMiddleware): () => void {
    this.middlewares.push(middleware);
    return () => { const i = this.middlewares.indexOf(middleware); if (i !== -1) this.middlewares.splice(i, 1); };
  }
  getOrCreateChannel(name: string): IPC {
    const existing = this.subChannels.get(name);
    if (existing) return existing;
    const next = new IPC({ maxHistory: this.maxHistory, origin: `${this.origin}:${name}` });
    this.subChannels.set(name, next);
    return next;
  }
  emitHigh(event: string, data: unknown = {}): IPCMessage { return this.emit(event, data, { priority: IPC.PRIORITY.HIGH }); }
  emitLow(event: string, data: unknown = {}): IPCMessage { return this.emit(event, data, { priority: IPC.PRIORITY.LOW }); }

  getHistory(event: string | null = null): IPCMessage[] { return event ? this.messageHistory.filter(m => m.event === event) : [...this.messageHistory]; }
  clearHistory(): void { this.messageHistory = []; }

  getStats(): { totalEmitted: number; totalDelivered: number; totalFiltered: number; totalErrors: number; byEvent: Record<string, { emitted: number; delivered: number }>; middlewareCount: number; listenerCount: number; historySize: number } {
    const byEvent: Record<string, { emitted: number; delivered: number }> = {};
    this.stats.byEvent.forEach((val, key) => { byEvent[key] = { ...val }; });
    return { totalEmitted: this.stats.totalEmitted, totalDelivered: this.stats.totalDelivered, totalFiltered: this.stats.totalFiltered, totalErrors: this.stats.totalErrors, byEvent, middlewareCount: this.middlewares.length, listenerCount: this.getListenerCount(), historySize: this.messageHistory.length };
  }

  getRegisteredEvents(): string[] { return Array.from(this.listeners.keys()); }
  getListenerCount(event: string | null = null): number {
    if (event) { const l = this.listeners.get(event); return l ? l.length : 0; }
    let c = 0; this.listeners.forEach(l => c += l.length); return c;
  }
  removeAllListeners(): void { this.listeners.clear(); }

  destroy(): void {
    this.listeners.clear(); this.messageHistory = []; this.middlewares = []; this.subChannels.clear(); this.stats.byEvent.clear();
  }

  private _generateId(): string { return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; }
  private _recordMessage(message: IPCMessage): void { this.messageHistory.push(message); if (this.messageHistory.length > this.maxHistory) this.messageHistory.shift(); }

  private _runMiddleware(message: IPCMessage & { next: () => boolean }): boolean {
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

  async request(event: string, data: unknown = {}, options: { requestId?: string; timeout?: number } = {}): Promise<unknown> {
    const requestId = options.requestId ?? this._generateId();
    const timeout = options.timeout ?? 5000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.off(`${event}:response:${requestId}`, handler as IPCCallback); reject(new Error(`[IPC] Request "${event}" timed out`)); }, timeout);
      const handler = (responseData: unknown) => {
        clearTimeout(timer); this.off(`${event}:response:${requestId}`, handler as IPCCallback);
        if (responseData && typeof responseData === 'object' && 'error' in (responseData as Record<string, unknown>)) reject(new Error((responseData as { error: string }).error));
        else resolve((responseData as { result: unknown }).result);
      };
      this.on(`${event}:response:${requestId}`, handler as IPCCallback);
      this.emit(event, Object.assign({}, data, { _requestId: requestId, _isRequest: true }));
    });
  }

  onRequest(event: string, handler: (data: unknown) => Promise<unknown>): () => void {
    return this.on(event, async (data: unknown) => {
      if (!data || typeof data !== 'object' || !(data as { _isRequest?: boolean })?._isRequest) return;
      const requestId = (data as { _requestId?: string })?._requestId;
      if (!requestId) return;
      try { const result = await handler(data); this.emit(`${event}:response:${requestId}`, { result }); }
      catch (error) { this.emit(`${event}:response:${requestId}`, { error: (error as Error)?.message ?? String(error) }); }
    });
  }

  respond(event: string, requestId: string, result: unknown): void { this.emit(`${event}:response:${requestId}`, { result }); }
  respondError(event: string, requestId: string, errorMessage: string): void { this.emit(`${event}:response:${requestId}`, { error: errorMessage }); }
}