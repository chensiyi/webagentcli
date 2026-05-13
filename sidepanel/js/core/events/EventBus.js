/**
 * 事件总线（消息总线）
 * 统一管理应用内所有事件通信
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.messageHistory = [];
    this.maxHistory = 100; // 最多保留100条历史消息
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event).push(callback);
    
    // 返回取消订阅函数
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * 订阅一次性事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
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
   */
  emit(event, data = {}) {
    const message = {
      event,
      data,
      timestamp: Date.now(),
      id: this.generateMessageId()
    };
    
    // 记录历史
    this.recordMessage(message);
    
    // 触发监听器
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      callbacks.forEach(callback => {
        try {
          callback(message.data, message);
        } catch (error) {
          console.error(`[EventBus] Error in listener for "${event}":`, error);
        }
      });
    }
    
    // 同时触发全局自定义事件（用于跨模块通信）
    window.dispatchEvent(new CustomEvent(event, {
      detail: message
    }));
    
    return message;
  }

  /**
   * 记录消息历史
   */
  recordMessage(message) {
    this.messageHistory.push(message);
    
    // 限制历史记录数量
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }
  }

  /**
   * 获取消息历史
   * @param {string} event - 可选，过滤特定事件
   * @returns {Array} 消息历史
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
   * 生成消息ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取所有已注册的事件
   */
  getRegisteredEvents() {
    return Array.from(this.listeners.keys());
  }

  /**
   * 获取某个事件的监听器数量
   */
  getListenerCount(event) {
    if (!this.listeners.has(event)) return 0;
    return this.listeners.get(event).length;
  }

  /**
   * 销毁事件总线
   */
  destroy() {
    this.listeners.clear();
    this.messageHistory = [];
  }
}

// 导出单例
window.EventBus = new EventBus();
