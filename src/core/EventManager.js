// ==================== 事件管理器 ====================
// 统一的事件总线，支持监听器 ID 管理和防重复注册

const EventManager = (function() {
    'use strict';
    
    /**
     * 事件类型常量
     */
    const EventTypes = {
        // UI 相关
        UI_SHOW: 'agent:ui:show',
        UI_HIDE: 'agent:ui:hide',
        UI_TOGGLE: 'agent:ui:toggle',
        
        // 聊天相关
        CHAT_MESSAGE_SENT: 'agent:chat:message:sent',
        CHAT_MESSAGE_RECEIVED: 'agent:chat:message:received',
        CHAT_CLEAR: 'agent:chat:clear',
        
        // 配置相关
        CONFIG_UPDATED: 'agent:config:updated',
        SETTINGS_OPEN: 'agent:settings:open',
        SETTINGS_SAVED: 'agent:settings:saved',
        
        // API 相关
        API_CALL_START: 'agent:api:call:start',
        API_CALL_SUCCESS: 'agent:api:call:success',
        API_CALL_ERROR: 'agent:api:call:error',
        
        // 系统级
        APP_STARTED: 'agent:app:started',
        APP_ERROR: 'agent:app:error',
        AGENT_OPEN: 'agent:open',
        AGENT_CLOSE: 'agent:close'
    };
    
    // 监听器注册表：eventType -> Map<listenerId, {callback, handler}>
    const listenerRegistry = new Map();
    let nextListenerId = 1;
    
    /**
     * 注册事件监听器
     * @param {string} eventType - 事件类型
     * @param {Function} callback - 回调函数
     * @returns {number} 监听器 ID，用于移除监听器
     */
    function on(eventType, callback) {
        if (typeof callback !== 'function') {
            console.error('❌ EventManager.on: callback 必须是函数');
            return -1;
        }
        
        // 为每个监听器创建唯一的 ID
        const listenerId = nextListenerId++;
        
        // 创建包装函数（用于接收 CustomEvent）
        const handler = (e) => {
            try {
                callback(e.detail);
            } catch (error) {
                console.error(`❌ 事件处理器错误 [${eventType}][ID:${listenerId}]:`, error);
            }
        };
        
        // 注册到内部表
        if (!listenerRegistry.has(eventType)) {
            listenerRegistry.set(eventType, new Map());
        }
        listenerRegistry.get(eventType).set(listenerId, { callback, handler });
        
        // 注册到 window
        window.addEventListener(eventType, handler);
        
        // 返回监听器 ID
        return listenerId;
    }
    
    /**
     * 触发事件
     * @param {string} eventType - 事件类型
     * @param {any} data - 事件数据
     */
    function emit(eventType, data = null) {
        window.dispatchEvent(new CustomEvent(eventType, { detail: data }));
    }
    
    /**
     * 移除事件监听器
     * @param {string} eventType - 事件类型
     * @param {number} listenerId - 监听器 ID（由 on() 返回）
     * @returns {boolean} 是否成功移除
     */
    function off(eventType, listenerId) {
        if (listenerRegistry.has(eventType)) {
            const listeners = listenerRegistry.get(eventType);
            if (listeners.has(listenerId)) {
                const { handler } = listeners.get(listenerId);
                
                // 从 window 移除
                window.removeEventListener(eventType, handler);
                
                // 从内部表移除
                listeners.delete(listenerId);
                
                // 如果没有监听器了，清理事件类型
                if (listeners.size === 0) {
                    listenerRegistry.delete(eventType);
                }
                
                return true;
            }
        }
        
        console.warn(`⚠️ 事件监听器未找到 [${eventType}][ID:${listenerId}]`);
        return false;
    }
    
    /**
     * 移除指定事件类型的所有监听器
     * @param {string} eventType - 事件类型
     * @returns {number} 移除的监听器数量
     */
    function offAll(eventType) {
        if (listenerRegistry.has(eventType)) {
            const listeners = listenerRegistry.get(eventType);
            let removedCount = 0;
            
            listeners.forEach(({ handler }, listenerId) => {
                window.removeEventListener(eventType, handler);
                removedCount++;
            });
            
            listenerRegistry.delete(eventType);
            
            return removedCount;
        }
        
        return 0;
    }
    
    /**
     * 获取所有注册的监听器统计信息
     * @returns {Object} 监听器统计
     */
    function getListenerStats() {
        const stats = {
            totalListeners: 0,
            eventTypes: listenerRegistry.size,
            details: {}
        };
        
        listenerRegistry.forEach((listeners, eventType) => {
            stats.totalListeners += listeners.size;
            stats.details[eventType] = listeners.size;
        });
        
        return stats;
    }
    
    /**
     * 获取事件类型常量
     */
    function getEventTypes() {
        return { ...EventTypes };
    }
    
    // 导出公共接口
    return {
        on,
        emit,
        off,
        offAll,
        getListenerStats,
        getEventTypes,
        
        // 事件类型常量（方便使用）
        EventTypes
    };
})();