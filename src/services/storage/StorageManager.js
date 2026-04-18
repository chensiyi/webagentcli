// ==================== 统一状态管理器 ====================
// v4.2.0: 单一状态树架构
// 整合 ConfigManager、StateManager、HistoryManager 的功能

const UnifiedStateManager = (function() {
    'use strict';

    // 单一状态树
    let state = {
        // 配置状态
        config: {
            apiKey: '',
            model: 'auto',
            temperature: 0.7,
            maxTokens: 4096,
            providers: [],
            customModels: []
        },
        
        // UI 状态
        ui: {
            visible: false,
            position: { x: null, y: null },
            size: { width: 450, height: 500 },
            theme: 'light'
        },
        
        // 会话状态（当前对话）
        session: {
            current: null,      // 当前会话信息 { id, startTime, messageCount }
            messages: []        // 当前会话的消息列表
        },
        
        // 模型状态
        models: {
            availableModels: [],
            modelStatus: {}, // { modelId: { available, lastTest, consecutiveFailures } }
            cachedAt: null
        },
        
        // 运行时状态
        runtime: {
            isProcessing: false,
            lastError: null,
            sessionStart: Date.now()
        }
    };

    // 状态变更监听器
    const listeners = [];

    // 持久化键名
    const STORAGE_KEYS = {
        CONFIG: 'unified_state_config',
        UI: 'unified_state_ui',
        SESSION: 'unified_state_session',  // 会话状态
        MODELS: 'unified_state_models'
    };

    /**
     * 初始化状态管理器
     */
    function init() {
        loadState();
        console.log('[UnifiedStateManager] 初始化完成');
    }

    /**
     * 获取状态（支持路径访问）
     * @param {string} path - 状态路径，如 'config.apiKey'
     * @returns {*} 状态值
     */
    function getState(path) {
        if (!path) {
            return { ...state }; // 返回深拷贝
        }

        const keys = path.split('.');
        let value = state;

        for (const key of keys) {
            if (value === undefined || value === null) {
                return undefined;
            }
            value = value[key];
        }

        return value;
    }

    /**
     * 设置状态（支持路径访问）
     * @param {string} path - 状态路径
     * @param {*} value - 新值
     * @param {boolean} persist - 是否持久化
     */
    function setState(path, value, persist = true) {
        const keys = path.split('.');
        let obj = state;

        // 导航到目标对象的父对象
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!obj[key]) {
                obj[key] = {};
            }
            obj = obj[key];
        }

        const lastKey = keys[keys.length - 1];
        const oldValue = obj[lastKey];
        obj[lastKey] = value;

        // 通知监听器
        notifyListeners(path, value, oldValue);

        // 持久化
        if (persist) {
            persistState(path);
        }

        console.log(`[UnifiedStateManager] ${path} 已更新`);
    }

    /**
     * 批量更新状态
     * @param {Object} updates - 更新对象 { 'config.apiKey': 'xxx', 'ui.visible': true }
     */
    function batchUpdate(updates) {
        Object.entries(updates).forEach(([path, value]) => {
            setState(path, value, false); // 批量更新时暂不持久化
        });
        
        // 最后统一持久化
        persistAll();
        console.log('[UnifiedStateManager] 批量更新完成');
    }

    /**
     * 注册状态变更监听器
     * @param {Function} callback - 回调函数 (path, newValue, oldValue)
     * @returns {string} 监听器 ID
     */
    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('Listener must be a function');
        }

        const listenerId = 'listener_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        listeners.push({ id: listenerId, callback });

        return listenerId;
    }

    /**
     * 取消订阅
     * @param {string} listenerId - 监听器 ID
     */
    function unsubscribe(listenerId) {
        const index = listeners.findIndex(l => l.id === listenerId);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }

    /**
     * 重置状态
     */
    function reset() {
        state = {
            config: {
                apiKey: '',
                model: 'auto',
                temperature: 0.7,
                maxTokens: 4096,
                providers: [],
                customModels: []
            },
            ui: {
                visible: false,
                position: { x: null, y: null },
                size: { width: 450, height: 500 },
                theme: 'light'
            },
            session: {
                current: null,
                messages: []
            },
            models: {
                availableModels: [],
                modelStatus: {},
                cachedAt: null
            },
            runtime: {
                isProcessing: false,
                lastError: null,
                sessionStart: Date.now()
            }
        };

        clearStorage();
        notifyListeners('*', null, null);
        console.log('[UnifiedStateManager] 状态已重置');
    }

    /**
     * 导出状态（用于调试或备份）
     * @returns {Object} 状态对象
     */
    function exportState() {
        return { ...state };
    }

    /**
     * 导入状态（用于恢复）
     * @param {Object} newState - 新状态
     */
    function importState(newState) {
        state = { ...state, ...newState };
        persistAll();
        notifyListeners('*', state, null);
        console.log('[UnifiedStateManager] 状态已导入');
    }

    // ==================== 私有函数 ====================

    /**
     * 加载持久化的状态
     */
    function loadState() {
        try {
            const config = GM_getValue(STORAGE_KEYS.CONFIG, null);
            if (config) state.config = { ...state.config, ...config };

            const ui = GM_getValue(STORAGE_KEYS.UI, null);
            if (ui) state.ui = { ...state.ui, ...ui };

            const session = GM_getValue(STORAGE_KEYS.SESSION, null);
            if (session) state.session = { ...state.session, ...session };

            const models = GM_getValue(STORAGE_KEYS.MODELS, null);
            if (models) state.models = { ...state.models, ...models };

            console.log('[UnifiedStateManager] 已加载持久化状态');
        } catch (e) {
            console.error('[UnifiedStateManager] 加载状态失败:', e);
        }
    }

    /**
     * 持久化指定路径的状态
     */
    function persistState(path) {
        try {
            if (path.startsWith('config.')) {
                GM_setValue(STORAGE_KEYS.CONFIG, state.config);
            } else if (path.startsWith('ui.')) {
                GM_setValue(STORAGE_KEYS.UI, state.ui);
            } else if (path.startsWith('session.')) {
                GM_setValue(STORAGE_KEYS.SESSION, state.session);
            } else if (path.startsWith('models.')) {
                GM_setValue(STORAGE_KEYS.MODELS, state.models);
            }
        } catch (e) {
            console.error('[UnifiedStateManager] 持久化失败:', e);
        }
    }

    /**
     * 持久化所有状态
     */
    function persistAll() {
        try {
            GM_setValue(STORAGE_KEYS.CONFIG, state.config);
            GM_setValue(STORAGE_KEYS.UI, state.ui);
            GM_setValue(STORAGE_KEYS.SESSION, state.session);
            GM_setValue(STORAGE_KEYS.MODELS, state.models);
        } catch (e) {
            console.error('[UnifiedStateManager] 批量持久化失败:', e);
        }
    }

    /**
     * 清除所有持久化数据
     */
    function clearStorage() {
        Object.values(STORAGE_KEYS).forEach(key => {
            GM_deleteValue(key);
        });
    }

    /**
     * 通知所有监听器
     */
    function notifyListeners(path, newValue, oldValue) {
        listeners.forEach(listener => {
            try {
                listener.callback(path, newValue, oldValue);
            } catch (e) {
                console.error('[UnifiedStateManager] 监听器执行失败:', e);
            }
        });
    }

    return {
        init,
        getState,
        setState,
        batchUpdate,
        subscribe,
        unsubscribe,
        reset,
        exportState,
        importState
    };
})();

// 导出到全局作用域
window.StorageManager = UnifiedStateManager;
