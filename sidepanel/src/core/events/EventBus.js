/**
 * EventBus - 事件总线（解耦模块通信）
 * 
 * 提供订阅/发布机制，支持精确卸载监听器。
 */

class EventBus {
  constructor() {
    this.listeners = new Map(); // listenerId -> { event, handler }
    this.eventHandlers = new Map(); // event -> Set<listenerId>
    this.nextListenerId = 1;
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} handler - 处理函数
   * @returns {string} listenerId - 用于卸载监听
   */
  on(event, handler) {
    const listenerId = `listener_${this.nextListenerId++}`;
    
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    
    this.eventHandlers.get(event).add(listenerId);
    this.listeners.set(listenerId, { event, handler });
    
    return listenerId;
  }

  /**
   * 一次性订阅（触发后自动卸载）
   * @param {string} event 
   * @param {Function} handler 
   * @returns {string} listenerId
   */
  once(event, handler) {
    const listenerId = this.on(event, (...args) => {
      this.off(listenerId);
      handler(...args);
    });
    
    return listenerId;
  }

  /**
   * 卸载监听器
   * @param {string} listenerId 
   */
  off(listenerId) {
    const listener = this.listeners.get(listenerId);
    if (!listener) return;
    
    const { event } = listener;
    const handlers = this.eventHandlers.get(event);
    
    if (handlers) {
      handlers.delete(listenerId);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
    
    this.listeners.delete(listenerId);
  }

  /**
   * 发布事件
   * @param {string} event - 事件名称
   * @param {any} data - 事件数据
   */
  emit(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    
    // 复制一份，防止在处理过程中被修改
    const listenerIds = Array.from(handlers);
    
    for (const listenerId of listenerIds) {
      const listener = this.listeners.get(listenerId);
      if (listener) {
        try {
          listener.handler(data, event);
        } catch (error) {
          console.error(`[EventBus] Error in handler for event "${event}":`, error);
        }
      }
    }
  }

  /**
   * 获取某事件的监听器数量
   * @param {string} event 
   */
  listenerCount(event) {
    const handlers = this.eventHandlers.get(event);
    return handlers ? handlers.size : 0;
  }

  /**
   * 清空所有监听器
   */
  clearAll() {
    this.listeners.clear();
    this.eventHandlers.clear();
  }

  /**
   * 清空某事件的所有监听器
   * @param {string} event 
   */
  clearEvent(event) {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    
    for (const listenerId of handlers) {
      this.listeners.delete(listenerId);
    }
    
    this.eventHandlers.delete(event);
  }
}

// 导出单例
if (typeof window !== 'undefined') {
  window.EventBus = EventBus;
  window.eventBus = new EventBus();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EventBus;
}
