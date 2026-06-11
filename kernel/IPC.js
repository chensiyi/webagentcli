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

class IPC {
  static PRIORITY = Object.freeze({
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    CRITICAL: 3
  });

  static PRIORITY_NAMES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

  constructor(options = {}) {
    this.listeners = new Map();
    this.messageHistory = [];
    this.maxHistory = options.maxHistory || 100;
    this.middlewares = [];
    this.channels = new Map(); // namespace → IPC instance (lightweight proxy)
    this.origin = options.origin || 'unknown';
    
    // 统计
    this.stats = {
      totalEmitted: 0,
      totalDelivered: 0,
      totalFiltered: 0,
      totalErrors: 0,
      byEvent: new Map()
    };
  }

  // ==================== 核心 API（与 EventBus 兼容） ====================

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数 (data, message)
   * @returns {Function} 取消订阅函数
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  /**
   * 订阅一次性事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  once(event, callback) {
    const wrapper = (data, message) => {
      callback(data, message);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  /**
   * 取消订阅
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * 发布事件
   * @param {string} event - 事件名称
   * @param {Object} data - 事件数据
   * @param {Object} [options]
   * @param {number} [options.priority] - IPC.PRIORITY.*
   * @param {string} [options.origin] - 消息来源
   * @returns {Object} message
   */
  emit(event, data = {}, options = {}) {
    const message = {
      event,
      data,
      timestamp: Date.now(),
      id: this._generateId(),
      priority: options.priority !== undefined ? options.priority : IPC.PRIORITY.NORMAL,
      origin: options.origin || this.origin,
      priorityName: IPC.PRIORITY_NAMES[options.priority] || 'NORMAL'
    };

    // 统计
    this.stats.totalEmitted++;
    if (!this.stats.byEvent.has(event)) {
      this.stats.byEvent.set(event, { emitted: 0, delivered: 0 });
    }
    this.stats.byEvent.get(event).emitted++;

    // 中间件链
    const middlewareResult = this._runMiddleware(message);
    if (middlewareResult === false) {
      this.stats.totalFiltered++;
      return message; // 被中间件拦截
    }

    // 记录历史
    this._recordMessage(message);

    // 触发监听器
    if (this.listeners.has(event)) {
      const callbacks = [...this.listeners.get(event)];
      callbacks.forEach(callback => {
        try {
          callback(message.data, message);
          this.stats.totalDelivered++;
          this.stats.byEvent.get(event).delivered++;
        } catch (error) {
          this.stats.totalErrors++;
          console.error(`[IPC] Error in listener for "${event}":`, error);
        }
      });
    }

    // 全局 CustomEvent 转发（浏览器环境）
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      try {
        window.dispatchEvent(new CustomEvent(event, { detail: message }));
      } catch (e) {
        // 非浏览器环境忽略
      }
    }

    return message;
  }

  // ==================== IPC 增强特性 ====================

  /**
   * 注册中间件
   * @param {Function} middleware - (message, next) => void
   * @returns {Function} 移除中间件的函数
   */
  use(middleware) {
    this.middlewares.push(middleware);
    return () => {
      const index = this.middlewares.indexOf(middleware);
      if (index !== -1) this.middlewares.splice(index, 1);
    };
  }

  /**
   * 创建命名空间通道
   * @param {string} namespace - 通道名称
   * @returns {IPCChannel} 轻量级通道实例
   */
  createChannel(namespace) {
    if (this.channels.has(namespace)) {
      return this.channels.get(namespace);
    }
    const channel = new IPCChannel(this, namespace);
    this.channels.set(namespace, channel);
    return channel;
  }

  /**
   * 发送高优先级消息（快捷方式）
   * @param {string} event
   * @param {Object} data
   * @returns {Object} message
   */
  emitHigh(event, data = {}) {
    return this.emit(event, data, { priority: IPC.PRIORITY.HIGH });
  }

  /**
   * 发送低优先级消息（快捷方式）
   * @param {string} event
   * @param {Object} data
   * @returns {Object} message
   */
  emitLow(event, data = {}) {
    return this.emit(event, data, { priority: IPC.PRIORITY.LOW });
  }

  // ==================== 历史与统计 ====================

  /**
   * 获取消息历史
   * @param {string} [event] - 可选过滤
   * @returns {Array}
   */
  getHistory(event = null) {
    if (event) {
      return this.messageHistory.filter(m => m.event === event);
    }
    return [...this.messageHistory];
  }

  /**
   * 清空消息历史
   */
  clearHistory() {
    this.messageHistory = [];
  }

  /**
   * 获取消息统计
   * @returns {Object}
   */
  getStats() {
    const byEvent = {};
    this.stats.byEvent.forEach((val, key) => {
      byEvent[key] = { ...val };
    });
    return {
      ...this.stats,
      byEvent,
      middlewareCount: this.middlewares.length,
      listenerCount: this.getListenerCount(),
      historySize: this.messageHistory.length
    };
  }

  /**
   * 获取所有已注册事件
   * @returns {string[]}
   */
  getRegisteredEvents() {
    return Array.from(this.listeners.keys());
  }

  /**
   * 获取监听器数量
   * @param {string} [event] - 可选，指定事件
   * @returns {number}
   */
  getListenerCount(event = null) {
    if (event) {
      const listeners = this.listeners.get(event);
      return listeners ? listeners.length : 0;
    }
    let count = 0;
    this.listeners.forEach(l => count += l.length);
    return count;
  }

  /**
   * 清空所有监听器
   */
  removeAllListeners() {
    this.listeners.clear();
  }

  /**
   * 销毁 IPC 总线
   */
  destroy() {
    this.listeners.clear();
    this.messageHistory = [];
    this.middlewares = [];
    this.channels.clear();
    this.stats.byEvent.clear();
  }

  // ==================== 内部方法 ====================

  _generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _recordMessage(message) {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }
  }

  _runMiddleware(message) {
    if (this.middlewares.length === 0) return true;

    let index = 0;
    const middlewares = [...this.middlewares];

    const next = () => {
      if (index >= middlewares.length) return true;
      const middleware = middlewares[index++];
      try {
        const result = middleware(message, next);
        // 支持 async middleware
        if (result instanceof Promise) {
          console.warn('[IPC] Async middleware detected, consider using synchronous middleware for performance');
        }
        return result !== false;
      } catch (error) {
        console.error('[IPC] Middleware error:', error);
        return true; // middleware 抛异常不阻断
      }
    };

    const result = next();
    return result !== false;
  }

  // ==================== Request/Response 模式 ====================

  /**
   * 发送请求并等待响应
   * @param {string} event - 请求事件名
   * @param {Object} data - 请求数据
   * @param {Object} [options] - 选项
   * @param {number} [options.timeout=5000] - 超时时间（毫秒）
   * @param {string} [options.requestId] - 自定义请求ID
   * @returns {Promise<Object>} 响应数据
   */
  async request(event, data = {}, options = {}) {
    const requestId = options.requestId || this._generateId();
    const timeout = options.timeout || 5000;

    return new Promise((resolve, reject) => {
      // 设置超时
      const timer = setTimeout(() => {
        this.off(`${event}:response:${requestId}`, responseHandler);
        reject(new Error(`[IPC] Request "${event}" timed out after ${timeout}ms`));
      }, timeout);

      // 响应处理器
      const responseHandler = (responseData) => {
        clearTimeout(timer);
        this.off(`${event}:response:${requestId}`, responseHandler);
        
        if (responseData.error) {
          reject(new Error(responseData.error));
        } else {
          resolve(responseData.result);
        }
      };

      // 监听响应
      this.on(`${event}:response:${requestId}`, responseHandler);

      // 发送请求
      this.emit(event, {
        ...data,
        _requestId: requestId,
        _isRequest: true
      });
    });
  }

  /**
   * 处理请求（服务端）
   * @param {string} event - 请求事件名
   * @param {Function} handler - 处理函数 (data) => Promise<result>
   * @returns {Function} 取消处理函数
   */
  onRequest(event, handler) {
    return this.on(event, async (data, message) => {
      if (!data._isRequest) return; // 不是请求，忽略

      const requestId = data._requestId;
      const responseEvent = `${event}:response:${requestId}`;

      try {
        const result = await handler(data);
        this.emit(responseEvent, { result });
      } catch (error) {
        this.emit(responseEvent, { error: error.message });
      }
    });
  }

  /**
   * 发送响应（服务端）
   * @param {string} event - 原始请求事件名
   * @param {string} requestId - 请求ID
   * @param {Object} result - 响应结果
   */
  respond(event, requestId, result) {
    this.emit(`${event}:response:${requestId}`, { result });
  }

  /**
   * 发送错误响应（服务端）
   * @param {string} event - 原始请求事件名
   * @param {string} requestId - 请求ID
   * @param {string} errorMessage - 错误消息
   */
  respondError(event, requestId, errorMessage) {
    this.emit(`${event}:response:${requestId}`, { error: errorMessage });
  }
}

/**
 * IPCChannel - IPC 命名空间通道
 * 自动给所有 emit 的事件添加命名空间前缀
 */
class IPCChannel {
  constructor(ipc, namespace) {
    this.ipc = ipc;
    this.namespace = namespace;
    this._prefix = `${namespace}:`;
  }

  on(event, callback) {
    return this.ipc.on(this._prefix + event, callback);
  }

  once(event, callback) {
    return this.ipc.once(this._prefix + event, callback);
  }

  off(event, callback) {
    this.ipc.off(this._prefix + event, callback);
  }

  emit(event, data = {}, options = {}) {
    const channelOptions = {
      ...options,
      origin: options.origin || `${this.ipc.origin}:${this.namespace}`
    };
    return this.ipc.emit(this._prefix + event, data, channelOptions);
  }

  emitHigh(event, data = {}) {
    return this.emit(event, data, { priority: IPC.PRIORITY.HIGH });
  }

  emitLow(event, data = {}) {
    return this.emit(event, data, { priority: IPC.PRIORITY.LOW });
  }

  getNamespace() {
    return this.namespace;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IPC, IPCChannel };
}
if (typeof window !== 'undefined') {
  window.IPC = IPC;
  window.IPCChannel = IPCChannel;
}
