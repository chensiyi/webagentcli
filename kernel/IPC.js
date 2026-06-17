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

export class IPC {
  static PRIORITY = Object.freeze({ LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 });
  static PRIORITY_NAMES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

  constructor(options = {}) {
    this.listeners = new Map();
    this.messageHistory = [];
    this.maxHistory = options.maxHistory || 100;
    this.middlewares = [];
    this.channels = new Map();
    this.origin = options.origin || 'unknown';
    this.stats = { totalEmitted: 0, totalDelivered: 0, totalFiltered: 0, totalErrors: 0, byEvent: new Map() };
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  once(event, callback) {
    const wrapper = (data, message) => { callback(data, message); this.off(event, wrapper); };
    this.on(event, wrapper);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const cbs = this.listeners.get(event);
    const i = cbs.indexOf(callback);
    if (i !== -1) cbs.splice(i, 1);
  }

  emit(event, data = {}, options = {}) {
    const message = {
      event, data, timestamp: Date.now(), id: this._generateId(),
      priority: options.priority !== undefined ? options.priority : IPC.PRIORITY.NORMAL,
      origin: options.origin || this.origin,
      priorityName: IPC.PRIORITY_NAMES[options.priority] || 'NORMAL'
    };
    this.stats.totalEmitted++;
    if (!this.stats.byEvent.has(event)) this.stats.byEvent.set(event, { emitted: 0, delivered: 0 });
    this.stats.byEvent.get(event).emitted++;

    if (this._runMiddleware(message) === false) { this.stats.totalFiltered++; return message; }
    this._recordMessage(message);

    if (this.listeners.has(event)) {
      const cbs = [...this.listeners.get(event)];
      cbs.forEach(callback => {
        try { callback(message.data, message); this.stats.totalDelivered++; this.stats.byEvent.get(event).delivered++; }
        catch (error) { this.stats.totalErrors++; console.error(`[IPC] Error in listener for "${event}":`, error); }
      });
    }
    return message;
  }

  use(middleware) {
    this.middlewares.push(middleware);
    return () => { const i = this.middlewares.indexOf(middleware); if (i !== -1) this.middlewares.splice(i, 1); };
  }

  createChannel(namespace) {
    if (this.channels.has(namespace)) return this.channels.get(namespace);
    const channel = new IPCChannel(this, namespace);
    this.channels.set(namespace, channel);
    return channel;
  }

  emitHigh(event, data = {}) { return this.emit(event, data, { priority: IPC.PRIORITY.HIGH }); }
  emitLow(event, data = {}) { return this.emit(event, data, { priority: IPC.PRIORITY.LOW }); }

  getHistory(event = null) { return event ? this.messageHistory.filter(m => m.event === event) : [...this.messageHistory]; }
  clearHistory() { this.messageHistory = []; }

  getStats() {
    const byEvent = {};
    this.stats.byEvent.forEach((val, key) => byEvent[key] = { ...val });
    return { ...this.stats, byEvent, middlewareCount: this.middlewares.length, listenerCount: this.getListenerCount(), historySize: this.messageHistory.length };
  }

  getRegisteredEvents() { return Array.from(this.listeners.keys()); }
  getListenerCount(event = null) {
    if (event) { const l = this.listeners.get(event); return l ? l.length : 0; }
    let c = 0; this.listeners.forEach(l => c += l.length); return c;
  }
  removeAllListeners() { this.listeners.clear(); }

  destroy() {
    this.listeners.clear(); this.messageHistory = []; this.middlewares = []; this.channels.clear(); this.stats.byEvent.clear();
  }

  _generateId() { return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; }
  _recordMessage(message) { this.messageHistory.push(message); if (this.messageHistory.length > this.maxHistory) this.messageHistory.shift(); }

  _runMiddleware(message) {
    if (this.middlewares.length === 0) return true;
    let index = 0;
    const middlewares = [...this.middlewares];
    const next = () => {
      if (index >= middlewares.length) return true;
      const mw = middlewares[index++];
      try { const r = mw(message, next); return r !== false; }
      catch (error) { console.error('[IPC] Middleware error:', error); return true; }
    };
    return next() !== false;
  }

  async request(event, data = {}, options = {}) {
    const requestId = options.requestId || this._generateId();
    const timeout = options.timeout || 5000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.off(`${event}:response:${requestId}`, handler); reject(new Error(`[IPC] Request "${event}" timed out`)); }, timeout);
      const handler = (responseData) => {
        clearTimeout(timer); this.off(`${event}:response:${requestId}`, handler);
        if (responseData.error) reject(new Error(responseData.error)); else resolve(responseData.result);
      };
      this.on(`${event}:response:${requestId}`, handler);
      this.emit(event, { ...data, _requestId: requestId, _isRequest: true });
    });
  }

  onRequest(event, handler) {
    return this.on(event, async (data) => {
      if (!data._isRequest) return;
      const requestId = data._requestId;
      try { const result = await handler(data); this.emit(`${event}:response:${requestId}`, { result }); }
      catch (error) { this.emit(`${event}:response:${requestId}`, { error: error.message }); }
    });
  }

  respond(event, requestId, result) { this.emit(`${event}:response:${requestId}`, { result }); }
  respondError(event, requestId, errorMessage) { this.emit(`${event}:response:${requestId}`, { error: errorMessage }); }
}

export class IPCChannel {
  constructor(ipc, namespace) {
    this.ipc = ipc; this.namespace = namespace; this._prefix = `${namespace}:`;
  }
  on(event, callback) { return this.ipc.on(this._prefix + event, callback); }
  once(event, callback) { return this.ipc.once(this._prefix + event, callback); }
  off(event, callback) { this.ipc.off(this._prefix + event, callback); }
  emit(event, data = {}, options = {}) { return this.ipc.emit(this._prefix + event, data, { ...options, origin: `${this.ipc.origin}:${this.namespace}` }); }
  emitHigh(event, data = {}) { return this.emit(event, data, { priority: IPC.PRIORITY.HIGH }); }
  emitLow(event, data = {}) { return this.emit(event, data, { priority: IPC.PRIORITY.LOW }); }
  getNamespace() { return this.namespace; }
}

export default IPC;