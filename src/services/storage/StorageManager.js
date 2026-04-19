// ==================== 统一状态管理器 ====================
// v4.2.0: 单一状态树架构
// 整合 StateManager、HistoryManager 的功能

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
            theme: 'light',
            settingsVisible: null  // 设置对话框可见性（用于快捷键冲突检测）
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

    // 获取当前域名（用于隔离存储）
    function getDomainKey() {
        try {
            return window.location.hostname || 'unknown';
        } catch (e) {
            return 'unknown';
        }
    }

    // 配置过期时间（毫秒）
    const EXPIRY_CONFIG = {
        CONFIG: 90 * 24 * 60 * 60 * 1000,      // 配置：90天
        UI: 30 * 24 * 60 * 60 * 1000,          // UI状态：30天
        SESSION: 7 * 24 * 60 * 60 * 1000,      // 会话记录：7天
        MODELS: 1 * 24 * 60 * 60 * 1000        // 模型缓存：1天
    };

    // 持久化键名（按域名隔离）
    const STORAGE_KEYS = {
        CONFIG: () => `webagent_config_${getDomainKey()}`,
        UI: () => `webagent_ui_${getDomainKey()}`,
        SESSION: () => `webagent_session_${getDomainKey()}`,
        MODELS: () => `webagent_models_${getDomainKey()}`
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
            const now = Date.now();
            
            // 加载配置（带过期检查）
            const configData = GM_getValue(STORAGE_KEYS.CONFIG(), null);
            if (configData) {
                // 兼容旧格式（没有时间戳）
                const hasTimestamp = configData.timestamp !== undefined;
                const data = hasTimestamp ? configData.data : configData;
                const timestamp = hasTimestamp ? configData.timestamp : now;
                
                const age = now - timestamp;
                if (age < EXPIRY_CONFIG.CONFIG) {
                    state.config = { ...state.config, ...data };
                    console.log('[UnifiedStateManager] 已加载配置 (年龄:', Math.floor(age / 86400000), '天)');
                } else {
                    console.log('[UnifiedStateManager] ⚠️ 配置已过期 (', Math.floor(age / 86400000), '天)，使用默认值');
                }
            }

            // 加载 UI 状态（带过期检查）
            const uiData = GM_getValue(STORAGE_KEYS.UI(), null);
            if (uiData) {
                const hasTimestamp = uiData.timestamp !== undefined;
                const data = hasTimestamp ? uiData.data : uiData;
                const timestamp = hasTimestamp ? uiData.timestamp : now;
                
                const age = now - timestamp;
                if (age < EXPIRY_CONFIG.UI) {
                    state.ui = { ...state.ui, ...data };
                    console.log('[UnifiedStateManager] 已加载 UI 状态 (年龄:', Math.floor(age / 86400000), '天)');
                } else {
                    console.log('[UnifiedStateManager] ⚠️ UI 状态已过期 (', Math.floor(age / 86400000), '天)，使用默认值');
                }
            }

            // 加载会话记录（带过期检查）
            const sessionData = GM_getValue(STORAGE_KEYS.SESSION(), null);
            if (sessionData) {
                const hasTimestamp = sessionData.timestamp !== undefined;
                const data = hasTimestamp ? sessionData.data : sessionData;
                const timestamp = hasTimestamp ? sessionData.timestamp : now;
                
                const age = now - timestamp;
                if (age < EXPIRY_CONFIG.SESSION) {
                    state.session = { ...state.session, ...data };
                    console.log('[UnifiedStateManager] 已加载会话记录 (年龄:', Math.floor(age / 86400000), '天)');
                } else {
                    console.log('[UnifiedStateManager] ⚠️ 会话记录已过期 (', Math.floor(age / 86400000), '天)，清空');
                }
            }

            // 加载模型缓存（带过期检查）
            const modelsData = GM_getValue(STORAGE_KEYS.MODELS(), null);
            if (modelsData) {
                const hasTimestamp = modelsData.timestamp !== undefined;
                const data = hasTimestamp ? modelsData.data : modelsData;
                const timestamp = hasTimestamp ? modelsData.timestamp : now;
                
                const age = now - timestamp;
                if (age < EXPIRY_CONFIG.MODELS) {
                    state.models = { ...state.models, ...data };
                    console.log('[UnifiedStateManager] 已加载模型缓存 (年龄:', Math.floor(age / 86400000), '天)');
                } else {
                    console.log('[UnifiedStateManager] ⚠️ 模型缓存已过期 (', Math.floor(age / 86400000), '天)，清空');
                }
            }

            console.log('[UnifiedStateManager] 初始化完成 (域名:', getDomainKey(), ')');
            
            // 清理过期数据
            cleanupExpiredData();
        } catch (e) {
            console.error('[UnifiedStateManager] 加载状态失败:', e);
        }
    }

    /**
     * 清理过期的存储数据
     */
    function cleanupExpiredData() {
        const now = Date.now();
        let cleanedCount = 0;
        
        // 检查并清理配置
        const configData = GM_getValue(STORAGE_KEYS.CONFIG(), null);
        if (configData && configData.timestamp) {
            const age = now - configData.timestamp;
            if (age >= EXPIRY_CONFIG.CONFIG) {
                GM_deleteValue(STORAGE_KEYS.CONFIG());
                cleanedCount++;
                console.log('[UnifiedStateManager] 🗑️ 已清理过期配置');
            }
        }
        
        // 检查并清理 UI 状态
        const uiData = GM_getValue(STORAGE_KEYS.UI(), null);
        if (uiData && uiData.timestamp) {
            const age = now - uiData.timestamp;
            if (age >= EXPIRY_CONFIG.UI) {
                GM_deleteValue(STORAGE_KEYS.UI());
                cleanedCount++;
                console.log('[UnifiedStateManager] 🗑️ 已清理过期 UI 状态');
            }
        }
        
        // 检查并清理会话记录
        const sessionData = GM_getValue(STORAGE_KEYS.SESSION(), null);
        if (sessionData && sessionData.timestamp) {
            const age = now - sessionData.timestamp;
            if (age >= EXPIRY_CONFIG.SESSION) {
                GM_deleteValue(STORAGE_KEYS.SESSION());
                cleanedCount++;
                console.log('[UnifiedStateManager] 🗑️ 已清理过期会话记录');
            }
        }
        
        // 检查并清理模型缓存
        const modelsData = GM_getValue(STORAGE_KEYS.MODELS(), null);
        if (modelsData && modelsData.timestamp) {
            const age = now - modelsData.timestamp;
            if (age >= EXPIRY_CONFIG.MODELS) {
                GM_deleteValue(STORAGE_KEYS.MODELS());
                cleanedCount++;
                console.log('[UnifiedStateManager] 🗑️ 已清理过期模型缓存');
            }
        }
        
        if (cleanedCount > 0) {
            console.log('[UnifiedStateManager] ✅ 共清理', cleanedCount, '项过期数据');
        }
    }

    /**
     * 持久化指定路径的状态
     */
    function persistState(path) {
        try {
            const now = Date.now();
            
            if (path.startsWith('config.')) {
                GM_setValue(STORAGE_KEYS.CONFIG(), { data: state.config, timestamp: now });
            } else if (path.startsWith('ui.')) {
                GM_setValue(STORAGE_KEYS.UI(), { data: state.ui, timestamp: now });
            } else if (path.startsWith('session.')) {
                GM_setValue(STORAGE_KEYS.SESSION(), { data: state.session, timestamp: now });
            } else if (path.startsWith('models.')) {
                GM_setValue(STORAGE_KEYS.MODELS(), { data: state.models, timestamp: now });
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
            const now = Date.now();
            GM_setValue(STORAGE_KEYS.CONFIG(), { data: state.config, timestamp: now });
            GM_setValue(STORAGE_KEYS.UI(), { data: state.ui, timestamp: now });
            GM_setValue(STORAGE_KEYS.SESSION(), { data: state.session, timestamp: now });
            GM_setValue(STORAGE_KEYS.MODELS(), { data: state.models, timestamp: now });
        } catch (e) {
            console.error('[UnifiedStateManager] 批量持久化失败:', e);
        }
    }

    /**
     * 清除所有持久化数据
     */
    function clearStorage() {
        Object.values(STORAGE_KEYS).forEach(keyFn => {
            GM_deleteValue(keyFn());
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
