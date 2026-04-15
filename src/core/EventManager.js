// ==================== 事件管理器 ====================
// 统一的事件通信系统，替换 window 全局事件

const EventManager = (function() {
    'use strict';
    
    const listeners = new Map();
    
    /**
     * 标准化事件类型
     */
    const EventTypes = {
        // UI 相关
        UI_SHOW: 'ui:show',
        UI_HIDE: 'ui:hide',
        UI_TOGGLE: 'ui:toggle',
        
        // 聊天相关
        CHAT_MESSAGE_SENT: 'chat:message:sent',
        CHAT_MESSAGE_RECEIVED: 'chat:message:received',
        CHAT_CLEAR: 'chat:clear',
        
        // 配置相关
        CONFIG_UPDATED: 'config:updated',
        SETTINGS_OPEN: 'settings:open',
        SETTINGS_SAVED: 'settings:saved',
        
        // 文件操作相关
        FILE_OPENED: 'file:opened',
        FILE_SAVED: 'file:saved',
        FILE_DELETED: 'file:deleted',
        FOLDER_OPENED: 'folder:opened',
        
        // 工作空间相关
        WORKSPACE_CHANGED: 'workspace:changed',
        WORKSPACE_LOADED: 'workspace:loaded',
        
        // API 相关
        API_CALL_START: 'api:call:start',
        API_CALL_SUCCESS: 'api:call:success',
        API_CALL_ERROR: 'api:call:error',
        
        // 系统级
        APP_STARTED: 'app:started',
        APP_ERROR: 'app:error',
        AGENT_OPEN: 'agent:open',
        AGENT_CLOSE: 'agent:close'
    };
    
    /**
     * 注册事件监听器
     * @param {string} eventType - 事件类型
     * @param {Function} callback - 回调函数
     * @returns {Function} 移除监听器的函数
     */
    function on(eventType, callback) {
        if (!listeners.has(eventType)) {
            listeners.set(eventType, []);
        }
        
        const callbacks = listeners.get(eventType);
        callbacks.push(callback);
        
        // 返回移除函数
        return () => {
            const idx = callbacks.indexOf(callback);
            if (idx > -1) {
                callbacks.splice(idx, 1);
            }
        };
    }
    
    /**
     * 一次性事件监听器
     * @param {string} eventType - 事件类型
     * @param {Function} callback - 回调函数
     */
    function once(eventType, callback) {
        const removeListener = on(eventType, (data) => {
            removeListener();
            callback(data);
        });
    }
    
    /**
     * 触发事件
     * @param {string} eventType - 事件类型
     * @param {any} data - 事件数据
     */
    function emit(eventType, data = null) {
        console.log(`📡 事件触发: ${eventType}`, data);
        
        // 兼容性：同时触发全局事件（暂时保留）
        try {
            window.dispatchEvent(new CustomEvent(eventType.replace(':', '-'), { detail: data }));
        } catch (error) {
            console.warn('全局事件触发失败:', error);
        }
        
        // 触发内部事件
        const callbacks = listeners.get(eventType);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`事件监听器错误 (${eventType}):`, error);
                }
            });
        }
    }
    
    /**
     * 移除事件监听器
     * @param {string} eventType - 事件类型
     * @param {Function} callback - 回调函数
     */
    function off(eventType, callback) {
        const callbacks = listeners.get(eventType);
        if (callbacks) {
            const idx = callbacks.indexOf(callback);
            if (idx > -1) {
                callbacks.splice(idx, 1);
            }
        }
    }
    
    /**
     * 清除所有事件监听器
     */
    function clearAll() {
        listeners.clear();
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
        once,
        emit,
        off,
        clearAll,
        getEventTypes,
        
        // 事件类型常量（方便使用）
        EventTypes
    };
})();