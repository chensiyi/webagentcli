/**
 * Web Agent Kernel Bundle
 * 由 build.js 自动生成，请勿手动编辑
 * 源码位于 kernel/ 目录
 */
(function(root) {
  'use strict';

  // 初始化命名空间
  const webagent = root.webagent = root.webagent || {};
  webagent.models = webagent.models || {};
  webagent.services = webagent.services || {};
  webagent.providers = webagent.providers || {};
  webagent.programs = webagent.programs || {};
  webagent.tools = webagent.tools || {};

  // ========== kernel/KernelLog.js ==========
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
  root.KernelLog = KernelLog;

  // ========== kernel/IPC.js ==========
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
  root.IPC = IPC;
  root.IPCChannel = IPCChannel;

  // ========== kernel/Events.js ==========
  /**
   * KernelEvents - 内核事件常量定义
   * 
   * 纯常量定义，零外部依赖
   * 包含：Chat / Settings / Service / UI / Storage / Scripts / Tool 事件
   * 以及 Kernel 系统事件
   * 
   * 事件命名规范：
   * - 格式：{domain}:{action}
   * - 示例：chat:messageAdded, settings:loaded
   * - 使用小写字母和冒号分隔
   */
  
  const KernelEvents = {
    // ==================== Kernel 系统事件 ====================
    KERNEL: {
      BOOT_START: 'kernel:bootStart',
      BOOT_PHASE: 'kernel:bootPhase',
      BOOT_COMPLETE: 'kernel:bootComplete',
      BOOT_ERROR: 'kernel:bootError',
      SHUTDOWN: 'kernel:shutdown',
      STATE_CHANGED: 'kernel:stateChanged',
      SERVICE_REGISTERED: 'kernel:serviceRegistered',
      SERVICE_INITIALIZED: 'kernel:serviceInitialized',
      SERVICE_STATE_CHANGED: 'kernel:serviceStateChanged',
      SERVICE_ERROR: 'kernel:serviceError',
    },
  
    // ==================== Chat 相关事件 ====================
    CHAT: {
      MESSAGE_ADDED: 'chat:messageAdded',
      MESSAGE_UPDATED: 'chat:messageUpdated',
      MESSAGE_DELETED: 'chat:messageDeleted',
      MESSAGES_ADDED: 'chat:messagesAdded',
      USER_MESSAGE_SENT: 'chat:userMessageSent',
      STREAM_START: 'chat:streamStart',
      STREAM_CHUNK_APPEND: 'chat:streamChunkAppend',
      STREAM_UPDATE: 'chat:streamUpdate',
      STREAM_COMPLETE: 'chat:streamComplete',
      STREAM_ERROR: 'chat:streamError',
      STREAM_STOP: 'chat:streamStop',
      ACTIVITY_STATE_CHANGED: 'chat:activityStateChanged',
      SESSION_CREATED: 'chat:sessionCreated',
      SESSION_SWITCHED: 'chat:sessionSwitched',
      SESSION_CLEARED: 'chat:sessionCleared',
      SESSION_DELETED: 'chat:sessionDeleted',
      SESSION_CLEAR_REQUEST: 'chat:sessionClearRequest',
      SESSION_LOADED: 'chat:sessionLoaded',
      SESSION_UPDATED: 'chat:sessionUpdated',
      CURRENT_SESSION_CHANGED: 'chat:currentSessionChanged',
      ALL_SESSIONS_CLEARED: 'chat:allSessionsCleared',
    },
  
    // ==================== Settings 相关事件 ====================
    SETTINGS: {
      LOADED: 'settings:loaded',
      UPDATED: 'settings:updated',
      SAVE_REQUEST: 'settings:saveRequest',
      SAVED: 'settings:saved',
      RESET: 'settings:reset',
      API_STANDARD_CHANGED: 'settings:apiStandardChanged',
      API_ENDPOINT_CHANGED: 'settings:apiEndpointChanged',
      MODEL_CHANGED: 'settings:modelChanged',
      MODELS_REQUEST: 'settings:modelsRequest',
      MODELS_LOADED: 'settings:modelsLoaded',
      MODELS_ERROR: 'settings:modelsError',
    },
  
    // ==================== Service 相关事件 ====================
    SERVICE: {
      CONFIGURED: 'service:configured',
      SWITCHED: 'service:switched',
      ERROR: 'service:error',
      STATE_CHANGED: 'service:stateChanged',
      HEALTH_CHECK: 'service:healthCheck',
    },
  
    // ==================== UI 相关事件 ====================
    UI: {
      PAGE_CHANGED: 'ui:pageChanged',
      THEME_CHANGED: 'ui:themeChanged',
      LOADING: 'ui:loading',
      ERROR: 'ui:error',
      NOTIFICATION: 'ui:notification',
    },
  
    // ==================== Storage 相关事件 ====================
    STORAGE: {
      LOADED: 'storage:loaded',
      SEARCHED: 'storage:searched',
      ERROR: 'storage:error',
      SAVED: 'storage:saved',
      DELETED: 'storage:deleted',
    },
  
    // ==================== Scripts 相关事件 ====================
    SCRIPTS: {
      LOADED: 'scripts:loaded',
      ERROR: 'scripts:error',
      INJECTED: 'scripts:injected',
      EXECUTED: 'scripts:executed',
    },
  
    // ==================== Tool 相关事件 ====================
    TOOL: {
      EXECUTING: 'tool:executing',
      COMPLETED: 'tool:completed',
      ALL_COMPLETED: 'tool:allCompleted',
      ERROR: 'tool:error',
      REGISTERED: 'tool:registered',
      UNREGISTERED: 'tool:unregistered',
    },
  
    // ==================== Task 相关事件 ====================
    TASK: {
      CREATED: 'task:created',
      STATUS_CHANGED: 'task:statusChanged',
      OUTPUT_UPDATED: 'task:outputUpdated',
      ERROR: 'task:error',
      QUEUED: 'task:queued',
      STARTED: 'task:started',
      COMPLETED: 'task:completed',
      CANCELLED: 'task:cancelled',
      RETRIED: 'task:retried',
      DELETED: 'task:deleted',
      BATCH_UPDATE: 'task:batchUpdate'
    },
  
    // ==================== IPC 系统事件 ====================
    IPC: {
      MIDDLEWARE_ERROR: 'ipc:middlewareError',
      CHANNEL_CREATED: 'ipc:channelCreated',
      MESSAGE_SENT: 'ipc:messageSent',
      MESSAGE_RECEIVED: 'ipc:messageReceived',
      REQUEST_TIMEOUT: 'ipc:requestTimeout',
    },
  
    // ==================== Capability 相关事件 ====================
    CAPABILITY: {
      CHECK: 'capability:check',
      DENIED: 'capability:denied',
      GRANTED: 'capability:granted',
      REVOKED: 'capability:revoked',
    }
  };
  
  /**
   * 消息格式规范
   * 
   * 定义每个事件的数据结构，用于验证和文档
   */
  const KernelMessageFormats = {
    // Kernel 系统事件
    KERNEL_BOOT_START: {
      timestamp: 'number - 启动时间戳'
    },
    KERNEL_BOOT_PHASE: {
      phase: 'string - 启动阶段名称',
      duration: 'number - 阶段耗时（毫秒）'
    },
    KERNEL_BOOT_COMPLETE: {
      duration: 'number - 总启动耗时（毫秒）',
      services: 'string[] - 已初始化的服务列表'
    },
    KERNEL_SERVICE_STATE_CHANGED: {
      service: 'string - 服务名称',
      oldState: 'string - 旧状态',
      newState: 'string - 新状态',
      reason: 'string - 状态变更原因（可选）'
    },
  
    // Chat 事件
    MESSAGE_ADDED: {
      message: 'Message对象',
      type: "'user' | 'assistant' | 'system' | 'tool'"
    },
    STREAM_UPDATE: {
      message: 'Message对象',
      content: 'string - 新增的文本内容',
      reasoning_content: 'string - 推理内容（可选）'
    },
    STREAM_CHUNK_APPEND: {
      messageId: 'string - 消息ID',
      content: 'string - 分片内容（可能为空）',
      reasoning_content: 'string - 推理分片内容（可能为空）'
    },
    STREAM_COMPLETE: {
      message: 'Message对象',
      duration: 'number - 耗时（毫秒，可选）'
    },
    STREAM_ERROR: {
      error: 'Error对象',
      message: 'string - 错误消息'
    },
    SESSION_SWITCHED: {
      sessionId: 'string',
      session: 'Session对象'
    },
    SESSION_CREATED: {
      session: 'Session对象'
    },
    SESSION_DELETED: {
      sessionId: 'string'
    },
  
    // Settings 事件
    SETTINGS_UPDATED: {
      key: 'string - 更新的键名',
      value: 'any - 新值',
      oldValue: 'any - 旧值（可选）'
    },
    SETTINGS_LOADED: {
      settings: 'Settings对象'
    },
  
    // Service 事件
    SERVICE_STATE_CHANGED: {
      service: 'string - 服务名称',
      oldState: 'string - 旧状态',
      newState: 'string - 新状态',
      reason: 'string - 状态变更原因（可选）'
    },
    SERVICE_ERROR: {
      service: 'string - 服务名称',
      error: 'Error对象',
      context: 'Object - 错误上下文（可选）'
    },
  
    // Tool 事件
    TOOL_EXECUTING: {
      tool: 'string - 工具名称',
      args: 'Object - 工具参数'
    },
    TOOL_COMPLETED: {
      tool: 'string - 工具名称',
      result: 'Object - 工具结果',
      duration: 'number - 执行耗时（毫秒）'
    },
    TOOL_ERROR: {
      tool: 'string - 工具名称',
      error: 'Error对象'
    },
  
    // UI 事件
    UI_LOADING: {
      key: 'string - 加载标识',
      loading: 'boolean - 是否加载中'
    },
    UI_ERROR: {
      message: 'string - 错误消息',
      error: 'Error对象（可选）'
    },
    UI_NOTIFICATION: {
      type: "'info' | 'success' | 'warning' | 'error'",
      message: 'string - 通知消息',
      duration: 'number - 显示时长（毫秒，可选）'
    }
  };
  
  /**
   * 事件验证器
   * 用于验证事件数据是否符合规范
   */
  class EventValidator {
    /**
     * 验证事件数据
     * @param {string} eventName - 事件名称
     * @param {Object} data - 事件数据
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static validate(eventName, data) {
      const format = KernelMessageFormats[eventName];
      if (!format) {
        return { valid: true, errors: [] }; // 未知事件，跳过验证
      }
  
      const errors = [];
      
      for (const [key, description] of Object.entries(format)) {
        if (!(key in data)) {
          errors.push(`Missing required field: ${key}`);
        }
      }
  
      return {
        valid: errors.length === 0,
        errors
      };
    }
  
    /**
     * 获取事件格式定义
     * @param {string} eventName - 事件名称
     * @returns {Object|null}
     */
    static getFormat(eventName) {
      return KernelMessageFormats[eventName] || null;
    }
  
    /**
     * 获取所有事件格式
     * @returns {Object}
     */
    static getAllFormats() {
      return { ...KernelMessageFormats };
    }
  }
  
  // 导出
  root.KernelEvents = KernelEvents;
  root.KernelMessageFormats = KernelMessageFormats;
  root.EventValidator = EventValidator;

  // ========== kernel/ToolRegistry.js ==========
  /**
   * ToolRegistry - 系统调用注册表
   * 
   * 职责：
   * - 系统调用（工具）的注册、查询、生命周期管理
   * - 标准化工具契约（ToolDefinition）
   * - 按权限查询工具
   * - 执行审计
   * 
   * 设计原则：
   * - 每个工具是一个"系统调用"，通过名称标识
   * - 工具与能力（capability）绑定，供 CapabilityManager 检查
   * - 零外部依赖
   */
  
  class ToolRegistry {
    constructor(options = {}) {
      this._tools = new Map();      // name → IToolService 实例
      this._invocationHistory = [];
      this._maxHistory = options.maxHistory || 500;
      this._beforeInvoke = options.beforeInvoke || null; // middleware
      this._afterInvoke = options.afterInvoke || null;   // middleware
    }
  
    /**
     * 注册工具
     * @param {IToolService} tool - 工具实例（必须包含 definition 和 invoke 方法）
     * @throws {Error} 如果工具名已存在
     */
    register(tool) {
      if (!tool || !tool.definition || !tool.definition.name) {
        throw new Error('[ToolRegistry] Invalid tool: must have a definition with name');
      }
      const name = tool.definition.name;
      if (this._tools.has(name)) {
        throw new Error(`[ToolRegistry] Tool "${name}" already registered`);
      }
      this._tools.set(name, tool);
      return this;
    }
  
    /**
     * 批量注册工具（忽略重复注册错误）
     * @param {IToolService[]} tools
     */
    registerAll(tools) {
      tools.forEach(tool => {
        try {
          this.register(tool);
        } catch (e) {
          console.warn(`[ToolRegistry] Failed to register tool "${tool.definition?.name}":`, e.message);
        }
      });
      return this;
    }
  
    /**
     * 注销工具
     * @param {string} name
     */
    unregister(name) {
      this._tools.delete(name);
      return this;
    }
  
    /**
     * 获取指定工具
     * @param {string} name
     * @returns {IToolService|null}
     */
    get(name) {
      return this._tools.get(name) || null;
    }
  
    /**
     * 获取所有已注册的工具
     * @returns {IToolService[]}
     */
    getAll() {
      return Array.from(this._tools.values());
    }
  
    /**
     * 获取所有已启用的工具
     * @returns {IToolService[]}
     */
    getEnabled() {
      return Array.from(this._tools.values()).filter(t => t.enabled !== false);
    }
  
    /**
     * 获取已禁用（enabled === false）的工具
     * @returns {IToolService[]}
     */
    getDisabled() {
      return Array.from(this._tools.values()).filter(t => t.enabled === false);
    }
  
    /**
     * 启用工具
     * @param {string} name
     */
    enable(name) {
      const tool = this._tools.get(name);
      if (tool) {
        tool.enabled = true;
      }
    }
  
    /**
     * 禁用工具
     * @param {string} name
     */
    disable(name) {
      const tool = this._tools.get(name);
      if (tool) {
        tool.enabled = false;
      }
    }
  
    /**
     * 检查工具是否已注册
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
      return this._tools.has(name);
    }
  
    /**
     * 获取已启用工具的数量
     * @returns {number}
     */
    getEnabledCount() {
      return this.getEnabled().length;
    }
  
    /**
     * 获取工具总数
     * @returns {number}
     */
    getTotalCount() {
      return this._tools.size;
    }
  
    /**
     * 获取工具定义列表（用于传给 LLM 的 tools 参数）
     * @param {string} [format='openai'] - 输出格式
     * @returns {Array}
     */
    getDefinitionsForLLM(format = 'openai') {
      const enabledTools = this.getEnabled();
      if (format === 'openai') {
        return enabledTools
          .filter(t => t.definition && typeof t.definition.toOpenAIFunction === 'function')
          .map(t => t.definition.toOpenAIFunction());
      }
      return enabledTools.map(t => t.definition);
    }
  
    /**
     * 按能力（capability）查询工具
     * @param {string} capability
     * @returns {IToolService[]}
     */
    findByCapability(capability) {
      return this.getEnabled().filter(t => {
        if (!t.definition) return false;
        const caps = t.definition.capabilities || [];
        return caps.includes(capability);
      });
    }
  
    /**
     * 获取调用历史
     * @param {Object} [filters]
     * @param {string} [filters.toolName] - 按工具名过滤
     * @param {string} [filters.status] - 按状态过滤
     * @param {number} [filters.since] - 起始时间戳
     * @param {number} [filters.limit] - 返回条数上限
     * @returns {Array}
     */
    getInvocationHistory(filters = {}) {
      let result = [...this._invocationHistory];
  
      if (filters.toolName) {
        result = result.filter(entry => entry.toolName === filters.toolName);
      }
      if (filters.status) {
        result = result.filter(entry => entry.status === filters.status);
      }
      if (filters.since) {
        result = result.filter(entry => entry.timestamp >= filters.since);
      }
      if (filters.limit && result.length > filters.limit) {
        result = result.slice(-filters.limit);
      }
  
      return result;
    }
  
    /**
     * 记录调用（由外部在 invoke 前后调用）
     * @param {Object} record
     * @param {string} record.toolName
     * @param {string} record.toolCallId
     * @param {string} record.status - 'started' | 'completed' | 'failed'
     * @param {number} [record.duration]
     * @param {*} [record.error]
     */
    recordInvocation(record) {
      this._invocationHistory.push({
        ...record,
        timestamp: Date.now(),
        id: `invoke_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      });
      if (this._invocationHistory.length > this._maxHistory) {
        this._invocationHistory.shift();
      }
    }
  
    /**
     * 设置调用前中间件
     * @param {Function} middleware - (toolCall, context) => boolean | void
     */
    setBeforeInvoke(middleware) {
      this._beforeInvoke = middleware;
    }
  
    /**
     * 设置调用后中间件
     * @param {Function} middleware - (result, context) => void
     */
    setAfterInvoke(middleware) {
      this._afterInvoke = middleware;
    }
  
    /**
     * 执行调用前检查（供 ChatController 使用）
     * @param {Object} toolCall
     * @param {Object} context
     * @returns {boolean} true 表示允许执行
     */
    runBeforeInvoke(toolCall, context = {}) {
      if (this._beforeInvoke) {
        try {
          const result = this._beforeInvoke(toolCall, context);
          return result !== false;
        } catch (e) {
          console.error('[ToolRegistry] beforeInvoke error:', e);
          return false;
        }
      }
      return true;
    }
  
    /**
     * 执行调用后处理（供 ChatController 使用）
     * @param {Object} result
     * @param {Object} context
     */
    runAfterInvoke(result, context = {}) {
      if (this._afterInvoke) {
        try {
          this._afterInvoke(result, context);
        } catch (e) {
          console.error('[ToolRegistry] afterInvoke error:', e);
        }
      }
    }
  
    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
      const totalInvocations = this._invocationHistory.length;
      const completed = this._invocationHistory.filter(e => e.status === 'completed').length;
      const failed = this._invocationHistory.filter(e => e.status === 'failed').length;
  
      return {
        totalTools: this._tools.size,
        enabledTools: this.getEnabledCount(),
        disabledTools: this.getDisabled().length,
        totalInvocations,
        completed,
        failed,
        successRate: totalInvocations > 0 ? (completed / totalInvocations * 100).toFixed(1) + '%' : 'N/A'
      };
    }
  
    /**
     * 清空调用历史
     */
    clearHistory() {
      this._invocationHistory = [];
    }
  
    /**
     * 清空所有注册
     */
    clear() {
      this._tools.clear();
      this._invocationHistory = [];
    }
  
    /**
     * 销毁
     */
    destroy() {
      this.clear();
      this._beforeInvoke = null;
      this._afterInvoke = null;
    }
  }
  
  // 导出
  root.ToolRegistry = ToolRegistry;

  // ========== kernel/CapabilityManager.js ==========
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
  root.CapabilityManager = CapabilityManager;
  root.CapabilityError = CapabilityError;

  // ========== kernel/Kernel.js ==========
  /**
   * Kernel - 核心内核
   * 
   * 职责：
   * - 服务注册表：管理所有服务的注册、懒加载、生命周期
   * - 承载内核子系统引用（IPC / ToolRegistry / CapabilityManager / KernelLog）
   * - 提供统一的 boot() / shutdown() 生命周期
   * - 零外部依赖，可在任何 JS 环境运行
   * 
   * 设计原则：
   * - 内核最小化：只做服务注册、消息路由、生命周期
   * - 所有业务逻辑在 Service 层，Kernel 不执行业务
   * - Kernel 不持有 window、chrome.*、document 引用
   */
  
  class Kernel {
    /**
     * @param {Object} [options]
     * @param {IPC} [options.ipc] - 可注入外部 IPC 实例
     * @param {KernelLog} [options.log] - 可注入外部日志实例
     * @param {string} [options.origin] - 内核来源标识
     */
    constructor(options = {}) {
      // 状态
      this.state = Kernel.STATE.CREATED;
      this.origin = options.origin || 'kernel';
  
      // 内核子系统（由 Kernel 或 Bootloader 初始化）
      this.log = options.log || null;
      this.ipc = options.ipc || null;
      this.toolRegistry = null;
      this.capabilities = null;
  
      // 服务注册表：name → { factory, instance, options }
      this._services = new Map();
      // 生命周期的钩子
      this._hooks = {
        beforeBoot: [],
        afterBoot: [],
        beforeShutdown: [],
        afterShutdown: []
      };
      // 存储每个阶段初始化的服务名
      this._bootOrder = [];
    }
  
    // ==================== 状态 ====================
  
    static STATE = Object.freeze({
      CREATED: 'created',
      BOOTING: 'booting',
      RUNNING: 'running',
      SHUTTING_DOWN: 'shutting_down',
      SHUTDOWN: 'shutdown',
      FAILED: 'failed'
    });
  
    // ==================== 生命周期 ====================
  
    /**
     * 启动内核
     * 按注册顺序执行服务的初始化
     * @returns {Promise<void>}
     */
    async boot() {
      if (this.state !== Kernel.STATE.CREATED) {
        throw new Error(`[Kernel] Cannot boot: current state is "${this.state}"`);
      }
  
      this.state = Kernel.STATE.BOOTING;
      this.log && this.log.info('KERNEL', 'Booting kernel...');
  
      try {
        // 1. 运行 beforeBoot 钩子
        await this._runHooks('beforeBoot');
  
        // 2. 初始化所有已注册的服务
        for (const [name, entry] of this._services) {
          if (entry.options.autoInit !== false) {
            this.log && this.log.debug('KERNEL', `Initializing service: ${name}`);
            await this._initService(name, entry);
            this._bootOrder.push(name);
          }
        }
  
        // 3. 运行 afterBoot 钩子
        await this._runHooks('afterBoot');
  
        this.state = Kernel.STATE.RUNNING;
        this.log && this.log.info('KERNEL', `Kernel booted. Services: ${this._services.size} registered, ${this._bootOrder.length} initialized`);
      } catch (error) {
        this.state = Kernel.STATE.FAILED;
        this.log && this.log.error('KERNEL', 'Kernel boot failed', error);
        throw error;
      }
    }
  
    /**
     * 关闭内核
     * 逆序关闭所有服务
     * @returns {Promise<void>}
     */
    async shutdown() {
      if (this.state !== Kernel.STATE.RUNNING) return;
  
      this.state = Kernel.STATE.SHUTTING_DOWN;
      this.log && this.log.info('KERNEL', 'Shutting down kernel...');
  
      try {
        await this._runHooks('beforeShutdown');
  
        // 逆序关闭已初始化的服务
        const initialized = Array.from(this._services.entries())
          .filter(([, e]) => e.instance !== null);
        
        for (const [name, entry] of initialized.reverse()) {
          if (entry.instance && typeof entry.instance.shutdown === 'function') {
            this.log && this.log.debug('KERNEL', `Shutting down service: ${name}`);
            try {
              await entry.instance.shutdown();
            } catch (e) {
              this.log && this.log.warn('KERNEL', `Service "${name}" shutdown error`, e);
            }
          }
          entry.instance = null;
        }
  
        await this._runHooks('afterShutdown');
  
        // 销毁内核子系统
        if (this.toolRegistry) this.toolRegistry.destroy();
        if (this.capabilities) this.capabilities.destroy();
        if (this.ipc) this.ipc.destroy();
        if (this.log) this.log.destroy();
  
        this.state = Kernel.STATE.SHUTDOWN;
        this.log && this.log.info('KERNEL', 'Kernel shutdown complete');
      } catch (error) {
        this.state = Kernel.STATE.FAILED;
        this.log && this.log.error('KERNEL', 'Kernel shutdown failed', error);
        throw error;
      }
    }
  
    // ==================== 服务注册 ====================
  
    /**
     * 注册一个服务工厂
     * @param {string} name - 服务名称（唯一）
     * @param {Function|Object} factory - 工厂函数 (kernel) => instance，或直接是服务实例
     * @param {Object} [options]
     * @param {boolean} [options.autoInit=true] - 是否在 boot() 时自动初始化
     * @param {boolean} [options.singleton=true] - 是否为单例
     * @param {string[]} [options.dependsOn] - 依赖的服务名称列表
     */
    register(name, factory, options = {}) {
      if (this._services.has(name)) {
        throw new Error(`[Kernel] Service "${name}" already registered`);
      }
      if (this.state !== Kernel.STATE.CREATED && this.state !== Kernel.STATE.BOOTING) {
        throw new Error(`[Kernel] Cannot register service "${name}" after boot`);
      }
  
      this._services.set(name, {
        factory,
        instance: null,
        options: {
          autoInit: true,
          singleton: true,
          dependsOn: [],
          ...options
        }
      });
  
      this.log && this.log.debug('KERNEL', `Service registered: ${name}`);
      return this;
    }
  
    /**
     * 获取服务实例（懒加载）
     * @param {string} name - 服务名称
     * @returns {*} 服务实例
     */
    get(name) {
      const entry = this._services.get(name);
      if (!entry) {
        throw new Error(`[Kernel] Service "${name}" not registered`);
      }
      return entry.instance;
    }
  
    /**
     * 检查服务是否已注册
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
      return this._services.has(name);
    }
  
    /**
     * 获取所有已注册服务的名称
     * @returns {string[]}
     */
    getServiceNames() {
      return Array.from(this._services.keys());
    }
  
    /**
     * 获取所有已初始化的服务实例
     * @returns {Map<string, *>}
     */
    getAllServices() {
      const result = new Map();
      this._services.forEach((entry, name) => {
        if (entry.instance !== null) {
          result.set(name, entry.instance);
        }
      });
      return result;
    }
  
    // ==================== 钩子管理 ====================
  
    /**
     * 注册生命周期钩子
     * @param {'beforeBoot'|'afterBoot'|'beforeShutdown'|'afterShutdown'} phase
     * @param {Function} hook - async function(kernel) => void
     */
    on(phase, hook) {
      if (!this._hooks[phase]) {
        throw new Error(`[Kernel] Unknown phase: "${phase}"`);
      }
      this._hooks[phase].push(hook);
      return this;
    }
  
    // ==================== 内部方法 ====================
  
    /**
     * 初始化单个服务
     * @private
     */
    async _initService(name, entry) {
      // 如果已初始化，跳过
      if (entry.instance !== null) return;
  
      const { factory, options } = entry;
  
      // 先初始化依赖
      if (options.dependsOn && options.dependsOn.length > 0) {
        for (const depName of options.dependsOn) {
          const depEntry = this._services.get(depName);
          if (!depEntry) {
            throw new Error(`[Kernel] Service "${name}" depends on "${depName}", but it's not registered`);
          }
          await this._initService(depName, depEntry);
        }
      }
  
      // 创建实例
      if (typeof factory === 'function') {
        entry.instance = await factory(this);
      } else {
        entry.instance = factory;
      }
  
      // 如果实例有 init 方法，调用它
      if (entry.instance && typeof entry.instance.init === 'function') {
        await entry.instance.init(this);
      }
    }
  
    /**
     * 运行指定阶段的所有钩子
     * @private
     */
    async _runHooks(phase) {
      const hooks = this._hooks[phase] || [];
      for (const hook of hooks) {
        try {
          await hook(this);
        } catch (error) {
          this.log && this.log.error('KERNEL', `Hook error in phase "${phase}"`, error);
          throw error;
        }
      }
    }
  
    /**
     * 获取内核信息
     * @returns {Object}
     */
    getInfo() {
      return {
        state: this.state,
        origin: this.origin,
        services: {
          total: this._services.size,
          initialized: Array.from(this._services.values()).filter(e => e.instance !== null).length,
          names: this.getServiceNames(),
          bootOrder: [...this._bootOrder]
        },
        subsystems: {
          hasIPC: this.ipc !== null,
          hasLog: this.log !== null,
          hasToolRegistry: this.toolRegistry !== null,
          hasCapabilities: this.capabilities !== null
        }
      };
    }
  }
  
  // 导出
  root.Kernel = Kernel;

  // ========== kernel/Bootloader.js ==========
  /**
   * Bootloader - 启动序列
   * 
   * 职责：
   * - 定义内核启动的标准化阶段
   * - 管理引导顺序：内核子系统 → 服务注册 → 服务初始化 → 就绪
   * - 每个阶段可注册钩子，精确控制启动流程
   * 
   * 启动阶段：
   *   1. CORE_INIT      - 初始化 IPC、KernelLog、CapabilityManager、ToolRegistry
   *   2. SERVICES_REGISTER - 注册所有 Service 工厂
   *   3. SERVICES_INIT   - 按依赖关系初始化所有 Service
   *   4. TOOLS_REGISTER  - 注册内置工具
   *   5. HANDLERS_INIT   - 应用层处理器初始化（由壳层实现）
   *   6. CONFIG_LOAD     - 加载配置/设置（由壳层实现）
   *   7. UI_RENDER       - 渲染 UI（由壳层实现）
   *   8. READY           - 就绪
   */
  
  class Bootloader {
    static PHASES = Object.freeze({
      CORE_INIT: 'core_init',
      SERVICES_REGISTER: 'services_register',
      SERVICES_INIT: 'services_init',
      TOOLS_REGISTER: 'tools_register',
      HANDLERS_INIT: 'handlers_init',
      CONFIG_LOAD: 'config_load',
      UI_RENDER: 'ui_render',
      READY: 'ready'
    });
  
    static PHASE_ORDER = [
      Bootloader.PHASES.CORE_INIT,
      Bootloader.PHASES.SERVICES_REGISTER,
      Bootloader.PHASES.SERVICES_INIT,
      Bootloader.PHASES.TOOLS_REGISTER,
      Bootloader.PHASES.HANDLERS_INIT,
      Bootloader.PHASES.CONFIG_LOAD,
      Bootloader.PHASES.UI_RENDER,
      Bootloader.PHASES.READY
    ];
  
    /**
     * @param {Kernel} kernel - 内核实例
     */
    constructor(kernel) {
      this.kernel = kernel;
      this.currentPhase = null;
      this.phaseHooks = new Map(); // phase → Set<hook>
      this.phaseResults = new Map(); // phase → result
      this._phaseTimings = [];
    }
  
    /**
     * 注册指定阶段的钩子
     * @param {string} phase - Bootloader.PHASES.*
     * @param {Function} hook - async (bootloader) => void
     */
    on(phase, hook) {
      if (!this.phaseHooks.has(phase)) {
        this.phaseHooks.set(phase, []);
      }
      this.phaseHooks.get(phase).push(hook);
      return this;
    }
  
    /**
     * 执行启动流程
     * @returns {Promise<void>}
     */
    async boot() {
      const kernel = this.kernel;
      kernel.log && kernel.log.info('BOOT', 'Bootloader starting...');
  
      for (const phase of Bootloader.PHASE_ORDER) {
        this.currentPhase = phase;
        const startTime = Date.now();
  
        kernel.log && kernel.log.info('BOOT', `Phase: ${phase}`);
  
        try {
          // 执行当前阶段的所有钩子
          await this._runPhaseHooks(phase);
  
          const duration = Date.now() - startTime;
          this._phaseTimings.push({ phase, duration });
          this.phaseResults.set(phase, { status: 'completed', duration });
  
          kernel.log && kernel.log.info('BOOT', `Phase "${phase}" completed in ${duration}ms`);
        } catch (error) {
          const duration = Date.now() - startTime;
          this._phaseTimings.push({ phase, duration });
          this.phaseResults.set(phase, { status: 'failed', duration, error: error.message });
  
          kernel.log && kernel.log.error('BOOT', `Phase "${phase}" failed after ${duration}ms`, error);
          throw error;
        }
      }
  
      this.currentPhase = Bootloader.PHASES.READY;
      kernel.log && kernel.log.info('BOOT', 'Bootloader complete');
    }
  
    /**
     * 运行指定阶段的所有钩子
     * @private
     */
    async _runPhaseHooks(phase) {
      const hooks = this.phaseHooks.get(phase) || [];
      for (const hook of hooks) {
        await hook(this);
      }
    }
  
    /**
     * 获取启动计时
     * @returns {Array}
     */
    getTimings() {
      return [...this._phaseTimings];
    }
  
    /**
     * 获取启动结果
     * @returns {Object}
     */
    getResults() {
      const results = {};
      this.phaseResults.forEach((val, phase) => {
        results[phase] = val;
      });
      return results;
    }
  }
  
  // 导出
  root.Bootloader = Bootloader;

  // ========== kernel/models/BaseModel.js ==========
  /**
   * BaseModel - 核心模型基类
   * 
   * 职责：
   * 1. 定义统一的序列化接口 (toJSON, fromJSON)
   * 2. 提供通用的 ID 生成等基础功能
   * 3. 规范构造函数模式（接收 options 对象）
   */
  
  class BaseModel {
    constructor(options = {}) {
      if (new.target === BaseModel) {
        throw new Error('Cannot instantiate BaseModel directly');
      }
      
      // 所有模型通常都有一个 ID 和时间戳
      this.id = options.id || this.generateId();
      this.createdAt = options.createdAt || Date.now();
      this.updatedAt = options.updatedAt || this.createdAt;
    }
  
    /**
     * 生成唯一 ID（子类可覆盖）
     */
    generateId() {
      const prefix = this.constructor.name.toLowerCase();
      return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  
    /**
     * 更新时间戳
     */
    touch() {
      this.updatedAt = Date.now();
    }
  
    /**
     * 转换为纯 JSON 对象（子类应覆盖以包含特定字段）
     */
    toJSON() {
      return {
        id: this.id,
        ...(this.createdAt && { createdAt: this.createdAt }),
        ...(this.updatedAt && { updatedAt: this.updatedAt })
      };
    }
  
    /**
     * 从 JSON 对象创建实例（抽象方法，由子类实现）
     */
    static fromJSON(data) {
      throw new Error('static fromJSON() must be implemented by subclass');
    }
  }
  
  // 导出到全局
  root.BaseModel = BaseModel;

  // ========== kernel/models/ToolDefinition.js ==========
  /**
   * ToolDefinition - 工具契约（静态、不可变）
   *
   * 职责：
   * 1. 声明一个工具的名字、描述、参数 JSON Schema
   * 2. 不含任何执行逻辑、不含协议字段
   *
   * 设计原则：
   * - 纯数据：只表达"是什么"，不表达"做什么"
   * - 一旦创建不可变（冻结）
   * - 协议无关：OpenAI/Anthropic 的转换在 MessageStructure 中处理
   */
  class ToolDefinition {
    /**
     * @param {Object} params
     * @param {string} params.name - 工具唯一名（如 'get_page_content'）
     * @param {string} params.description - 工具描述（供 LLM 理解）
     * @param {Object} params.parameters - JSON Schema (OpenAI function calling 格式)
     * @param {boolean} [params.requiresApproval=false] - 是否需要用户确认才能执行
     * @param {Object} [params.metadata] - 额外元数据（分类、图标等）
     */
    constructor({ name, description, parameters, requiresApproval = false, metadata = {} } = {}) {
      if (!name || typeof name !== 'string') {
        throw new Error('ToolDefinition: name must be a non-empty string');
      }
      if (typeof description !== 'string') {
        throw new Error('ToolDefinition: description must be a string');
      }
      if (!parameters || typeof parameters !== 'object' || parameters.type !== 'object') {
        throw new Error('ToolDefinition: parameters must be a JSON Schema with type:"object"');
      }
  
      this.name = name;
      this.description = description;
      this.parameters = parameters;
      this.requiresApproval = !!requiresApproval;
      this.metadata = metadata;
  
      // 冻结：ToolDefinition 一旦声明不可变
      Object.freeze(this);
    }
  
    /**
     * 序列化为 OpenAI function calling 格式
     * 注意：协议字段隔离在 M 层外
     */
    toOpenAIFunction() {
      return {
        type: 'function',
        function: {
          name: this.name,
          description: this.description,
          parameters: this.parameters
        }
      };
    }
  
    toJSON() {
      return {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
        requiresApproval: this.requiresApproval,
        metadata: this.metadata
      };
    }
  
    static fromJSON(obj) {
      return new ToolDefinition(obj);
    }
  }
  root.ToolDefinition = ToolDefinition;

  // ========== kernel/models/ToolCall.js ==========
  /**
   * ToolCall - AI 工具调用意图（事实记录）
   *
   * 职责：
   * 1. 记录 AI 在某轮希望执行的工具调用
   * 2. 不含执行结果（结果由 ToolResult 独立记录）
   * 3. 不含协议字段（OpenAI 协议转换在 MessageStructure 中）
   *
   * 设计原则：
   * - 纯数据：仅表达"AI 想用什么工具、参数是什么"
   * - 不可变：创建后字段不再变更
   * - 生命周期：随 Message 一同持久化（作为 Message 的子对象）
   */
  class ToolCall {
    /**
     * @param {Object} params
     * @param {string} params.id - 唯一标识（如 'call_abc123'）
     * @param {string} params.toolName - 工具名（对应 ToolDefinition.name）
     * @param {Object} [params.arguments={}] - 工具参数（对象形式，非 JSON 字符串）
     */
    constructor({ id, toolName, arguments: args = {} } = {}) {
      if (!id || typeof id !== 'string') {
        throw new Error('ToolCall: id must be a non-empty string');
      }
      if (!toolName || typeof toolName !== 'string') {
        throw new Error('ToolCall: toolName must be a non-empty string');
      }
      if (args && typeof args !== 'object') {
        throw new Error('ToolCall: arguments must be an object');
      }
  
      this.id = id;
      this.toolName = toolName;
      this.arguments = args;
  
      Object.freeze(this.arguments);
      Object.freeze(this);
    }
  
    toJSON() {
      return {
        id: this.id,
        toolName: this.toolName,
        arguments: this.arguments
      };
    }
  
    static fromJSON(obj) {
      if (!obj) return null;
      return new ToolCall(obj);
    }
  }
  root.ToolCall = ToolCall;

  // ========== kernel/models/ToolResult.js ==========
  /**
   * ToolResult - 工具执行结果（事实记录）
   *
   * 职责：
   * 1. 记录某个 ToolCall 的执行结果
   * 2. 不可变：一旦写入不再修改（修正需创建新的 ToolResult）
   *
   * 设计原则：
   * - 纯数据：仅表达"工具执行得到什么结果"
   * - 不可变：创建后字段不再变更
   * - 引用完整：toolCallId 必须对应一个已存在的 ToolCall
   */
  class ToolResult {
    /**
     * @param {Object} params
     * @param {string} params.toolCallId - 关联的 ToolCall.id
     * @param {'success'|'failed'|'cancelled'} params.status - 执行状态
     * @param {*} [params.output=null] - 执行输出（任意可序列化值）
     * @param {string|null} [params.error=null] - 错误消息
     * @param {number} [params.duration=0] - 执行耗时（毫秒）
     */
    constructor({ toolCallId, status, output = null, error = null, duration = 0 } = {}) {
      if (!toolCallId || typeof toolCallId !== 'string') {
        throw new Error('ToolResult: toolCallId must be a non-empty string');
      }
      if (!['success', 'failed', 'cancelled'].includes(status)) {
        throw new Error('ToolResult: status must be one of success|failed|cancelled');
      }
      if (typeof duration !== 'number' || duration < 0) {
        throw new Error('ToolResult: duration must be a non-negative number');
      }
      if (status === 'success' && error) {
        throw new Error('ToolResult: success result cannot have error');
      }
  
      this.toolCallId = toolCallId;
      this.status = status;
      this.output = output;
      this.error = error;
      this.duration = duration;
  
      Object.freeze(this);
    }
  
    isSuccess() { return this.status === 'success'; }
    isFailed() { return this.status === 'failed'; }
    isCancelled() { return this.status === 'cancelled'; }
  
    toJSON() {
      return {
        toolCallId: this.toolCallId,
        status: this.status,
        ...(this.output !== null && { output: this.output }),
        ...(this.error && { error: this.error }),
        duration: this.duration
      };
    }
  
    static fromJSON(obj) {
      if (!obj) return null;
      return new ToolResult(obj);
    }
  }
  root.ToolResult = ToolResult;

  // ========== kernel/models/MessageContent.js ==========
  /**
   * MessageContent - 富媒体消息结构定义
   * 
   * 职责：
   * 1. 定义消息中的富媒体内容块（TextBlock, ImageBlock, ToolUseBlock 等）
   * 2. 提供消息结构的转换逻辑（如从 OpenAI 格式转换为块格式）
   * 3. 包含多媒体资源的处理逻辑 (MediaContent)
   */
  
  // =============================================================================
  // 内部工具
  // =============================================================================
  /**
   * 安全解析 JSON 字符串，解析失败返回 {}
   */
  function safeParseJSON(str) {
    if (!str || typeof str !== 'string') return {};
    try { return JSON.parse(str); } catch (e) { return {}; }
  }
  
  // =============================================================================
  // 内容块类型
  // =============================================================================
  
  /**
   * 文本内容块
   */
  class TextBlock {
    constructor(text) {
      this.type = 'text';
      this.text = text || '';
    }
    static fromString(text) { return new TextBlock(text); }
  }
  
  /**
   * 图片内容块
   */
  class ImageBlock {
    constructor(source) {
      this.type = 'image';
      this.source = source; // { type: 'base64', media_type: 'image/png', data: '...' }
    }
  }
  
  /**
   * 工具调用内容块
   */
  class ToolUseBlock {
    constructor(id, name, input) {
      this.type = 'tool_use';
      this.id = id;
      this.name = name;
      this.input = input || {};
    }
    static fromOpenAIToolCall(toolCall) {
      return new ToolUseBlock(
        toolCall.id,
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments || '{}')
      );
    }
  }
  
  /**
   * 工具结果内容块
   */
  class ToolResultBlock {
    constructor(toolUseId, content) {
      this.type = 'tool_result';
      this.tool_use_id = toolUseId;
      this.content = content; // string | array | object
    }
    static serializeContent(content) {
      if (content === null || content === undefined) return '';
      if (typeof content === 'string') return content;
      return JSON.stringify(content, null, 2);
    }
  }
  
  /**
   * 思考内容块
   */
  class ThinkingBlock {
    constructor(thinking, signature = null) {
      this.type = 'thinking';
      this.thinking = thinking || '';
      this.signature = signature;
    }
  }
  
  /**
   * 思考配置
   */
  class ThinkingConfig {
    /**
     * @param {string} effort - 思考强度 ('off' | 'low' | 'medium' | 'high')
     */
    constructor(effort = 'off') {
      this.effort = effort;
      this.enabled = effort !== 'off';
    }
  
    /**
     * 转换为 API 格式
     */
    toAPIFormat() {
      if (!this.enabled) return null;
      return {
        type: 'enabled',
        budget_tokens: 4000 // 默认值，或者从 settings 获取
      };
    }
  }
  
  // =============================================================================
  // MediaContent - 多媒体内容模型
  // =============================================================================
  class MediaContent {
    constructor({ type, text = null, dataUrl = null, url = null, filename = null, mimeType = null, size = null, metadata = {} }) {
      this.type = type;
      this.text = text;
      this.dataUrl = dataUrl;
      this.url = url;
      this.filename = filename;
      this.mimeType = mimeType;
      this.size = size;
      this.metadata = metadata;
    }
  
    static fromJSON(obj) { return new MediaContent(obj); }
    static createText(text) { return new MediaContent({ type: 'text', text }); }
    static createImage(dataUrlOrUrl, options = {}) {
      const isDataUrl = dataUrlOrUrl.startsWith('data:');
      return new MediaContent({
        type: 'image',
        dataUrl: isDataUrl ? dataUrlOrUrl : null,
        url: isDataUrl ? null : dataUrlOrUrl,
        ...options
      });
    }
  }
  
  // =============================================================================
  // 消息结构工厂与转换器
  // =============================================================================
  class MessageStructure {
    /**
     * 将消息转换为各厂商 API 所需的请求体格式
     * 负责把内部对象 (Message + toolCalls) 转成 OpenAI 协议字段
     */
    static toAPIFormat(message, standard = 'openai') {
      if (standard === 'openai') {
        const result = { role: message.role };
  
        // 从 Message.toolCalls (子对象数组) 转 OpenAI 协议字段
        if (message.toolCalls && message.toolCalls.length > 0) {
          result.tool_calls = message.toolCalls.map(MessageStructure.toOpenAIToolCall);
        }
  
        if (Array.isArray(message.content)) {
          if (message.role === 'assistant') {
            const toolUses = message.content.filter(b => b.type === 'tool_use');
            const texts = message.content.filter(b => b.type === 'text');
  
            if (toolUses.length > 0 && !result.tool_calls) {
              result.tool_calls = toolUses.map(tu => ({
                id: tu.id,
                type: 'function',
                function: { name: tu.name, arguments: JSON.stringify(tu.input) }
              }));
            }
  
            result.content = texts.map(t => t.text).join('\n\n') || null;
          } else {
            result.content = message.getText();
          }
        } else {
          result.content = message.content;
        }
  
        if (message.reasoning_content) {
          result.reasoning_content = message.reasoning_content;
        }
        // Role.TOOL 消息使用 toolCallId 关联一次工具调用
        if (message.role === 'tool' && message.toolCallId) {
          result.tool_call_id = message.toolCallId;
        }
  
        return result;
      }
      return message.toJSON();
    }
  
    /**
     * 把内部 ToolCall 转为 OpenAI 协议字段
     * 这里是协议转换的唯一边界
     */
    static toOpenAIToolCall(toolCall) {
      return {
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.toolName,
          arguments: JSON.stringify(toolCall.arguments || {})
        }
      };
    }
  
    /**
     * 把 OpenAI 响应中的 tool_calls 解析为内部 ToolCall[] 供 Message 接受
     * 这里同样是协议转换的唯一边界
     * @param {Array} openAIToolCalls
     * @returns {ToolCall[]}
     */
    static parseToolCallsFromOpenAI(openAIToolCalls) {
      if (!Array.isArray(openAIToolCalls)) return [];
      return openAIToolCalls
        .filter(tc => tc && tc.function)
        .map(tc => new ToolCall({
          id: tc.id,
          toolName: tc.function.name,
          arguments: safeParseJSON(tc.function.arguments)
        }));
    }
  
    /**
     * 从 API 响应解析为块结构
     */
    static fromAPIResponse(responseMsg) {
      // 逻辑实现...
    }
  }
  
  // =============================================================================
  // 消息请求模型
  // =============================================================================
  
  /**
   * MessagesRequest - 统一的消息请求对象
   * 
   * 职责：
   * 1. 封装发送给 Provider API 的完整请求参数
   * 2. 包含消息列表、模型、采样参数等
   * 3. 包含思考模式 (ThinkingConfig) 配置
   */
  class MessagesRequest {
    /**
     * @param {Object} options
     * @param {string} options.model - 模型 ID
     * @param {Array<Message>} options.messages - 消息对象数组
     * @param {string} [options.system] - 系统提示词
     * @param {number} [options.maxTokens] - 最大生成长度
     * @param {number} [options.temperature] - 温度
     * @param {boolean} [options.stream=true] - 是否流式
     * @param {ThinkingConfig} [options.thinking] - 思考模式配置
     * @param {Array} [options.tools] - 工具定义列表
     * @param {Object} [options.metadata] - 额外元数据
     */
    constructor(options) {
      this.model = options.model;
      this.messages = options.messages || [];
      this.system = options.system || null;
      this.maxTokens = options.maxTokens || 2000;
      this.temperature = options.temperature ?? 0.7;
      this.stream = options.stream !== false;
      this.thinking = options.thinking || null;
      this.tools = options.tools || null;
      this.metadata = options.metadata || {};
    }
  
    /**
     * 验证请求参数
     */
    validate() {
      if (!this.model) throw new Error('Model is required');
      if (!this.messages || this.messages.length === 0) throw new Error('Messages cannot be empty');
      return true;
    }
  }
  
  // =============================================================================
  // 导出到全局
  // =============================================================================
  const MessageContent = {
  
      TextBlock,
      ImageBlock,
      ToolUseBlock,
      ToolResultBlock,
      ThinkingBlock,
      ThinkingConfig,
      MessagesRequest,
      MediaContent,
      MessageStructure
    
  };
  root.MessageContent = MessageContent;

  // ========== kernel/models/Message.js ==========
  /**
   * Message - 消息原型定义
   *
   * 职责：
   * 1. 定义消息的角色枚举 (Role)
   * 2. 定义核心消息数据结构，支持纯文本和富媒体块内容
   * 3. 工具调用作为子对象（toolCalls: ToolCall[]）随消息持久化
   *
   * 设计原则：
   * - 工具相关字段是消息的子对象，不是独立的 Session 索引
   * - 协议字段 (OpenAI tool_calls) 隔离在 MessageContent.MessageStructure
   * - role 一旦设置不可修改
   */
  
  // =============================================================================
  // 角色枚举
  // =============================================================================
  const Role = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    TOOL: 'tool'
  };
  
  // =============================================================================
  // 消息类
  // =============================================================================
  class Message extends BaseModel {
    /**
     * @param {Object} options
     * @param {string} options.role - 角色 (Role)
     * @param {string|Array} options.content - 消息内容（字符串或富媒体块数组）
     * @param {string} [options.id] - 消息唯一 ID
     * @param {number} [options.timestamp] - 时间戳
     * @param {string} [options.reasoning_content] - 推理/思考内容
     * @param {Array<ToolCall>} [options.toolCalls] - 工具调用列表（子对象数组）
     * @param {string} [options.toolCallId] - 工具调用 ID (Role.TOOL 时使用)
     * @param {Object} [options.metadata] - 额外元数据
     */
    constructor(options = {}) {
      super(options);
      this._role = options.role || Role.USER;
      this.content = options.content || '';
      this.timestamp = options.timestamp || this.createdAt;
  
      // 扩展字段
      this.reasoning_content = options.reasoning_content || null;
      this.toolCallId = options.toolCallId || null;
      this.metadata = options.metadata || {};
  
      // 工具调用列表（子对象数组）
      this.toolCalls = [];
      if (Array.isArray(options.toolCalls)) {
        options.toolCalls.forEach(tc => this.addToolCall(tc));
      }
    }
  
    /** 角色：只读，构造时设定 */
    get role() { return this._role; }
  
    /**
     * 添加工具调用
     * @param {ToolCall|Object} toolCall
     */
    addToolCall(toolCall) {
      if (!toolCall) return;
      const tc = toolCall instanceof ToolCall
        ? toolCall
        : ToolCall.fromJSON(toolCall);
      if (!tc) return;
      if (this.toolCalls.some(existing => existing.id === tc.id)) return; // 防止重复
      this.toolCalls.push(tc);
      this.touch();
    }
  
    /**
     * 通过 ID 获取工具调用
     */
    getToolCall(id) {
      return this.toolCalls.find(tc => tc.id === id) || null;
    }
  
    /**
     * 判断内容是否为富媒体块数组
     */
    isRichContent() {
      return Array.isArray(this.content);
    }
  
    /**
     * 获取纯文本内容
     */
    getText() {
      if (typeof this.content === 'string') {
        return this.content;
      }
      if (Array.isArray(this.content)) {
        return this.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n\n');
      }
      return '';
    }
  
    /**
     * 判断是否包含工具调用
     */
    hasToolCalls() {
      return this.toolCalls.length > 0;
    }
  
    /**
     * 状态判断
     */
    isUser() { return this._role === Role.USER; }
    isAssistant() { return this._role === Role.ASSISTANT; }
    isSystem() { return this._role === Role.SYSTEM; }
    isTool() { return this._role === Role.TOOL; }
  
    /**
     * 序列化（toolCalls 作为子对象数组嵌套写入）
     */
    toJSON() {
      return {
        ...super.toJSON(),
        ...(this._role && { role: this._role }),
        ...(this.content && { content: this.content }),
        ...(this.timestamp && { timestamp: this.timestamp }),
        ...(this.reasoning_content && { reasoning_content: this.reasoning_content }),
        ...(this.toolCallId && { toolCallId: this.toolCallId }),
        ...(this.toolCalls.length > 0 && { toolCalls: this.toolCalls.map(tc => tc.toJSON()) }),
        ...((Object.keys(this.metadata || {}).length > 0) && { metadata: this.metadata })
      };
    }
  
    /**
     * 反序列化
     */
    static fromJSON(data) {
      return new Message(data);
    }
  }
  
  // 导出到全局
  root.Message = Message;
  root.Role = Role;

  // ========== kernel/models/Session.js ==========
  /**
   * Session - 会话模型
   *
   * 职责：
   * 1. 维护会话内的消息列表（每条消息可携带 ToolCall[]）
   * 2. 提供工具集合的查询视图（不独立存储 ToolCall）
   * 3. ToolResult 不属于 Session，Controller 单独管理（按"消息流"对齐）
   *
   * 设计原则：
   * - ToolCall 始终是 Message 的子对象（消息流）
   * - 视图方法仅做查询/过滤，不修改数据
   * - 状态机修改（pending/executing/completed）由 Controller 通过字段控制
   */
  class Session extends BaseModel {
    constructor(options = {}) {
      super(options);
      this.title = options.title || '新对话';
      this.messages = options.messages || [];
      this.metadata = options.metadata || {};
  
      // 思考模式配置（单一变量）
      this.reasoningEffort = options.reasoningEffort || 'medium'; // 'off' | 'low' | 'medium' | 'high'
  
      // 运行时状态（不持久化）
      this.port = null;
      this.isStreaming = false;
    }
  
    // ==================== 消息管理 ====================
  
    addMessage(message) {
      this.messages.push(message);
      this.touch();
    }
  
    removeMessage(messageId) {
      const index = this.messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        this.messages.splice(index, 1);
        this.touch();
        return true;
      }
      return false;
    }
  
    updateMessage(messageId, updater) {
      const message = this.messages.find(m => m.id === messageId);
      if (!message) return false;
      const result = updater(message);
      if (result && result !== message) {
        const index = this.messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
          this.messages[index] = result;
        }
      }
      this.touch();
      return true;
    }
  
    getLastMessage() {
      return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    }
  
    clearMessages() {
      this.messages = [];
      this.touch();
    }
  
    hasMessages() {
      return this.messages.length > 0;
    }
  
    // ==================== 工具调用视图（不存储，仅查询）====================
  
    /**
     * 获取会话中所有的 ToolCall
     * @returns {ToolCall[]}
     */
    getAllToolCalls() {
      const result = [];
      this.messages.forEach(msg => {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          result.push(...msg.toolCalls);
        }
      });
      return result;
    }
  
    /**
     * 获取指定 message 上的 ToolCall
     */
    getToolCallsOfMessage(messageId) {
      const msg = this.messages.find(m => m.id === messageId);
      return msg && msg.toolCalls ? msg.toolCalls : [];
    }
  
    /**
     * 通过 id 在所有消息中查找 ToolCall
     */
    findToolCall(toolCallId) {
      for (const msg of this.messages) {
        if (msg.toolCalls) {
          const found = msg.toolCalls.find(tc => tc.id === toolCallId);
          if (found) return found;
        }
      }
      return null;
    }
  
    /**
     * 是否有任何工具调用
     */
    hasToolCalls() {
      return this.getAllToolCalls().length > 0;
    }
  
    /**
     * 获取所有 Role.TOOL 消息（用于判断哪些 ToolCall 已有结果回传）
     */
    getToolResultMessages() {
      return this.messages.filter(m => m.role === Role.TOOL);
    }
  
    /**
     * 找出尚未被 ToolResult 消息回应的 ToolCall
     * （pending 视图，由 Controller 用来判断是否需要继续轮询 AI）
     * @returns {ToolCall[]}
     */
    getPendingToolCalls() {
      const answeredIds = new Set(
        this.getToolResultMessages()
          .map(m => m.toolCallId)
          .filter(Boolean)
      );
      return this.getAllToolCalls().filter(tc => !answeredIds.has(tc.id));
    }
  
    // ==================== 序列化 ====================
  
    toJSON() {
      return {
        ...super.toJSON(),
        ...this.title && { title: this.title },
        ...this.messages && { messages: this.messages.map(m => m.toJSON ? m.toJSON() : m) },
        ...(Object.keys(this.metadata || {}).length > 0) && { metadata: this.metadata },
        ...this.reasoningEffort && { reasoningEffort: this.reasoningEffort }
      };
    }
  
    /**
     * 从纯对象创建
     */
    static fromJSON(data) {
      const session = new Session(data);
      if (data.messages && Array.isArray(data.messages)) {
        session.messages = data.messages.map(m =>
          m instanceof Message ? m : Message.fromJSON(m)
        );
      }
      return session;
    }
  }
  root.Session = Session;

  // ========== kernel/models/Settings.js ==========
  /**
   * 设置模型
   * 支持多 API 标准配置
   */
  
  class Settings extends BaseModel {
    constructor(options = {}) {
      // 设置通常是单例，ID 可以固定
      options.id = options.id || 'global_settings';
      super(options);
  
      // API 配置
      this.apiStandard = options.apiStandard || 'openrouter'; // 'openai' | 'openrouter' | 'lm-studio' | 'ollama' | 'anthropic'
      this.apiKey = options.apiKey || '';
      this.apiEndpoint = options.apiEndpoint || 'https://openrouter.ai/api/v1';
      this.model = options.model || '';
      this.models = Array.isArray(options.models) ? options.models : [];
      
      // 模型参数
      this.temperature = options.temperature ?? 0.7;
      this.maxTokens = options.maxTokens ?? 2000;
      this.systemPrompt = options.systemPrompt || '';
      
      // 上下文管理
      this.autoContextTruncation = options.autoContextTruncation !== false;
      this.contextWindowSize = options.contextWindowSize || 20; // 有 Provider 缓存时的固定窗口大小
      this.contextWindowRatio = options.contextWindowRatio || 0.8; // 无缓存时，输入侧最多使用模型 contextLength 的 80%
      
      // 思考模式配置（单一变量）
      // 'off' 表示关闭，其他值表示开启并使用对应强度
      this.reasoningEffort = options.reasoningEffort || 'medium'; // 'off' | 'low' | 'medium' | 'high'
      
      // UI 配置
      this.theme = options.theme || 'light'; // 'light' | 'dark'
    }
    
    /**
     * 思考模式是否开启
     */
    isReasoningEnabled() {
      return this.reasoningEffort !== 'off';
    }
    
    /**
     * 获取默认端点
     */
    static getDefaultEndpoint(apiStandard) {
      const endpoints = {
        'openai': 'https://api.openai.com/v1',
        'openrouter': 'https://openrouter.ai/api/v1',
        'lm-studio': 'http://localhost:1234',
        'ollama': 'http://localhost:11434',
        'anthropic': 'https://api.anthropic.com'
      };
      return endpoints[apiStandard] || '';
    }
    
    /**
     * 转换为纯对象
     */
    toJSON() {
      return {
        ...super.toJSON(),
        ...this.apiStandard && { apiStandard: this.apiStandard },
        ...this.apiKey && { apiKey: this.apiKey },
        ...this.apiEndpoint && { apiEndpoint: this.apiEndpoint },
        ...this.model && { model: this.model },
        ...this.temperature !== undefined && { temperature: this.temperature },
        ...this.maxTokens !== undefined && { maxTokens: this.maxTokens },
        ...this.systemPrompt && { systemPrompt: this.systemPrompt },
        ...this.autoContextTruncation !== undefined && { autoContextTruncation: this.autoContextTruncation },
        ...this.contextWindowSize !== undefined && { contextWindowSize: this.contextWindowSize },
        ...this.contextWindowRatio !== undefined && { contextWindowRatio: this.contextWindowRatio },
        ...this.reasoningEffort && { reasoningEffort: this.reasoningEffort },
        ...this.theme && { theme: this.theme },
        ...this.models && { models: this.models }
      };
    }
    
    /**
     * 从纯对象创建
     */
    static fromJSON(data) {
      return new Settings(data);
    }
  }
  
  // 导出到全局
  root.Settings = Settings;

  // ========== kernel/models/Model.js ==========
  /**
   * Model - AI 模型业务模型（协议无关）
   * 
   * 描述 AI 模型的能力和元数据，不包含任何 API 标准相关的字段。
   * 基于 LM Studio /api/v1/models 响应格式设计。
   */
  
  class Model extends BaseModel {
    /**
     * @param {Object} params
     * @param {string} params.id - 模型唯一标识（如 'qwen2-vl-7b-instruct'）
     * @param {string} params.name - 模型显示名称
     * @param {string} [params.type] - 模型类型 ('llm' | 'vlm' | 'embeddings')
     * @param {string} [params.publisher] - 发布者/提供商
     * @param {string} [params.architecture] - 模型架构（如 'llama', 'qwen2_vl', 'nomic-bert'）
     * @param {Object} [params.capabilities] - 模型能力
     * @param {boolean} [params.capabilities.vision] - 是否支持视觉输入
     * @param {boolean} [params.capabilities.toolUse] - 是否支持工具调用
     * @param {boolean} [params.capabilities.streaming] - 是否支持流式响应
     * @param {boolean} [params.capabilities.reasoning] - 是否支持思考过程
     * @param {boolean} [params.capabilities.jsonMode] - 是否支持 JSON 模式输出
     * @param {Array<string>} [params.inputModalities] - 输入模态 ['text', 'image', 'audio']
     * @param {Array<string>} [params.outputModalities] - 输出模态 ['text']
     * @param {number} [params.contextLength] - 最大上下文长度（tokens）
     * @param {number} [params.maxOutputTokens] - 最大单次输出长度（tokens）
     * @param {string} [params.quantization] - 量化等级（如 'Q4_K_M', '4bit', 'Q8'）
     * @param {string} [params.compatibilityType] - 兼容类型（如 'gguf', 'mlx'）
     * @param {string} [params.state] - 加载状态 ('loaded' | 'not-loaded' | 'loading')
     * @param {number} [params.sizeBytes] - 模型文件大小（字节）
     * @param {string} [params.paramsString] - 参数字符串（如 '7B', '13B'）
     * @param {string} [params.description] - 模型描述
     * @param {Object} [params.pricing] - 价格信息 { prompt: number, completion: number }
     * @param {Object} [params.metadata] - 额外元数据
     */
    constructor(params = {}) {
      super(params);
      
      const {
        id,
        name,
        type = 'llm',
        publisher = 'unknown',
        architecture = null,
        capabilities = {},
        inputModalities = ['text'],
        outputModalities = ['text'],
        contextLength = 8192,
        maxOutputTokens = null,
        quantization = null,
        compatibilityType = null,
        state = 'not-loaded',
        sizeBytes = null,
        paramsString = null,
        description = '',
        pricing = null,
        metadata = {}
      } = params;
  
      if (!id) throw new Error('Model id is required');
      if (!name) throw new Error('Model name is required');
  
      this.id = id;
      this.name = name;
      this.type = type; // 'llm' | 'vlm' | 'embeddings'
      this.publisher = publisher;
      this.architecture = architecture;
      this.capabilities = {
        vision: false,
        toolUse: true,
        streaming: true,
        reasoning: false, // 默认关闭思考能力，仅支持的模型启用
        jsonMode: false,
        ...capabilities
      };
      this.inputModalities = inputModalities;
      this.outputModalities = outputModalities;
      this.contextLength = contextLength;
      this.maxOutputTokens = maxOutputTokens;
      this.quantization = quantization; // 'Q4_K_M', '4bit', 'Q8', etc.
      this.compatibilityType = compatibilityType; // 'gguf', 'mlx', etc.
      this.state = state; // 'loaded' | 'not-loaded' | 'loading'
      this.sizeBytes = sizeBytes;
      this.paramsString = paramsString; // '7B', '13B', '70B', etc.
      this.description = description;
      this.pricing = pricing;
      this.metadata = metadata;
    }
  
    /**
     * 检查是否支持某种输入模态
     */
    supportsInputModality(modality) {
      return this.inputModalities.includes(modality);
    }
  
    /**
     * 检查是否为视觉语言模型（VLM）
     */
    isVisionModel() {
      return this.type === 'vlm' || 
             this.capabilities.vision || 
             this.inputModalities.includes('image');
    }
  
    /**
     * 检查是否为嵌入模型
     */
    isEmbeddingModel() {
      return this.type === 'embeddings';
    }
  
    /**
     * 检查是否为多模态模型
     */
    isMultimodal() {
      return this.inputModalities.length > 1 || 
             this.outputModalities.length > 1;
    }
  
    /**
     * 检查是否支持工具调用
     */
    supportsToolUse() {
      return this.capabilities.toolUse && !this.isEmbeddingModel();
    }
  
    /**
     * 检查是否支持流式响应
     */
    supportsStreaming() {
      return this.capabilities.streaming;
    }
  
    /**
     * 检查是否已加载到内存
     */
    isLoaded() {
      return this.state === 'loaded';
    }
  
    /**
     * 获取参数量字符串（如 '7B', '13B'）
     */
    getParamsString() {
      return this.paramsString || 'Unknown';
    }
  
    /**
     * 检查是否支持 JSON 模式
     */
    supportsJsonMode() {
      return this.capabilities.jsonMode;
    }
  
    /**
     * 检查是否支持思考/推理过程
     */
    supportsReasoning() {
      return this.capabilities.reasoning;
    }
  
    /**
     * 获取量化的简短描述
     */
    getQuantizationLabel() {
      if (!this.quantization) return 'Unknown';
      
      // 标准化量化标签
      const q = this.quantization.toUpperCase();
      if (q.includes('Q4')) return '4-bit';
      if (q.includes('Q5')) return '5-bit';
      if (q.includes('Q6')) return '6-bit';
      if (q.includes('Q8')) return '8-bit';
      if (q.includes('FP16') || q.includes('F16')) return 'FP16';
      if (q.includes('FP32') || q.includes('F32')) return 'FP32';
      
      return this.quantization;
    }
  
    /**
     * 获取模型大小的可读字符串
     */
    getSizeLabel() {
      if (!this.sizeBytes) return 'Unknown';
      
      const gb = this.sizeBytes / (1024 * 1024 * 1024);
      if (gb >= 1) {
        return `${gb.toFixed(1)} GB`;
      }
      
      const mb = this.sizeBytes / (1024 * 1024);
      return `${mb.toFixed(0)} MB`;
    }
  
    /**
     * 转换为普通对象（用于序列化）
     */
    toJSON() {
      return {
        ...super.toJSON(),
        ...this.name && { name: this.name },
        ...this.type && { type: this.type },
        ...this.publisher && { publisher: this.publisher },
        ...this.architecture && { architecture: this.architecture },
        ...this.capabilities && { capabilities: this.capabilities },
        ...this.inputModalities && { inputModalities: this.inputModalities },
        ...this.outputModalities && { outputModalities: this.outputModalities },
        ...this.contextLength && { contextLength: this.contextLength },
        ...this.maxOutputTokens && { maxOutputTokens: this.maxOutputTokens },
        ...this.quantization && { quantization: this.quantization },
        ...this.compatibilityType && { compatibilityType: this.compatibilityType },
        ...this.state && { state: this.state },
        ...this.sizeBytes && { sizeBytes: this.sizeBytes },
        ...this.paramsString && { paramsString: this.paramsString },
        ...this.description && { description: this.description },
        ...this.pricing && { pricing: this.pricing },
        ...this.metadata && { metadata: this.metadata },
        
        // 兼容性字段 (snake_case)，用于现有 UI（如 SettingsPage）
        ...this.contextLength && { context_length: this.contextLength },
        ...this.maxOutputTokens && { max_output_tokens: this.maxOutputTokens },
        ...this.inputModalities && { input_modalities: this.inputModalities },
        ...this.outputModalities && { output_modalities: this.outputModalities },
        ...this.inputModalities && { modality: this.inputModalities.join('->') + '->' + this.outputModalities.join(',') },
        ...this.capabilities.reasoning && { supports_reasoning: this.capabilities.reasoning },
        ...this.capabilities.toolUse && { supports_tools: this.capabilities.toolUse },
        ...this.capabilities.jsonMode && { supports_json_mode: this.capabilities.jsonMode }
      };
    }
  
    /**
     * 从普通对象创建实例
     */
    static fromJSON(obj) {
      return new Model(obj);
    }
  }
  
  // 导出到全局
  root.Model = Model;

  // ========== kernel/models/Scripts.js ==========
  /**
   * Scripts Model - 用户脚本数据模型
   * 管理用户脚本的存储和解析
   */
  
  class ScriptsModel {
    /**
     * @param {IStorageManager} [storage] - 存储适配器（可选，必须实现 IStorageManager 接口）
     */
    constructor(storage = null) {
      this.storageKey = 'user_scripts';
      this.storage = storage;
    }
  
    /**
     * 设置存储适配器（运行时注入）
     * @param {IStorageManager} storage
     */
    setStorage(storage) {
      this.storage = storage;
    }
  
    /**
     * 解析 Tampermonkey 脚本元数据
     * @param {string} code - 脚本代码
     * @returns {Object} 元数据
     */
    parseMetadata(code) {
      const metadata = {
        name: '',
        namespace: '',
        version: '',
        description: '',
        author: '',
        match: [],
        grant: []
      };
  
      // 提取 ==UserScript== 块
      const match = code.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
      if (!match) {
        throw new Error('无效的 UserScript 格式，缺少 ==UserScript== 标记');
      }
  
      const block = match[1];
      
      // 解析各个字段
      const nameMatch = block.match(/@name\s+(.+)/);
      if (nameMatch) metadata.name = nameMatch[1].trim();
  
      const namespaceMatch = block.match(/@namespace\s+(.+)/);
      if (namespaceMatch) metadata.namespace = namespaceMatch[1].trim();
  
      const versionMatch = block.match(/@version\s+(.+)/);
      if (versionMatch) metadata.version = versionMatch[1].trim();
  
      const descMatch = block.match(/@description\s+(.+)/);
      if (descMatch) metadata.description = descMatch[1].trim();
  
      const authorMatch = block.match(/@author\s+(.+)/);
      if (authorMatch) metadata.author = authorMatch[1].trim();
  
      // 解析多个 match 规则
      const matchRules = [];
      const matchRegex = /@match\s+(.+)/g;
      let m;
      while ((m = matchRegex.exec(block)) !== null) {
        matchRules.push(m[1].trim());
      }
      metadata.match = matchRules;
  
      // 解析 grant 权限
      const grantPermissions = [];
      const grantRegex = /@grant\s+(.+)/g;
      let g;
      while ((g = grantRegex.exec(block)) !== null) {
        grantPermissions.push(g[1].trim());
      }
      metadata.grant = grantPermissions;
  
      // 如果没有名称，尝试从文件名提取
      if (!metadata.name) {
        metadata.name = '未命名脚本';
      }
  
      return metadata;
    }
  
    /**
     * 生成唯一 ID
     * @returns {string}
     */
    generateId() {
      return `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  
    /**
     * 获取所有脚本
     * @returns {Promise<Array>} 脚本列表
     */
    async getAll() {
      if (!this.storage || typeof this.storage.get !== 'function') {
        console.warn('[ScriptsModel] No storage adapter provided');
        return [];
      }
      
      try {
        const result = await this.storage.get(this.storageKey);
        return result || [];
      } catch (error) {
        console.error('[ScriptsModel] Failed to get scripts:', error);
        return [];
      }
    }
  
    /**
     * 根据 ID 获取脚本
     * @param {string} id - 脚本 ID
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
      const scripts = await this.getAll();
      return scripts.find(s => s.id === id) || null;
    }
  
    /**
     * 保存脚本列表
     * @param {Array} scripts - 脚本列表
     * @returns {Promise<void>}
     */
    async save(scripts) {
      if (!this.storage || typeof this.storage.set !== 'function') {
        console.warn('[ScriptsModel] No storage adapter provided, save skipped');
        return;
      }
      
      try {
        await this.storage.set(this.storageKey, scripts);
      } catch (error) {
        console.error('[ScriptsModel] Failed to save scripts:', error);
        throw error;
      }
    }
  
    /**
     * 安装脚本
     * @param {string} code - 脚本代码
     * @returns {Promise<Object>} 安装的脚本信息
     */
    async install(code) {
      const metadata = this.parseMetadata(code);
      const id = this.generateId();
      
      const script = {
        id,
        name: metadata.name,
        namespace: metadata.namespace,
        version: metadata.version,
        description: metadata.description,
        author: metadata.author,
        match: metadata.match,
        grant: metadata.grant,
        enabled: true,
        code,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
  
      const scripts = await this.getAll();
      scripts.push(script);
      await this.save(scripts);
  
      return script;
    }
  
    /**
     * 更新脚本代码
     * @param {string} id - 脚本 ID
     * @param {string} code - 新代码
     * @returns {Promise<Object>} 更新后的脚本
     */
    async updateCode(id, code) {
      const scripts = await this.getAll();
      const index = scripts.findIndex(s => s.id === id);
      
      if (index === -1) {
        throw new Error('脚本不存在');
      }
  
      const metadata = this.parseMetadata(code);
      scripts[index] = {
        ...scripts[index],
        name: metadata.name,
        namespace: metadata.namespace,
        version: metadata.version,
        description: metadata.description,
        author: metadata.author,
        match: metadata.match,
        grant: metadata.grant,
        code,
        updatedAt: Date.now()
      };
  
      await this.save(scripts);
      return scripts[index];
    }
  
    /**
     * 切换脚本启用状态
     * @param {string} id - 脚本 ID
     * @param {boolean} enabled - 启用状态
     * @returns {Promise<Object>} 更新后的脚本
     */
    async toggle(id, enabled) {
      const scripts = await this.getAll();
      const index = scripts.findIndex(s => s.id === id);
      
      if (index === -1) {
        throw new Error('脚本不存在');
      }
  
      scripts[index].enabled = enabled;
      scripts[index].updatedAt = Date.now();
  
      await this.save(scripts);
      return scripts[index];
    }
  
    /**
     * 删除脚本
     * @param {string} id - 脚本 ID
     * @returns {Promise<void>}
     */
    async remove(id) {
      const scripts = await this.getAll();
      const filtered = scripts.filter(s => s.id !== id);
      await this.save(filtered);
    }
  }
  
  // 导出类，不再创建全局单例
  root.ScriptsModel = ScriptsModel;

  // ========== kernel/models/Program.js ==========
  /**
   * Program - 程序定义
   *
   * 类似操作系统中的"可执行文件"，是一个可复用的 AI 工作单元定义。
   *
   * 职责：
   * - 声明所需权限（capabilities）
   * - 定义系统提示（instructions）
   * - 声明可用工具集
   * - 定义资源限制（maxTokens, timeout）
   *
   * 设计原则：
   * - Program 是不可变的定义（创建后不修改运行参数）
   * - 一个 Program 可以被 spawn 多个 Process
   * - Program 不持有运行时状态
   */
  
  class Program {
    /**
     * @param {Object} options
     * @param {string} options.name - 程序名称（唯一标识）
     * @param {string} [options.description] - 描述
     * @param {string[]} [options.capabilities] - 所需权限列表
     * @param {string} [options.instructions] - 系统提示
     * @param {number} [options.maxTokens] - 输入 token 预算
     * @param {number} [options.timeout] - 超时（ms）
     * @param {Object} [options.config] - 附加配置
     */
    constructor({
      name,
      description = '',
      capabilities = [],
      instructions = '',
      maxTokens = 4096,
      timeout = 120000,
      config = {}
    } = {}) {
      if (!name) {
        throw new Error('[Program] name is required');
      }
  
      /** @type {string} */
      this.id = `prog_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      /** @type {string} */
      this.name = name;
      /** @type {string} */
      this.description = description;
      /** @type {string[]} */
      this.capabilities = [...capabilities];
      /** @type {string} */
      this.instructions = instructions;
      /** @type {number} */
      this.maxTokens = maxTokens;
      /** @type {number} */
      this.timeout = timeout;
      /** @type {Object} */
      this.config = config;
  
      this.createdAt = Date.now();
      this.updatedAt = Date.now();
    }
  
    /**
     * 检查程序是否需要指定权限
     * @param {string} capability
     * @returns {boolean}
     */
    requiresCapability(capability) {
      return this.capabilities.includes(capability);
    }
  
    /**
     * 序列化为 JSON（用于持久化）
     * @returns {Object}
     */
    toJSON() {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        capabilities: this.capabilities,
        instructions: this.instructions,
        maxTokens: this.maxTokens,
        timeout: this.timeout,
        config: this.config,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
      };
    }
  
    /**
     * 从 JSON 反序列化
     * @param {Object} json
     * @returns {Program}
     */
    static fromJSON(json) {
      return new Program(json);
    }
  }
  
  // ==================== 预定义程序 ====================
  
  /**
   * 默认聊天程序 — 基础对话，无特殊权限
   */
  Program.CHAT_DEFAULT = new Program({
    name: 'chat_default',
    description: '默认聊天程序，基础对话能力',
    capabilities: [],
    instructions: '',
    timeout: 120000
  });
  
  /**
   * 工具执行程序 — 允许调用所有工具
   */
  Program.TOOL_EXECUTOR = new Program({
    name: 'tool_executor',
    description: '工具执行程序，可调用所有已注册工具',
    capabilities: ['tool'],
    instructions: '你是一个有工具调用能力的助手。根据用户需求使用合适的工具完成任务。',
    timeout: 300000
  });
  
  /**
   * 脚本管理程序 — 脚本安装与管理
   */
  Program.SCRIPT_MANAGER = new Program({
    name: 'script_manager',
    description: '脚本管理程序，可安装和管理用户脚本',
    capabilities: ['tool', 'user_script'],
    instructions: '你是用户脚本管理助手。帮助用户安装、启用、禁用和管理 Tampermonkey 脚本。',
    timeout: 60000
  });
  
  // 导出
  root.Program = Program;

  // ========== kernel/models/Process.js ==========
  /**
   * Process - 进程实例
   *
   * 类似操作系统中的"运行中的进程"，是 Program 的运行实例。
   * 每个 Process 绑定一个会话，拥有独立的状态和资源上下文。
   *
   * 职责：
   * - 承载运行时状态（CREATED → RUNNING → COMPLETED / FAILED / TERMINATED）
   * - 管理能力上下文（从 Program 继承，运行时可追加）
   * - 追踪执行时间与错误
   * - 支持父子关系（子任务）
   *
   * 设计原则：
   * - Process 持有运行时状态，但不包含业务逻辑
   * - 业务逻辑由 ProcessManager 驱动
   * - 状态转换由 ProcessManager 统一管理
   */
  
  class Process {
    // ==================== 状态定义 ====================
  
    static STATE = Object.freeze({
      CREATED: 'created',       // 已创建，未开始
      READY: 'ready',           // 就绪，等待调度
      RUNNING: 'running',       // 执行中
      PAUSED: 'paused',         // 暂停（等待用户确认等）
      COMPLETED: 'completed',   // 正常完成
      FAILED: 'failed',         // 失败
      TERMINATED: 'terminated'  // 手动终止
    });
  
    // 合法的状态转换
    static TRANSITIONS = Object.freeze({
      [Process.STATE.CREATED]: [Process.STATE.READY, Process.STATE.TERMINATED],
      [Process.STATE.READY]: [Process.STATE.RUNNING, Process.STATE.TERMINATED],
      [Process.STATE.RUNNING]: [Process.STATE.PAUSED, Process.STATE.COMPLETED, Process.STATE.FAILED, Process.STATE.TERMINATED],
      [Process.STATE.PAUSED]: [Process.STATE.RUNNING, Process.STATE.TERMINATED],
      [Process.STATE.COMPLETED]: [],
      [Process.STATE.FAILED]: [Process.STATE.READY],
      [Process.STATE.TERMINATED]: []
    });
  
    /**
     * @param {Object} options
     * @param {Program} options.program - 关联的程序定义
     * @param {string} [options.sessionId] - 绑定的会话 ID
     * @param {string} [options.model] - 使用的模型 ID
     * @param {string} [options.parentProcessId] - 父进程 ID（子任务时）
     */
    constructor({ program, sessionId = null, model = null, parentProcessId = null } = {}) {
      if (!program) {
        throw new Error('[Process] program is required');
      }
  
      this.id = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      this.programId = program.id;
      this.program = program;
      this.sessionId = sessionId;
      this.model = model;
      this.parentProcessId = parentProcessId;
  
      // 运行时状态
      this.state = Process.STATE.CREATED;
      this.capabilities = [...program.capabilities];
      this.startTime = null;
      this.endTime = null;
      this.duration = null;
      this.error = null;
      this.output = null;
  
      this.createdAt = Date.now();
    }
  
    /**
     * 检查是否可以转换到目标状态
     * @param {string} targetState
     * @returns {boolean}
     */
    canTransition(targetState) {
      const allowed = Process.TRANSITIONS[this.state];
      return allowed ? allowed.includes(targetState) : false;
    }
  
    /**
     * 检查进程是否处于终态
     * @returns {boolean}
     */
    get isTerminal() {
      return this.state === Process.STATE.COMPLETED ||
             this.state === Process.STATE.FAILED ||
             this.state === Process.STATE.TERMINATED;
    }
  
    /**
     * 检查进程是否正在运行
     * @returns {boolean}
     */
    get isRunning() {
      return this.state === Process.STATE.RUNNING;
    }
  
    /**
     * 获取运行时长（ms）
     * @returns {number|null}
     */
    get elapsed() {
      if (!this.startTime) return null;
      if (this.endTime) return this.duration;
      return Date.now() - this.startTime;
    }
  
    /**
     * 授予额外能力
     * @param {string} capability
     */
    grantCapability(capability) {
      if (!this.capabilities.includes(capability)) {
        this.capabilities.push(capability);
      }
    }
  
    /**
     * 撤销能力
     * @param {string} capability
     */
    revokeCapability(capability) {
      this.capabilities = this.capabilities.filter(c => c !== capability);
    }
  
    /**
     * 检查是否拥有指定能力
     * @param {string} capability
     * @returns {boolean}
     */
    hasCapability(capability) {
      return this.capabilities.includes(capability);
    }
  
    /**
     * 序列化为 JSON（用于持久化）
     * @returns {Object}
     */
    toJSON() {
      return {
        id: this.id,
        programId: this.programId,
        sessionId: this.sessionId,
        model: this.model,
        parentProcessId: this.parentProcessId,
        state: this.state,
        capabilities: this.capabilities,
        startTime: this.startTime,
        endTime: this.endTime,
        duration: this.duration,
        error: this.error,
        output: this.output,
        createdAt: this.createdAt
      };
    }
  }
  
  // 导出
  root.Process = Process;

  // ========== kernel/services/IStorageManager.js ==========
  /**
   * IStorageManager - 存储管理器基类（抽象接口）
   * 
   * 统一存储接口，包含底层存储操作和上层管理功能
   */
  class IStorageManager {
    constructor(serviceCenter) {
      if (new.target === IStorageManager) {
        throw new Error('Cannot instantiate abstract class directly');
      }
      this.serviceCenter = serviceCenter;
      this.eventBus = serviceCenter ? serviceCenter.getEventBus() : null;
    }
  
    // ========== 底层存储操作 ==========
    
    /**
     * 获取所有存储项
     * @returns {Promise<Array<[string, any]>>} 键值对数组
     */
    async getAll() { throw new Error('IStorageManager.getAll() must be implemented'); }
  
    /**
     * 获取指定键的值
     * @param {string} key - 键名
     * @returns {Promise<any>} 值
     */
    async get(key) { throw new Error('IStorageManager.get() must be implemented'); }
  
    /**
     * 设置存储项
     * @param {string} key - 键名
     * @param {any} value - 值
     * @returns {Promise<void>}
     */
    async set(key, value) { throw new Error('IStorageManager.set() must be implemented'); }
  
    /**
     * 删除指定存储项
     * @param {string} key - 键名
     * @returns {Promise<void>}
     */
    async remove(key) { throw new Error('IStorageManager.remove() must be implemented'); }
  
    /**
     * 清除所有存储
     * @returns {Promise<void>}
     */
    async clear() { throw new Error('IStorageManager.clear() must be implemented'); }
  
    /**
     * 搜索存储项
     * @param {string} keyword - 搜索关键词
     * @returns {Promise<Array<[string, any]>>} 匹配的键值对数组
     */
    async search(keyword) {
      const all = await this.getAll();
      const lowerKeyword = keyword.toLowerCase();
      
      return all.filter(([key, value]) => {
        const keyStr = key.toLowerCase();
        const valueStr = JSON.stringify(value).toLowerCase();
        return keyStr.includes(lowerKeyword) || valueStr.includes(lowerKeyword);
      });
    }
  
    /**
     * 获取存储使用量统计
     * @returns {Promise<Object>} 统计信息
     */
    async getStats() {
      const all = await this.getAll();
      const totalSize = all.reduce((sum, [, value]) => {
        return sum + JSON.stringify(value).length;
      }, 0);
  
      return {
        totalItems: all.length,
        totalSize: totalSize,
        totalSizeKB: (totalSize / 1024).toFixed(2),
        largestItem: all.length > 0 ? {
          key: all[0][0],
          size: JSON.stringify(all[0][1]).length
        } : null
      };
    }
  
    // ========== 上层管理功能 ==========
    
    /**
     * 加载所有存储项（并触发事件）
     */
    async loadAll() { throw new Error('IStorageManager.loadAll() must be implemented'); }
  
    /**
     * 删除指定存储项（并刷新列表）
     * @param {string} key - 键名
     */
    async removeItem(key) { throw new Error('IStorageManager.removeItem() must be implemented'); }
  
    /**
     * 更新指定存储项（并刷新列表）
     * @param {string} key - 键名
     * @param {any} value - 新值
     */
    async updateItem(key, value) { throw new Error('IStorageManager.updateItem() must be implemented'); }
  
    /**
     * 清除所有存储（并刷新列表）
     */
    async clearAll() { throw new Error('IStorageManager.clearAll() must be implemented'); }
  }
  root.IStorageManager = IStorageManager;

  // ========== kernel/services/IAppSettings.js ==========
  /**
   * IAppSettings - 应用设置管理器接口（抽象基类）
   * 
   * 定义应用设置管理的标准接口，所有具体实现必须继承此基类。
   * 
   * 职责：
   * - 定义设置管理的标准方法签名
   * - 提供默认的空实现（便于子类继承）
   * - 不包含具体业务逻辑
   * 
   * 设计原则：
   * 1. I 前缀表示这是一个接口规范
   * 2. 使用者可以实现自己的 IAppSettings 并替换
   * 3. 业务逻辑在具体实现类中（如 SettingsManager）
   */
  
  class IAppSettings {
    /**
     * @param {EventBus} eventBus - 事件总线实例
     * @param {IStorageManager} [storage] - 存储后端（必须实现 IStorageManager 接口）
     * @param {string} storageKey - 存储键名
     */
    constructor(eventBus, storage = null, storageKey = 'app_settings') {
       if (new.target === IAppSettings) {
         throw new Error('Cannot instantiate abstract class directly');
       }
       
       this.eventBus = eventBus;
       this.storage = storage;
       this.storageKey = storageKey;
       this.settings = null;
     }
  
    /**
     * 获取设置
     * @returns {Settings} 设置对象
     */
    getSettings() {
      throw new Error('Method not implemented: getSettings');
    }
  
    /**
     * 更新设置
     * @param {Object} updates - 要更新的设置项
     */
    updateSettings(updates) {
      throw new Error('Method not implemented: updateSettings');
    }
  
    /**
     * 保存设置
     * @returns {Promise<void>}
     */
    async saveSettings() {
      throw new Error('Method not implemented: saveSettings');
    }
  
    /**
     * 加载设置
     * @returns {Promise<Settings>}
     */
    async loadSettings() {
      throw new Error('Method not implemented: loadSettings');
    }
  
    /**
     * 重置设置
     */
    resetSettings() {
      throw new Error('Method not implemented: resetSettings');
    }
  
    /**
     * 处理 API 标准变更
     * @param {Object} data - { apiStandard }
     */
    _handleApiStandardChange(data) {
      throw new Error('Method not implemented: _handleApiStandardChange');
    }
  
    /**
     * 处理模型加载请求
     * @param {Object} data - { apiKey, apiEndpoint, apiStandard }
     */
    async _handleModelsRequest(data) {
      throw new Error('Method not implemented: _handleModelsRequest');
    }
  }
  
  // 导出到全局
  root.IAppSettings = IAppSettings;

  // ========== kernel/services/IModelManager.js ==========
  /**
   * IModelManager - 模型管理接口规范
   */
  class IModelManager {
    constructor(serviceCenter) {
      if (new.target === IModelManager) {
        throw new Error('Cannot instantiate abstract class directly');
      }
      this.serviceCenter = serviceCenter;
      this.eventBus = serviceCenter.getEventBus();
    }
  
    async fetchModels(params) { throw new Error('Not implemented'); }
    getModels() { throw new Error('Not implemented'); }
    getModel(modelId) { throw new Error('Not implemented'); }
    async clearCache() { throw new Error('Not implemented'); }
  }
  root.IModelManager = IModelManager;

  // ========== kernel/services/IProviderAPIService.js ==========
  /**
   * Provider API Service 接口规范
   *
   * 定义所有 AI Provider 服务必须实现的标准接口。
   * chat() 和 chatStream() 统一返回 Promise<StandardResponse>，
   * 内部完成协议解析，Controller 直接操作 ToolCall[] 对象。
   *
   * StandardResponse:
   * {
   *   content: string,
   *   toolCalls: ToolCall[],
   *   reasoning_content: string,
   *   finishReason: string | null,
   *   usage: object | null,
   *   model: string | null
   * }
   */
  class IProviderAPIService {
    constructor() {
      if (new.target === IProviderAPIService) {
        throw new Error('Cannot instantiate abstract class directly');
      }
      this.name = 'unknown';
      this.config = null;
      this.abortController = null;
  
      // === Provider 端前缀缓存支持 ===
      // 按 sessionId 作为 cache key，Provider 可以在会话多轮交互中复用前缀 KV 缓存
      // - 命中后 token 成本与首 token 延迟可下降 50-90%
      // - 默认开启，Provider 内部决定是否可应用
      this.cacheOptions = {
        enabled: true,              // 是否启用缓存
        sessionCacheKey: null,      // 调用时由 ChatController 注入
        ttlSeconds: 600,            // 缓存生存时间（各 Provider 实现可调整）
        minMessageCount: 2,         // 最少消息数才启用缓存
        minPrefixTokens: 1024       // 小于此 token 数的前缀不缓存，避免不划算
      };
    }
  
    /**
     * 统一的缓存决策逻辑（各 Provider 应调用此方法或覆盖以实现自己的策略）
     * @param {MessagesRequest} request - 消息请求对象
     * @returns {boolean} 是否应该应用缓存
     * @protected
     */
    shouldApplyCache(request) {
      // 默认实现：基础检查
      if (!this.cacheOptions.enabled) return false;
      if (!this.cacheOptions.sessionCacheKey) return false;
      
      const msgCount = Array.isArray(request.messages) ? request.messages.length : 0;
      return msgCount >= this.cacheOptions.minMessageCount;
    }
  
    /**
     * 配置服务
     * @param {Object} config
     * @param {string} config.endpoint
     * @param {string} [config.apiKey]
     * @param {string} [config.defaultModel]
     */
    configure(config) {
      throw new Error('Method not implemented: configure');
    }
  
    /**
     * 发送聊天请求（非流式）
     * @param {MessagesRequest} request
     * @returns {Promise<StandardResponse>}
     */
    chat(request) {
      throw new Error('Method not implemented: chat');
    }
  
    /**
     * 发送聊天请求（流式）
     * @param {MessagesRequest} request
     * @param {Function} onChunk - (chunk: {content, reasoning_content}) => void，实时 UI 更新
     * @returns {Promise<StandardResponse>} 流结束后的完整响应，含 toolCalls: ToolCall[]
     */
    chatStream(request, onChunk) {
      throw new Error('Method not implemented: chatStream');
    }
  
    /**
     * 取消正在进行的请求
     */
    cancel() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    }
  
    /**
     * 列出可用模型
     * @returns {Promise<Array>}
     */
    listModels() {
      throw new Error('Method not implemented: listModels');
    }
  
    /**
     * 获取单个模型详情
     * @param {string} modelId
     * @returns {Promise<Object>}
     */
    getModelDetails(modelId) {
      throw new Error('Method not implemented: getModelDetails');
    }
  }
  root.IProviderAPIService = IProviderAPIService;

  // ========== kernel/services/IScriptsManager.js ==========
  /**
   * IScriptsManager - 脚本管理接口规范
   */
  class IScriptsManager {
    constructor(serviceCenter) {
      if (new.target === IScriptsManager) {
        throw new Error('Cannot instantiate abstract class directly');
      }
      this.serviceCenter = serviceCenter;
      this.eventBus = serviceCenter.getEventBus();
    }
  
    async loadAll() { throw new Error('Not implemented'); }
    async install(code) { throw new Error('Not implemented'); }
    async updateCode(id, code) { throw new Error('Not implemented'); }
    async toggle(id, enabled) { throw new Error('Not implemented'); }
    async remove(id) { throw new Error('Not implemented'); }
  }
  root.IScriptsManager = IScriptsManager;

  // ========== kernel/services/ISessionManager.js ==========
  /**
   * ISessionManager - 会话存储接口（抽象基类）
   * 
   * 定义会话管理的标准接口，所有具体实现必须继承此基类。
   * 
   * 职责：
   * - 定义会话存储与消息持久化的标准方法签名
   * - 提供默认的空实现（便于子类继承）
   * - 不包含具体业务逻辑
   * 
   * 设计原则：
   * 1. I 前缀表示这是一个接口规范
   * 2. 使用者可以实现自己的 ISessionManager 并替换
   * 3. 业务逻辑在具体实现类中（如 SessionManager）
   * 
   * 使用示例：
   * ```javascript
   * class MySessionManagerImpl extends ISessionManager {
   *   createSession(options) {
   *     // 实现具体逻辑
   *   }
   * }
   * ```
   */
  
  class ISessionManager {
    /**
     * @param {EventBus} eventBus - 事件总线实例
     * @param {IStorageManager} storage - 存储后端（必须实现 IStorageManager 接口）
     */
    constructor(eventBus, storage = null) {
      if (new.target === ISessionManager) {
        throw new Error('Cannot instantiate abstract class directly');
      }
      
      this.eventBus = eventBus;
      this.storage = storage;
    }
  
    // ==================== 会话管理 ====================
  
    /**
     * 创建新会话
     * @param {Object} options 
     * @param {string} [options.title] - 会话标题
     * @param {boolean} [options.persist=true] - 是否立即持久化
     * @returns {Session} 新创建的会话
     */
    createSession(options = {}) {
      throw new Error('Method not implemented: createSession');
    }
  
    /**
     * 加载指定会话
     * @param {string} sessionId 
     * @returns {Session|null}
     */
    loadSession(sessionId) {
      throw new Error('Method not implemented: loadSession');
    }
  
    /**
     * 删除会话
     * @param {string} sessionId 
     * @returns {boolean}
     */
    deleteSession(sessionId) {
      throw new Error('Method not implemented: deleteSession');
    }
  
    /**
     * 获取指定会话
     * @param {string} sessionId
     * @returns {Session|null}
     */
    getSession(sessionId) {
      throw new Error('Method not implemented: getSession');
    }
  
    /**
     * 获取当前会话
     * @returns {Session|null}
     */
    getCurrentSession() {
      throw new Error('Method not implemented: getCurrentSession');
    }
  
    /**
     * 设置当前会话
     * @param {string|null} sessionId
     * @returns {Session|null}
     */
    setCurrentSession(sessionId) {
      throw new Error('Method not implemented: setCurrentSession');
    }
  
    /**
     * 获取所有会话列表
     * @returns {Array<Session>}
     */
    getAllSessions() {
      throw new Error('Method not implemented: getAllSessions');
    }
  
    /**
     * 更新会话标题
     * @param {string} sessionId 
     * @param {string} title 
     * @returns {boolean}
     */
    updateSessionTitle(sessionId, title) {
      throw new Error('Method not implemented: updateSessionTitle');
    }
  
    /**
     * 更新会话（通用）
     * @param {string} sessionId 
     * @param {Function} updater - 接收会话对象并执行修改
     * @returns {boolean}
     */
    updateSession(sessionId, updater) {
      throw new Error('Method not implemented: updateSession');
    }
  
    // ==================== 消息管理 ====================
  
    /**
     * 添加消息到目标会话
     * @param {Message} message 
     * @param {string|null} [sessionId]
     * @returns {Promise<boolean>}
     */
    async addMessage(message, sessionId = null) {
      throw new Error('Method not implemented: addMessage');
    }
  
    /**
     * 批量添加消息到目标会话
     * @param {Array<Message>} messages 
     * @param {string|null} [sessionId]
     * @returns {Promise<boolean>}
     */
    async addMessages(messages, sessionId = null) {
      throw new Error('Method not implemented: addMessages');
    }
  
    /**
     * 更新目标会话中的消息
     * @param {string} messageId 
     * @param {Function} updater 
     * @param {string|null} [sessionId]
     * @returns {boolean}
     */
    updateMessage(messageId, updater, sessionId = null) {
      throw new Error('Method not implemented: updateMessage');
    }
  
    /**
     * 流式分片更新目标会话中的消息内容
     * @param {string} messageId 
     * @param {Object} chunk - { content?: string, reasoning_content?: string }
     * @param {string|null} [sessionId]
     * @returns {boolean}
     */
    streamChunkMessage(messageId, chunk, sessionId = null) {
      throw new Error('Method not implemented: streamChunkMessage');
    }
  
    /**
     * 清空目标会话中的所有消息
     * @param {string|null} [sessionId]
     * @returns {boolean}
     */
    clearMessages(sessionId = null) {
      throw new Error('Method not implemented: clearMessages');
    }
  
    /**
     * 删除目标会话中的消息
     * @param {string} messageId 
     * @param {string|null} [sessionId]
     * @returns {boolean}
     */
    deleteMessage(messageId, sessionId = null) {
      throw new Error('Method not implemented: deleteMessage');
    }
  
    // ==================== 上下文管理 ====================
  
    /**
     * 获取用于 API 请求的消息窗口
     * @param {Session} session - 会话对象
     * @param {Object} settings - { autoContextTruncation: boolean, contextWindowSize?: number }
     * @returns {Array<Message>}
     */
    getContextWindow(session, settings = {}) {
      throw new Error('Method not implemented: getContextWindow');
    }
  
    /**
     * 基于 token 预算的消息截断（用于无 Provider 缓存的场景）
     * @param {Session} session - 会话对象
     * @param {Object} options - { contextLength, maxTokens, contextWindowRatio }
     * @returns {Array<Message>}
     */
    getMessagesByTokenBudget(session, options = {}) {
      throw new Error('Method not implemented: getMessagesByTokenBudget');
    }
  
    /**
     * 准备用于 API 发送的消息列表（应用上下文截断）
     * @param {Session} session - 会话对象
     * @param {Object} settings - 应用设置
     * @returns {Array<Message>}
     */
    getMessagesForAPI(session, settings = {}) {
      throw new Error('Method not implemented: getMessagesForAPI');
    }
  }
  
  // 导出到全局
  root.ISessionManager = ISessionManager;

  // ========== kernel/services/IToolService.js ==========
  /**
   * IToolService - 工具统一接口
   *
   * 每个工具实现此接口，覆盖完整生命周期：
   * 注册 → 启用/关闭 → 调用（带异常/计时） → 销毁
   *
   * ServiceCenter 在 initialization 时注册内置工具，
   * 用户可通过 Settings 页面开关。
   */
  class IToolService {
    constructor() {
      if (new.target === IToolService) {
        throw new Error('Cannot instantiate abstract class directly');
      }
  
      /** @type {ToolDefinition|null} */
      this.definition = null;
      /** @type {boolean} */
      this.enabled = false;
      /** @type {Function|null} handler(toolCallArgs, context) => Promise<any> */
      this._handler = null;
    }
  
    /**
     * 注册工具定义并挂载执行器
     * @param {ToolDefinition} definition
     * @param {Function} handler - (args: object, context: object) => Promise<any>
     */
    register(definition, handler) {
      if (!definition || !(definition instanceof ToolDefinition)) {
        throw new Error('IToolService.register: definition must be a ToolDefinition');
      }
      if (typeof handler !== 'function') {
        throw new Error('IToolService.register: handler must be a function');
      }
      this.definition = definition;
      this._handler = handler;
      this.enabled = true;
      console.log(`[IToolService] Registered: ${definition.name}`);
    }
  
    /** 启用工具 */
    enable() { this.enabled = true; }
  
    /** 关闭工具（用户侧禁用） */
    disable() { this.enabled = false; }
  
    /** 工具是否已注册 */
    isRegistered() { return !!this.definition; }
  
    /**
     * 调用工具（核心方法）
     * 统一封装：异常捕获、计时、结果封装为 ToolResult
     *
     * @param {ToolCall} toolCall
     * @param {Object} context - { sessionId, messageId, tabId }
     * @returns {Promise<ToolResult>}
     */
    async invoke(toolCall, context = {}) {
      if (!this.isRegistered()) {
        return new ToolResult({
          toolCallId: toolCall.id,
          status: 'failed',
          error: 'Tool not registered'
        });
      }
      if (!this.enabled) {
        return new ToolResult({
          toolCallId: toolCall.id,
          status: 'cancelled',
          error: 'Tool is disabled'
        });
      }
  
      const start = Date.now();
      try {
        const output = await this._handler(toolCall.arguments || {}, context);
        return new ToolResult({
          toolCallId: toolCall.id,
          status: 'success',
          output,
          duration: Date.now() - start
        });
      } catch (error) {
        return new ToolResult({
          toolCallId: toolCall.id,
          status: 'failed',
          error: error.message || String(error),
          duration: Date.now() - start
        });
      }
    }
  
    /** 序列化（用于持久化用户的启用/关闭状态） */
    toJSON() {
      return {
        definition: this.definition ? this.definition.toJSON() : null,
        enabled: this.enabled
      };
    }
  
    /** 销毁：清理资源 */
    dispose() {
      this.definition = null;
      this._handler = null;
      this.enabled = false;
    }
  }
  root.IToolService = IToolService;

  // ========== kernel/services/ProviderAPIServices/OpenAIService.js ==========
  /**
   * OpenAI Service
   *
   * chat() 和 chatStream() 均返回 StandardResponse（Promise），
   * 内部完成协议解析，Controller 层面接受 ToolCall[] 对象。
   */
  class OpenAIService extends IProviderAPIService {
    constructor() {
      super();
      this.name = 'openai';
    }
  
    configure(config) {
      this.config = {
        endpoint: config.endpoint || 'https://api.openai.com/v1',
        apiKey: config.apiKey || '',
        defaultModel: config.defaultModel || 'gpt-3.5-turbo',
        ...config
      };
      if (!this.config.apiKey) throw new Error('OpenAI: apiKey is required');
    }
  
    buildUrl(path) {
      const cleanBase = this.config.endpoint.replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return `${cleanBase}${cleanPath}`;
    }
  
    buildHeaders() {
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      };
    }
  
    formatMessages(messages) {
      if (!messages || !Array.isArray(messages)) return [];
      const { MessageStructure } = MessageContent;
      return messages.map(msg => MessageStructure.toAPIFormat(msg, 'openai'));
    }
  
    buildRequestBody(request) {
      const body = {
        model: request.model || this.config.defaultModel,
        messages: this.formatMessages(request.messages || []),
        temperature: request.temperature ?? 0.7,
        stream: request.stream ?? false,
        ...(request.maxTokens && { max_tokens: request.maxTokens }),
        ...(request.tools && { tools: request.tools })
      };
      if (request.system) {
        body.messages.unshift({ role: 'system', content: request.system });
      }
      // reasoning_effort 来自 MessagesRequest.thinking (ThinkingConfig 对象)
      const thinking = request.thinking;
      if (thinking && thinking.effort) {
        body.reasoning_effort = thinking.effort;
      }
  
      // === Provider 端前缀缓存 ===
      // OpenAI gpt-4o / gpt-4.1 / o-series 自动启用 prompt caching
      // - 提供 prompt_cache_key 则是手动控制（仅 o-series、gpt-4.1 等付费 KV cache 模型）
      // - 不支持时该字段会被忽略，不影响请求
      if (this.shouldApplyCache(request) && this._isModelCacheable(request.model)) {
        body.prompt_cache_key = this.cacheOptions.sessionCacheKey;
      }
  
      return body;
    }
  
    /**
     * 判断本次请求是否应应用 Provider 端缓存
     * OpenAI 只对支持缓存的模型提供 prompt_cache_key
     * @private
     */
    _isModelCacheable(modelId) {
      const model = modelId || this.config?.defaultModel || '';
      // 支持缓存的模型（只对需要 KV cache 的模型传 key，避免额外 1 token 推断成本）
      const cacheable = /^(o\d|gpt-4\.1|gpt-4o)/i;
      return cacheable.test(model);
    }
  
    /** 公用的 API 调用后处理：生成 StandardResponse，将 OpenAI tool_calls 转为 ToolCall[] */
    _buildStandardResponse(choice, data) {
      const { MessageStructure } = MessageContent;
      return {
        content: choice.message?.content || '',
        reasoning_content: choice.message?.reasoning_content || '',
        role: choice.message?.role || 'assistant',
        toolCalls: MessageStructure.parseToolCallsFromOpenAI(choice.message?.tool_calls || []),
        finishReason: choice.finish_reason || null,
        usage: data.usage || null,
        model: data.model || null
      };
    }
  
    // ==================== 非流式 ====================
  
    chat(request) {
      const url = this.buildUrl('/chat/completions');
      const headers = this.buildHeaders();
      request.stream = false;
      const body = this.buildRequestBody(request);
  
      this.abortController = new AbortController();
  
      return fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: this.abortController.signal
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(t => { throw new Error(`OpenAI API error: ${response.status} - ${t}`); });
        }
        return response.json();
      })
      .then(data => {
        const choice = data.choices?.[0];
        if (!choice) throw new Error('Empty response');
        return this._buildStandardResponse(choice, data);
      })
      .catch(error => {
        if (error.name === 'AbortError') { console.log('[OpenAIService] cancelled'); return null; }
        throw error;
      })
      .finally(() => { this.abortController = null; });
    }
  
    // ==================== 流式 ====================
  
    chatStream(request, onChunk) {
      const url = this.buildUrl('/chat/completions');
      const headers = this.buildHeaders();
      request.stream = true;
      const body = this.buildRequestBody(request);
  
      this.abortController = new AbortController();
  
      // 累计流式分片
      let pendingContent = '';
      let pendingReasoning = '';
      const pendingToolCalls = {};   // index → OpenAI raw tool_call
      let pendingFinishReason = null;
  
      return new Promise((resolve, reject) => {
        fetch(url, {
          method: 'POST', headers, body: JSON.stringify(body),
          signal: this.abortController.signal
        })
        .then(response => {
          if (!response.ok) {
            return response.text().then(t => { throw new Error(`OpenAI API error: ${response.status} - ${t}`); });
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
  
          const processStream = () => {
            return reader.read().then(({ done, value }) => {
              if (done) {
                // 流结束：构造 StandardResponse
                const { MessageStructure } = MessageContent;
                resolve({
                  content: pendingContent,
                  reasoning_content: pendingReasoning,
                  toolCalls: MessageStructure.parseToolCallsFromOpenAI(Object.values(pendingToolCalls)),
                  finishReason: pendingFinishReason || 'stop',
                  usage: null,
                  model: null
                });
                return;
              }
  
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop();
  
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
  
                if (trimmed.startsWith('data: ')) {
                  try {
                    const json = JSON.parse(trimmed.slice(6));
                    const choice = json.choices?.[0];
                    if (!choice) continue;
  
                    const delta = choice.delta || {};
                    const finish = choice.finish_reason;
                    if (finish) pendingFinishReason = finish;
  
                    // 累计 tool_calls（按 index 合并 arguments）
                    if (delta.tool_calls) {
                      for (const tc of delta.tool_calls) {
                        if (!pendingToolCalls[tc.index]) {
                          pendingToolCalls[tc.index] = tc;
                        } else {
                          const existing = pendingToolCalls[tc.index];
                          if (tc.function) {
                            existing.function = existing.function || { arguments: '' };
                            existing.function.arguments = (existing.function.arguments || '') + (tc.function.arguments || '');
                          }
                        }
                      }
                    }
  
                    // 累计 content / reasoning
                    const contentChunk = delta.content || '';
                    const reasoningChunk = delta.reasoning_content || delta.thinking || '';
                    if (contentChunk) pendingContent += contentChunk;
                    if (reasoningChunk) pendingReasoning += reasoningChunk;
  
                    // 实时回调 onChunk（仅用于 UI 更新）
                    if (onChunk && (contentChunk || reasoningChunk)) {
                      onChunk({ content: contentChunk, reasoning_content: reasoningChunk });
                    }
                  } catch (e) {
                    console.warn('[OpenAIService] Failed to parse chunk:', e);
                  }
                }
              }
              return processStream();
            });
          };
          return processStream();
        })
        .catch(error => {
          if (error.name === 'AbortError') {
            console.log('[OpenAIService] Stream cancelled');
            resolve(null);
          } else {
            reject(error);
          }
        })
        .finally(() => { this.abortController = null; });
      });
    }
  
    cancel() {
      if (this.abortController) { this.abortController.abort(); this.abortController = null; }
    }
  
    listModels() {
      const baseUrl = this.config.endpoint.replace(/\/$/, '');
      const modelsEndpoint = baseUrl.endsWith('/v1') ? baseUrl + '/models' : baseUrl + '/v1/models';
      return fetch(modelsEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
      })
      .then(r => { if (!r.ok) return r.text().then(t => { throw new Error(`HTTP ${r.status}: ${t.substring(0, 200)}`); }); return r.json(); })
      .then(result => (result.data || []).map(m => ({
        id: m.id, name: m.name || m.id, created: m.created,
        owned_by: m.owned_by, context_length: m.context_length || null,
        max_output_tokens: m.max_output_tokens || null,
        modality: 'text->text', supports_reasoning: this._detectReasoningSupport(m.id), supports_tools: true,
        pricing: { prompt: null, completion: null }, ...m
      })));
    }
  
    getModelDetails(modelId) {
      const baseUrl = this.config.endpoint.replace(/\/$/, '');
      const ep = baseUrl.endsWith('/v1') ? `${baseUrl}/models/${modelId}` : `${baseUrl}/v1/models/${modelId}`;
      return fetch(ep, { method: 'GET', headers: { 'Authorization': `Bearer ${this.config.apiKey}` } })
      .then(r => { if (!r.ok) return null; return r.json(); })
      .then(m => m ? {
        id: m.id, name: m.name || m.id, created: m.created, owned_by: m.owned_by,
        context_length: m.context_length || null, max_output_tokens: m.max_output_tokens || null,
        modality: 'text->text', supports_reasoning: this._detectReasoningSupport(m.id), supports_tools: true,
        pricing: { prompt: null, completion: null }, ...m
      } : null);
    }
  
    /**
     * 检测 OpenAI 模型是否支持推理能力
     * @private
     */
    _detectReasoningSupport(modelId) {
      const id = modelId.toLowerCase();
      return id.includes('o1') || id.includes('o3') || 
             id.includes('reasoning') || id.includes('think') ||
             id.includes('r1'); // DeepSeek-R1 compatibility
    }
  }
  root.OpenAIService = OpenAIService;

  // ========== kernel/services/ProviderAPIServices/OpenRouterService.js ==========
  /**
   * OpenRouter Service
   *
   * 继承 OpenAIService，OpenRouter 使用 OpenAI 兼容的 API 标准。
   * 差异点：reasoning 字段名不同（delta.reasoning / message.reasoning）。
   * tool_calls 处理与 OpenAI 一致，继承父类逻辑。
   */
  class OpenRouterService extends OpenAIService {
    constructor() {
      super();
      this.name = 'openrouter';
    }
  
    configure(config) {
      this.config = {
        endpoint: config.endpoint || 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey || '',
        defaultModel: config.defaultModel || 'openai/gpt-3.5-turbo',
        ...config
      };
      if (!this.config.apiKey) throw new Error('OpenRouter: apiKey is required');
    }
  
    buildHeaders() {
      const headers = super.buildHeaders();
      headers['HTTP-Referer'] = window.location.href || 'http://localhost';
      headers['X-Title'] = 'Web Agent Client';
      return headers;
    }
  
    buildRequestBody(request) {
      const body = super.buildRequestBody(request);
      // OpenRouter 特有的参数
      if (request.metadata?.transforms) body.transforms = request.metadata.transforms;
      if (request.metadata?.provider) body.provider = request.metadata.provider;
      if (request.metadata?.route) body.route = request.metadata.route;
      // 思考模式：OpenRouter 用 thinking 对象，来自 MessagesRequest.thinking (ThinkingConfig)
      const thinking = request.thinking;
      if (thinking && thinking.effort) {
        body.reasoning_effort = thinking.effort === 'off'  ?  'none' : thinking.effort ;
      }
      console.log('[OpenRouterService] Built request body:', body);
  
      // === OpenRouter 端前缀缓存 ===
      // OpenRouter 通过给 system / 历史消息上加 cache_control: { type: 'ephemeral' } 启用 Anthropic-style 缓存
      // - 命中后计费降到原价 ~10%
      // - cache_control 字段会透传到上游 provider，不支持的 provider 会忽略
      if (this.shouldApplyCache(request)) {
        this._applyCacheControl(body);
      }
      return body;
    }
  
    /**
     * 覆盖缓存决策：OpenRouter 缓存策略与 OpenAI 不同
     * OpenRouter 的 Anthropic-style 缓存更激进，即使少消息也值得
     * @override
     */
    shouldApplyCache(request) {
      if (!this.cacheOptions.enabled) return false;
      if (!this.cacheOptions.sessionCacheKey) return false;
      const msgCount = Array.isArray(request.messages) ? request.messages.length : 0;
      return msgCount >= 2; // OpenRouter 缓存粒度更细，比OpenAI更早启用
    }
  
    /**
     * 在 system 提示和部分早期消息上加 cache_control 断点
     * 这样后续轮次中只要这些点之前的内容不变，OpenRouter 就可以命中缓存
     * @private
     */
    _applyCacheControl(body) {
      const breakPoints = 2; // system + 前 1/3 历史
      if (Array.isArray(body.messages)) {
        let stamps = 0;
        for (let i = 0; i < body.messages.length && stamps < breakPoints; i++) {
          const m = body.messages[i];
          if (m.role === 'system' || i < Math.max(2, Math.floor(body.messages.length / 3))) {
            m.cache_control = { type: 'ephemeral' };
            stamps++;
          }
        }
      }
    }
  
    /** 覆盖：OpenRouter 的 reasoning 字段是 delta.reasoning / message.reasoning */
    chatStream(request, onChunk) {
      const url = this.buildUrl('/chat/completions');
      const headers = this.buildHeaders();
      request.stream = true;
      const body = this.buildRequestBody(request);
      this.abortController = new AbortController();
  
      let pendingContent = '';
      let pendingReasoning = '';
      const pendingToolCalls = {};
      let pendingFinishReason = null;
  
      return new Promise((resolve, reject) => {
        fetch(url, {
          method: 'POST', headers, body: JSON.stringify(body),
          signal: this.abortController.signal
        })
        .then(response => {
          if (!response.ok) {
            return response.text().then(t => { throw new Error(`OpenRouter API error: ${response.status} - ${t}`); });
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
  
          const processStream = () => {
            return reader.read().then(({ done, value }) => {
              if (done) {
                const { MessageStructure } = MessageContent;
                resolve({
                  content: pendingContent,
                  reasoning_content: pendingReasoning,
                  toolCalls: MessageStructure.parseToolCallsFromOpenAI(Object.values(pendingToolCalls)),
                  finishReason: pendingFinishReason || 'stop',
                  usage: null,
                  model: null
                });
                return;
              }
  
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop();
  
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
  
                if (trimmed.startsWith('data: ')) {
                  try {
                    const json = JSON.parse(trimmed.slice(6));
                    const choice = json.choices?.[0];
                    if (!choice) continue;
  
                    const delta = choice.delta || {};
                    const finish = choice.finish_reason;
                    if (finish) pendingFinishReason = finish;
  
                    // 累计 tool_calls（与 OpenAIService 相同）
                    if (delta.tool_calls) {
                      for (const tc of delta.tool_calls) {
                        if (!pendingToolCalls[tc.index]) {
                          pendingToolCalls[tc.index] = tc;
                        } else {
                          const existing = pendingToolCalls[tc.index];
                          if (tc.function) {
                            existing.function = existing.function || { arguments: '' };
                            existing.function.arguments = (existing.function.arguments || '') + (tc.function.arguments || '');
                          }
                        }
                      }
                    }
  
                    // OpenRouter 的 reasoning 在 delta.reasoning 字段
                    const contentChunk = delta.content || '';
                    const reasoningChunk = delta.reasoning || delta.reasoning_content || '';
                    if (contentChunk) pendingContent += contentChunk;
                    if (reasoningChunk) pendingReasoning += reasoningChunk;
  
                    if (onChunk && (contentChunk || reasoningChunk)) {
                      onChunk({ content: contentChunk, reasoning_content: reasoningChunk });
                    }
                  } catch (e) {
                    console.warn('[OpenRouterService] Failed to parse chunk:', e);
                  }
                }
              }
              return processStream();
            });
          };
          return processStream();
        })
        .catch(error => {
          if (error.name === 'AbortError') {
            console.log('[OpenRouterService] Stream cancelled');
            resolve(null);
          } else {
            reject(error);
          }
        })
        .finally(() => { this.abortController = null; });
      });
    }
  
    /** 覆盖：OpenRouter 非流式响应中 reasoning 字段位置不同 */
    _buildStandardResponse(choice, data) {
      const { MessageStructure } = MessageContent;
      const reasoning = choice.message?.reasoning || data.reasoning_details?.map(d => d.text || '').join('\n') || choice.message?.reasoning_content || '';
      return {
        content: choice.message?.content || '',
        reasoning_content: reasoning,
        role: choice.message?.role || 'assistant',
        toolCalls: MessageStructure.parseToolCallsFromOpenAI(choice.message?.tool_calls || []),
        finishReason: choice.finish_reason || null,
        usage: data.usage || null,
        model: data.model || null
      };
    }
  
    listModels() {
      const modelsEndpoint = this.config.endpoint.replace(/\/$/, '') + '/models';
      return fetch(modelsEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
      })
      .then(r => { if (!r.ok) return r.text().then(t => { throw new Error(`HTTP ${r.status}: ${t.substring(0,200)}`); }); return r.json(); })
      .then(result => (result.data || []).map(m => ({
        id: m.id, name: m.name || m.id, created: m.created,
        owned_by: m.owned_by || m.owner || 'openrouter',
        context_length: m.context_length || null, max_output_tokens: m.max_output_tokens || null,
        modality: m.architecture?.modality || 'text->text',
        pricing: { prompt: m.pricing?.prompt ? parseFloat(m.pricing.prompt) : null, completion: m.pricing?.completion ? parseFloat(m.pricing.completion) : null },
        supports_reasoning: (m.supported_parameters || []).includes('reasoning'),
        supports_tools: (m.supported_parameters || []).includes('tools'),
        description: m.description || null, ...m
      })));
    }
  
    getModelDetails(modelId) {
      return this.listModels().then(models => models.find(m => m.id === modelId) || null);
    }
  }
  root.OpenRouterService = OpenRouterService;

  // ========== kernel/services/ProviderAPIServices/LMStudioService.js ==========
  /**
   * LM Studio Service
   *
   * 使用 LM Studio v1 REST API 标准。
   * 同时支持 v1 output 数组格式和 OpenAI 兼容格式。
   * chat() 和 chatStream() 返回 StandardResponse，toolCalls 为 ToolCall[] 对象。
   */
  class LMStudioService extends IProviderAPIService {
    constructor() {
      super();
      this.name = 'lm-studio';
    }
  
    configure(config) {
      this.config = {
        endpoint: config.endpoint || 'http://localhost:1234',
        apiKey: '',
        defaultModel: config.defaultModel || 'local-model',
        ...config
      };
    }
  
    buildUrl(path) {
      const cleanBase = this.config.endpoint.replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      if (path === '/chat') return `${cleanBase}/v1/chat/completions`;
      if (cleanBase.includes('/api/v1')) return `${cleanBase}${cleanPath}`;
      return `${cleanBase}/api/v1${cleanPath}`;
    }
  
    buildHeaders() { return { 'Content-Type': 'application/json' }; }
  
    formatMessages(messages) {
      if (!messages || !Array.isArray(messages)) return [];
      const { MessageStructure } = MessageContent;
      return messages.map(msg => MessageStructure.toAPIFormat(msg, 'openai'));
    }
  
    buildRequestBody(request) {
      const body = {
        model: request.model || this.config.defaultModel,
        messages: this.formatMessages(request.messages || []),
        stream: request.stream ?? false
      };
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.maxTokens) body.max_tokens = request.maxTokens;
      if (request.system) body.messages.unshift({ role: 'system', content: request.system });
      if (request.reasoningEffort !== undefined) body.reasoning_effort = request.reasoningEffort || 'off';
  
      // === LM Studio 端前缀缓存 ===
      // LM Studio v0.3.5+ 支持 context_overlap / cache_prompt
      // - cache_prompt=true: 启用服务端 prompt 缓存（多次调用可复用）
      // - 本地运行、零成本，强烈推荐开启
      if (this.shouldApplyCache(request)) {
        body.cache_prompt = true;
      }
  
      return body;
    }
  
    /** 解析非流式响应 → StandardResponse（含 ToolCall[]） */
    _parseResponse(data) {
      const { MessageStructure } = MessageContent;
  
      if (data.output && Array.isArray(data.output)) {
        const messageOutput = data.output.find(item => item.type === 'message');
        const reasoningOutputs = data.output.filter(item => item.type === 'reasoning');
        const rawToolCalls = data.output.filter(item => item.type === 'tool_call').map(tc => ({
          id: tc.tool,
          function: { name: tc.tool, arguments: JSON.stringify(tc.arguments || {}) }
        }));
        return {
          content: messageOutput?.content || '',
          reasoning_content: reasoningOutputs.map(r => r.content).join(''),
          toolCalls: MessageStructure.parseToolCallsFromOpenAI(rawToolCalls),
          finishReason: 'stop',
          usage: data.stats ? {
            prompt_tokens: data.stats.input_tokens,
            completion_tokens: data.stats.total_output_tokens,
            total_tokens: data.stats.input_tokens + data.stats.total_output_tokens
          } : null,
          model: data.model_instance_id || null
        };
      }
  
      if (data.choices?.length) {
        const choice = data.choices[0];
        return {
          content: choice.message?.content || '',
          reasoning_content: choice.message?.reasoning_content || '',
          toolCalls: MessageStructure.parseToolCallsFromOpenAI(choice.message?.tool_calls || []),
          finishReason: choice.finish_reason || null,
          usage: data.usage || null,
          model: data.model || null
        };
      }
  
      throw new Error('Unexpected LM Studio response format');
    }
  
    /** 解析流式单片数据 → 返回 { contentChunk, reasoningChunk, rawToolCall?, finishReason? } */
    _parseStreamChunkRaw(data) {
      if (data.type && data.output !== undefined) {
        switch (data.type) {
          case 'chunk':
            return { contentChunk: data.output || '', finishReason: data.finish_reason || null };
          case 'reasoning_chunk':
            return { reasoningChunk: data.output || '' };
          case 'tool_call_start':
          case 'tool_call_end':
            return { rawToolCall: data.tool_call || null };
          default:
            return null;
        }
      }
  
      if (data.choices?.length) {
        const choice = data.choices[0];
        const delta = choice?.delta;
        if (!delta) return null;
        return {
          contentChunk: delta.content || '',
          reasoningChunk: delta.reasoning || delta.reasoning_content || delta.thinking || '',
          finishReason: choice.finish_reason || null
        };
      }
      return null;
    }
  
    // ==================== 非流式 ====================
  
    chat(request) {
      const url = this.buildUrl('/chat');
      const headers = this.buildHeaders();
      request.stream = false;
      const body = this.buildRequestBody(request);
  
      this.abortController = new AbortController();
  
      return fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: this.abortController.signal
      })
      .then(response => {
        if (!response.ok) return response.text().then(t => { throw new Error(`LM Studio API error: ${response.status} - ${t}`); });
        return response.json();
      })
      .then(data => this._parseResponse(data))
      .catch(error => {
        if (error.name === 'AbortError') { console.log('[LMStudioService] cancelled'); return null; }
        throw error;
      })
      .finally(() => { this.abortController = null; });
    }
  
    // ==================== 流式 ====================
  
    chatStream(request, onChunk) {
      const url = this.buildUrl('/chat');
      const headers = this.buildHeaders();
      request.stream = true;
      const body = this.buildRequestBody(request);
  
      this.abortController = new AbortController();
      let pendingContent = '';
      let pendingReasoning = '';
      const pendingToolCalls = {}; // index → raw
      let pendingFinishReason = null;
  
      return new Promise((resolve, reject) => {
        fetch(url, {
          method: 'POST', headers, body: JSON.stringify(body),
          signal: this.abortController.signal
        })
        .then(response => {
          if (!response.ok) return response.text().then(t => { throw new Error(`LM Studio API error: ${response.status} - ${t}`); });
  
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
  
          const processStream = () => {
            return reader.read().then(({ done, value }) => {
              if (done) {
                const { MessageStructure } = MessageContent;
                resolve({
                  content: pendingContent,
                  reasoning_content: pendingReasoning,
                  toolCalls: MessageStructure.parseToolCallsFromOpenAI(Object.values(pendingToolCalls)),
                  finishReason: pendingFinishReason || 'stop',
                  usage: null,
                  model: null
                });
                return;
              }
  
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop();
  
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;
  
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const raw = this._parseStreamChunkRaw(json);
                  if (!raw) continue;
  
                  if (raw.finishReason) pendingFinishReason = raw.finishReason;
  
                  // 累计 tool_call（按 index 合并）
                  if (raw.rawToolCall) {
                    const idx = Object.keys(pendingToolCalls).length;
                    pendingToolCalls[idx] = {
                      id: raw.rawToolCall.tool || raw.rawToolCall.id,
                      index: idx,
                      function: {
                        name: raw.rawToolCall.tool,
                        arguments: typeof raw.rawToolCall.arguments === 'string'
                          ? raw.rawToolCall.arguments
                          : JSON.stringify(raw.rawToolCall.arguments || {})
                      }
                    };
                  }
  
                  if (raw.contentChunk) pendingContent += raw.contentChunk;
                  if (raw.reasoningChunk) pendingReasoning += raw.reasoningChunk;
  
                  if (onChunk && (raw.contentChunk || raw.reasoningChunk)) {
                    onChunk({ content: raw.contentChunk || '', reasoning_content: raw.reasoningChunk || '' });
                  }
                } catch (e) {
                  console.warn('[LMStudioService] Failed to parse chunk:', e);
                }
              }
              return processStream();
            });
          };
          return processStream();
        })
        .catch(error => {
          if (error.name === 'AbortError') {
            console.log('[LMStudioService] Stream cancelled');
            resolve(null);
          } else {
            reject(error);
          }
        })
        .finally(() => { this.abortController = null; });
      });
    }
  
    cancel() {
      if (this.abortController) { this.abortController.abort(); this.abortController = null; }
    }
  
    listModels() {
      const endpoints = [
        this.config.endpoint.replace(/\/$/, '') + '/api/v1/models',
        this.config.endpoint.replace(/\/$/, '') + '/v1/models'
      ];
  
      const tryEndpoint = (index) => {
        if (index >= endpoints.length) return Promise.reject(new Error('Failed to fetch models from any LM Studio endpoint'));
        const url = endpoints[index];
        return fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
        .then(r => {
          if (!r.ok) return tryEndpoint(index + 1);
          return r.json();
        })
        .then(result => {
          let modelsArray = [];
          if (result.data?.length) modelsArray = result.data;
          else if (result.models?.length) modelsArray = result.models;
          if (modelsArray.length === 0) return tryEndpoint(index + 1);
          return modelsArray.map(m => ({
            id: m.key || m.id, name: m.name || m.key || m.id,
            context_length: m.max_context_length || m.context_length || null,
            max_output_tokens: m.max_output_tokens || null,
            owned_by: m.publisher || m.owner || 'local',
            created: m.created || Math.floor(Date.now() / 1000),
            modality: m.input_modalities?.includes('image') ? 'text+image->text' : 'text->text',
            supports_reasoning: !!(m.capabilities?.reasoning),
            supports_tools: !!(m.capabilities?.toolUse),
            pricing: { prompt: 0, completion: 0 },
            ...m
          }));
        })
        .catch(e => { console.warn(`[LMStudioService] Failed from ${endpoints[index]}:`, e); return tryEndpoint(index + 1); });
      };
      return tryEndpoint(0);
    }
  
    getModelDetails(modelId) {
      return this.listModels().then(models => models.find(m => m.id === modelId) || null);
    }
  }
  root.LMStudioService = LMStudioService;

  // ========== kernel/services/SessionManager.js ==========
  /**
   * SessionManager - 会话管理器（ISessionManager 的具体实现）
   * 
   * 职责：
   * 1. 实现 ISessionManager 接口定义的所有方法
   * 2. 处理会话管理业务逻辑（CRUD、持久化、消息存储）
   * 3. 通过 EventBus 与 UI 层通信
   * 
   * 设计原则：
   * - 继承 ISessionManager 基类
   * - 包含完整的业务逻辑实现
   * - 仅管理会话与消息数据，不承担 chat 运行时职责
   */
  
  class SessionManager extends ISessionManager {
    /**
     * @param {EventBus} eventBus - 事件总线实例
     */
    constructor(eventBus) {
      super(eventBus);
  
      // 内存中的会话缓存
      this.sessions = new Map(); // sessionId -> Session
      this.currentSessionId = null;
  
      // === 流式写入合并：防抖持久化 ===
      // 避免每个 chunk 都触发一次 chrome.storage.local.set
      this._pendingStreamWrites = new Map(); // sessionId → { content, reasoning_content, dirty, timer }
      this._streamFlushInterval = 250; // ms
      this._streamFlushTimer = null;
  
      console.log('[SessionManager] Initialized');
    }
  
    // ==================== 会话管理 ====================
  
    /**
     * 创建新会话
     * @param {Object} options 
     * @param {string} [options.title] - 会话标题
     * @param {boolean} [options.persist=true] - 是否立即持久化
     * @param {string} [options.reasoningEffort] - 思考强度（'off' | 'low' | 'medium' | 'high'）
     * @returns {Session} 新创建的会话
     */
    createSession(options = {}) {
      const session = new Session({
        title: options.title || '新对话',
        messages: [],
        reasoningEffort: options.reasoningEffort || 'medium'
      });
        
      this.sessions.set(session.id, session);
      this.currentSessionId = session.id;
        
      // 默认不立即持久化，除非显式要求
      if (options.persist) {
        this._saveSessions();
      }
        
      // 发布事件
      this.eventBus.emit(Events.CHAT.SESSION_CREATED, { session });
      this.eventBus.emit(Events.CHAT.CURRENT_SESSION_CHANGED, { sessionId: session.id });
        
      console.log('[SessionManager] Created session:', session.id, 'Reasoning effort:', session.reasoningEffort);
      return session;
    }
  
    /**
     * 加载指定会话
     * @param {string} sessionId 
     * @returns {Session|null}
     */
    loadSession(sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        console.warn('[SessionManager] Session not found:', sessionId);
        return null;
      }
      
      const previousId = this.currentSessionId;
      this.currentSessionId = sessionId;
      
      // TODO: 切换会话时，重新评估并同步会话的环境配置
      // this._syncSessionEnvironment(session);
      
      if (previousId !== sessionId) {
        this.eventBus.emit(Events.CHAT.CURRENT_SESSION_CHANGED, { 
          sessionId, 
          previousId,
          session: session
        });
      }
      
      this.eventBus.emit(Events.CHAT.SESSION_LOADED, { session });
      return session;
    }
  
    /**
     * 删除会话
     * @param {string} sessionId 
     * @param {boolean} autoSwitch - 是否自动切换（已废弃）
     * @returns {boolean}
     */
    deleteSession(sessionId, autoSwitch = true) {
      const deleted = this.sessions.delete(sessionId);
      if (!deleted) {
        console.warn('[SessionManager] Session not found for deletion:', sessionId);
        return false;
      }
      
      // 如果删除的是当前会话，清空指向
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
        
        this.eventBus.emit(Events.CHAT.CURRENT_SESSION_CHANGED, { 
          sessionId: null,
          previousId: sessionId
        });
      }
      
      // 持久化
      this._saveSessions();
      
      // 发布事件
      this.eventBus.emit(Events.CHAT.SESSION_DELETED, { sessionId });
      
      console.log('[SessionManager] Deleted session:', sessionId);
      return true;
    }
  
    /**
     * 获取当前会话
     * @returns {Session|null}
     */
    getCurrentSession() {
      if (!this.currentSessionId) {
        return null;
      }
      
      return this.sessions.get(this.currentSessionId) || null;
    }
  
    /**
     * 获取指定会话
     * @param {string} sessionId
     * @returns {Session|null}
     */
    getSession(sessionId) {
      if (!sessionId) {
        return null;
      }
  
      return this.sessions.get(sessionId) || null;
    }
  
    /**
     * 设置当前会话
     * @param {string|null} sessionId
     * @returns {Session|null}
     */
    setCurrentSession(sessionId) {
      if (sessionId !== null && !this.sessions.has(sessionId)) {
        console.warn('[SessionManager] Session not found:', sessionId);
        return null;
      }
  
      const previousId = this.currentSessionId;
      this.currentSessionId = sessionId;
  
      if (previousId !== sessionId) {
        this._saveSessions();
        this.eventBus.emit(Events.CHAT.CURRENT_SESSION_CHANGED, {
          sessionId,
          previousId,
          session: sessionId ? this.sessions.get(sessionId) : null
        });
      }
  
      return this.getCurrentSession();
    }
  
    /**
     * 获取所有会话列表
     * @returns {Array<Session>}
     */
    getAllSessions() {
      return Array.from(this.sessions.values());
    }
  
    /**
     * 更新会话标题
     * @param {string} sessionId 
     * @param {string} title 
     * @returns {boolean}
     */
    updateSessionTitle(sessionId, title) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        console.warn('[SessionManager] Session not found:', sessionId);
        return false;
      }
      
      session.title = title;
      session.touch();
      
      this._saveSessions();
      this.eventBus.emit(Events.CHAT.SESSION_UPDATED, { session });
      
      return true;
    }
  
    /**
     * 更新会话（通用）
     * @param {string} sessionId 
     * @param {Function} updater - 接收会话对象并执行修改
     * @returns {boolean}
     */
    updateSession(sessionId, updater) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        console.warn('[SessionManager] Session not found:', sessionId);
        return false;
      }
      
      updater(session);
      session.touch();
      
      this._saveSessions();
      this.eventBus.emit(Events.CHAT.SESSION_UPDATED, { session });
      return true;
    }
  
    // ==================== 消息管理 ====================
  
    /**
     * 添加消息到目标会话
     * @param {Message} message 
     * @param {string|null} [sessionId]
     * @returns {Promise<boolean>}
     */
    async addMessage(message, sessionId = null) {
      let session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
      
      // 如果当前没有会话，则自动创建一个新会话
      if (!session) {
        if (sessionId) {
          console.warn('[SessionManager] Session not found:', sessionId);
          return false;
        }
        session = this.createSession({ title: '新对话', persist: false });
      }
      
      session.addMessage(message);
      
      // 持久化
      await this._saveSessions();
      
      // 发布事件
      this.eventBus.emit(Events.CHAT.MESSAGE_ADDED, {
        sessionId: session.id,
        message
      });
      
      return true;
    }
  
    /**
     * 批量添加消息到目标会话
     * @param {Array<Message>} messages 
     * @param {string|null} [sessionId]
     * @returns {Promise<boolean>}
     */
    async addMessages(messages, sessionId = null) {
      let session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
      
      if (!session) {
        if (sessionId) {
          console.warn('[SessionManager] Session not found:', sessionId);
          return false;
        }
        session = this.createSession({ title: '新对话', persist: false });
      }
      
      messages.forEach(msg => session.addMessage(msg));
      
      await this._saveSessions();
      
      this.eventBus.emit(Events.CHAT.MESSAGES_BATCH_ADDED, {
        sessionId: session.id,
        messages
      });
      
      return true;
    }
  
    /**
     * 更新目标会话中的消息
     * @param {string} messageId 
     * @param {Function} updater 
     * @param {string|null} [sessionId]
     * @returns {boolean}
     */
    updateMessage(messageId, updater, sessionId = null) {
      const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
      if (!session) {
        console.warn('[SessionManager] No target session');
        return false;
      }
      
      const result = session.updateMessage(messageId, updater);
      if (result) {
        this._saveSessions();
        // 获取更新后的 message 对象并传递
        const message = session.messages.find(m => m.id === messageId);
        if (message) {
          this.eventBus.emit(Events.CHAT.MESSAGE_UPDATED, { message });
        }
      }
      return result;
    }
  
    /**
     * 流式分片更新目标会话中的消息内容（**带防抖批量持久化**）
     *
     * 优化点：
     * 1. 内存中立即追加 chunk（保证 UI 实时）
     * 2. 持久化推迟到 _streamFlushInterval (默认 250ms) 后的下一个静默期
     * 3. 避免每个 chunk 触发一次 chrome.storage.local.set
     * 4. 多个会话并发流式时按 sessionId 隔离，不会互相覆盖
     *
     * @param {string} messageId
     * @param {Object} chunk - { content?: string, reasoning_content?: string }
     * @param {string|null} [sessionId]
     * @returns {boolean}
     */
    streamChunkMessage(messageId, chunk, sessionId = null) {
      const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
      if (!session) {
        console.warn('[SessionManager] No target session');
        return false;
      }
  
      // 1. 内存中立即追加（保证 UI 实时反应）
      const result = session.updateMessage(messageId, (message) => {
        if (chunk.content) {
          message.content = (message.content || '') + chunk.content;
        }
        if (chunk.reasoning_content) {
          message.reasoning_content = (message.reasoning_content || '') + chunk.reasoning_content;
        }
      });
  
      if (!result) return false;
  
      // 2. 注册一个待刷新项（按 sessionId 隔离）
      let pending = this._pendingStreamWrites.get(session.id);
      if (!pending) {
        pending = { messageIds: new Set(), timer: null };
        this._pendingStreamWrites.set(session.id, pending);
      }
      pending.messageIds.add(messageId);
  
      // 3. 重置定时器（防抖）
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = setTimeout(() => this._flushStreamWrites(session.id), this._streamFlushInterval);
  
      return true;
    }
  
    /**
     * 立即刷新指定 session 的待写入流式分片
     * @param {string} sessionId
     * @private
     */
    async _flushStreamWrites(sessionId) {
      const pending = this._pendingStreamWrites.get(sessionId);
      if (!pending) return;
  
      // 清除注册状态（本次 refresh 结束）
      this._pendingStreamWrites.delete(sessionId);
      if (pending.timer) {
        clearTimeout(pending.timer);
        pending.timer = null;
      }
  
      // 检查会话是否还存在
      const session = this.sessions.get(sessionId);
      if (!session) return;
  
      try {
        await this._saveSessions();
      } catch (e) {
        console.error('[SessionManager] Flush stream writes failed:', e);
      }
    }
  
    /**
     * 外部调用：强制刷新所有待写入的流式分片
     * （会话结束/取消生成/页面卸载时调用，防止数据丢失）
     */
    async flushAllStreamWrites() {
      const ids = Array.from(this._pendingStreamWrites.keys());
      await Promise.all(ids.map(id => this._flushStreamWrites(id)));
    }
  
    /**
     * 清空目标会话中的所有消息
     * @param {string|null} [sessionId]
     * @returns {boolean}
     */
    clearMessages(sessionId = null) {
      const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
      if (!session) {
        console.warn('[SessionManager] No target session');
        return false;
      }
  
      session.clearMessages();
      this._saveSessions();
      this.eventBus.emit(Events.CHAT.SESSION_CLEARED, {
        sessionId: session.id,
        session
      });
      return true;
    }
  
    /**
     * 删除目标会话中的消息
     * @param {string} messageId 
     * @param {string|null} [sessionId]
     * @returns {boolean}
     */
    deleteMessage(messageId, sessionId = null) {
      const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
      if (!session) {
        console.warn('[SessionManager] No target session');
        return false;
      }
      
      // Session 使用 removeMessage 方法
      const result = session.removeMessage(messageId);
      if (result) {
        this._saveSessions();
        this.eventBus.emit(Events.CHAT.MESSAGE_DELETED, {
          messageId,
          sessionId: session.id
        });
      }
      return result;
    }
  
    // ==================== 上下文管理（支持 Provider 缓存优化） ====================
  
    /**
     * 获取用于 API 请求的消息窗口
     * 
     * 设计目标：
     * 1. 结合 Provider 端前缀缓存，减少网络 payload
     * 2. 保持本地上下文窗口足够大，保证响应质量
     * 3. 配合 ChatController 中的 Provider 缓存 key 使用
     *
     * 策略：
     * - 当 autoContextTruncation 启用时，返回截断后的最后 N 条消息
     * - 关键约束：tool_call 消息必须与其对应的 tool_result 消息成对保留
     * - 如果窗口切割点落在 tool_call/tool_result 对中间，向前扩展以保持完整性
     * 
     * @param {Session} session - 会话对象
     * @param {Object} settings - 应用设置 { autoContextTruncation: boolean, contextWindowSize?: number }
     * @returns {Array<Message>} 截断后的消息列表（用于 API 请求）
     */
    getContextWindow(session, settings = {}) {
      if (!session || !Array.isArray(session.messages)) {
        console.log('[SessionManager] getContextWindow: no session or empty messages');
        return [];
      }
      
      const messages = session.messages;
      if (messages.length === 0) {
        console.log('[SessionManager] getContextWindow: session has 0 messages');
        return [];
      }
  
      // 如果禁用上下文截断，返回全部消息
      if (!settings.autoContextTruncation) {
        console.log(`[SessionManager] getContextWindow: truncation disabled, returning all ${messages.length} messages`);
        return messages;
      }
  
      // 默认窗口大小：最后 20 条消息（约 2-3 轮完整对话）
      const windowSize = settings.contextWindowSize || 20;
      
      if (messages.length <= windowSize) {
        console.log(`[SessionManager] getContextWindow: ${messages.length} msgs ≤ windowSize ${windowSize}, no truncation needed`);
        return messages;
      }
  
      // === 关键：安全截断，保证 tool-call/result 对完整性 ===
      // OpenAI 协议要求：assistant 消息的 tool_calls 必须有对应的 tool result 消息紧随其后。
      // 如果截断点恰好砍在 tool_call 和 tool_result 之间，Provider 会返回 400 错误。
      let safeIndex = messages.length - windowSize;
  
      // 从截断点向前扫描，找到最近一个"安全边界"（非 tool 消息的位置）
      while (safeIndex > 0) {
        const candidate = messages[safeIndex];
        const prevMsg = messages[safeIndex - 1];
        
        // 如果 candidate 是 tool result 消息，且前一条是 assistant（可能有 tool_calls），
        // 那么截断点在这里会导致 assistant 的 tool_calls 没有对应 result —— 向前移
        if (candidate.role === 'tool' && prevMsg && prevMsg.role === 'assistant' && prevMsg.toolCalls && prevMsg.toolCalls.length > 0) {
          safeIndex--;
          continue;
        }
        
        // 如果 candidate 是 assistant 消息且有 tool_calls，但前一条不是 tool result（即没有对应的 request），
        // 这意味着截断点砍掉了 tool_calls 的上游 —— 向前移
        if (candidate.role === 'assistant' && candidate.toolCalls && candidate.toolCalls.length > 0) {
          // assistant 有 tool_calls，需要确保它前面有对应的 tool result
          // 实际上 tool_calls 后面会跟 tool result，只要不砍断后面就行
          // 但如果 assistant 本身是截断后的第一条，且前面的 user message 有 tool_calls 的前因...
          // 安全起见：如果当前消息是 tool result，继续向前
          break;
        }
        
        // 如果 candidate 是 tool result 消息，说明前面有一轮完整的 tool 调用链
        // 截断点应该在 tool result 之前或之后（不会砍断对）
        if (candidate.role === 'tool') {
          safeIndex--;
          continue;
        }
        
        // 普通消息（user/assistant/system），安全边界
        break;
      }
  
      // 注意：连续窗口截断不做跳跃保留（会破坏消息顺序）
      // 如需保留第一条 user 消息作为对话锚点，需另行设计 system 提示插入逻辑
      const truncated = messages.slice(safeIndex);
      const dropped = messages.length - truncated.length;
  
      // === 详细截断日志 ===
      if (dropped > 0) {
        const roleCounts = { user: 0, assistant: 0, tool: 0, system: 0 };
        truncated.forEach(m => { roleCounts[m.role] = (roleCounts[m.role] || 0) + 1; });
        
        console.log(
          `[SessionManager] Context truncated: ${messages.length} → ${truncated.length} messages ` +
          `(dropped ${dropped}, safeIndex=${safeIndex}, windowSize=${windowSize}, session=${session.id})`
        );
        console.log(
          `[SessionManager]   Kept roles: user=${roleCounts.user}, assistant=${roleCounts.assistant}, ` +
          `tool=${roleCounts.tool}, system=${roleCounts.system}`
        );
      }
  
      return truncated;
    }
  
    /**
     * 基于 token 预算的消息截断（用于无 Provider 缓存的场景）
     * 
     * 策略：
     * 1. 粗估每条消息的 token 数（chars / 4）
     * 2. 从尾部向前累加，直到接近 token 预算上限
     * 3. 始终保证 tool_call 和 tool_result 成对
     * 
     * @param {Session} session - 会话对象
     * @param {Object} options
     * @param {number} options.contextLength - 模型最大上下文长度（tokens）
     * @param {number} options.maxTokens - 模型最大输出 tokens
     * @param {number} [options.contextWindowRatio=0.8] - 输入侧比例
     * @param {number} [options.toolsTokenEstimate=500] - 工具定义占用的 token 估算
     * @returns {Array<Message>} 截断后的消息列表
     */
    getMessagesByTokenBudget(session, options = {}) {
      if (!session || !Array.isArray(session.messages)) {
        console.log('[SessionManager] getMessagesByTokenBudget: no session or empty messages');
        return [];
      }
  
      const messages = session.messages;
      if (messages.length === 0) {
        console.log('[SessionManager] getMessagesByTokenBudget: session has 0 messages');
        return [];
      }
  
      const contextLength = options.contextLength || 8192;
      const maxTokens = options.maxTokens || 2000;
      const ratio = options.contextWindowRatio || 0.8;
      const toolsTokenEstimate = options.toolsTokenEstimate || 500;
  
      // 可用于消息的 token 预算 = contextLength × ratio - maxTokens - 工具定义
      const inputBudget = Math.floor(contextLength * ratio) - maxTokens - toolsTokenEstimate;
  
      console.log(
        `[SessionManager] getMessagesByTokenBudget: ` +
        `contextLength=${contextLength}, maxTokens=${maxTokens}, ratio=${ratio}, ` +
        `toolsEstimate=${toolsTokenEstimate}, inputBudget=${inputBudget} tokens`
      );
  
      // 估算单条消息的 token 数
      const estimateTokens = (msg) => {
        let tokens = 0;
        // content
        if (typeof msg.content === 'string') {
          tokens += Math.ceil(msg.content.length / 4);
        } else if (Array.isArray(msg.content)) {
          msg.content.forEach(block => {
            if (block.text) tokens += Math.ceil(block.text.length / 4);
            if (block.data) tokens += Math.ceil(block.data.length / 4); // base64 图片
          });
        }
        // reasoning_content
        if (msg.reasoning_content) {
          tokens += Math.ceil(msg.reasoning_content.length / 4);
        }
        // tool_calls (序列化后的 arguments)
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msg.toolCalls.forEach(tc => {
            tokens += Math.ceil(JSON.stringify(tc.arguments || {}).length / 4);
            tokens += 20; // name + id 开销
          });
        }
        // role + overhead
        tokens += 4;
        return tokens;
      };
  
      // 从尾部向前累加，直到超出预算
      let totalTokens = 0;
      let startIndex = messages.length;
  
      for (let i = messages.length - 1; i >= 0; i--) {
        const msgTokens = estimateTokens(messages[i]);
        if (totalTokens + msgTokens > inputBudget) {
          startIndex = i + 1;
          break;
        }
        totalTokens += msgTokens;
        startIndex = i;
      }
  
      // === 安全边界：保证 tool-call/result 对完整性 ===
      while (startIndex > 0) {
        const candidate = messages[startIndex];
        const prevMsg = messages[startIndex - 1];
  
        if (!candidate) break;
  
        // candidate 是 tool result，前一条是 assistant 有 tool_calls → 向前扩展
        if (candidate.role === 'tool' && prevMsg && prevMsg.role === 'assistant' 
            && prevMsg.toolCalls && prevMsg.toolCalls.length > 0) {
          startIndex--;
          totalTokens += estimateTokens(messages[startIndex]);
          continue;
        }
  
        // candidate 是孤立的 tool result → 向前扩展
        if (candidate.role === 'tool') {
          startIndex--;
          totalTokens += estimateTokens(messages[startIndex]);
          continue;
        }
  
        break;
      }
  
      const truncated = messages.slice(startIndex);
      const dropped = startIndex;
  
      if (dropped > 0) {
        const roleCounts = { user: 0, assistant: 0, tool: 0, system: 0 };
        truncated.forEach(m => { roleCounts[m.role] = (roleCounts[m.role] || 0) + 1; });
  
        console.log(
          `[SessionManager] Token-budget truncation: ${messages.length} → ${truncated.length} messages ` +
          `(dropped ${dropped}, estimatedTokens=${totalTokens}/${inputBudget}, session=${session.id})`
        );
        console.log(
          `[SessionManager]   Kept roles: user=${roleCounts.user}, assistant=${roleCounts.assistant}, ` +
          `tool=${roleCounts.tool}, system=${roleCounts.system}`
        );
      } else {
        console.log(
          `[SessionManager] Token-budget: all ${messages.length} messages fit within ${inputBudget} token budget`
        );
      }
  
      return truncated;
    }
  
    /**
     * 准备用于 API 发送的消息列表（应用上下文截断）
     * 
     * @param {Session} session - 会话对象
     * @param {Object} settings - 应用设置
     * @returns {Array<Message>} 用于 API 请求的消息列表
     */
    getMessagesForAPI(session, settings = {}) {
      return this.getContextWindow(session, settings);
    }
  
    // ==================== 内部方法 ====================
  
    /**
     * 同步会话环境配置
     * @param {Session} session 
     * @param {Object} [settings] - 可选，设置对象
     */
    _syncSessionEnvironment(session, settings = null) {
      // 如果没有提供 settings，无法同步
      if (!settings || !settings.model || !settings.apiEndpoint) return;
  
      const cachedModels = Array.isArray(settings.models) ? settings.models : null;
      
      if (!cachedModels || !Array.isArray(cachedModels)) {
        return;
      }
  
      const currentModel = cachedModels.find(m => m.id === settings.model);
      if (!currentModel) return;
  
      // 1. 同步 Reasoning 状态
      const supportsReasoning = typeof currentModel.supportsReasoning === 'function' 
        ? currentModel.supportsReasoning() 
        : (currentModel.capabilities?.reasoning || currentModel.supports_reasoning);
  
      // 如果模型不支持，强制关闭会话中的思考模式
      if (!supportsReasoning && session.reasoningEffort !== 'off') {
        console.log(`[SessionManager] Model ${settings.model} does not support reasoning. Disabling for session ${session.id}`);
        session.reasoningEffort = 'off';
        this._saveSessions();
      }
    }
  
    /**
     * 初始化会话管理器（等待异步加载完成）
     * @returns {Promise<void>}
     */
    initialize() {
      console.log('[SessionManager] Initialization started');
      return this._loadSessionsFromStorage();
    }
  
    /**
     * 从存储加载会话（私有方法，仅在初始化时调用）
     * @returns {Promise<void>}
     * @private
     */
    async _loadSessionsFromStorage() {
      if (!this.storage || typeof this.storage.get !== 'function') {
        console.warn('[SessionManager] No storage adapter provided, skipping load skipped');
        return;
      }
      
      try {
        const sessionsVal = await this.storage.get('sessions');
        const currentSessionIdVal = await this.storage.get('currentSessionId');
        
        if (sessionsVal) {
          const sessionsData = sessionsVal;
          this.sessions.clear();
          
          Object.values(sessionsData).forEach(sessionData => {
            const session = typeof Session.fromJSON === 'function'
              ? Session.fromJSON(sessionData)
              : new Session(sessionData);
            this.sessions.set(session.id, session);
          });
          
          console.log('[SessionManager] Loaded sessions:', this.sessions.size);
        }
        
        if (currentSessionIdVal) {
          this.currentSessionId = currentSessionIdVal;
          console.log('[SessionManager] Current session:', this.currentSessionId);
        }
      } catch (error) {
        console.error('[SessionManager] Failed to load sessions:', error);
      }
    }
  
    /**
     * 保存会话到存储
     * @private
     * @returns {Promise<void>}
     */
    async _saveSessions() {
      if (!this.storage || typeof this.storage.set !== 'function') {
        console.warn('[SessionManager] No storage adapter provided, save skipped');
        return;
      }
      
      const sessionsData = {};
      this.sessions.forEach((session, id) => {
        sessionsData[id] = session.toJSON();
      });
      
      try {
        await this.storage.set('sessions', sessionsData);
        await this.storage.set('currentSessionId', this.currentSessionId);
      } catch (error) {
        console.error('[SessionManager] Failed to save sessions:', error);
      }
    }
  }
  
  // 导出类（由 ServiceCenter 创建实例）
  root.SessionManager = SessionManager;

  // ========== kernel/services/SettingsManager.js ==========
  /**
   * SettingsManager - 设置管理器（IAppSettings 的具体实现）
   * 
   * 职责：
   * 1. 实现 IAppSettings 接口定义的所有方法
   * 2. 处理设置管理业务逻辑（加载、保存、应用）
   * 3. 通过 EventBus 与其他模块通信
   * 
   * 设计原则：
   * - 继承 IAppSettings 基类
   * - 包含完整的业务逻辑实现
   * - 统一通过 ServiceCenter 管理 Provider 服务实例
   */
  
  class SettingsManager extends IAppSettings {
    /**
     * @param {ServiceCenter} serviceCenter
     * @param {IStorageManager} [storage] - 可选，用于持久化
     */
    constructor(serviceCenter, storage = null) {
      super(serviceCenter.getEventBus(), storage);
      this.serviceCenter = serviceCenter;
      this.storage = storage;
      
      this.settings = new Settings();
      
      console.log('[SettingsManager] Initialized');
    }
    
    /**
     * 处理设置更新（由 SettingsEventHandler 通过 SETTINGS.UPDATED 事件触发）
     * 检查是否涉及 API 相关配置变更，记录日志
     */
    _handleSettingsUpdate(data) {
      const { updates } = data;
      
      // 检查是否更新了 API 相关配置
      const apiRelatedKeys = ['apiStandard', 'apiEndpoint', 'apiKey', 'model'];
      const hasApiUpdate = apiRelatedKeys.some(key => key in updates);
      
      if (!hasApiUpdate) {
        return;
      }
      
      console.log('[SettingsManager] API related settings updated');
    }
    
    /**
     * 处理 API 标准变更
     */
    _handleApiStandardChange(data) {
      const { apiStandard } = data;
      
      // 自动填充默认端点
      const defaultEndpoint = Settings.getDefaultEndpoint(apiStandard);
      
      // 保存通用参数（temperature, maxTokens, systemPrompt 等）
      const preservedParams = {
        temperature: this.settings.temperature,
        maxTokens: this.settings.maxTokens,
        systemPrompt: this.settings.systemPrompt,
        autoContextTruncation: this.settings.autoContextTruncation
      };
      
      // 更新内部设置对象
      this.settings.apiStandard = apiStandard;
      this.settings.apiEndpoint = defaultEndpoint;
      
      // 恢复通用参数（确保不被重置）
      Object.assign(this.settings, preservedParams);
      
      // 发布端点变更事件（通知 UI 更新输入框）
      this.eventBus.emit(Events.SETTINGS.API_ENDPOINT_CHANGED, {
        apiStandard,
        endpoint: defaultEndpoint,
        isAutoFilled: true
      });
      
      // 同时发布设置更新事件，确保其他模块也能感知到变化
      this.eventBus.emit(Events.SETTINGS.UPDATED, {
        updates: { apiStandard, apiEndpoint: defaultEndpoint, ...preservedParams },
        newSettings: this.settings.toJSON()
      });
      
      console.log('[SettingsManager] API standard changed:', apiStandard, '-> endpoint:', defaultEndpoint);
    }
    
    /**
     * 处理模型加载请求
     */
    async _handleModelsRequest(data) {
      const { apiKey, apiEndpoint, apiStandard } = data;
      
      console.log('[SettingsManager] MODELS_REQUEST received');
      
      // 发布加载状态事件（由 EventHandler 转发到 View）
      this.eventBus.emit(Events.UI.LOADING, { key: 'loadModels', loading: true });
      
      try {
        const modelManager = this.serviceCenter.getModelManager();
        
        // 通过 ModelManager 获取并标准化模型
        const models = await modelManager.fetchModels({
          apiStandard,
          apiEndpoint,
          apiKey
        });
        
        // 直接持久化模型列表到设置
        this.settings.models = models.map(m => m.toJSON());
        await this.saveSettings();
        
        // 发布模型加载完成事件
        this.eventBus.emit(Events.SETTINGS.MODELS_LOADED, {
          models: this.settings.models,
          count: models.length,
          fromCache: false
        });
        
        console.log('[SettingsManager] Loaded', models.length, 'models');
      } catch (error) {
        this.eventBus.emit(Events.SETTINGS.MODELS_ERROR, { error });
      } finally {
        // 发布加载结束事件
        this.eventBus.emit(Events.UI.LOADING, { key: 'loadModels', loading: false });
      }
    }
    
    /**
     * 获取设置
     */
    getSettings() {
      return this.settings;
    }
    
    /**
     * 更新设置
     */
    updateSettings(updates) {
      const oldSettings = { ...this.settings.toJSON() };
      
      console.log('[SettingsManager] Updating settings:', {
        apiStandard: updates.apiStandard,
        apiEndpoint: updates.apiEndpoint,
        model: updates.model
      });
      
      // 更新设置
      Object.assign(this.settings, updates);
      
      // 发布更新事件
      this.eventBus.emit(Events.SETTINGS.UPDATED, {
        updates,
        oldSettings,
        newSettings: this.settings.toJSON()
      });
      
      // 保存到存储
      this.saveSettings();
      
      console.log('[SettingsManager] Settings updated and save initiated');
    }
    
    /**
     * 保存设置
     */
    async saveSettings() {
      if (!this.storage || typeof this.storage.set !== 'function') {
        console.warn('[SettingsManager] No storage adapter provided, save skipped');
        return Promise.resolve();
      }
      
      try {
        await this.storage.set(this.storageKey, this.settings.toJSON());
        console.log('[SettingsManager] Settings saved successfully');
        
        // 发布保存事件
        this.eventBus.emit(Events.SETTINGS.SAVED, {
          settings: this.settings.toJSON()
        });
      } catch (error) {
        console.error('[SettingsManager] Failed to save settings:', error);
        throw error;
      }
    }
  
    /**
     * 加载设置
     */
    async loadSettings() {
      if (!this.storage || typeof this.storage.get !== 'function') {
        console.warn('[SettingsManager] No storage adapter provided, load skipped');
        return this.settings;
      }
      
      try {
        const data = await this.storage.get(this.storageKey);
        if (data) {
          this.settings = Settings.fromJSON(data);
          console.log('[SettingsManager] Settings loaded:', this.settings);
          
          // 发布加载事件
          this.eventBus.emit(Events.SETTINGS.LOADED, {
            settings: this.settings.toJSON()
          });
        }
      } catch (error) {
        console.error('[SettingsManager] Failed to load settings:', error);
      }
      
      return this.settings;
    }
    
    /**
     * 重置设置
     */
    resetSettings() {
      this.settings = new Settings();
      this.saveSettings();
      
      // 发布重置事件
      this.eventBus.emit(Events.SETTINGS.RESET);
      
      console.log('[SettingsManager] Settings reset');
    }
    
    /**
     * 清除模型缓存
     */
    async clearModelCache() {
      const settings = this.getSettings();
      if (!settings) return false;
  
      const modelManager = this.serviceCenter.getModelManager();
      await modelManager.clearCache();
  
      this.settings.models = [];
      await this.saveSettings();
      
      console.log('[SettingsManager] Model cache cleared');
      
      // 发布事件通知 View 层更新
      this.eventBus.emit(Events.SETTINGS.MODELS_LOADED, {
        models: [],
        count: 0,
        fromCache: false
      });
      
      return true;
    }
  }
  
  // 导出类（由 ServiceCenter 创建实例）
  root.SettingsManager = SettingsManager;

  // ========== kernel/services/ScriptsManager.js ==========
  /**
   * Scripts Manager - 用户脚本管理器
   * 处理用户脚本业务逻辑，通过 EventBus 与 UI 通信
   */
  
  class ScriptsManager extends IScriptsManager {
    /**
     * @param {ServiceCenter} serviceCenter - 服务中心
     * @param {ScriptsModel} [scriptsModel] - 脚本模型实例（可选）
     */
    constructor(serviceCenter, scriptsModel = null) {
      super(serviceCenter);
      this.model = scriptsModel;
    }
  
    /**
     * 设置脚本模型（运行时注入）
     * @param {ScriptsModel} scriptsModel
     */
    setScriptsModel(scriptsModel) {
      this.model = scriptsModel;
    }
  
    /**
     * 加载所有脚本
     */
    async loadAll() {
      if (!this.model) {
        console.warn('[ScriptsManager] No ScriptsModel not initialized');
        return;
      }
      try {
        const scripts = await this.model.getAll();
        this.eventBus.emit(Events.SCRIPTS.LOADED, { scripts });
      } catch (error) {
        this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
      }
    }
  
    /**
     * 安装脚本
     * @param {string} code - 脚本代码
     */
    async install(code) {
      if (!this.model) {
        console.warn('[ScriptsManager] No ScriptsModel not initialized');
        return;
      }
      try {
        const script = await this.model.install(code);
        await this.loadAll();
      } catch (error) {
        this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
      }
    }
  
    /**
     * 更新脚本代码
     * @param {string} id - 脚本 ID
     * @param {string} code - 新代码
     */
    async updateCode(id, code) {
      if (!this.model) {
        console.warn('[ScriptsManager] No ScriptsModel not initialized');
        return;
      }
      try {
        await this.model.updateCode(id, code);
        await this.loadAll();
      } catch (error) {
        this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
      }
    }
  
    /**
     * 切换脚本启用状态
     * @param {string} id - 脚本 ID
     * @param {boolean} enabled - 启用状态
     */
    async toggle(id, enabled) {
      if (!this.model) {
        console.warn('[ScriptsManager] No ScriptsModel not initialized');
        return;
      }
      try {
        await this.model.toggle(id, enabled);
        await this.loadAll();
      } catch (error) {
        this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
      }
    }
  
    /**
     * 删除脚本
     * @param {string} id - 脚本 ID
     */
    async remove(id) {
      if (!this.model) {
        console.warn('[ScriptsManager] No ScriptsModel not initialized');
        return;
      }
      try {
        await this.model.remove(id);
        await this.loadAll();
      } catch (error) {
        this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
      }
    }
  }
  
  // 导出类（由 ServiceCenter 创建实例）
  root.ScriptsManager = ScriptsManager;

  // ========== kernel/services/ModelManager.js ==========
  /**
   * ModelManager - 模型列表管理与能力检测管理器
   * 
   * 职责：
   * 1. 负责从 Provider API 获取模型列表并标准化为业务模型
   * 2. 负责模型能力的检测逻辑
   * 3. 不维护自有缓存——模型列表以 SettingsManager.settings.models 为准
   * 
   * 设计变更说明：
   * - 移除了 this.models 运行时缓存，改用 serviceCenter.getSettingsManager().getSettings().models
   * - fetchModels() 仅负责 API 调用和标准化，持久化由调用方（SettingsManager）负责
   */
  
  class ModelManager extends IModelManager {
    /**
     * @param {ServiceCenter} serviceCenter - 服务中心
     */
    constructor(serviceCenter) {
      super(serviceCenter);
    }
  
    /**
     * 获取已持久化的模型列表（来自 Settings）
     * @returns {Array<Model>}
     */
    getModels() {
      const settings = this.serviceCenter.getSettingsManager().getSettings();
      if (!settings || !Array.isArray(settings.models)) return [];
      return settings.models.map(m => 
        m instanceof Model ? m : Model.fromJSON(m)
      );
    }
  
    /**
     * 获取指定模型（来自 Settings）
     * @param {string} modelId 
     * @returns {Model|null}
     */
    getModel(modelId) {
      return this.getModels().find(m => m.id === modelId) || null;
    }
  
    /**
     * 从 Provider API 获取模型列表并标准化
     * @param {Object} params
     * @param {string} params.apiStandard - API 标准
     * @param {string} params.apiEndpoint - API 端点
     * @param {string} params.apiKey - API Key
     * @param {boolean} [params.forceRefresh=false] - 强制刷新（当前忽略，始终拉取）
     * @returns {Promise<Array<Model>>}
     */
    async fetchModels({ apiStandard, apiEndpoint, apiKey }) {
      console.log('[ModelManager] Fetching models:', { apiStandard, apiEndpoint });
  
      const service = this.serviceCenter.createProviderService(apiStandard, {
        endpoint: apiEndpoint,
        apiKey: apiKey,
        defaultModel: 'default'
      });
  
      const rawModels = await service.listModels();
      const models = this._processModelData(rawModels, apiStandard);
  
      console.log('[ModelManager] Fetched and standardized', models.length, 'models');
      return models;
    }
  
    /**
     * 清除模型缓存（仅清空 Settings 中的 models，重新拉取由调用方决定）
     */
    async clearCache() {
      console.log('[ModelManager] Cache clear requested — delegates to settings.models reset');
    }
  
    /**
     * 标准化原始模型数据
     * @private
     */
    _processModelData(rawModels, apiStandard) {
      if (!Array.isArray(rawModels)) return [];
  
      return rawModels.map(raw => {
        if (raw instanceof Model) return raw;
  
        const id = typeof raw === 'string' ? raw : raw.id;
        const name = raw.name || id;
  
        const capabilities = {
          vision: this._detectVisionCapability(id, name, raw),
          toolUse: this._detectToolUseCapability(id, name, raw, apiStandard),
          streaming: true,
          reasoning: this._detectReasoningCapability(id, name, raw),
          jsonMode: this._detectJsonModeCapability(id, name, raw, apiStandard)
        };
  
        return new Model({
          id,
          name,
          publisher: raw.owned_by || raw.publisher || 'unknown',
          architecture: raw.architecture || null,
          capabilities,
          contextLength: raw.context_length || raw.context_window || 8192,
          inputModalities: raw.input_modalities || (this._detectVisionCapability(id, name, raw) ? ['text', 'image'] : ['text']),
          pricing: raw.pricing || null,
          description: raw.description || '',
          metadata: raw
        });
      });
    }
  
    /**
     * 检测视觉能力
     * @private
     */
    _detectVisionCapability(id, name, raw) {
      const searchStr = (id + ' ' + name).toLowerCase();
      return searchStr.includes('vision') || 
             searchStr.includes('vl') || 
             searchStr.includes('multimodal') ||
             !!(raw.capabilities?.vision) ||
             raw.modality?.includes('image');
    }
  
    /**
     * 检测工具调用能力
     * @private
     */
    _detectToolUseCapability(id, name, raw, apiStandard) {
      const searchStr = (id + ' ' + name).toLowerCase();
      if (searchStr.includes('embedding')) return false;
      if (apiStandard === 'openai') return true;
      return raw.capabilities?.tool_use !== false && 
             raw.supports_tools !== false && 
             raw.supports_function_calling !== false;
    }
  
    /**
     * 检测推理/思考能力
     * @private
     */
    _detectReasoningCapability(id, name, raw) {
      const searchStr = (id + ' ' + name).toLowerCase();
      return searchStr.includes('think') || 
             searchStr.includes('reasoning') || 
             searchStr.includes('deepseek-r1') ||
             searchStr.includes('o1') ||
             searchStr.includes('o3') ||
             !!(raw.capabilities?.reasoning) ||
             raw.supports_reasoning === true;
    }
  
    /**
     * 检测 JSON 模式能力
     * @private
     */
    _detectJsonModeCapability(id, name, raw, apiStandard) {
      if (apiStandard === 'openai') return true;
      return !!(raw.capabilities?.json_mode);
    }
  }
  
  // 导出类
  root.ModelManager = ModelManager;

  // ========== kernel/services/ProcessManager.js ==========
  /**
   * ProcessManager - 进程管理器
   *
   * 职责：
   * - 进程的生命周期管理（spawn / run / pause / resume / kill）
   * - 能力检查（集成 CapabilityManager）
   * - 进程状态追踪与事件分发
   * - 进程注册表（list / get / getBySession）
   *
   * 设计原则：
   * - ProcessManager 不包含具体的 AI 调用逻辑，由上层驱动
   * - 进程状态转换受 Process.TRANSITIONS 约束
   * - 所有状态变更通过 EventBus 广播
   */
  
  class ProcessManager {
    constructor(serviceCenter) {
      this.serviceCenter = serviceCenter;
      this.eventBus = serviceCenter.getEventBus();
      this.capabilityManager = serviceCenter.capabilities;
  
      /** @type {Map<string, Process>} procId → Process */
      this._processes = new Map();
      /** @type {Map<string, string>} sessionId → procId（当前活跃进程） */
      this._sessionProcessMap = new Map();
    }
  
    // ==================== 进程创建与销毁 ====================
  
    /**
     * 创建进程（spawn）
     *
     * @param {Object} options
     * @param {Program} options.program - 程序定义
     * @param {string} [options.sessionId] - 绑定会话 ID
     * @param {string} [options.model] - 使用的模型 ID
     * @param {string} [options.parentProcessId] - 父进程 ID
     * @returns {Process}
     */
    spawn({ program, sessionId = null, model = null, parentProcessId = null } = {}) {
      if (!program) {
        throw new Error('[ProcessManager] program is required');
      }
  
      // 权限检查：程序声明的能力是否被允许
      this._checkCapabilities(program);
  
      const proc = new Process({ program, sessionId, model, parentProcessId });
  
      this._processes.set(proc.id, proc);
      if (sessionId) {
        this._sessionProcessMap.set(sessionId, proc.id);
      }
  
      // 状态转换：CREATED → READY
      this._transition(proc, Process.STATE.READY);
  
      console.log(`[ProcessManager] Spawned process ${proc.id} (program=${program.name})`);
      return proc;
    }
  
    /**
     * 终止进程（kill）
     * @param {string} procId
     * @returns {boolean}
     */
    kill(procId) {
      const proc = this.get(procId);
      if (!proc || proc.isTerminal) return false;
  
      this._transition(proc, Process.STATE.TERMINATED);
  
      if (proc.sessionId) {
        this._sessionProcessMap.delete(proc.sessionId);
      }
  
      console.log(`[ProcessManager] Terminated process ${procId}`);
      return true;
    }
  
    // ==================== 进程调度 ====================
  
    /**
     * 启动进程（run）
     * 将进程从 READY 转为 RUNNING
     * @param {string} procId
     * @returns {Process|null}
     */
    run(procId) {
      const proc = this.get(procId);
      if (!proc || !proc.canTransition(Process.STATE.RUNNING)) return null;
  
      this._transition(proc, Process.STATE.RUNNING);
      proc.startTime = Date.now();
      return proc;
    }
  
    /**
     * 暂停进程（pause）
     * @param {string} procId
     * @returns {boolean}
     */
    pause(procId) {
      const proc = this.get(procId);
      if (!proc || !proc.canTransition(Process.STATE.PAUSED)) return false;
  
      this._transition(proc, Process.STATE.PAUSED);
      return true;
    }
  
    /**
     * 恢复进程（resume）
     * @param {string} procId
     * @returns {boolean}
     */
    resume(procId) {
      const proc = this.get(procId);
      if (!proc || !proc.canTransition(Process.STATE.RUNNING)) return false;
  
      this._transition(proc, Process.STATE.RUNNING);
      return true;
    }
  
    /**
     * 标记进程完成
     * @param {string} procId
     * @param {*} [output]
     */
    complete(procId, output = null) {
      const proc = this.get(procId);
      if (!proc || !proc.canTransition(Process.STATE.COMPLETED)) return;
  
      proc.output = output;
      proc.endTime = Date.now();
      proc.duration = proc.endTime - proc.startTime;
      this._transition(proc, Process.STATE.COMPLETED);
  
      console.log(`[ProcessManager] Process ${procId} completed in ${proc.duration}ms`);
    }
  
    /**
     * 标记进程失败
     * @param {string} procId
     * @param {Error|string} error
     */
    fail(procId, error) {
      const proc = this.get(procId);
      if (!proc || !proc.canTransition(Process.STATE.FAILED)) return;
  
      proc.error = error instanceof Error ? error : new Error(String(error));
      proc.endTime = Date.now();
      proc.duration = proc.endTime - (proc.startTime || proc.createdAt);
      this._transition(proc, Process.STATE.FAILED);
  
      console.error(`[ProcessManager] Process ${procId} failed:`, error);
    }
  
    // ==================== 查询 ====================
  
    /**
     * 获取进程
     * @param {string} procId
     * @returns {Process|null}
     */
    get(procId) {
      return this._processes.get(procId) || null;
    }
  
    /**
     * 获取进程列表
     * @param {Object} [filters]
     * @param {string} [filters.state] - 按状态过滤
     * @param {string} [filters.sessionId] - 按会话过滤
     * @param {string} [filters.programId] - 按程序过滤
     * @returns {Process[]}
     */
    list(filters = {}) {
      let result = Array.from(this._processes.values());
  
      if (filters.state) {
        result = result.filter(p => p.state === filters.state);
      }
      if (filters.sessionId) {
        result = result.filter(p => p.sessionId === filters.sessionId);
      }
      if (filters.programId) {
        result = result.filter(p => p.programId === filters.programId);
      }
  
      return result;
    }
  
    /**
     * 获取指定会话的活跃进程
     * @param {string} sessionId
     * @returns {Process|null}
     */
    getBySession(sessionId) {
      const procId = this._sessionProcessMap.get(sessionId);
      return procId ? this.get(procId) : null;
    }
  
    /**
     * 获取所有运行中的进程
     * @returns {Process[]}
     */
    getRunning() {
      return this.list({ state: Process.STATE.RUNNING });
    }
  
    /**
     * 清理已完成的进程
     */
    cleanup() {
      for (const [id, proc] of this._processes) {
        if (proc.isTerminal) {
          this._processes.delete(id);
          if (proc.sessionId) {
            this._sessionProcessMap.delete(proc.sessionId);
          }
        }
      }
    }
  
    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
      const all = Array.from(this._processes.values());
      return {
        total: all.length,
        running: all.filter(p => p.state === Process.STATE.RUNNING).length,
        completed: all.filter(p => p.state === Process.STATE.COMPLETED).length,
        failed: all.filter(p => p.state === Process.STATE.FAILED).length,
        created: all.filter(p => p.state === Process.STATE.CREATED).length,
        ready: all.filter(p => p.state === Process.STATE.READY).length,
        paused: all.filter(p => p.state === Process.STATE.PAUSED).length,
        terminated: all.filter(p => p.state === Process.STATE.TERMINATED).length
      };
    }
  
    // ==================== 内部方法 ====================
  
    /**
     * 检查程序声明的能力是否被允许
     * @private
     * @param {Program} program
     */
    _checkCapabilities(program) {
      if (!this.capabilityManager || !program.capabilities.length) return;
  
      for (const cap of program.capabilities) {
        if (!this.capabilityManager.check(program.name, cap, { programId: program.id })) {
          console.warn(
            `[ProcessManager] Program "${program.name}" requires capability "${cap}" which is not granted. ` +
            `Process will be created but capability checks may fail at runtime.`
          );
        }
      }
    }
  
    /**
     * 执行状态转换
     * @private
     * @param {Process} proc
     * @param {string} newState
     */
    _transition(proc, newState) {
      if (!proc.canTransition(newState)) {
        console.error(
          `[ProcessManager] Invalid transition: ${proc.state} → ${newState} for process ${proc.id}`
        );
        return;
      }
  
      const oldState = proc.state;
      proc.state = newState;
  
      this.eventBus.emit(Events.PROCESS.STATE_CHANGED, {
        processId: proc.id,
        programId: proc.programId,
        oldState,
        newState,
        timestamp: Date.now()
      });
    }
  }
  
  // 导出
  root.ProcessManager = ProcessManager;

  // ========== kernel/services/ServiceCenter.js ==========
  /**
   * ServiceCenter - 框架核心服务管理中心（向后兼容层）
   * 
   * 职责：
   * - 提供全局框架服务的统一访问入口（单例管理）
   * - 底层 IPC 由 Kernel 提供，不再创建独立 EventBus
   * 
   * 注意：新代码应通过 kernel.get('serviceName') 访问服务
   */
  
  class ServiceCenter {
    constructor(ipc = null, kernel = null) {
      // 使用 Kernel IPC 代替独立 EventBus
      this.eventBus = ipc;
      this.kernel = kernel;
      
      // 服务实例缓存
      this.sessionManager = null;
      this.settingsManager = null;
      this.storageManager = null;
      this.scriptsManager = null;
      this.modelManager = null;
      this.currentProviderService = null;
      this.currentProviderId = null;
      
      // 工具注册表
      this.tools = new Map();
    }
  
    /**
     * 获取事件总线实例（返回 Kernel IPC，API 完全兼容）
     */
    getEventBus() {
      return this.eventBus;
    }
  
    /**
     * 设置 IPC 实例（由 app.js 注入 Kernel IPC）
     * @param {IPC} ipc
     */
    setIPC(ipc) {
      this.eventBus = ipc;
      this._ownsEventBus = false;
    }
  
    /**
     * 获取 SessionManager
     */
    getSessionManager() {
      return this.sessionManager;
    }
  
    /**
     * 获取 SettingsManager
     */
    getSettingsManager() {
      return this.settingsManager;
    }
  
    /**
     * 获取 StorageManager
     */
    getStorageManager() {
      return this.storageManager;
    }
  
    /**
     * 获取 ScriptsManager
     */
    getScriptsManager() {
      return this.scriptsManager;
    }
  
    /**
     * 获取 ModelManager
     */
    getModelManager() {
      return this.modelManager;
    }
  
    /**
     * 获取所有已注册的工具
     * @returns {Array} 工具实例数组
     */
    getAllTools() {
      if (this.kernel && this.kernel.toolRegistry && typeof this.kernel.toolRegistry.getAll === 'function') {
        return this.kernel.toolRegistry.getAll();
      }
      return Array.from(this.tools.values());
    }
  
    /**
     * 获取指定工具
     * @param {string} name
     * @returns {Object|null}
     */
    getTool(name) {
      if (this.kernel && this.kernel.toolRegistry && typeof this.kernel.toolRegistry.get === 'function') {
        return this.kernel.toolRegistry.get(name);
      }
      return this.tools.get(name) || null;
    }
  
    /**
     * 获取工具定义列表（用于传给 LLM 的 tools 参数）
     * @param {string} [format='openai']
     * @returns {Array}
     */
    getToolDefinitionsForLLM(format = 'openai') {
      if (this.kernel && this.kernel.toolRegistry && typeof this.kernel.toolRegistry.getDefinitionsForLLM === 'function') {
        return this.kernel.toolRegistry.getDefinitionsForLLM(format);
      }
      return [];
    }
  
    /**
     * 登记或更新当前活跃的 Provider API 服务
     */
    updateProviderService(settings) {
      if (!settings || !settings.apiStandard) {
        console.warn('[ServiceCenter] Cannot update provider: settings or apiStandard missing');
        return null;
      }
  
      const providerId = settings.apiStandard;
      const config = {
        endpoint: settings.apiEndpoint,
        apiKey: settings.apiKey,
        defaultModel: settings.model || 'default'
      };
  
      if (!this.currentProviderService || this.currentProviderId !== providerId) {
        this.currentProviderService = this.createProviderService(providerId, config);
        this.currentProviderId = providerId;
        console.log('[ServiceCenter] New provider service registered:', providerId);
      } else {
        const currentConfig = this.currentProviderService.config || {};
        const configChanged = 
          currentConfig.endpoint !== config.endpoint ||
          currentConfig.apiKey !== config.apiKey ||
          currentConfig.defaultModel !== config.defaultModel;
  
        if (configChanged) {
          this.currentProviderService.configure(config);
          console.log('[ServiceCenter] Existing provider service updated:', providerId);
        }
      }
  
      return this.currentProviderService;
    }
  
    /**
     * 获取当前活跃的 Provider API 服务
     */
    getCurrentProviderService() {
      if (!this.currentProviderService) {
        const settings = this.getSettingsManager().getSettings();
        if (settings && settings.apiStandard) {
          return this.updateProviderService(settings.toJSON ? settings.toJSON() : settings);
        }
        throw new Error('Chat service not registered. Please ensure provider is initialized via SettingsEventHandler.');
      }
      return this.currentProviderService;
    }
  
    /**
     * 创建 Provider API 服务实例
     */
    createProviderService(providerId, config) {
      let ServiceClass = null;
      switch (providerId) {
        case 'openai':
          ServiceClass = OpenAIService;
          break;
        case 'openrouter':
          ServiceClass = OpenRouterService;
          break;
        case 'lm-studio':
          ServiceClass = LMStudioService;
          break;
        default:
          throw new Error(`Unknown provider: ${providerId}`);
      }
      
      if (!ServiceClass) {
        throw new Error(`Service class not found for provider: ${providerId}`);
      }
      
      const service = new ServiceClass();
      service.configure(config);
      
      console.log('[ServiceCenter] Chat service created for:', providerId);
      return service;
    }
  }
  
  // 导出
  root.ServiceCenter = ServiceCenter;

  // ========== kernel/programs/ChatProgram.js ==========
  /**
   * ChatProgram - 聊天程序（Core 层）
   *
   * 职责：编排"用户发消息 → AI 流式回复 → 工具调用循环"的完整流程。
   * 只处理 core model + 存储逻辑。
   *
   * 输入：订阅 eventBus 事件
   *   CMD.SEND             → 发送消息
   *   CMD.STOP             → 停止生成
   *   CMD.DELETE_MESSAGE   → 删除消息
   *
   * 输出：发射 eventBus 事件
   *   STREAM_START              → 流式开始（UI 应显示停止按钮）
   *   STREAM_CHUNK_APPEND       → 流式分片（content/reasoning_content）
   *   STREAM_COMPLETE           → 流式结束（UI 应隐藏停止按钮）
   *   STREAM_STOP               → 用户停止
   *   STREAM_ERROR              → 流式错误
   *   TOOL.EXECUTING            → 工具开始执行
   *   TOOL.COMPLETED            → 工具执行完成
   *   TOOL.ALL_COMPLETED        → 本轮所有工具执行完毕
   *   MESSAGE_DELETED           → 消息已删除
   */
  class ChatProgram {
    // ★ 指令接口：ChatProgram 只接受这些指令
    static CMD = Object.freeze({
      SEND: 'chat:cmd:send',                    // 发送消息 { content, sessionId?, model?, reasoningEffort? }
      STOP: 'chat:cmd:stop',                    // 停止生成
      DELETE_MESSAGE: 'chat:cmd:deleteMessage',  // 删除消息 { messageId }
    });
  
    constructor(serviceCenter) {
      this.serviceCenter = serviceCenter;
      this.eventBus = serviceCenter.getEventBus();
  
      this._session = null;
      this._assistantMsgId = null;
      this._destroyed = false;
  
      // ★ 订阅自己的指令（由 ChatEventHandler 鉴权后转发）
      // 保存回调引用以便 destroy() 时移除
      this._onSend = (data) => this.sendMessage(data);
      this._onStop = () => this.cancel();
      this._onDeleteMessage = (data) => {
        const sessionManager = this.serviceCenter.getSessionManager();
        const session = sessionManager.getCurrentSession();
        if (session && data.messageId) {
          const result = sessionManager.deleteMessage(data.messageId, session.id);
          if (result !== false) {
            this.eventBus.emit(Events.CHAT.MESSAGE_DELETED, {
              messageId: data.messageId, sessionId: session.id,
            });
          }
        }
      };
  
      this.eventBus.on(ChatProgram.CMD.SEND, this._onSend);
      this.eventBus.on(ChatProgram.CMD.STOP, this._onStop);
      this.eventBus.on(ChatProgram.CMD.DELETE_MESSAGE, this._onDeleteMessage);
  
      // ★ 会话切换时：取消正在进行的交互，更新 session 引用
      this._onSessionChanged = () => {
        if (this._active) {
          console.log('[ChatProgram] Session changed during active stream, cancelling');
          this.cancel();
        }
        // session 已由 SessionManager 更新，下次 sendMessage 时会自动获取当前会话
      };
      this.eventBus.on(Events.CHAT.CURRENT_SESSION_CHANGED, this._onSessionChanged);
    }
  
    /**
     * 销毁实例，移除所有事件监听
     */
    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      this.eventBus.off(ChatProgram.CMD.SEND, this._onSend);
      this.eventBus.off(ChatProgram.CMD.STOP, this._onStop);
      this.eventBus.off(ChatProgram.CMD.DELETE_MESSAGE, this._onDeleteMessage);
      this.eventBus.off(Events.CHAT.CURRENT_SESSION_CHANGED, this._onSessionChanged);
      console.log('[ChatProgram] Destroyed');
    }
  
    /**
     * 发送消息（用户消息 → 流式回复 → 工具循环全流程）
     */
    async sendMessage({ content, sessionId = null, model = null, reasoningEffort = undefined, isToolContinuation = false } = {}) {
      if (!isToolContinuation && !content?.trim()) return;
  
      const sessionManager = this.serviceCenter.getSessionManager();
      let service;
  
      try {
        service = this.serviceCenter.getCurrentProviderService();
      } catch (e) {
        console.error('[ChatProgram] No provider configured');
        this.eventBus.emit(Events.CHAT.STREAM_ERROR, {
          error: e, message: '请先在设置中配置 AI 服务',
        });
        return;
      }
  
      const settings = this.serviceCenter.getSettingsManager().getSettings();
      const defaultEffort = settings?.reasoningEffort || 'medium';
  
      try {
        // 1. 获取/创建会话
        this._session = sessionId
          ? sessionManager.getSession(sessionId)
          : sessionManager.getCurrentSession();
  
        if (!this._session) {
          this._session = sessionManager.createSession({
            title: '新对话',
            reasoningEffort: reasoningEffort || defaultEffort,
          });
        } else if (reasoningEffort && this._session.reasoningEffort !== reasoningEffort) {
          this._session.reasoningEffort = reasoningEffort;
        }
  
        const modelId = model || service.config?.defaultModel;
        const thinkingEffort = this._session.reasoningEffort || 'off';
  
        // 2. 添加用户消息
        if (!isToolContinuation) {
          const userMsg = new Message({ role: 'user', content: content.trim() });
          await sessionManager.addMessage(userMsg, this._session.id);
        }
  
        // 3. 截断 → 构建请求
        const freshSession = sessionManager.getSession(this._session.id);
        const messages = this._truncateMessages(freshSession, settings, modelId);
        const tools = this.serviceCenter.getToolDefinitionsForLLM();
        const { MessagesRequest } = MessageContent;
  
        const request = new MessagesRequest({
          model: modelId,
          messages,
          stream: true,
          thinking: new MessageContent.ThinkingConfig(thinkingEffort),
          tools: tools.length > 0 ? tools : null,
        });
  
        if (service?.cacheOptions) {
          service.cacheOptions.sessionCacheKey = `webagentcli:session:${this._session.id}`;
        }
  
        // 4. 创建 assistant 空消息
        const assistantMsg = new Message({ role: 'assistant', content: '' });
        await sessionManager.addMessage(assistantMsg, this._session.id);
        this._assistantMsgId = assistantMsg.id;
  
        // → 发射 STREAM_START（UI 应显示停止按钮）
        this.eventBus.emit(Events.CHAT.STREAM_START, {
          sessionId: this._session.id, messageId: this._assistantMsgId,
        });
  
        // 5. 流式请求
        const result = await service.chatStream(request, (chunk) => {
          const text = chunk.content || '';
          const reasoning = chunk.reasoning_content || '';
  
          // 持久化写入 session
          sessionManager.streamChunkMessage(this._assistantMsgId, {
            content: text, reasoning_content: reasoning,
          }, this._session.id);
  
          // UI 更新
          this.eventBus.emit(Events.CHAT.STREAM_CHUNK_APPEND, {
            sessionId: this._session.id,
            messageId: this._assistantMsgId,
            content: text,
            reasoning_content: reasoning,
          });
        });
  
        if (!result) return; // 被 cancel
  
        // 6. 附加 toolCalls
        if (result.toolCalls?.length > 0) {
          sessionManager.updateMessage(this._assistantMsgId, (msg) => {
            result.toolCalls.forEach(tc => msg.addToolCall(tc));
          }, this._session.id);
        }
  
        // → 发射 STREAM_COMPLETE（UI 应隐藏停止按钮）
        this.eventBus.emit(Events.CHAT.STREAM_COMPLETE, {
          sessionId: this._session.id, messageId: this._assistantMsgId,
        });
  
        // 7. 工具循环或结束
        if (result.toolCalls?.length > 0) {
          await this._executeToolCalls(result.toolCalls, this._session.id);
        }
  
        return result;
  
      } catch (error) {
        console.error('[ChatProgram] sendMessage failed:', error);
        this.eventBus.emit(Events.CHAT.STREAM_ERROR, {
          error, message: error.message,
          sessionId: this._session?.id, messageId: this._assistantMsgId,
        });
      } finally {
        try { await sessionManager.flushAllStreamWrites(); } catch (e) { /* ignore */ }
      }
    }
  
    /**
     * 取消当前请求
     */
    cancel() {
      const service = this.serviceCenter.getCurrentProviderService();
      if (service?.cancel) service.cancel();
      this.eventBus.emit(Events.CHAT.STREAM_STOP, {
        sessionId: this._session?.id, messageId: this._assistantMsgId,
      });
      try { this.serviceCenter.getSessionManager().flushAllStreamWrites(); } catch (e) { /* ignore */ }
    }
  
    // ==================== 工具循环 ====================
  
    async _executeToolCalls(toolCalls, sessionId) {
      const sessionManager = this.serviceCenter.getSessionManager();
  
      // → 发射 TOOL.EXECUTING 第一个工具开始（UI 可显示执行指示器）
      if (toolCalls.length > 0) {
        this.eventBus.emit(Events.TOOL.EXECUTING, {
          toolName: toolCalls[0].toolName, toolCallId: toolCalls[0].id, sessionId,
        });
      }
  
      for (const tc of toolCalls) {
        const tool = this.serviceCenter.getTool(tc.toolName);
  
        let toolResult;
        try {
          if (!tool) {
            toolResult = new ToolResult({ toolCallId: tc.id, status: 'failed', error: `Unknown: ${tc.toolName}` });
          } else {
            toolResult = await tool.invoke(tc, { sessionId });
          }
        } catch (e) {
          toolResult = new ToolResult({ toolCallId: tc.id, status: 'failed', error: e.message || String(e) });
        }
  
        this.eventBus.emit(Events.TOOL.COMPLETED, {
          toolName: tc.toolName, toolCallId: tc.id, status: toolResult.status, duration: toolResult.duration, sessionId,
        });
  
        const toolMsg = new Message({
          role: Role.TOOL,
          toolCallId: tc.id,
          content: toolResult.isSuccess()
            ? (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))
            : `⚠️ 失败: ${toolResult.error}`,
        });
        await sessionManager.addMessage(toolMsg, sessionId);
      }
  
      // → 发射 TOOL.ALL_COMPLETED（UI 可隐藏执行指示器）
      this.eventBus.emit(Events.TOOL.ALL_COMPLETED, { toolResults: Array.from(toolCalls), sessionId });
  
      // 工具续发
      await this.sendMessage({ sessionId, isToolContinuation: true });
    }
  
    // ==================== 内部 ====================
  
    _truncateMessages(session, settings, modelId) {
      const sessionManager = this.serviceCenter.getSessionManager();
      const totalMessages = session.messages.length;
      const autoTruncate = settings?.autoContextTruncation !== false;
      const hasCache = this._providerHasCache(this.serviceCenter.getCurrentProviderService(), modelId);
  
      let messages;
      if (hasCache) {
        messages = sessionManager.getContextWindow(session, {
          autoContextTruncation: autoTruncate,
          contextWindowSize: settings?.contextWindowSize || 20,
        });
      } else {
        const modelObj = this.serviceCenter.getModelManager().getModel(modelId);
        messages = sessionManager.getMessagesByTokenBudget(session, {
          contextLength: modelObj?.contextLength || 8192,
          maxTokens: settings?.maxTokens || 2000,
          contextWindowRatio: settings?.contextWindowRatio || 0.8,
        });
      }
      if (messages.length < totalMessages) console.log(`[ChatProgram] Truncated: ${totalMessages} → ${messages.length}`);
      return messages;
    }
  
    _providerHasCache(service, modelId) {
      if (!service?.cacheOptions?.enabled) return false;
      switch (service.name) {
        case 'openai':  return /^(o\d|gpt-4\.1|gpt-4o)/i.test(modelId || '');
        case 'openrouter': return !modelId?.includes('free');
        case 'lm-studio': return true;
        default: return false;
      }
    }
  }
  root.ChatProgram = ChatProgram;


  // ========== webagent 命名空间快捷引用 ==========
  webagent.KernelLog = root.KernelLog;
  webagent.IPC = root.IPC;
  webagent.IPCChannel = root.IPCChannel;
  webagent.KernelEvents = root.KernelEvents;
  webagent.KernelMessageFormats = root.KernelMessageFormats;
  webagent.EventValidator = root.EventValidator;
  webagent.ToolRegistry = root.ToolRegistry;
  webagent.CapabilityManager = root.CapabilityManager;
  webagent.CapabilityError = root.CapabilityError;
  webagent.Kernel = root.Kernel;
  webagent.Bootloader = root.Bootloader;
  webagent.models.BaseModel = root.BaseModel;
  webagent.models.ToolDefinition = root.ToolDefinition;
  webagent.models.ToolCall = root.ToolCall;
  webagent.models.ToolResult = root.ToolResult;
  webagent.models.MessageContent = root.MessageContent;
  webagent.models.Message = root.Message;
  webagent.models.Role = root.Role;
  webagent.models.Session = root.Session;
  webagent.models.Settings = root.Settings;
  webagent.models.Model = root.Model;
  webagent.models.ScriptsModel = root.ScriptsModel;
  webagent.models.Program = root.Program;
  webagent.models.Process = root.Process;
  webagent.services.IStorageManager = root.IStorageManager;
  webagent.services.IAppSettings = root.IAppSettings;
  webagent.services.IModelManager = root.IModelManager;
  webagent.services.IProviderAPIService = root.IProviderAPIService;
  webagent.services.IScriptsManager = root.IScriptsManager;
  webagent.services.ISessionManager = root.ISessionManager;
  webagent.services.IToolService = root.IToolService;
  webagent.providers.OpenAIService = root.OpenAIService;
  webagent.providers.OpenRouterService = root.OpenRouterService;
  webagent.providers.LMStudioService = root.LMStudioService;
  webagent.services.SessionManager = root.SessionManager;
  webagent.services.SettingsManager = root.SettingsManager;
  webagent.services.ScriptsManager = root.ScriptsManager;
  webagent.services.ModelManager = root.ModelManager;
  webagent.services.ProcessManager = root.ProcessManager;
  webagent.services.ServiceCenter = root.ServiceCenter;
  webagent.programs.ChatProgram = root.ChatProgram;

  webagent.VERSION = '0.5.1';
  webagent.CODENAME = 'Microkernel';

  // ========== 注册到 globalThis（供 bundle 外部的壳层代码使用） ==========
  root.KernelLog = KernelLog;
  root.IPC = IPC;
  root.IPCChannel = IPCChannel;
  root.KernelEvents = KernelEvents;
  root.KernelMessageFormats = KernelMessageFormats;
  root.EventValidator = EventValidator;
  root.ToolRegistry = ToolRegistry;
  root.CapabilityManager = CapabilityManager;
  root.CapabilityError = CapabilityError;
  root.Kernel = Kernel;
  root.Bootloader = Bootloader;
  root.BaseModel = BaseModel;
  root.ToolDefinition = ToolDefinition;
  root.ToolCall = ToolCall;
  root.ToolResult = ToolResult;
  root.MessageContent = MessageContent;
  root.Message = Message;
  root.Role = Role;
  root.Session = Session;
  root.Settings = Settings;
  root.Model = Model;
  root.ScriptsModel = ScriptsModel;
  root.Program = Program;
  root.Process = Process;
  root.IStorageManager = IStorageManager;
  root.IAppSettings = IAppSettings;
  root.IModelManager = IModelManager;
  root.IProviderAPIService = IProviderAPIService;
  root.IScriptsManager = IScriptsManager;
  root.ISessionManager = ISessionManager;
  root.IToolService = IToolService;
  root.OpenAIService = OpenAIService;
  root.OpenRouterService = OpenRouterService;
  root.LMStudioService = LMStudioService;
  root.SessionManager = SessionManager;
  root.SettingsManager = SettingsManager;
  root.ScriptsManager = ScriptsManager;
  root.ModelManager = ModelManager;
  root.ProcessManager = ProcessManager;
  root.ServiceCenter = ServiceCenter;
  root.ChatProgram = ChatProgram;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
