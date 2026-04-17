// ==UserScript==
// @name         Free Web AI Agent
// @namespace    https://github.com/chensiyi1994
// @version      3.8.6
// @description  基于ai模型的Web AI 助手,支持 JS 执行
// @author       chensiyi1994
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

// 构建信息
// 版本: 3.8.6
// 日期: 2026-04-17
// 模块数: 12


// =====================================================
// 模块: core/utils.js
// =====================================================

// ==================== 工具函数模块 ====================
// 提供通用的工具函数，避免代码重复

const Utils = (function() {
    'use strict';
    
    /**
     * 获取当前域名
     * @returns {string} 域名
     */
    function getCurrentDomain() {
        try {
            return window.location.hostname || 'unknown';
        } catch (e) {
            return 'unknown';
        }
    }
    
    /**
     * 获取基于域名的存储 key
     * @param {string} baseKey - 基础键名
     * @returns {string} 带域名的键名
     */
    function getDomainKey(baseKey) {
        const domain = getCurrentDomain();
        return `${baseKey}_${domain}`;
    }
    
    // 导出公共接口
    return {
        getCurrentDomain,
        getDomainKey
    };
})();


// =====================================================
// 模块: core/EventManager.js
// =====================================================

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

// =====================================================
// 模块: core/ConfigManager.js
// =====================================================

// ==================== 配置管理器 (重构版) ====================
// 提供统一的配置管理接口，降低耦合度

const ConfigManager = (function() {
    'use strict';
    
    // 配置键名枚举
    const ConfigKeys = {
        API_KEY: 'api_key',
        MODEL: 'model',
        ENDPOINT: 'endpoint',
        TEMPERATURE: 'temperature',
        TOP_P: 'top_p',
        MAX_TOKENS: 'max_tokens',
        JS_ENABLED: 'js_execution_enabled',
        USER_ID: 'user_id'
    };
    
    // 默认配置
    const Defaults = {
        apiKey: '',
        model: 'google/gemma-3-12b-it:free',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        temperature: 0.7,
        topP: 0.95,
        maxTokens: 2048,
        jsExecutionEnabled: true,
        userId: 'user_' + Date.now()
    };
    
    // 配置缓存
    let configCache = {};
    let isInitialized = false;
    
    // 依赖引用（通过依赖注入）
    let eventManager = null;
    
    /**
     * 初始化配置管理器
     * @param {Object} dependencies - 依赖对象
     * @returns {Promise<Object>} 当前配置
     */
    async function init(dependencies = {}) {
        if (isInitialized) {
            console.log('⚠️ 配置管理器已初始化');
            return configCache;
        }
        
        // 注入依赖
        if (dependencies.eventManager) {
            eventManager = dependencies.eventManager;
        }
        
        console.log('🔄 初始化配置管理器...');
        
        // 执行数据迁移
        await migrateOldConfig();
        
        // 加载配置
        await loadAllConfig();
        
        isInitialized = true;
        console.log('✅ 配置管理器初始化完成');
        
        // 触发初始化完成事件
        if (eventManager) {
            eventManager.emit(eventManager.EventTypes.CONFIG_UPDATED, configCache);
        }
        
        return configCache;
    }
    
    /**
     * 迁移旧配置（兼容性）
     */
    async function migrateOldConfig() {
        const oldMappings = {
            'openrouter_model': ConfigKeys.MODEL,
            'openrouter_api_key': ConfigKeys.API_KEY,
            'openrouter_endpoint': ConfigKeys.ENDPOINT
        };
        
        for (const [oldKey, newKey] of Object.entries(oldMappings)) {
            const oldValue = GM_getValue(oldKey, undefined);
            const newValue = GM_getValue(newKey, undefined);
            
            if (oldValue !== undefined && newValue === undefined) {
                GM_setValue(newKey, oldValue);
                console.log(`✅ 已迁移配置: ${oldKey} -> ${newKey}`);
            }
        }
    }
    
    /**
     * 加载所有配置
     */
    async function loadAllConfig() {
        configCache = {
            apiKey: GM_getValue(ConfigKeys.API_KEY, Defaults.apiKey),
            model: GM_getValue(ConfigKeys.MODEL, Defaults.model),
            endpoint: GM_getValue(ConfigKeys.ENDPOINT, Defaults.endpoint),
            temperature: GM_getValue(ConfigKeys.TEMPERATURE, Defaults.temperature),
            topP: GM_getValue(ConfigKeys.TOP_P, Defaults.topP),
            maxTokens: GM_getValue(ConfigKeys.MAX_TOKENS, Defaults.maxTokens),
            jsExecutionEnabled: GM_getValue(ConfigKeys.JS_ENABLED, Defaults.jsExecutionEnabled),
            userId: GM_getValue(ConfigKeys.USER_ID, Defaults.userId)
        };

        console.log('✅ 配置已加载');
    }
    
    /**
     * 获取所有配置
     * @returns {Object} 配置对象
     */
    function getAll() {
        return { ...configCache };
    }
    
    /**
     * 获取单个配置项
     * @param {string} key - 配置键
     * @returns {any} 配置值
     */
    function get(key) {
        if (key in configCache) {
            return configCache[key];
        }
        console.warn(`⚠️ 未知配置键: ${key}`);
        return undefined;
    }
    
    /**
     * 设置配置项
     * @param {string} key - 配置键
     * @param {any} value - 配置值
     */
    function set(key, value) {
        if (!(key in configCache)) {
            console.warn(`⚠️ 尝试设置未知配置键: ${key}`);
            return;
        }
        
        configCache[key] = value;
        
        // 保存到 GM 存储
        const keyMappings = {
            apiKey: ConfigKeys.API_KEY,
            model: ConfigKeys.MODEL,
            endpoint: ConfigKeys.ENDPOINT,
            temperature: ConfigKeys.TEMPERATURE,
            topP: ConfigKeys.TOP_P,
            maxTokens: ConfigKeys.MAX_TOKENS,
            jsExecutionEnabled: ConfigKeys.JS_ENABLED,
            userId: ConfigKeys.USER_ID
        };
        
        const gmKey = keyMappings[key];
        if (gmKey) {
            GM_setValue(gmKey, value);
        }
        
        // 触发配置更新事件
        if (eventManager) {
            eventManager.emit(eventManager.EventTypes.CONFIG_UPDATED, { [key]: value });
        }
    }
    
    /**
     * 批量更新配置
     * @param {Object} updates - 配置更新对象
     */
    function update(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            set(key, value);
        });
    }
    
    /**
     * 重置配置到默认值
     * @param {string|null} key - 指定键，为 null 则重置所有
     */
    function reset(key = null) {
        if (key === null) {
            // 重置所有配置
            Object.keys(configCache).forEach(k => {
                set(k, Defaults[k] || '');
            });
        } else if (key in Defaults) {
            // 重置指定配置
            set(key, Defaults[key]);
        }
    }
    
    /**
     * 验证配置是否完整
     * @returns {boolean} 是否配置完整
     */
    function isConfigured() {
        return !!configCache.apiKey && !!configCache.model;
    }
    
    /**
     * 导出配置
     * @returns {Object} 可导出的配置对象
     */
    function exportConfig() {
        return {
            ...configCache,
            // 排除敏感信息
            apiKey: configCache.apiKey ? '[HIDDEN]' : ''
        };
    }
    
    /**
     * 导入配置
     * @param {Object} imported - 导入的配置对象
     */
    function importConfig(imported) {
        const safeUpdates = {};
        
        // 只导入安全的字段
        const safeFields = ['model', 'endpoint', 'temperature', 'topP', 'maxTokens', 'jsExecutionEnabled'];
        
        safeFields.forEach(field => {
            if (field in imported) {
                safeUpdates[field] = imported[field];
            }
        });
        
        update(safeUpdates);
        console.log('✅ 配置导入完成');
    }
    
    // 导出公共接口
    return {
        init,
        getAll,
        get,
        set,
        update,
        reset,
        isConfigured,
        exportConfig,
        importConfig,
        
        // 常量导出（只读）
        ConfigKeys,
        Defaults
    };
})();


// =====================================================
// 模块: core/HistoryManager.js
// =====================================================

// ==================== 历史管理器 ====================
// 负责对话历史的加载、保存和管理

const HistoryManager = (function() {
    'use strict';
    
    // 配置键
    const HISTORY_KEY = 'conversation_history';
    const MAX_HISTORY_LENGTH = 50; // 最多保留 50 条消息
    
    // 缓存
    let historyCache = [];
    let isInitialized = false;
    
    /**
     * 初始化历史管理器
     */
    function init() {
        if (isInitialized) {
            console.log('⚠️ 历史管理器已初始化');
            return historyCache;
        }
        
        console.log('🔄 初始化历史管理器...');
        loadConversationHistory();
        
        isInitialized = true;
        console.log('✅ 历史管理器初始化完成');
        
        return historyCache;
    }
    
    /**
     * 加载对话历史
     * @returns {Array} 对话历史
     */
    function loadConversationHistory() {
        const domainKey = Utils.getDomainKey(HISTORY_KEY);
        historyCache = GM_getValue(domainKey, []);
        return historyCache;
    }
    
    /**
     * 获取对话历史
     * @returns {Array} 对话历史
     */
    function getHistory() {
        return [...historyCache];
    }
    
    /**
     * 保存对话历史
     * @param {Array} history - 对话历史
     */
    function saveConversationHistory(history) {
        // 创建副本，避免外部修改影响缓存
        const historyCopy = Array.isArray(history) ? [...history] : [];
        
        // 只保留最近 50 条消息
        if (historyCopy.length > MAX_HISTORY_LENGTH) {
            historyCopy.splice(0, historyCopy.length - MAX_HISTORY_LENGTH);
        }
        
        historyCache = historyCopy;
        
        // 保存到浏览器缓存
        const domainKey = Utils.getDomainKey(HISTORY_KEY);
        GM_setValue(domainKey, historyCopy);
    }
    
    /**
     * 添加消息到历史
     * @param {Object} message - 消息对象 {role, content}
     */
    function addMessage(message) {
        historyCache.push(message);
        saveConversationHistory(historyCache);
    }
    
    /**
     * 清空历史
     */
    function clearHistory() {
        historyCache = [];
        const domainKey = Utils.getDomainKey(HISTORY_KEY);
        GM_setValue(domainKey, []);
    }
    
    // 导出公共接口
    return {
        init,
        getHistory,
        loadConversationHistory,
        saveConversationHistory,
        addMessage,
        clearHistory
    };
})();


// =====================================================
// 模块: core/StateManager.js
// =====================================================

// ==================== 状态管理器 ====================
// 负责 UI 状态管理（窗口可见性等）

const StateManager = (function() {
    'use strict';
    
    // 配置键
    const CHAT_VISIBILITY_KEY = 'chat_visibility';
    
    // 缓存
    let stateCache = null;
    let isInitialized = false;
    
    /**
     * 初始化状态管理器
     */
    function init() {
        if (isInitialized) {
            return stateCache;
        }
        
        // 先加载，再设置
        const visibility = loadChatVisibility();
        stateCache = {
            chatVisibility: visibility
        };
        
        isInitialized = true;
        
        return stateCache;
    }
    

    /**
     * 加载聊天窗口可见性
     */
    function loadChatVisibility() {
        const domainKey = Utils.getDomainKey(CHAT_VISIBILITY_KEY);
        return GM_getValue(domainKey, false);
    }
    
    /**
     * 获取聊天窗口可见性
     * @returns {boolean} 是否可见
     */
    function getChatVisibility() {
        if (!isInitialized) {
            return false;
        }
        return stateCache.chatVisibility;
    }
    
    /**
     * 保存聊天窗口可见性
     * @param {boolean} isVisible - 是否可见
     */
    function saveChatVisibility(isVisible) {
        if (!isInitialized) {
            stateCache = { chatVisibility: isVisible };
            isInitialized = true;
        } else {
            stateCache.chatVisibility = isVisible;
        }
        
        const domainKey = Utils.getDomainKey(CHAT_VISIBILITY_KEY);
        GM_setValue(domainKey, isVisible);
    }
    
    /**
     * 切换聊天窗口可见性
     */
    function toggleChatVisibility() {
        const newState = !stateCache.chatVisibility;
        saveChatVisibility(newState);
        return newState;
    }
    
    // 导出公共接口
    return {
        init,
        getChatVisibility,
        saveChatVisibility,
        toggleChatVisibility,
        loadChatVisibility
    };
})();


// =====================================================
// 模块: ui-styles.js
// =====================================================

// ==================== UI 样式模块 ====================
// 集中管理所有 UI 相关的 CSS 样式

const UIStyles = (function() {
    'use strict';

    /**
     * 获取主界面样式
     */
    function getMainStyles() {
        return `
            #ai-agent {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 450px;
                height: 500px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                z-index: 2147483647 !important;
                display: flex;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 1px solid #e0e0e0;
                transition: all 0.3s ease;
                pointer-events: auto !important;
            }
            
            /* 主内容区域 */
            #agent-main {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
                overflow: hidden;
                pointer-events: auto !important;
            }
            #agent-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                min-height: 44px;
                flex-shrink: 0;
                pointer-events: auto !important;
                position: relative;
                z-index: 2;
            }
            #agent-title { 
                font-weight: 600; 
                font-size: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
                pointer-events: auto !important;
            }
            #agent-controls {
                display: flex;
                gap: 6px;
                pointer-events: auto !important;
            }
            .header-btn {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                transition: background 0.2s;
                pointer-events: auto !important;
                position: relative;
                z-index: 3;
            }
            .header-btn:hover { background: rgba(255,255,255,0.3); }
            #agent-chat {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                background: #f5f7fa;
                scroll-behavior: smooth;
                display: flex;
                flex-direction: column;
                gap: 10px;
                min-height: 0;
            }
            .message { 
                margin: 10px 0;
                animation: fadeIn 0.3s ease;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .user-message {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 10px 14px;
                border-radius: 16px 16px 6px 16px;
                margin-left: auto;
                max-width: 85%;
                word-wrap: break-word;
                align-self: flex-end;
            }
            .assistant-message {
                background: white;
                border: 1px solid #e0e0e0;
                padding: 10px 14px;
                border-radius: 16px 16px 16px 6px;
                max-width: 85%;
                word-wrap: break-word;
                align-self: flex-start;
            }
            .message-content { 
                line-height: 1.5; 
                font-size: 14px;
                white-space: pre-wrap;
            }
            .code-block {
                background: #282c34;
                color: #abb2bf;
                padding: 12px;
                border-radius: 8px;
                margin: 8px 0;
                font-family: 'SF Mono', 'Fira Code', monospace;
                font-size: 12px;
                overflow-x: auto;
                position: relative;
            }
            .code-language {
                position: absolute;
                top: 4px;
                right: 8px;
                font-size: 10px;
                color: #5c6370;
                text-transform: uppercase;
            }
            .code-actions { 
                margin-top: 8px;
                display: flex;
                gap: 6px;
            }
            .code-btn {
                background: #667eea;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .code-btn:hover { 
                background: #5568d3;
                transform: translateY(-1px);
            }
            .code-btn.execute { background: #10b981; }
            .code-btn.execute:hover { background: #059669; }
            #agent-input-area { 
                border-top: 1px solid #e0e0e0; 
                padding: 12px;
                background: white;
                border-radius: 0 0 12px 12px;
                flex-shrink: 0;
            }
            #agent-input {
                width: 100%;
                min-height: 60px;
                max-height: 150px;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 8px;
                resize: vertical;
                font-size: 14px;
                font-family: inherit;
                transition: border-color 0.2s;
            }
            #agent-input:focus { 
                outline: none; 
                border-color: #667eea;
            }
            #agent-controls-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 8px;
                gap: 8px;
            }
            .control-btn {
                background: #f5f7fa;
                border: 1px solid #e0e0e0;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .control-btn:hover {
                background: #e5e7eb;
            }
            #agent-send {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 8px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            #agent-send:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            #agent-send:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            
            /* 设置对话框 */
            #agent-settings-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                z-index: 2147483647;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                padding: 24px;
            }
            .settings-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 2147483646;
            }
            .settings-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 12px;
                border-bottom: 2px solid #e0e0e0;
            }
            .settings-title {
                font-size: 20px;
                font-weight: 600;
                color: #1f2937;
            }
            .settings-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #6b7280;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                transition: all 0.2s;
            }
            .settings-close:hover {
                background: #f3f4f6;
                color: #1f2937;
            }
            .settings-section {
                margin-bottom: 20px;
            }
            .settings-section-title {
                font-size: 14px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 12px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            .settings-field {
                margin-bottom: 16px;
            }
            .settings-label {
                display: block;
                font-size: 13px;
                font-weight: 500;
                color: #4b5563;
                margin-bottom: 6px;
            }
            .settings-input {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                transition: all 0.2s;
            }
            .settings-input:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            .settings-select {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                background: white;
                cursor: pointer;
            }
            .settings-slider {
                width: 100%;
                margin: 8px 0;
            }
            .settings-value {
                display: inline-block;
                margin-left: 8px;
                font-weight: 500;
                color: #667eea;
            }
            .settings-checkbox {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
            }
            .settings-checkbox input[type="checkbox"] {
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            .settings-actions {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-top: 24px;
                padding-top: 16px;
                border-top: 1px solid #e0e0e0;
            }
            .settings-btn {
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
            }
            .settings-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            .settings-btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            .settings-btn-secondary {
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #d1d5db;
            }
            .settings-btn-secondary:hover {
                background: #e5e7eb;
            }
            
            /* 代码执行结果 */
            .execution-result {
                margin: 8px 0;
                padding: 12px;
                border-radius: 8px;
                font-family: 'SF Mono', monospace;
                font-size: 12px;
                line-height: 1.5;
            }
            .execution-success { 
                background: #d1fae5; 
                border-left: 4px solid #10b981;
                color: #065f46;
            }
            .execution-error { 
                background: #fee2e2; 
                border-left: 4px solid #ef4444;
                color: #991b1b;
            }
            
            /* 打字指示器 */
            .typing { 
                display: flex; 
                gap: 4px; 
                padding: 12px;
                align-items: center;
            }
            .typing-dot {
                width: 8px;
                height: 8px;
                background: #667eea;
                border-radius: 50%;
                animation: typing 1.4s infinite ease-in-out;
            }
            .typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .typing-dot:nth-child(2) { animation-delay: -0.16s; }
            @keyframes typing {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
            }
            
            /* 状态徽章 */
            .status-badge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
                margin-left: 8px;
            }
            .status-active {
                background: #d1fae5;
                color: #065f46;
            }
            .status-inactive {
                background: #fee2e2;
                color: #991b1b;
            }
        `;
    }

    // 导出公共接口
    return {
        getMainStyles
    };
})();


// =====================================================
// 模块: ui-templates.js
// =====================================================

// ==================== UI 模板模块 ====================
// 集中管理所有 HTML 模板

const UITemplates = (function() {
    'use strict';

    /**
     * 构建主界面 HTML
     * @param {Object} config - 配置对象
     * @returns {string} HTML 字符串
     */
    function buildMainHTML(config) {
        const statusBadge = config.apiKey 
            ? '<span class="status-badge status-active">已配置</span>' 
            : '<span class="status-badge status-inactive">未配置</span>';
        
        return `
            <div id="agent-main">
                <div id="agent-header">
                    <div id="agent-title">
                        <span>✨</span>
                        <span>AI 助手</span>
                        ${statusBadge}
                    </div>
                    <div id="agent-controls">
                        <button class="header-btn" id="agent-close" title="关闭">×</button>
                    </div>
                </div>
                <div id="agent-chat"></div>
                <div id="agent-input-area">
                    <textarea id="agent-input" placeholder="输入消息...&#10;使用 /js 执行代码,例如: /js alert('Hello')"></textarea>
                    <div id="agent-controls-bar">
                        <button class="control-btn" id="agent-settings">⚙️ 设置</button>
                        <button class="control-btn" id="agent-clear">🗑️ 清空</button>
                        <button id="agent-send">发送 ➤</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 构建打字指示器 HTML
     * @returns {string} HTML 字符串
     */
    function buildTypingIndicatorHTML() {
        return `
            <div class="typing" id="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
    }

    /**
     * 构建用户消息 HTML
     * @param {string} content - 消息内容
     * @returns {string} HTML 字符串
     */
    function buildUserMessageHTML(content) {
        return `
            <div class="user-message">
                <div class="message-content">${escapeHtml(content)}</div>
            </div>
        `;
    }

    /**
     * 构建助手消息 HTML
     * @param {string} content - 格式化后的内容
     * @returns {string} HTML 字符串
     */
    function buildAssistantMessageHTML(content) {
        return `
            <div class="assistant-message">
                <div class="message-content">${content}</div>
            </div>
        `;
    }

    /**
     * 构建代码块 HTML
     * @param {string} code - 代码内容
     * @param {string} language - 语言标识
     * @param {string} blockId - 代码块 ID
     * @returns {string} HTML 字符串
     */
    function buildCodeBlockHTML(code, language, blockId) {
        return `
            <div class="code-block" data-code-id="${blockId}">
                <div class="code-language">${language || 'text'}</div>
                <pre><code>${escapeHtml(code)}</code></pre>
                <div class="code-actions">
                    <button class="code-btn copy" data-action="copy-code">📋 复制</button>
                    <button class="code-btn execute" data-action="execute-code">▶️ 执行</button>
                </div>
            </div>
        `;
    }

    /**
     * 构建执行结果 HTML
     * @param {boolean} success - 是否成功
     * @param {string} content - 结果内容
     * @returns {string} HTML 字符串
     */
    function buildExecutionResultHTML(success, content) {
        const className = success ? 'execution-success' : 'execution-error';
        const icon = success ? '✅ 执行成功' : '❌ 执行失败';
        
        return `
            <div class="execution-result ${className}">
                <strong>${icon}</strong>
                <br>
                <pre style="margin-top: 8px; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(content)}</pre>
            </div>
        `;
    }

    /**
     * 构建高危代码警告 HTML
     * @param {string} code - 代码内容
     * @param {number} index - 代码块索引
     * @returns {string} HTML 字符串
     */
    function buildHighRiskWarningHTML(code, index) {
        return `
            <div class="assistant-message">
                <div class="execution-result execution-error">
                    <strong>⚠️ 检测到高危代码 (第 ${index} 个代码块)</strong>
                    <br><br>
                    <div style="background: #fee2e2; padding: 12px; border-radius: 6px; margin: 8px 0;">
                        <strong>该代码可能包含危险操作，请仔细检查：</strong>
                        <pre style="margin-top: 8px; background: #fef2f2; padding: 8px; border-radius: 4px;">${escapeHtml(code)}</pre>
                    </div>
                    <br>
                    <div style="display: flex; gap: 8px;">
                        <button class="code-btn execute" onclick="window.confirmAndExecute('${index}')">
                            ⚠️ 我已确认安全，执行代码
                        </button>
                        <button class="code-btn" onclick="window.cancelExecution('${index}')" style="background: #6b7280;">
                            ❌ 取消执行
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 构建欢迎消息 HTML
     * @returns {string} HTML 字符串
     */
    function buildWelcomeMessageHTML() {
        const welcomeMessage = `
<strong>👋 欢迎使用 AI Agent!</strong>

我可以帮你:
• 💬 智能对话 - 回答各种问题
• 🔧 执行 JavaScript 代码
• 🎨 操作当前页面
• 📊 提取页面信息

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行代码
• <code>/clear</code> - 清空历史
• <code>/help</code> - 显示帮助

试试对我说: "帮我修改页面背景色"
        `;
        
        return `
            <div class="assistant-message">
                <div class="message-content">${welcomeMessage}</div>
            </div>
        `;
    }

    /**
     * 构建设置对话框 HTML
     * @param {Object} config - 当前配置
     * @param {Array} models - 可用模型列表
     * @returns {string} HTML 字符串
     */
    function buildSettingsDialogHTML(config, models) {
        const modelOptions = models.map(model => 
            `<option value="${model.id}" ${config.model === model.id ? 'selected' : ''}>${model.name}</option>`
        ).join('');

        return `
            <div class="settings-overlay" id="settings-overlay"></div>
            <div id="agent-settings-dialog">
                <div class="settings-header">
                    <h2 class="settings-title">⚙️ 设置</h2>
                    <button class="settings-close" id="settings-close">×</button>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">API 配置</div>
                    
                    <div class="settings-field">
                        <label class="settings-label">API Key</label>
                        <input type="password" class="settings-input" id="setting-api-key" 
                               value="${escapeHtml(config.apiKey || '')}" 
                               placeholder="输入你的 API Key">
                    </div>
                    
                    <div class="settings-field">
                        <label class="settings-label">Endpoint</label>
                        <input type="text" class="settings-input" id="setting-endpoint" 
                               value="${escapeHtml(config.endpoint || '')}" 
                               placeholder="API 端点地址">
                    </div>
                    
                    <div class="settings-field">
                        <label class="settings-label">模型</label>
                        <select class="settings-select" id="setting-model">
                            ${modelOptions}
                        </select>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">生成参数</div>
                    
                    <div class="settings-field">
                        <label class="settings-label">
                            Temperature: <span class="settings-value" id="temp-value">${config.temperature}</span>
                        </label>
                        <input type="range" class="settings-slider" id="setting-temperature" 
                               min="0" max="2" step="0.1" value="${config.temperature}">
                    </div>
                    
                    <div class="settings-field">
                        <label class="settings-label">
                            Top P: <span class="settings-value" id="topp-value">${config.topP}</span>
                        </label>
                        <input type="range" class="settings-slider" id="setting-top-p" 
                               min="0" max="1" step="0.05" value="${config.topP}">
                    </div>
                    
                    <div class="settings-field">
                        <label class="settings-label">Max Tokens</label>
                        <input type="number" class="settings-input" id="setting-max-tokens" 
                               value="${config.maxTokens}" min="1" max="8192">
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">高级选项</div>
                    
                    <div class="settings-field">
                        <label class="settings-checkbox">
                            <input type="checkbox" id="setting-js-enabled" 
                                   ${config.jsExecutionEnabled ? 'checked' : ''}>
                            <span>允许自动执行 JavaScript 代码</span>
                        </label>
                    </div>
                </div>
                
                <div class="settings-actions">
                    <button class="settings-btn settings-btn-secondary" id="settings-cancel">取消</button>
                    <button class="settings-btn settings-btn-primary" id="settings-save">保存</button>
                </div>
            </div>
        `;
    }

    /**
     * HTML 转义工具函数
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') return String(text);
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 导出公共接口
    return {
        buildMainHTML,
        buildTypingIndicatorHTML,
        buildUserMessageHTML,
        buildAssistantMessageHTML,
        buildCodeBlockHTML,
        buildExecutionResultHTML,
        buildHighRiskWarningHTML,
        buildWelcomeMessageHTML,
        buildSettingsDialogHTML,
        escapeHtml
    };
})();


// =====================================================
// 模块: ui.js
// =====================================================

// ==================== UI 界面模块 (重构版) ====================
// 职责：UI 交互逻辑、事件处理、DOM 操作
// 样式已分离到 ui-styles.js
// 模板已分离到 ui-templates.js

const UIManager = (function() {
    'use strict';
    
    // ========== 状态管理 ==========
    let assistant = null;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let rafId = null; // requestAnimationFrame ID
    let currentMousePos = { x: 0, y: 0 }; // 当前鼠标位置
    let escapeHandler = null; // ESC 键处理器

    // ========== CSS 样式管理 ==========

    /**
     * 添加所有样式（从 UIStyles 模块获取）
     */
    function addStyles() {
        GM_addStyle(UIStyles.getMainStyles());
        GM_addStyle(getSettingsStyles()); // 设置对话框样式保留在此
    }

    /**
     * 获取主界面样式
     */
    function getMainStyles() {
        return `
            #ai-agent {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 450px;
                height: 500px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                z-index: 2147483647 !important;
                display: flex;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 1px solid #e0e0e0;
                transition: all 0.3s ease;
                pointer-events: auto !important;
            }
            
            /* 主内容区域 */
            #agent-main {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
                overflow: hidden;
                pointer-events: auto !important;
            }
            #agent-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                min-height: 44px;
                flex-shrink: 0;
                pointer-events: auto !important;
                position: relative;
                z-index: 2;
            }
            #agent-title { 
                font-weight: 600; 
                font-size: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
                pointer-events: auto !important;
            }
            #agent-controls {
                display: flex;
                gap: 6px;
                pointer-events: auto !important;
            }
            .header-btn {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                transition: background 0.2s;
                pointer-events: auto !important;
                position: relative;
                z-index: 3;
            }
            .header-btn:hover { background: rgba(255,255,255,0.3); }
            #agent-chat {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                background: #f5f7fa;
                scroll-behavior: smooth;
                display: flex;
                flex-direction: column;
                gap: 10px;
                min-height: 0;
            }
            .message { 
                margin: 10px 0;
                animation: fadeIn 0.3s ease;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .user-message {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 10px 14px;
                border-radius: 16px 16px 6px 16px;
                margin-left: auto;
                max-width: 85%;
                word-wrap: break-word;
                align-self: flex-end;
            }
            .assistant-message {
                background: white;
                border: 1px solid #e0e0e0;
                padding: 10px 14px;
                border-radius: 16px 16px 16px 6px;
                max-width: 85%;
                word-wrap: break-word;
                align-self: flex-start;
            }
            .message-content { 
                line-height: 1.5; 
                font-size: 14px;
                white-space: pre-wrap;
            }
            .code-block {
                background: #282c34;
                color: #abb2bf;
                padding: 12px;
                border-radius: 8px;
                margin: 8px 0;
                font-family: 'SF Mono', 'Fira Code', monospace;
                font-size: 12px;
                overflow-x: auto;
                position: relative;
            }
            .code-language {
                position: absolute;
                top: 4px;
                right: 8px;
                font-size: 10px;
                color: #5c6370;
                text-transform: uppercase;
            }
            .code-actions { 
                margin-top: 8px;
                display: flex;
                gap: 6px;
            }
            .code-btn {
                background: #667eea;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .code-btn:hover { 
                background: #5568d3;
                transform: translateY(-1px);
            }
            .code-btn.execute { background: #10b981; }
            .code-btn.execute:hover { background: #059669; }
            #agent-input-area { 
                border-top: 1px solid #e0e0e0; 
                padding: 12px;
                background: white;
                border-radius: 0 0 12px 12px;
                flex-shrink: 0;
            }
            #agent-input {
                width: 100%;
                min-height: 60px;
                max-height: 150px;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 8px;
                resize: vertical;
                font-size: 14px;
                font-family: inherit;
                transition: border-color 0.2s;
            }
            #agent-input:focus { 
                outline: none; 
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            #agent-controls-bar { 
                display: flex; 
                gap: 8px; 
                margin-top: 10px;
                align-items: center;
                z-index: 999;
                position: relative;
            }
            #agent-send {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
                z-index: 999;
            }
            #agent-send:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }
            #agent-send:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            .control-btn {
                background: #f5f7fa;
                border: 1px solid #ddd;
                padding: 8px 12px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
                z-index: 999;
            }
            .control-btn:hover {
                background: #e8ecf1;
                border-color: #667eea;
            }
            .execution-result {
                margin-top: 10px;
                padding: 10px;
                border-radius: 8px;
                font-family: 'SF Mono', monospace;
                font-size: 12px;
                line-height: 1.5;
            }
            .execution-success { 
                background: #d1fae5; 
                border-left: 4px solid #10b981;
                color: #065f46;
            }
            .execution-error { 
                background: #fee2e2; 
                border-left: 4px solid #ef4444;
                color: #991b1b;
            }
            .typing { 
                display: flex; 
                gap: 4px; 
                padding: 12px;
                align-items: center;
            }
            .typing-dot {
                width: 8px;
                height: 8px;
                background: #667eea;
                border-radius: 50%;
                animation: typing 1.4s infinite ease-in-out;
            }
            .typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .typing-dot:nth-child(2) { animation-delay: -0.16s; }
            @keyframes typing {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
            }
            .status-badge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
                margin-left: 8px;
            }
            .status-active {
                background: #d1fae5;
                color: #065f46;
            }
            .status-inactive {
                background: #fee2e2;
                color: #991b1b;
            }
        `;
    }

    // ========== DOM 创建 ==========

    /**
     * 创建主界面
     */
    function createAssistant(config) {
        assistant = document.createElement('div');
        assistant.id = 'ai-agent';
        assistant.innerHTML = buildMainHTML(config);
        document.body.appendChild(assistant);
        
        setupEventListeners();
        setupChatEventDelegation();
        
        return assistant;
    }

    /**
     * 构建主界面 HTML（从 UITemplates 模块获取）
     */
    function buildMainHTML(config) {
        return UITemplates.buildMainHTML(config);
    }

    // ========== 事件处理 ==========

    /**
     * 设置事件监听
     */
    function setupEventListeners() {
        setupInputEvents();
        setupButtonEvents();
        setupDragEvents();
    }

    /**
     * 设置输入框事件
     */
    function setupInputEvents() {
        const sendBtn = document.getElementById('agent-send');
        const input = document.getElementById('agent-input');
        
        if (!sendBtn) {
            console.error('❌ 发送按钮未找到！DOM 元素可能尚未创建');
            return;
        }
        
        console.log('✅ 发送按钮已找到，绑定点击事件');
        
        // 发送按钮点击
        sendBtn.addEventListener('click', () => {
            console.log('📨 发送按钮被点击');
            
            // 检查是否是停止按钮
            if (sendBtn.textContent.includes('停止')) {
                console.log('⏹ 用户请求停止');
                EventManager.emit('agent:stop:request');
                return;
            }
            
            const message = input.value.trim();
            if (!message) return; // 空消息不发送
            
            console.log('📨 消息内容:', message);
            EventManager.emit(EventManager.EventTypes.CHAT_MESSAGE_SENT, message);
            // 发送成功后清空输入框
            input.value = '';
        });
        
        // 回车发送
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                EventManager.emit(EventManager.EventTypes.CHAT_MESSAGE_SENT, input.value.trim());
                // 发送成功后清空输入框
                input.value = '';
            }
        });
    }

    /**
     * 设置按钮事件
     */
    function setupButtonEvents() {
        const closeBtn = document.getElementById('agent-close');
        const settingsBtn = document.getElementById('agent-settings');
        const clearBtn = document.getElementById('agent-clear');

        // 关闭按钮
        closeBtn.addEventListener('click', () => {
            hide();
        });

        // 设置按钮
        settingsBtn.addEventListener('click', () => {
            EventManager.emit(EventManager.EventTypes.SETTINGS_OPEN);
        });

        // 清空按钮
        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有对话记录吗?')) {
                EventManager.emit(EventManager.EventTypes.CHAT_CLEAR);
            }
        });
    }

    /**
     * 设置拖拽事件（优化版：使用 requestAnimationFrame）
     */
    function setupDragEvents() {
        const header = document.getElementById('agent-header');
        
        // mousedown: 开始拖动
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.header-btn')) return;
            isDragging = true;
            dragOffset.x = e.clientX - assistant.offsetLeft;
            dragOffset.y = e.clientY - assistant.offsetTop;
            assistant.style.cursor = 'grabbing';
            
            // 阻止默认行为，防止文本选择
            e.preventDefault();
        });

        // mousemove: 更新鼠标位置，使用 rAF 优化
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            // 更新当前鼠标位置
            currentMousePos.x = e.clientX;
            currentMousePos.y = e.clientY;
            
            // 如果已经有 pending 的 rAF，跳过
            if (rafId !== null) return;
            
            // 请求下一帧更新位置
            rafId = requestAnimationFrame(() => {
                updateAssistantPosition();
                rafId = null;
            });
        });

        // mouseup: 结束拖动
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            assistant.style.cursor = '';
            
            // 取消 pending 的 rAF
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        });
    }
    
    /**
     * 更新助手窗口位置（在 rAF 回调中调用）
     */
    function updateAssistantPosition() {
        if (!isDragging || !assistant) return;
        
        const newLeft = currentMousePos.x - dragOffset.x;
        const newTop = currentMousePos.y - dragOffset.y;
        
        // 批量更新样式，减少重排
        assistant.style.left = newLeft + 'px';
        assistant.style.top = newTop + 'px';
        assistant.style.right = 'auto';
        assistant.style.bottom = 'auto';
    }

    /**
     * 设置聊天区域事件委托
     */
    function setupChatEventDelegation() {
        const chat = document.getElementById('agent-chat');
        if (!chat) return;

        // 使用事件委托处理代码块按钮点击
        chat.addEventListener('click', (e) => {
            const target = e.target.closest('button[data-action]');
            if (!target) return;

            handleCodeBlockAction(target);
        });
    }

    /**
     * 处理代码块操作
     */
    function handleCodeBlockAction(button) {
        const action = button.dataset.action;
        const assistantMessage = button.closest('.assistant-message');
        if (!assistantMessage) return;

        const codeBlock = assistantMessage.querySelector('.code-block');
        if (!codeBlock) return;

        // 从全局存储中获取代码（避免 HTML 转义问题）
        const blockId = codeBlock.dataset.codeId;
        const code = ChatManager.getCodeFromStore(blockId);
        
        if (!code) {
            console.error('未找到代码块:', blockId);
            return;
        }

        if (action === 'execute-code') {
            // 触发执行代码事件
            EventManager.emit('agent:execute:code', code);
        } else if (action === 'copy-code') {
            copyToClipboard(code, button);
        }
    }

    /**
     * 复制代码到剪贴板
     */
    function copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = button.textContent;
            button.textContent = '✓ 已复制';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        });
    }

    // ========== 消息显示 ==========

    /**
     * 追加消息到聊天区域
     */
    function appendMessage(html) {
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.insertAdjacentHTML('beforeend', html);
            chat.scrollTop = chat.scrollHeight;
        }
    }

    /**
     * 显示打字指示器
     */
    function showTypingIndicator() {
        const typingHTML = `
            <div class="typing" id="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        appendMessage(typingHTML);
    }

    /**
     * 隐藏打字指示器
     */
    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    /**
     * 更新发送按钮状态
     */
    function updateSendButtonState(isProcessing) {
        const sendBtn = document.getElementById('agent-send');
        if (sendBtn) {
            sendBtn.disabled = false; // 始终启用，允许停止
            if (isProcessing) {
                sendBtn.textContent = '⏹ 停止';
                sendBtn.style.background = '#ef4444'; // 红色背景表示可以停止
            } else {
                sendBtn.textContent = '发送 ➤';
                sendBtn.style.background = ''; // 恢复默认渐变
            }
        }
    }

    /**
     * 更新状态徽章
     */
    function updateStatusBadge(hasApiKey) {
        const badge = document.querySelector('#agent-title .status-badge');
        if (badge) {
            if (hasApiKey) {
                badge.className = 'status-badge status-active';
                badge.textContent = '已配置';
            } else {
                badge.className = 'status-badge status-inactive';
                badge.textContent = '未配置';
            }
        }
    }

    // ========== 窗口控制 ==========

    /**
     * 显示助手
     */
    function show() {
        if (assistant) {
            assistant.style.display = 'flex';
            
            // 保存显示状态到当前域名（使用 StateManager）
            if (typeof StateManager !== 'undefined') {
                StateManager.saveChatVisibility(true);
            }
        }
    }

    /**
     * 隐藏助手
     */
    function hide() {
        if (assistant) {
            assistant.style.display = 'none';
            // 触发 Agent 关闭事件，让 main.js 处理状态保存和日志记录
            EventManager.emit(EventManager.EventTypes.AGENT_CLOSE);
        }
    }

    // ========== 设置对话框 ==========

    /**
     * 显示设置对话框
     */
    function showSettings() {
        // 检查是否已经存在设置对话框
        const existingModal = document.getElementById('settings-modal');
        if (existingModal) {
            console.log('⚙️ 设置对话框已存在，跳过创建');
            return;
        }
        
        const config = ConfigManager.getAll();
        
        // 添加设置对话框样式
        GM_addStyle(getSettingsStyles());

        const modalHTML = buildSettingsHTML(config);
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 初始化模型选择
        initializeModelSelect(config.model);

        // 绑定事件
        bindSettingsEvents();
        
        // 绑定 ESC 键关闭
        bindEscapeKey();
    }

    /**
     * 获取设置对话框样式
     */
    function getSettingsStyles() {
        return `
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 1000000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .modal-content {
                background: white;
                padding: 24px;
                border-radius: 12px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                max-height: 80vh;
                overflow-y: auto;
            }
            .modal-title {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 16px;
                color: #1f2937;
            }
            .form-group {
                margin-bottom: 16px;
            }
            .form-label {
                display: block;
                margin-bottom: 6px;
                font-size: 14px;
                font-weight: 500;
                color: #374151;
            }
            .form-input {
                width: 100%;
                padding: 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                transition: border-color 0.2s;
            }
            .form-input:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            .form-hint {
                font-size: 12px;
                color: #6b7280;
                margin-top: 4px;
            }
            .modal-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 20px;
            }
            .btn-primary {
                background: #667eea;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            }
            .btn-secondary {
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #d1d5db;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            }
            .toggle-switch {
                position: relative;
                display: inline-block;
                width: 48px;
                height: 24px;
            }
            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 24px;
            }
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .toggle-slider {
                background-color: #667eea;
            }
            input:checked + .toggle-slider:before {
                transform: translateX(24px);
            }
            .setting-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid #e5e7eb;
            }
        `;
    }

    /**
     * 构建设置对话框 HTML
     */
    function buildSettingsHTML(config) {
        return `
            <div class="modal-overlay" id="settings-modal">
                <div class="modal-content">
                    <div class="modal-title">⚙️ 设置</div>
                    
                    <div class="form-group">
                        <label class="form-label">API Key *</label>
                        <input type="password" class="form-input" id="setting-api-key" 
                               value="${config.apiKey}" 
                               placeholder="输入你的 API Key">
                        <div class="form-hint">
                            从 <a href="https://openrouter.ai/keys" target="_blank">OpenRouter Keys</a> 获取免费 API Key
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">模型选择 (免费)</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <select class="form-input" id="setting-model" style="flex: 1;">
                                <option value="auto">🔄 Auto (自动选择)</option>
                            </select>
                            <button class="btn-secondary" id="refresh-models" title="刷新模型列表" style="padding: 8px 12px; white-space: nowrap;">🔄 刷新</button>
                        </div>
                        <div class="form-hint">
                            所有标记 :free 的模型都完全免费 | Auto 会自动选择最佳可用模型 | 点击刷新获取最新列表
                        </div>
                        <div id="models-status" style="margin-top: 8px; font-size: 12px; color: #6b7280;"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Temperature: <span id="temp-value">${config.temperature}</span></label>
                        <input type="range" class="form-input" id="setting-temperature" 
                               min="0" max="1" step="0.1" value="${config.temperature}">
                        <div class="form-hint">控制回复的随机性 (0=确定, 1=创意)</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Top P: <span id="topp-value">${config.topP}</span></label>
                        <input type="range" class="form-input" id="setting-top-p" 
                               min="0" max="1" step="0.1" value="${config.topP}">
                        <div class="form-hint">核采样参数,控制多样性 (0.95 推荐)</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">最大输出 Token</label>
                        <input type="number" class="form-input" id="setting-max-tokens" 
                               value="${config.maxTokens}" min="100" max="4096">
                    </div>

                    <div class="setting-row">
                        <div>
                            <div style="font-weight: 500;">JavaScript 执行</div>
                            <div style="font-size: 12px; color: #6b7280;">允许执行 AI 生成的代码</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-js-enabled" ${config.jsExecutionEnabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="modal-actions">
                        <button class="btn-secondary" id="cancel-settings">取消</button>
                        <button class="btn-primary" id="save-settings">保存</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定设置对话框的事件监听
     */
    function bindSettingsEvents() {
        // 温度滑块实时更新
        document.getElementById('setting-temperature').addEventListener('input', (e) => {
            document.getElementById('temp-value').textContent = e.target.value;
        });

        // Top P 滑块实时更新
        document.getElementById('setting-top-p').addEventListener('input', (e) => {
            document.getElementById('topp-value').textContent = e.target.value;
        });

        // 刷新模型列表
        setupModelRefresh();

        // 保存设置
        document.getElementById('save-settings').addEventListener('click', saveSettings);

        // 取消
        document.getElementById('cancel-settings').addEventListener('click', closeModal);
        
        // 点击遮罩层关闭
        const modalOverlay = document.getElementById('settings-modal');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                // 只有点击遮罩层本身才关闭，点击内容区域不关闭
                if (e.target === modalOverlay) {
                    closeModal();
                }
            });
        }
    }

    /**
     * 初始化模型选择
     */
    function initializeModelSelect(currentModel) {
        const cached = ModelManager.loadCachedModels();
        ModelManager.updateModelSelect(cached.models, currentModel);
        
        const modelsStatus = document.getElementById('models-status');
        if (modelsStatus && !cached.isExpired) {
            modelsStatus.innerHTML = `<span style="color: #6b7280;">📦 已加载缓存 (${cached.hoursAgo}小时前) | 点击刷新获取最新</span>`;
        }
    }

    /**
     * 设置模型刷新功能
     */
    function setupModelRefresh() {
        const refreshBtn = document.getElementById('refresh-models');
        const modelsStatus = document.getElementById('models-status');
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 加载中...';
            modelsStatus.innerHTML = '<span style="color: #3b82f6;">⏳ 正在获取最新模型列表...</span>';
            
            try {
                const result = await ModelManager.refreshModels();
                
                if (result.success) {
                    const select = document.getElementById('setting-model');
                    const currentModel = select.value;
                    ModelManager.updateModelSelect(result.models, currentModel);
                    modelsStatus.innerHTML = `<span style="color: #10b981;">✅ 已更新!找到 ${result.count} 个免费模型 (最后更新: ${new Date().toLocaleTimeString()})</span>`;
                } else {
                    throw new Error(result.error);
                }
                
            } catch (error) {
                console.error('获取模型列表失败:', error);
                modelsStatus.innerHTML = `<span style="color: #ef4444;">❌ 获取失败: ${error.message}</span><br><span style="color: #6b7280;">提示: Auto 模式仍然可用</span>`;
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 刷新';
            }
        });
    }

    /**
     * 保存设置
     */
    function saveSettings() {
        const apiKey = document.getElementById('setting-api-key').value.trim();
        const model = document.getElementById('setting-model').value;
        const temperature = parseFloat(document.getElementById('setting-temperature').value);
        const topP = parseFloat(document.getElementById('setting-top-p').value);
        let maxTokens = parseInt(document.getElementById('setting-max-tokens').value);
        const jsEnabled = document.getElementById('setting-js-enabled').checked;

        // 验证并限制 maxTokens 范围
        if (isNaN(maxTokens) || maxTokens < 100) {
            maxTokens = 2048;
        } else if (maxTokens > 8192) {
            maxTokens = 8192;
            alert('⚠️ maxTokens 已自动限制为 8192，避免超出 API 限制');
        }

        // 保存到配置管理器 (浏览器存储)
        ConfigManager.set('apiKey', apiKey);
        ConfigManager.set('model', model);
        ConfigManager.set('temperature', temperature);
        ConfigManager.set('topP', topP);
        ConfigManager.set('maxTokens', maxTokens);
        ConfigManager.set('jsExecutionEnabled', jsEnabled);

        closeModal();
        
        // 更新 UI 状态徽章
        updateStatusBadge(apiKey.length > 0);
        
        // 显示成功消息
        appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #10b981;">
                    ✅ 设置已保存 - 开始免费使用!
                </div>
            </div>
        `);
    }

    /**
     * 绑定 ESC 键关闭设置对话框
     */
    function bindEscapeKey() {
        // 先移除旧的监听器（如果存在）
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
        }
        
        // 创建新的处理器
        escapeHandler = (e) => {
            if (e.key === 'Escape' || e.keyCode === 27) {
                closeModal();
            }
        };
        
        document.addEventListener('keydown', escapeHandler);
    }

    /**
     * 关闭模态框
     */
    function closeModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.remove();
        }
        
        // 移除 ESC 键监听器
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
            escapeHandler = null;
        }
    }

    // ========== 初始化 ==========
    addStyles();

    // ========== 公共接口 ==========
    return {
        createAssistant,
        appendMessage,
        showTypingIndicator,
        hideTypingIndicator,
        updateSendButtonState,
        updateStatusBadge,
        show,
        hide,
        showSettings,
        closeModal
    };
})();


// =====================================================
// 模块: models.js
// =====================================================

// ==================== 模型管理模块 ====================

const ModelManager = (function() {
    const CACHE_KEY = 'cached_models';
    const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

    // 默认模型列表
    const DEFAULT_MODELS = [
        { id: 'google/gemma-3-12b-it:free', name: '🌟 Gemma 3 12B (推荐)', provider: 'google' },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: '🦙 Llama 3.3 70B', provider: 'meta-llama' },
        { id: 'qwen/qwen-2.5-72b-instruct:free', name: '💬 Qwen 2.5 72B (中文好)', provider: 'qwen' },
        { id: 'deepseek/deepseek-r1-0528:free', name: '🧠 DeepSeek R1 (推理强)', provider: 'deepseek' },
        { id: 'mistralai/mistral-7b-instruct:free', name: '⚡ Mistral 7B (快速)', provider: 'mistralai' },
        { id: 'google/gemini-2.0-flash-exp:free', name: '✨ Gemini 2.0 Flash', provider: 'google' },
        { id: 'openai/gpt-oss-20b:free', name: '🤖 GPT-OSS 20B', provider: 'openai' },
        { id: 'zhipuai/glm-4.5-air:free', name: '🇨🇳 GLM-4.5 Air', provider: 'zhipuai' },
        { id: 'stepfun/step-3.5-flash:free', name: '🚀 Step 3.5 Flash', provider: 'stepfun' },
        { id: 'arcee/trinity-mini:free', name: '🔹 Trinity Mini 26B', provider: 'arcee' },
        { id: 'openrouter/auto', name: '🎲 Auto (智能路由 - 推荐)', provider: 'openrouter' }
    ];

    /**
     * 从 API 获取免费模型列表
     */
    function fetchFreeModels() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://openrouter.ai/api/v1/models',
                headers: {
                    'Content-Type': 'application/json'
                },
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.data) {
                            // 过滤出免费模型
                            const freeModels = data.data
                                .filter(model => model.id.includes(':free') || model.pricing?.prompt === 0)
                                .map(model => ({
                                    id: model.id,
                                    name: getModelDisplayName(model),
                                    provider: model.id.split('/')[0],
                                    context_length: model.context_length || 'N/A'
                                }))
                                .sort((a, b) => a.name.localeCompare(b.name));
                            
                            resolve(freeModels);
                        } else {
                            reject(new Error('无效的响应格式'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    /**
     * 获取模型显示名称
     */
    function getModelDisplayName(model) {
        const providerIcons = {
            'google': '✨',
            'meta-llama': '🦙',
            'llama': '🦙',
            'qwen': '💬',
            'aliyun': '💬',
            'deepseek': '🧠',
            'mistral': '⚡',
            'mistralai': '⚡',
            'openai': '🤖',
            'zhipu': '🇨🇳',
            'glm': '🇨🇳',
            'stepfun': '🚀',
            'arcee': '🔹'
        };

        const provider = model.id.split('/')[0];
        const icon = providerIcons[provider] || '🤖';
        
        return `${icon} ${model.name || model.id}`;
    }

    /**
     * 更新模型选择下拉框
     */
    function updateModelSelect(models, currentModel) {
        const select = document.getElementById('setting-model');
        if (!select) return;
        
        // 保存当前选中的值
        const currentValue = currentModel || select.value;
        
        // 清空现有选项
        select.innerHTML = '';
        
        // 添加 Auto 选项 (始终在第一位)
        const autoOption = document.createElement('option');
        autoOption.value = 'openrouter/auto';
        autoOption.textContent = '🎲 Auto (智能路由 - 推荐)';
        if (currentValue === 'openrouter/auto') autoOption.selected = true;
        select.appendChild(autoOption);
        
        // 添加分隔线
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────────';
        select.appendChild(separator);
        
        // 添加免费模型选项
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            
            // 恢复之前的选择
            if (model.id === currentValue) {
                option.selected = true;
            }
            
            select.appendChild(option);
        });
    }

    /**
     * 加载缓存的模型列表
     */
    function loadCachedModels() {
        const cached = GM_getValue(CACHE_KEY, null);
        if (cached) {
            try {
                const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
                const models = data.models;
                const timestamp = data.timestamp;
                const age = Date.now() - timestamp;
                
                // 如果缓存不超过 24 小时,使用缓存
                if (age < CACHE_EXPIRY) {
                    return { models, isExpired: false, hoursAgo: Math.floor(age / (60 * 60 * 1000)) };
                }
            } catch (error) {
                console.error('加载缓存失败:', error);
            }
        }
        return { models: DEFAULT_MODELS, isExpired: true, hoursAgo: 0 };
    }

    /**
     * 保存模型列表到缓存
     */
    function saveToCache(models) {
        GM_setValue(CACHE_KEY, JSON.stringify({
            models: models,
            timestamp: Date.now()
        }));
    }

    /**
     * 刷新模型列表
     */
    async function refreshModels() {
        try {
            const models = await fetchFreeModels();
            saveToCache(models);
            return { success: true, models, count: models.length };
        } catch (error) {
            console.error('获取模型列表失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取提供商图标
     */
    function getProviderIcon(provider) {
        const icons = {
            'google': '✨',
            'meta-llama': '🦙',
            'llama': '🦙',
            'qwen': '💬',
            'deepseek': '🧠',
            'mistral': '⚡',
            'openai': '🤖',
            'zhipu': '🇨🇳',
            'glm': '🇨🇳',
            'stepfun': '🚀',
            'arcee': '🔹',
            'openrouter': '🎲'
        };
        return icons[provider] || '🤖';
    }

    return {
        DEFAULT_MODELS,
        fetchFreeModels,
        updateModelSelect,
        loadCachedModels,
        saveToCache,
        refreshModels,
        getProviderIcon,
        getModelDisplayName
    };
})();


// =====================================================
// 模块: api.js
// =====================================================

// ==================== API 调用模块 ====================

const APIManager = (function() {
    let isProcessing = false;

    /**
     * 调用 AI API
     */
    async function callAPI(userMessage, conversationHistory, config, abortController = null) {
        if (isProcessing) return null;
        
        isProcessing = true;
        
        try {
            // 验证配置
            if (!config.apiKey) {
                throw new Error('API Key 未设置，请在设置中配置 OpenRouter API Key');
            }
            if (!config.model) {
                throw new Error('模型未设置');
            }
            
            const messages = buildMessages(userMessage, conversationHistory, config);
            
            const requestBody = {
                model: config.model,
                messages: messages,
                temperature: config.temperature || 0.7,
                top_p: config.topP || 0.95,
                // 限制 max_tokens 最大值，避免超出 API 限制
                max_tokens: Math.min(config.maxTokens || 2048, 8192)
            };
            
            console.log('📤 API 请求:', { model: config.model, messagesCount: messages.length });
            
            const response = await makeRequest(requestBody, config.apiKey, abortController);
            
            console.log('📥 API 响应:', response.choices ? '成功' : '失败');
            
            if (response.choices && response.choices.length > 0) {
                const assistantMessage = response.choices[0].message.content;
                return { success: true, message: assistantMessage };
            } else {
                throw new Error('无效的 API 响应');
            }

        } catch (error) {
            console.error('API 调用失败:', error);
            
            // 检查是否是用户主动取消
            if (error.name === 'AbortError') {
                return { success: false, cancelled: true, error: '请求已取消' };
            }
            
            return { success: false, error: error.message };
        } finally {
            isProcessing = false;
        }
    }

    /**
     * 构建消息数组
     */
    function buildMessages(currentMessage, history, config) {
        // 系统提示词
        const systemMessage = {
            role: 'system',
            content: `你是浏览器中的AI助手,发送\`\`\`js\`\`\`包裹的代码块，执行代码，通过return获取结果`
        };

        // 获取最近的对话历史(最多保留最近 10 轮)
        const recentHistory = (history || []).slice(-10);
        
        // 构建完整的消息数组
        const messages = [
            systemMessage,
            ...recentHistory.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.content
            })),
            {
                role: 'user',
                content: currentMessage
            }
        ];

        return messages;
    }

    /**
     * 发起 HTTP 请求
     */
    function makeRequest(requestBody, apiKey, abortController = null) {
        return new Promise((resolve, reject) => {
            const xhr = GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'AI Browser Agent'
                },
                data: JSON.stringify(requestBody),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            resolve(data);
                        } catch (error) {
                            reject(new Error('响应解析失败'));
                        }
                    } else {
                        // 尝试解析错误详情
                        let errorDetail = response.statusText;
                        try {
                            const errorData = JSON.parse(response.responseText);
                            if (errorData.error) {
                                errorDetail = errorData.error.message || errorData.error.code || JSON.stringify(errorData.error);
                            }
                        } catch (e) {
                            errorDetail = response.responseText || response.statusText;
                        }
                        reject(new Error(`HTTP ${response.status}: ${errorDetail}`));
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('请求超时')),
                onreadystatechange: (readyState) => {
                    // 检查是否被中止
                    if (abortController && abortController.signal.aborted) {
                        xhr.abort();
                        reject(new DOMException('The user aborted a request.', 'AbortError'));
                    }
                }
            });
            
            // 监听 abort 信号
            if (abortController) {
                abortController.signal.addEventListener('abort', () => {
                    xhr.abort();
                    reject(new DOMException('The user aborted a request.', 'AbortError'));
                });
            }
        });
    }

    /**
     * 检查是否正在处理
     */
    function getProcessingState() {
        return isProcessing;
    }

    return {
        callAPI,
        getProcessingState
    };
})();


// =====================================================
// 模块: chat.js
// =====================================================

// ==================== 聊天逻辑模块 (重构版) ====================

const ChatManager = (function() {
    'use strict';
    
    // ========== 状态管理 ==========
    const MAX_CODE_BLOCKS = 100; // 最多保留 100 个代码块
    
    const state = {
        isProcessing: false,
        codeBlockStore: {},
        codeBlockIndex: 0,
        messageQueue: [],
        currentAbortController: null,  // 当前请求的 AbortController
        historyLoaded: false  // 标记历史记录是否已加载
    };

    // ========== 工具函数 ==========
    
    /**
     * 安全地将对象转换为字符串（处理循环引用）
     */
    function safeStringify(result) {
        try {
            return typeof result === 'object' 
                ? JSON.stringify(result, null, 2) 
                : String(result);
        } catch (e) {
            if (typeof result === 'object' && result !== null) {
                try {
                    const simpleObj = {};
                    for (let key in result) {
                        if (result.hasOwnProperty(key)) {
                            const val = result[key];
                            const type = typeof val;
                            if (type === 'string' || type === 'number' || type === 'boolean') {
                                simpleObj[key] = val;
                            } else if (type === 'function') {
                                simpleObj[key] = '[Function]';
                            } else if (type === 'object' && val !== null) {
                                simpleObj[key] = '[Object]';
                            }
                        }
                        if (Object.keys(simpleObj).length >= 20) break;
                    }
                    return JSON.stringify(simpleObj, null, 2);
                } catch (e2) {
                    return `[${typeof result}] 对象类型（无法完整序列化）`;
                }
            } else {
                return String(result);
            }
        }
    }

    /**
     * HTML 转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 从文本中提取所有代码块
     */
    function extractCodeBlocks(text) {
        const codeBlocks = [];
        const regex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            codeBlocks.push({
                lang: match[1] || 'text',
                code: match[2].trim()
            });
        }
        return codeBlocks;
    }

    /**
     * 检查代码是否为高危操作
     */
    function isHighRiskCode(code) {
        const highRiskPatterns = [
            // 导航/跳转类
            /window\.location\s*=/,
            /window\.location\.href\s*=/,
            /location\.href\s*=/,
            /location\.replace\s*\(/,
            /location\.assign\s*\(/,
            /window\.open\s*\(/,
            
            // 数据删除类
            /localStorage\.clear\s*\(/,
            /localStorage\.removeItem\s*\(/,
            /sessionStorage\.clear\s*\(/,
            /indexedDB\.deleteDatabase\s*\(/,
            
            // Cookie 操作
            /document\.cookie\s*=.*expires/,
            /document\.cookie\s*=.*max-age=0/,
            
            // 危险执行
            /eval\s*\(/,
            /Function\s*\(/,
            /setTimeout\s*\(.*eval/,
            /setInterval\s*\(.*eval/,
            
            // DOM 破坏性操作
            /document\.body\.innerHTML\s*=\s*['"`]/,
            /document\.documentElement\.innerHTML\s*=\s*['"`]/,
            
            // 弹窗轰炸
            /while\s*\(.*\)\s*\{\s*alert/,
            /for\s*\(.*\)\s*\{\s*alert/,
            
            // 无限循环
            /while\s*\(true\)/,
            /for\s*\(;;\)/,
            /while\s*\(1\)/,
        ];
        
        return highRiskPatterns.some(pattern => pattern.test(code));
    }

    /**
     * 停止当前请求并清空队列
     */
    function stopCurrentRequest() {
        // 1. 取消当前的 API 请求
        if (state.currentAbortController) {
            state.currentAbortController.abort();
            state.currentAbortController = null;
        }
        
        // 2. 清空消息队列
        state.messageQueue = [];
        
        // 3. 重置处理状态
        state.isProcessing = false;
        
        // 4. 隐藏打字指示器
        UIManager.hideTypingIndicator();
        
        // 5. 更新按钮状态
        UIManager.updateSendButtonState(false);
        
        // 6. 添加系统提示
        addAssistantMessage('⏹ 已停止请求并清空队列');
    }

    // ========== 消息处理核心 ==========

    /**
     * 处理用户消息（主入口）
     */
    async function handleMessage(message) {
        // 如果正在处理，将消息加入队列
        if (state.isProcessing) {
            state.messageQueue.push(message);
            console.log('⏳ 消息已加入队列，等待处理');
            return;
        }
        
        const trimmedMessage = message.trim();
        if (!trimmedMessage) return;

        // 添加用户消息到界面
        addUserMessage(trimmedMessage);

        // 检查是否是快捷命令
        if (trimmedMessage.startsWith('/')) {
            state.isProcessing = true;
            try {
                handleCommand(trimmedMessage);
            } finally {
                state.isProcessing = false;
                processNextMessage();
            }
            return;
        }

        // 正常对话处理
        await handleNormalMessage(trimmedMessage);
    }

    /**
     * 处理普通对话消息
     */
    async function handleNormalMessage(message) {
        state.isProcessing = true;
        
        try {
            UIManager.showTypingIndicator();
            UIManager.updateSendButtonState(true); // 更新按钮为停止状态

            const config = ConfigManager.getAll();
            const history = HistoryManager.getHistory();
            
            // 创建 AbortController 用于取消请求
            state.currentAbortController = new AbortController();
            
            const response = await APIManager.callAPI(message, history, config, state.currentAbortController);
            
            // 请求完成，清除 AbortController
            state.currentAbortController = null;
            
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false); // 恢复按钮状态

            if (response.success) {
                addAssistantMessage(response.message);
                
                // 异步执行代码块（只执行一次，不阻塞主流程）
                setTimeout(() => executeCodeBlocksFromMessage(response.message), 100);
            } else {
                // 检查是否是用户主动取消
                if (response.cancelled) {
                    console.log('✅ 请求已被用户取消');
                    return; // 不显示错误消息，因为已经显示了停止提示
                }
                addAssistantMessage(`❌ API 错误: ${response.error}`);
            }

        } catch (error) {
            console.error('❌ 消息处理失败:', error);
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false); // 恢复按钮状态
            
            // 检查是否是中止错误
            if (error.name === 'AbortError') {
                console.log('✅ 请求已中止');
                return; // 不显示错误消息
            }
            
            addAssistantMessage(`❌ 错误: ${error.message}`);
        } finally {
            state.isProcessing = false;
            state.currentAbortController = null;
            processNextMessage();
        }
    }

    /**
     * 处理队列中的下一条消息
     */
    function processNextMessage() {
        if (state.messageQueue.length > 0 && !state.isProcessing) {
            const nextMessage = state.messageQueue.shift();
            console.log('📤 从队列取出消息处理');
            handleMessage(nextMessage);
        }
    }

    // ========== 消息显示 ==========

    /**
     * 添加用户消息到界面
     */
    function addUserMessage(text) {
        const messageHTML = `
            <div class="user-message">
                <div class="message-content">${escapeHtml(text)}</div>
            </div>
        `;
        UIManager.appendMessage(messageHTML);
        
        // 保存到历史
        saveToHistory({ role: 'user', content: text });
    }

    /**
     * 添加助手消息到界面
     */
    function addAssistantMessage(text) {
        const formattedText = formatMessage(text);
        UIManager.appendMessage(formattedText);
        
        // 保存到历史
        saveToHistory({ role: 'assistant', content: text });
    }

    /**
     * 保存消息到历史记录
     */
    function saveToHistory(message) {
        const history = HistoryManager.getHistory();
        history.push(message);
        HistoryManager.saveConversationHistory(history);
    }

    // ========== 代码执行 ==========

    /**
     * 执行 JavaScript 代码（手动触发）
     */
    function executeJavaScript(code) {
        try {
            const result = unsafeWindow.eval(code);
            const resultStr = safeStringify(result);
            
            // 生成唯一 ID 并存储到全局
            const blockId = 'result_' + Date.now();
            state.codeBlockStore[blockId] = resultStr;
            
            // 使用代码块形式显示执行结果（控制高度）
            UIManager.appendMessage(`
                <div class="assistant-message">
                    <div style="margin-bottom: 4px; font-size: 13px; color: #10b981;">
                        <strong>✅ 执行成功</strong>
                    </div>
                    <div class="code-block" data-code-id="${blockId}" data-lang="result" style="max-height: 200px; overflow-y: auto;">
                        <div class="code-language">RESULT</div>
                        <pre>${escapeHtml(resultStr)}</pre>
                    </div>
                </div>
            `);
            
            // 保存执行记录
            saveToHistory({ 
                role: 'system', 
                content: `[代码执行] ${code}\n结果: ${resultStr}` 
            });
            
        } catch (error) {
            displayExecutionError(error);
        }
    }

    /**
     * 显示代码执行错误
     */
    function displayExecutionError(error) {
        let errorType = '未知错误';
        let suggestion = '';
        
        if (error instanceof SyntaxError) {
            errorType = '语法错误';
            suggestion = '<br><br>💡 <strong>建议:</strong> 请让 AI 重新生成代码,并检查:<br>• 字符串是否使用了正确的引号<br>• 模板字符串是否使用了反引号 (`)<br>• 括号是否匹配';
        } else if (error instanceof ReferenceError) {
            errorType = '引用错误';
            suggestion = '<br><br>💡 <strong>建议:</strong> 变量或函数未定义,请检查代码中的变量名是否正确';
        } else if (error instanceof TypeError) {
            errorType = '类型错误';
            suggestion = '<br><br>💡 <strong>建议:</strong> 调用了不存在的方法或属性,请检查对象是否存在';
        }
        
        // 生成唯一 ID 并存储到全局
        const blockId = 'error_' + Date.now();
        state.codeBlockStore[blockId] = error.toString();
        
        // 使用代码块形式显示错误（控制高度）
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div style="margin-bottom: 4px; font-size: 13px; color: #ef4444;">
                    <strong>❌ 执行失败 (${errorType})</strong>
                </div>
                <div class="code-block" data-code-id="${blockId}" data-lang="error" style="max-height: 200px; overflow-y: auto; background: #fee2e2; border-left: 4px solid #ef4444;">
                    <div class="code-language">ERROR</div>
                    <pre>${escapeHtml(error.toString())}</pre>
                </div>
                ${suggestion}
            </div>
        `);
        
        console.error('❌ 代码执行失败:', error);
    }

    /**
     * 执行消息中的代码块（自动执行安全代码，高危代码需要确认）
     */
    async function executeCodeBlocksFromMessage(message) {
        if (state.isProcessing) return;
        
        const codeBlocks = extractCodeBlocks(message);
        const jsCodeBlocks = codeBlocks.filter(block => block.lang === 'javascript' || block.lang === 'js');
        
        if (jsCodeBlocks.length === 0) return;
        
        state.isProcessing = true;
        
        try {
            // 依次执行所有代码块，收集结果
            const results = [];
            
            for (let i = 0; i < jsCodeBlocks.length; i++) {
                const block = jsCodeBlocks[i];
                const index = i + 1;
                
                // 检查是否为高危代码
                if (isHighRiskCode(block.code)) {
                    // 高危代码：显示警告，需要手动确认
                    showHighRiskWarning(block.code, index);
                    results.push({
                        index,
                        status: 'pending',
                        message: '⚠️ 等待用户确认'
                    });
                } else {
                    // 安全代码：执行并收集结果（最多尝试3次）
                    const result = await executeWithRetry(block.code, index, 3);
                    results.push(result);
                }
            }
            
            // 如果有需要执行的代码块，组合结果并反馈给 AI
            const executableResults = results.filter(r => r.status !== 'pending');
            if (executableResults.length > 0) {
                // sendCombinedResultsToAI -> callAPIForFeedback 会自己管理状态
                await sendCombinedResultsToAI(executableResults);
            }
            
        } catch (error) {
            console.error('❌ 代码块执行失败:', error);
        } finally {
            // 只有在没有进行 API 调用时才重置状态
            // 如果调用了 callAPIForFeedback，它会在完成后重置状态
            if (!state.currentAbortController) {
                state.isProcessing = false;
                UIManager.updateSendButtonState(false);
                processNextMessage();
            }
            // 如果正在进行 API 调用，processNextMessage 会在 callAPIForFeedback 结束后调用
        }
    }

    /**
     * 带重试的代码执行（最多尝试 maxRetries 次）
     */
    async function executeWithRetry(code, index, maxRetries = 3) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 执行代码块 ${index} (尝试 ${attempt}/${maxRetries})`);
                
                const result = unsafeWindow.eval(code);
                const resultStr = safeStringify(result);
                
                console.log(`✅ 代码块 ${index} 执行成功 (尝试 ${attempt})`);
                
                return {
                    index,
                    status: 'success',
                    result: resultStr,
                    attempts: attempt
                };
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ 代码块 ${index} 执行失败 (尝试 ${attempt}/${maxRetries}):`, error.message);
                
                // 如果不是最后一次尝试，等待一小段时间再重试
                if (attempt < maxRetries) {
                    await sleep(500); // 等待 500ms 后重试
                }
            }
        }
        
        // 所有尝试都失败了
        console.error(`❌ 代码块 ${index} 执行失败，已重试 ${maxRetries} 次`);
        
        return {
            index,
            status: 'failed',
            error: lastError.toString(),
            attempts: maxRetries,
            errorType: getErrorType(lastError)
        };
    }

    /**
     * 发送组合结果给 AI
     */
    async function sendCombinedResultsToAI(results) {
        // 构建组合结果消息
        const combinedMessage = buildCombinedResultsMessage(results);
        
        // 显示执行结果摘要
        addAssistantMessage(combinedMessage.summary);
        
        // 添加简化的用户消息
        addUserMessage(combinedMessage.userMessage);
        
        // 构建详细的反馈消息发送给 AI
        const feedbackMessage = combinedMessage.feedbackMessage;
        
        // 调用 API 获取 AI 响应
        await callAPIForFeedback(feedbackMessage);
    }

    /**
     * 构建组合结果消息
     */
    function buildCombinedResultsMessage(results) {
        const successCount = results.filter(r => r.status === 'success').length;
        const failedCount = results.filter(r => r.status === 'failed').length;
        
        // 构建详细结果文本（压缩格式）
        let resultText = `代码执行结果: 总计 ${results.length} 个 | ✅ 成功 ${successCount} 个 | ❌ 失败 ${failedCount} 个\n`;
        resultText += `${'='.repeat(60)}\n\n`;
        
        results.forEach((result, idx) => {
            resultText += `[代码块 ${result.index}] `;
            
            if (result.status === 'success') {
                resultText += `✅ 成功 (尝试 ${result.attempts} 次)\n`;
                resultText += `结果: ${result.result}\n`;
            } else {
                resultText += `❌ 失败 (${result.errorType}, 尝试 ${result.attempts} 次)\n`;
                resultText += `错误: ${result.error}\n`;
            }
            
            resultText += `\n${'-'.repeat(60)}\n\n`;
        });
        
        if (failedCount > 0) {
            resultText += `\n请根据上述结果修正失败的代码或提供其他帮助。`;
        }
        
        // 生成唯一 ID 并存储到全局
        const blockId = 'exec_result_' + Date.now();
        state.codeBlockStore[blockId] = resultText;
        
        // 构建摘要消息（使用代码块形式）
        let summaryHTML = '<div class="assistant-message">';
        summaryHTML += `<div style="margin-bottom: 4px; font-size: 13px; color: #667eea;">`;
        summaryHTML += `<strong>⚡ 代码执行结果 (${results.length} 个代码块)</strong>`;
        summaryHTML += `</div>`;
        summaryHTML += `<div class="code-block" data-code-id="${blockId}" data-lang="execution-result" style="max-height: 200px; overflow-y: auto;">`;
        summaryHTML += `<div class="code-language">RESULT</div>`;
        summaryHTML += `<pre>${escapeHtml(resultText)}</pre>`;
        summaryHTML += `</div></div>`;
        
        // 构建用户消息
        let userMessage = '';
        if (failedCount === 0) {
            userMessage = `✅ 所有代码块执行成功 (${results.length} 个)`;
        } else {
            userMessage = `⚠️ 部分代码块执行失败 (${successCount}/${results.length} 成功)`;
        }
        
        // 构建详细反馈消息（发送给 AI）
        let feedbackMessage = resultText;
        
        return {
            summary: summaryHTML,
            userMessage,
            feedbackMessage
        };
    }

    /**
     * 获取错误类型
     */
    function getErrorType(error) {
        if (error instanceof SyntaxError) return '语法错误';
        if (error instanceof ReferenceError) return '引用错误';
        if (error instanceof TypeError) return '类型错误';
        if (error.message && (error.message.includes('network') || error.message.includes('Network'))) return '网络错误';
        return '未知错误';
    }

    /**
     * 延迟函数
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 为代码执行反馈调用 API（不显示用户消息）
     */
    async function callAPIForFeedback(feedbackMessage) {
        UIManager.showTypingIndicator();
        UIManager.updateSendButtonState(true); // 更新按钮为停止状态
        
        const config = ConfigManager.getAll();
        const history = HistoryManager.getHistory();
        
        // 创建 AbortController 用于取消请求
        state.currentAbortController = new AbortController();
        
        const response = await APIManager.callAPI(feedbackMessage, history, config, state.currentAbortController);
        
        // 请求完成，清除 AbortController
        state.currentAbortController = null;
        
        UIManager.hideTypingIndicator();
        UIManager.updateSendButtonState(false); // 恢复按钮状态
        
        // 重置处理状态
        state.isProcessing = false;
        
        // 显示 AI 回复
        if (response.success) {
            addAssistantMessage(response.message);
            
            // 检查 AI 回复中是否有新的代码块需要执行
            setTimeout(() => executeCodeBlocksFromMessage(response.message), 100);
        } else {
            // 检查是否是用户主动取消
            if (response.cancelled) {
                console.log('✅ 代码执行反馈请求已被用户取消');
                processNextMessage();
                return; // 不显示错误消息
            }
            addAssistantMessage(`❌ API 错误: ${response.error}`);
        }
        
        // 处理队列中的下一条消息
        processNextMessage();
    }

    /**
     * 显示高危代码警告（需要手动确认执行）
     */
    function showHighRiskWarning(code, index) {
        // 生成唯一 ID 用于手动执行
        const warningId = 'warning_' + Date.now() + '_' + index;
        state.codeBlockStore[warningId] = code;
        
        // 创建 HTML 元素（不使用 onclick，改用 data 属性）
        const warningHTML = `
            <div class="assistant-message">
                <div class="execution-result execution-error" style="margin-top: 4px;">
                    <strong>⚠️ 高危代码检测 (代码块 ${index})</strong>
                    <br>
                    <span style="font-size: 13px; margin-top: 4px; display: block;">
                        此代码包含潜在危险操作，需要手动确认后才能执行。
                    </span>
                    <div style="margin-top: 8px; display: flex; gap: 6px;">
                        <button class="code-btn execute warning-execute-btn" data-warning-id="${warningId}" style="background: #f59e0b;">
                            ⚠️ 确认执行
                        </button>
                        <button class="code-btn warning-ignore-btn" style="background: #6b7280;">
                            ✕ 忽略
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        UIManager.appendMessage(warningHTML);
        
        // 等待 DOM 更新后绑定事件
        setTimeout(() => {
            // 查找刚添加的按钮并绑定事件
            const buttons = document.querySelectorAll('.warning-execute-btn, .warning-ignore-btn');
            buttons.forEach(btn => {
                if (!btn.dataset.eventBound) {
                    btn.dataset.eventBound = 'true';
                    
                    if (btn.classList.contains('warning-execute-btn')) {
                        btn.addEventListener('click', () => {
                            const wid = btn.dataset.warningId;
                            console.log('⚠️ 用户确认执行高危代码:', wid);
                            
                            if (typeof ChatManager !== 'undefined' && ChatManager.getCodeFromStore) {
                                const code = ChatManager.getCodeFromStore(wid);
                                if (code) {
                                    ChatManager.executeJavaScript(code);
                                    // 移除警告框
                                    const warningBox = btn.closest('.assistant-message');
                                    if (warningBox) warningBox.remove();
                                }
                            } else {
                                console.error('❌ ChatManager 未初始化');
                            }
                        });
                    } else if (btn.classList.contains('warning-ignore-btn')) {
                        btn.addEventListener('click', () => {
                            const warningBox = btn.closest('.assistant-message');
                            if (warningBox) warningBox.remove();
                        });
                    }
                }
            });
        }, 50);
    }

    // ========== 消息格式化 ==========

    /**
     * 格式化消息(支持代码块)
     */
    function formatMessage(text) {
        // 先处理代码块,避免被转义
        let formatted = text;
        
        // 处理代码块 - 先提取代码块并标记占位符
        const codeBlocks = [];
        formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const index = codeBlocks.length;
            codeBlocks.push({ lang: lang || 'text', code: code.trim() });
            return `__CODE_BLOCK_${index}__`;
        });
        
        // 恢复代码块 - 同时存储到全局和 HTML 中
        formatted = formatted.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
            const block = codeBlocks[parseInt(index)];
            
            // 生成唯一 ID 并存储到全局（用于执行/复制）
            const blockId = 'code_' + Date.now() + '_' + (++state.codeBlockIndex);
            state.codeBlockStore[blockId] = block.code;
            
            // 如果超过限制，删除最旧的 20 个
            const keys = Object.keys(state.codeBlockStore);
            if (keys.length > MAX_CODE_BLOCKS) {
                keys.sort();
                keys.slice(0, 20).forEach(key => {
                    delete state.codeBlockStore[key];
                });
            }
            
            const isJs = block.lang === 'javascript' || block.lang === 'js';
            
            // HTML 中显示代码（用于视觉展示）
            return [
                `<div class="code-block" data-code-id="${blockId}" data-lang="${block.lang}">`,
                `<div class="code-language">${block.lang}</div>`,
                `<pre>${escapeHtml(block.code)}</pre>`,
                `</div>`,
                `<div class="code-actions">`,
                isJs ? '<button class="code-btn execute" data-action="execute-code">▶ 执行代码</button>' : '',
                '<button class="code-btn" data-action="copy-code">📋 复制</button>',
                `</div>`
            ].join('');
        });
        
        // 处理行内代码
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>');
        
        return `
            <div class="assistant-message">
                <div class="message-content">${formatted}</div>
            </div>
        `;
    }

    // ========== 快捷命令 ==========

    /**
     * 处理快捷命令
     */
    function handleCommand(command) {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        switch (cmd) {
            case '/js':
                if (args) {
                    executeJavaScript(args);
                } else {
                    addAssistantMessage('❌ 请提供要执行的 JavaScript 代码\n\n示例: /js document.title');
                }
                break;
            case '/clear':
                clearChat();
                break;
            case '/help':
                showHelp();
                break;
            default:
                addAssistantMessage(`❌ 未知命令: ${cmd}\n\n输入 /help 查看可用命令`);
        }
    }

    /**
     * 显示帮助信息
     */
    function showHelp() {
        const helpText = `
<strong>💡 使用帮助</strong>

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行 JavaScript 代码
• <code>/clear</code> - 清空对话历史
• <code>/help</code> - 显示此帮助

<strong>示例:</strong>
• "帮我修改页面背景色为蓝色"
• "/js document.body.style.background = 'blue'"
• "提取页面上所有链接"
• "分析当前页面的结构"

<strong>提示:</strong>
• 按 Enter 发送消息,Shift+Enter 换行
• 可以拖拽标题栏移动窗口
• 点击 − 最小化窗口
• 代码块可以直接执行或复制
        `;
        
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content">${helpText}</div>
            </div>
        `);
    }

    /**
     * 清空聊天
     */
    function clearChat() {
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.innerHTML = '';
        }
        HistoryManager.clearHistory();
        
        // 重置历史记录加载标志
        state.historyLoaded = false;
        console.log('🗑️ 聊天记录已清空，重置加载标志');
        
        showWelcomeMessage();
    }

    // ========== 历史记录 ==========

    /**
     * 渲染历史记录到界面
     */
    function renderHistory(history) {
        // 如果已经加载过历史记录，则不再重复加载
        if (state.historyLoaded) {
            console.log('⚠️ 历史记录已加载，跳过重复加载');
            return;
        }
        
        // 清空当前聊天区域
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.innerHTML = '';
        }
        
        // 加载历史消息（不保存，不执行）
        history.forEach((msg) => {
            if (msg.role === 'user') {
                const messageHTML = `
                    <div class="user-message">
                        <div class="message-content">${escapeHtml(msg.content)}</div>
                    </div>
                `;
                UIManager.appendMessage(messageHTML);
            } else if (msg.role === 'assistant') {
                const formattedText = formatMessage(msg.content);
                UIManager.appendMessage(formattedText);
            }
        });
        
        // 标记为已加载
        state.historyLoaded = true;
        console.log(`✅ 历史记录加载完成，共 ${history.length} 条消息`);
    }

    /**
     * 显示欢迎消息
     */
    function showWelcomeMessage() {
        const welcomeMessage = `
<strong>👋 欢迎使用 AI Agent!</strong>

我可以帮你:
• 💬 智能对话 - 回答各种问题
• 🔧 执行 JavaScript 代码
•  操作当前页面
•  提取页面信息

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行代码
• <code>/clear</code> - 清空历史
• <code>/help</code> - 显示帮助

试试对我说: "帮我修改页面背景色"
        `;
        
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content">${welcomeMessage}</div>
            </div>
        `);
    }

    // ========== 公共接口 ==========

    return {
        handleMessage,
        executeJavaScript,
        clearChat,
        showHelp,
        showWelcomeMessage,
        renderHistory,
        stopCurrentRequest,  // 添加停止请求功能
        getCodeFromStore: (blockId) => state.codeBlockStore[blockId] || '',
        getMessageQueueLength: () => state.messageQueue.length
    };
})();


// =====================================================
// 模块: main.js
// =====================================================

// ==================== 主入口模块 (重构版) ====================
// 使用模块化架构，降低耦合度

(function() {
    'use strict';
    
    // 标记是否已经初始化
    let isInitialized = false;
    
    /**
     * 初始化应用
     */
    async function init() {
        // 防止重复初始化
        if (isInitialized) {
            console.log('⚠️ 应用已初始化，跳过');
            return;
        }
        isInitialized = true;
        
        console.log('🚀 AI Agent 正在启动...');
        
        try {
            // 1. 初始化核心模块
            await initCoreModules();
            console.log('✅ 核心模块已初始化');
            
            // 2. 初始化业务模块
            await initBusinessModules();
            console.log('✅ 业务模块已初始化');
            
            // 3. 设置事件监听
            setupEventListeners();
            console.log('✅ 事件监听已设置');
            
            // 4. 创建启动按钮
            createLauncherButton();
            console.log('✅ 启动按钮已创建');
            
            // 5. 启动应用
            startApplication();
            console.log('🎉 AI Agent 启动成功!');
            
        } catch (error) {
            console.error('❌ 启动失败:', error);
            EventManager?.emit(EventManager.EventTypes.APP_ERROR, { error });
        }
    }
    
    /**
     * 初始化核心模块
     */
    async function initCoreModules() {
        // 初始化配置管理器（带依赖注入）
        await ConfigManager.init({
            eventManager: EventManager
        });
        
        // 初始化历史管理器
        await HistoryManager.init();
        
        // 初始化状态管理器
        await StateManager.init();
        
        console.log('✅ 核心模块加载完成');
    }
    
    /**
     * 初始化业务模块
     */
    async function initBusinessModules() {
        const config = ConfigManager.getAll();
        
        // 初始化各模块
        try {
            // 先加载对话历史，判断是否首次使用
            const history = HistoryManager.getHistory();
            const isFirstUse = history.length === 0;
            
            // 检查聊天窗口状态
            const cachedVisibility = StateManager.getChatVisibility();
            
            // 初始化UI
            UIManager.createAssistant(config);
            
            // 根据状态显示/隐藏聊天窗口
            // 默认隐藏，需要用户点击按钮唤醒
            if (cachedVisibility) {
                // 状态为打开：显示 + 加载历史
                UIManager.show();
                ChatManager.renderHistory(history);
            } else {
                // 默认隐藏（包括首次使用）
                UIManager.hide();
            }
            
        } catch (error) {
            console.error('❌ 业务模块初始化失败:', error);
            throw error;
        }
    }

    /**
     * 设置全局事件监听（简化版）
     * @returns {Array<number>} 监听器 ID 列表
     */
    function setupEventListeners() {
        const { EventTypes } = EventManager;
        const listenerIds = [];
        
        // 聊天消息发送事件 - 直接调用 ChatManager.handleMessage
        listenerIds.push(
            EventManager.on(EventTypes.CHAT_MESSAGE_SENT, async (message) => {
                await ChatManager.handleMessage(message);
            })
        );
        
        // 打开设置事件
        listenerIds.push(
            EventManager.on(EventTypes.SETTINGS_OPEN, () => {
                UIManager.showSettings();
            })
        );
        
        // 清空聊天事件
        listenerIds.push(
            EventManager.on(EventTypes.CHAT_CLEAR, () => {
                ChatManager.clearChat();
            })
        );
        
        // 执行代码事件
        listenerIds.push(
            EventManager.on('agent:execute:code', (code) => {
                ChatManager.executeJavaScript(code);
            })
        );
        
        // 停止请求事件
        listenerIds.push(
            EventManager.on('agent:stop:request', () => {
                ChatManager.stopCurrentRequest();
            })
        );
        
        // 打开/关闭 Agent 窗口事件
        listenerIds.push(
            EventManager.on(EventTypes.AGENT_OPEN, async () => {
                UIManager.show();
                StateManager.saveChatVisibility(true);
                
                // 加载历史记录（如果有的话）
                const history = HistoryManager.getHistory();
                if (history.length > 0) {
                    ChatManager.renderHistory(history);
                }
            })
        );
        
        listenerIds.push(
            EventManager.on(EventTypes.AGENT_CLOSE, () => {
                // 注意：UIManager.hide() 已经在 ui.js 中调用过了，这里不需要再次调用
                // 只需要保存状态和记录日志
                StateManager.saveChatVisibility(false);
            })
        );
        
        return listenerIds;
    }

    /**
     * 启动应用逻辑
     */
    function startApplication() {
        const config = ConfigManager.getAll();
        
        // 触发应用启动事件
        EventManager.emit(EventManager.EventTypes.APP_STARTED, {
            config: ConfigManager.exportConfig(),
            timestamp: Date.now()
        });
        
        console.log('🎯 应用已启动，等待用户交互...');
    }

    /**
     * 创建启动按钮
     * @returns {number|null} 监听器 ID
     */
    function createLauncherButton() {
        // 检查是否已存在启动按钮
        if (document.getElementById('agent-launcher-btn')) {
            console.log('🔘 启动按钮已存在，跳过创建');
            return null;
        }

        setTimeout(() => {
            const badge = document.createElement('div');
            badge.id = 'agent-launcher-btn';
            badge.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 50%;
                font-size: 24px;
                font-family: -apple-system, sans-serif;
                z-index: 999998;
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                border: none;
            `;
            badge.textContent = '🤖';
            badge.title = '点击打开 AI Agent';
            
            // 根据聊天窗口状态决定按钮初始显示状态
            const isChatVisible = StateManager.getChatVisibility();
            if (isChatVisible) {
                badge.style.display = 'none';
            }
            
            // 悬停效果
            badge.addEventListener('mouseenter', () => {
                badge.style.transform = 'scale(1.1)';
                badge.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
            });
            
            badge.addEventListener('mouseleave', () => {
                badge.style.transform = 'scale(1)';
                badge.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)';
            });
            
            badge.addEventListener('click', () => {
                // 使用事件系统打开 Agent
                EventManager.emit(EventManager.EventTypes.AGENT_OPEN);
                
                // 点击后隐藏按钮（Agent 打开后不需要显示）
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(0)';
                badge.style.opacity = '0';
                setTimeout(() => {
                    badge.style.display = 'none';
                }, 300);
            });
            
            document.body.appendChild(badge);
            
            // 监听 Agent 关闭事件，重新显示按钮
            const listenerId = EventManager.on(EventManager.EventTypes.AGENT_CLOSE, () => {
                badge.style.display = 'flex';
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(1)';
                badge.style.opacity = '1';
            });
            
            console.log('🔘 AI Agent 启动按钮已创建（右下角圆形按钮）');
            return listenerId;
        }, 1000);
    }

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init();
        });
    } else {
        // DOM 已经加载完成，直接初始化
        // 使用 setTimeout 确保在下一个事件循环中执行，避免潜在的问题
        setTimeout(() => {
            init();
        }, 0);
    }

})();

