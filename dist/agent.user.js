// ==UserScript==
// @name         Free Web AI Agent
// @namespace    https://github.com/chensiyi1994
// @version      3.9.8
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
// 版本: 3.9.8
// 日期: 2026-04-18
// 模块数: 16


// =====================================================
// 模块: core/utils.js
// =====================================================

// ==================== 工具函数模块 ====================
// 提供通用的工具函数，避免代码重复

const Utils = (function() {
    'use strict';
    
    // 调试模式开关（生产环境设为 false）
    const DEBUG_MODE = false; // 发布模式已关闭调试日志
    
    /**
     * 条件日志输出（仅在 DEBUG_MODE 为 true 时输出）
     */
    function debugLog(...args) {
        if (DEBUG_MODE) {
            console.log(...args);
        }
    }
    
    function debugWarn(...args) {
        if (DEBUG_MODE) {
            console.warn(...args);
        }
    }
    
    function debugError(...args) {
        if (DEBUG_MODE) {
            console.error(...args);
        }
    }
    
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
        getDomainKey,
        debugLog,
        debugWarn,
        debugError
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
// 模块: core/ErrorTracker.js
// =====================================================

// ==================== 错误追踪模块 ====================
// v4.0.0: 统一的错误处理和日志系统
// 负责错误收集、分类、报告和展示

const ErrorTracker = (function() {
    'use strict';

    // 私有变量
    const errors = [];
    const MAX_ERRORS = 100; // 最多保留 100 个错误
    const listeners = []; // 错误监听器

    /**
     * 错误级别枚举
     */
    const ErrorLevel = {
        DEBUG: 'DEBUG',
        INFO: 'INFO',
        WARN: 'WARN',
        ERROR: 'ERROR',
        FATAL: 'FATAL'
    };

    /**
     * 错误分类枚举
     */
    const ErrorCategory = {
        NETWORK: 'NETWORK',           // 网络错误
        API: 'API',                   // API 调用错误
        DOM: 'DOM',                   // DOM 操作错误
        CONFIG: 'CONFIG',             // 配置错误
        VALIDATION: 'VALIDATION',     // 验证错误
        EXECUTION: 'EXECUTION',       // 代码执行错误
        UNKNOWN: 'UNKNOWN'            // 未知错误
    };

    /**
     * 记录错误
     * @param {Error|string} error - 错误对象或消息
     * @param {Object} context - 上下文信息
     * @param {string} category - 错误分类
     * @param {string} level - 错误级别
     */
    function report(error, context = {}, category = ErrorCategory.UNKNOWN, level = ErrorLevel.ERROR) {
        const errorRecord = {
            id: generateId(),
            timestamp: Date.now(),
            level: level,
            category: category,
            message: typeof error === 'string' ? error : error.message,
            stack: error instanceof Error ? error.stack : null,
            context: context,
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        // 添加到错误列表
        errors.push(errorRecord);

        // 限制数量
        if (errors.length > MAX_ERRORS) {
            errors.shift(); // 移除最旧的错误
        }

        // 保存到本地存储（最近 10 个错误）
        saveToStorage();

        // 通知监听器
        notifyListeners(errorRecord);

        // 根据级别输出到控制台
        outputToConsole(errorRecord);

        return errorRecord.id;
    }

    /**
     * 获取最近的错误
     * @param {number} count - 获取数量
     * @returns {Array} 错误列表
     */
    function getRecentErrors(count = 10) {
        return errors.slice(-count).map(err => ({
            ...err,
            timeAgo: formatTimeAgo(err.timestamp)
        }));
    }

    /**
     * 获取指定分类的错误
     * @param {string} category - 错误分类
     * @returns {Array} 错误列表
     */
    function getErrorsByCategory(category) {
        return errors.filter(err => err.category === category);
    }

    /**
     * 获取指定级别的错误
     * @param {string} level - 错误级别
     * @returns {Array} 错误列表
     */
    function getErrorsByLevel(level) {
        return errors.filter(err => err.level === level);
    }

    /**
     * 获取错误统计信息
     * @returns {Object} 统计数据
     */
    function getStats() {
        const stats = {
            total: errors.length,
            byLevel: {},
            byCategory: {},
            lastHour: 0,
            last24Hours: 0
        };

        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const oneDay = 24 * 60 * 60 * 1000;

        errors.forEach(err => {
            // 按级别统计
            stats.byLevel[err.level] = (stats.byLevel[err.level] || 0) + 1;

            // 按分类统计
            stats.byCategory[err.category] = (stats.byCategory[err.category] || 0) + 1;

            // 时间统计
            if (now - err.timestamp < oneHour) {
                stats.lastHour++;
            }
            if (now - err.timestamp < oneDay) {
                stats.last24Hours++;
            }
        });

        return stats;
    }

    /**
     * 清除所有错误
     */
    function clear() {
        errors.length = 0;
        GM_setValue('error_tracker_errors', []);
        console.log('[ErrorTracker] 已清除所有错误记录');
    }

    /**
     * 导出错误报告
     * @returns {string} JSON 格式的错误报告
     */
    function exportReport() {
        const report = {
            exportedAt: new Date().toISOString(),
            totalErrors: errors.length,
            stats: getStats(),
            errors: getRecentErrors(errors.length)
        };

        return JSON.stringify(report, null, 2);
    }

    /**
     * 注册错误监听器
     * @param {Function} callback - 回调函数
     * @returns {string} 监听器 ID
     */
    function addListener(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('Listener must be a function');
        }

        const listenerId = generateId();
        listeners.push({ id: listenerId, callback });

        return listenerId;
    }

    /**
     * 移除错误监听器
     * @param {string} listenerId - 监听器 ID
     */
    function removeListener(listenerId) {
        const index = listeners.findIndex(l => l.id === listenerId);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }

    /**
     * 显示错误面板（UI 展示）
     */
    function showPanel() {
        // TODO: 实现错误面板 UI
        const recentErrors = getRecentErrors(20);
        const stats = getStats();

        let html = `
            <div style="padding: 20px; max-height: 500px; overflow-y: auto;">
                <h3 style="margin-top: 0;">🐛 错误追踪面板</h3>
                
                <div style="margin-bottom: 20px; padding: 10px; background: #f0f0f0; border-radius: 4px;">
                    <strong>统计信息：</strong><br>
                    总错误数: ${stats.total}<br>
                    最近1小时: ${stats.lastHour}<br>
                    最近24小时: ${stats.last24Hours}<br>
                    <br>
                    按级别: ${JSON.stringify(stats.byLevel)}<br>
                    按分类: ${JSON.stringify(stats.byCategory)}
                </div>
        `;

        if (recentErrors.length === 0) {
            html += '<p style="color: #10b981;">✅ 没有错误记录</p>';
        } else {
            html += '<div style="border-top: 1px solid #ddd; padding-top: 10px;">';
            html += '<strong>最近错误：</strong><br><br>';

            recentErrors.forEach(err => {
                const levelColor = {
                    'DEBUG': '#6b7280',
                    'INFO': '#3b82f6',
                    'WARN': '#f59e0b',
                    'ERROR': '#ef4444',
                    'FATAL': '#dc2626'
                }[err.level] || '#000';

                html += `
                    <div style="margin-bottom: 10px; padding: 8px; border-left: 3px solid ${levelColor}; background: #fafafa;">
                        <div style="font-size: 12px; color: #666;">
                            [${err.timeAgo}] [${err.level}] [${err.category}]
                        </div>
                        <div style="margin: 4px 0; color: #333;">
                            ${escapeHtml(err.message)}
                        </div>
                        ${err.context && Object.keys(err.context).length > 0 ? 
                            `<div style="font-size: 11px; color: #666;">
                                上下文: ${JSON.stringify(err.context)}
                            </div>` : ''}
                    </div>
                `;
            });

            html += '</div>';
        }

        html += `
                <div style="margin-top: 20px; text-align: right;">
                    <button onclick="ErrorTracker.clear()" 
                            style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        🗑️ 清除所有错误
                    </button>
                    <button onclick="console.log(ErrorTracker.exportReport())" 
                            style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 8px;">
                        📋 导出报告
                    </button>
                </div>
            </div>
        `;

        // 创建模态框显示
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background: white;
            border-radius: 8px;
            max-width: 800px;
            width: 90%;
            max-height: 80vh;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;
        panel.innerHTML = html;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    }

    // ==================== 私有函数 ====================

    /**
     * 生成唯一 ID
     */
    function generateId() {
        return 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 格式化时间为相对时间
     */
    function formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}天前`;
        if (hours > 0) return `${hours}小时前`;
        if (minutes > 0) return `${minutes}分钟前`;
        return `${seconds}秒前`;
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
     * 保存到本地存储
     */
    function saveToStorage() {
        try {
            // 只保存最近 10 个错误
            const toSave = errors.slice(-10);
            GM_setValue('error_tracker_errors', toSave);
        } catch (e) {
            console.error('[ErrorTracker] 保存错误失败:', e);
        }
    }

    /**
     * 从本地存储加载
     */
    function loadFromStorage() {
        try {
            const saved = GM_getValue('error_tracker_errors', []);
            if (Array.isArray(saved) && saved.length > 0) {
                errors.push(...saved);
            }
        } catch (e) {
            console.error('[ErrorTracker] 加载错误失败:', e);
        }
    }

    /**
     * 通知监听器
     */
    function notifyListeners(errorRecord) {
        listeners.forEach(listener => {
            try {
                listener.callback(errorRecord);
            } catch (e) {
                console.error('[ErrorTracker] 监听器执行失败:', e);
            }
        });
    }

    /**
     * 输出到控制台
     */
    function outputToConsole(errorRecord) {
        const prefix = `[ErrorTracker][${errorRecord.level}]`;
        const message = `${prefix} ${errorRecord.message}`;

        switch (errorRecord.level) {
            case ErrorLevel.DEBUG:
                console.debug(message, errorRecord.context);
                break;
            case ErrorLevel.INFO:
                console.info(message, errorRecord.context);
                break;
            case ErrorLevel.WARN:
                console.warn(message, errorRecord.context);
                break;
            case ErrorLevel.ERROR:
            case ErrorLevel.FATAL:
                console.error(message, errorRecord.context);
                if (errorRecord.stack) {
                    console.error('Stack:', errorRecord.stack);
                }
                break;
        }
    }

    /**
     * 初始化
     */
    function init() {
        loadFromStorage();
        console.log('[ErrorTracker] 初始化完成，已加载', errors.length, '个历史错误');

        // 捕获全局错误
        window.addEventListener('error', (event) => {
            report(event.error || event.message, {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            }, ErrorCategory.UNKNOWN, ErrorLevel.ERROR);
        });

        // 捕获未处理的 Promise 拒绝
        window.addEventListener('unhandledrejection', (event) => {
            report(event.reason || 'Unhandled Promise Rejection', {
                type: 'unhandledrejection'
            }, ErrorCategory.EXECUTION, ErrorLevel.ERROR);
        });
    }

    // 公开接口
    return {
        init,
        report,
        getRecentErrors,
        getErrorsByCategory,
        getErrorsByLevel,
        getStats,
        clear,
        exportReport,
        addListener,
        removeListener,
        showPanel,
        ErrorLevel,
        ErrorCategory
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
// 模块: core/ShortcutManager.js
// =====================================================

// ==================== 快捷键管理器 ====================
// 统一管理全局快捷键，支持注册、注销和条件触发

const ShortcutManager = (function() {
    'use strict';
    
    // 快捷键注册表：key -> {callback, description, enabled}
    const shortcutRegistry = new Map();
    
    // 全局键盘事件处理器引用
    let globalKeyHandler = null;
    
    /**
     * 初始化快捷键系统
     */
    function init() {
        console.log('⌨️ 初始化快捷键系统');
        
        // 创建全局键盘事件处理器
        globalKeyHandler = handleGlobalKeyDown;
        
        // 绑定到 document
        document.addEventListener('keydown', globalKeyHandler);
        
        console.log('✅ 快捷键系统已启动');
    }
    
    /**
     * 销毁快捷键系统
     */
    function destroy() {
        if (globalKeyHandler) {
            document.removeEventListener('keydown', globalKeyHandler);
            globalKeyHandler = null;
        }
        shortcutRegistry.clear();
        console.log('🗑️ 快捷键系统已销毁');
    }
    
    /**
     * 注册快捷键
     * @param {string} keyCombo - 快捷键组合，如 'Ctrl+Enter', 'Escape', 'Ctrl+ArrowUp'
     * @param {Function} callback - 回调函数
     * @param {string} description - 描述（用于显示）
     * @param {Object} options - 选项
     * @param {boolean} options.enabled - 是否启用（默认 true）
     * @param {boolean} options.preventDefault - 是否阻止默认行为（默认 true）
     * @param {boolean} options.stopPropagation - 是否停止传播（默认 false）
     */
    function register(keyCombo, callback, description = '', options = {}) {
        const normalizedKey = normalizeKeyCombo(keyCombo);
        
        shortcutRegistry.set(normalizedKey, {
            callback,
            description,
            enabled: options.enabled !== false,
            preventDefault: options.preventDefault !== false,
            stopPropagation: options.stopPropagation === true
        });
        
        console.log(`⌨️ 注册快捷键: ${normalizedKey} - ${description}`);
    }
    
    /**
     * 注销快捷键
     * @param {string} keyCombo - 快捷键组合
     */
    function unregister(keyCombo) {
        const normalizedKey = normalizeKeyCombo(keyCombo);
        const removed = shortcutRegistry.delete(normalizedKey);
        
        if (removed) {
            console.log(`🗑️ 注销快捷键: ${normalizedKey}`);
        }
        
        return removed;
    }
    
    /**
     * 检查快捷键是否已注册
     * @param {string} keyCombo - 快捷键组合
     * @returns {boolean}
     */
    function isRegistered(keyCombo) {
        const normalizedKey = normalizeKeyCombo(keyCombo);
        return shortcutRegistry.has(normalizedKey);
    }
    
    /**
     * 启用/禁用快捷键
     * @param {string} keyCombo - 快捷键组合
     * @param {boolean} enabled - 是否启用
     */
    function setEnabled(keyCombo, enabled) {
        const normalizedKey = normalizeKeyCombo(keyCombo);
        const shortcut = shortcutRegistry.get(normalizedKey);
        
        if (shortcut) {
            shortcut.enabled = enabled;
            console.log(`⚙️ 快捷键 ${normalizedKey} ${enabled ? '已启用' : '已禁用'}`);
        }
    }
    
    /**
     * 获取所有已注册的快捷键
     * @returns {Array} 快捷键列表
     */
    function getAllShortcuts() {
        const shortcuts = [];
        shortcutRegistry.forEach((value, key) => {
            shortcuts.push({
                keyCombo: key,
                description: value.description,
                enabled: value.enabled
            });
        });
        return shortcuts;
    }
    
    /**
     * 标准化快捷键组合字符串
     * @param {string} keyCombo - 原始快捷键组合
     * @returns {string} 标准化后的组合
     */
    function normalizeKeyCombo(keyCombo) {
        // 转换为小写，去除空格
        return keyCombo.toLowerCase().replace(/\s+/g, '');
    }
    
    /**
     * 解析按键事件为快捷键组合字符串
     * @param {KeyboardEvent} e - 键盘事件
     * @returns {string} 快捷键组合字符串
     */
    function parseKeyEvent(e) {
        const parts = [];
        
        // 添加修饰键
        if (e.ctrlKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        if (e.metaKey) parts.push('meta');
        
        // 添加主键
        const key = e.key.toLowerCase();
        
        // 特殊键名映射
        const specialKeys = {
            'arrowup': 'arrowup',
            'arrowdown': 'arrowdown',
            'arrowleft': 'arrowleft',
            'arrowright': 'arrowright',
            'escape': 'escape',
            'enter': 'enter',
            ' ': 'space',
            'tab': 'tab',
            'backspace': 'backspace',
            'delete': 'delete'
        };
        
        const mainKey = specialKeys[key] || key;
        parts.push(mainKey);
        
        return parts.join('+');
    }
    
    /**
     * 全局键盘事件处理器
     * @param {KeyboardEvent} e - 键盘事件
     */
    function handleGlobalKeyDown(e) {
        const keyCombo = parseKeyEvent(e);
        const shortcut = shortcutRegistry.get(keyCombo);
        
        if (!shortcut || !shortcut.enabled) {
            return;
        }
        
        // 执行回调
        try {
            const shouldPreventDefault = shortcut.callback(e) !== false;
            
            // 根据配置决定是否阻止默认行为
            if (shouldPreventDefault && shortcut.preventDefault) {
                e.preventDefault();
            }
            
            // 根据配置决定是否停止传播
            if (shortcut.stopPropagation) {
                e.stopPropagation();
            }
            
            console.log(`⌨️ 触发快捷键: ${keyCombo}`);
        } catch (error) {
            console.error(`❌ 快捷键 ${keyCombo} 执行失败:`, error);
        }
    }
    
    // 导出公共接口
    return {
        init,
        destroy,
        register,
        unregister,
        isRegistered,
        setEnabled,
        getAllShortcuts
    };
})();


// =====================================================
// 模块: core/ProviderManager.js
// =====================================================

/**
 * ProviderManager - 模型提供商管理器
 * 
 * 功能：
 * 1. 管理多个模型提供商（OpenRouter、LM Studio、Ollama 等）
 * 2. 支持多种 API 模板（OpenAI、Anthropic、Ollama 等）
 * 3. 提供商配置的持久化（按域名隔离）
 * 4. 本地服务自动发现
 */

// 注意：此文件通过 build.js 合并，EventManager 和 ConfigManager 已在全局作用域

// ==================== 模型模板定义 ====================

const ModelTemplates = {
    /**
     * OpenAI 兼容模板
     * 适用于：OpenAI、OpenRouter、LM Studio、Azure OpenAI 等
     */
    OPENAI: {
        name: 'OpenAI Compatible',
        endpoint: '{baseUrl}/chat/completions',
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }),
        buildRequest: (model, messages, params) => ({
            model,
            messages,
            stream: true,
            ...params
        }),
        parseResponse: (response) => response.choices?.[0]?.message?.content || '',
        parseStreamChunk: (chunk) => chunk.choices?.[0]?.delta?.content || '',
        isStreamFinished: (chunk) => chunk.choices?.[0]?.finish_reason === 'stop'
    },

    /**
     * Anthropic Claude 模板
     * 适用于：Anthropic API
     */
    ANTHROPIC: {
        name: 'Anthropic Claude',
        endpoint: '{baseUrl}/messages',
        headers: (apiKey) => ({
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'messages-2023-12-15',
            'Content-Type': 'application/json'
        }),
        buildRequest: (model, messages, params) => {
            // Anthropic 不支持 system 角色，需要特殊处理
            const systemMessage = messages.find(m => m.role === 'system');
            const chatMessages = messages.filter(m => m.role !== 'system');
            
            return {
                model,
                messages: chatMessages.map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content
                })),
                system: systemMessage?.content,
                stream: true,
                max_tokens: params.max_tokens || 4096,
                ...params
            };
        },
        parseResponse: (response) => response.content?.[0]?.text || '',
        parseStreamChunk: (chunk) => {
            if (chunk.type === 'content_block_delta') {
                return chunk.delta?.text || '';
            }
            return '';
        },
        isStreamFinished: (chunk) => chunk.type === 'message_stop'
    },

    /**
     * Ollama 本地模板
     * 适用于：Ollama 本地服务
     */
    OLLAMA: {
        name: 'Ollama Local',
        endpoint: '{baseUrl}/api/chat',
        headers: () => ({
            'Content-Type': 'application/json'
        }),
        buildRequest: (model, messages, params) => ({
            model,
            messages,
            stream: true,
            options: {
                temperature: params.temperature,
                top_p: params.top_p,
                num_predict: params.max_tokens
            }
        }),
        parseResponse: (response) => response.message?.content || '',
        parseStreamChunk: (chunk) => chunk.message?.content || '',
        isStreamFinished: (chunk) => chunk.done === true
    },

    /**
     * Google Gemini 模板
     * 适用于：Google AI Studio
     */
    GEMINI: {
        name: 'Google Gemini',
        endpoint: '{baseUrl}/models/{model}:streamGenerateContent?alt=sse&key={apiKey}',
        headers: () => ({
            'Content-Type': 'application/json'
        }),
        buildRequest: (model, messages, params) => {
            // Gemini 的消息格式转换
            const contents = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));
            
            return {
                contents,
                generationConfig: {
                    temperature: params.temperature,
                    topP: params.top_p,
                    maxOutputTokens: params.max_tokens
                }
            };
        },
        parseResponse: (response) => {
            const candidates = response.candidates;
            return candidates?.[0]?.content?.parts?.[0]?.text || '';
        },
        parseStreamChunk: (chunk) => {
            // Gemini SSE 格式特殊，需要解析 data: 行
            return chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        },
        isStreamFinished: (chunk) => chunk.candidates?.[0]?.finishReason === 'STOP'
    }
};

// ==================== 默认提供商配置 ====================

const DEFAULT_PROVIDERS = [
    {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        template: 'OPENAI',
        enabled: true,
        priority: 1,
        models: [],  // 动态加载
        autoDiscover: false
    }
];

// ==================== 官方供应商预设模板 ====================

const OFFICIAL_PROVIDER_TEMPLATES = {
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        template: 'OPENAI',
        priority: 1,
        description: '多模型聚合平台，支持 200+ 模型',
        website: 'https://openrouter.ai'
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: '',
        template: 'ANTHROPIC',
        priority: 2,
        description: 'Claude 系列模型，强大的推理能力',
        website: 'https://console.anthropic.com'
    },
    google: {
        id: 'google',
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        template: 'GEMINI',
        priority: 3,
        description: 'Gemini 系列模型，免费额度充足',
        website: 'https://aistudio.google.com'
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        template: 'OPENAI',
        priority: 4,
        description: 'GPT-4、GPT-3.5 等官方模型',
        website: 'https://platform.openai.com'
    },
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        template: 'OPENAI',
        priority: 5,
        description: 'DeepSeek-V3 等国产优秀模型',
        website: 'https://platform.deepseek.com'
    },
    zhipu: {
        id: 'zhipu',
        name: '智谱 AI',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: '',
        template: 'OPENAI',
        priority: 6,
        description: 'GLM 系列模型，中文优化',
        website: 'https://open.bigmodel.cn'
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama (本地)',
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        template: 'OLLAMA',
        priority: 10,
        description: '本地运行的开源模型',
        website: 'https://ollama.ai',
        isLocal: true
    },
    lmstudio: {
        id: 'lm-studio',
        name: 'LM Studio (本地)',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: '',
        template: 'OPENAI',
        priority: 11,
        description: '本地 GUI 工具，支持多种模型',
        website: 'https://lmstudio.ai',
        isLocal: true
    }
};

// ==================== ProviderManager 核心逻辑 ====================

let providers = [];
let templates = { ...ModelTemplates };

/**
 * 初始化 ProviderManager
 */
async function init() {
    await loadProviders();
    
    // 如果没有提供商，使用默认配置
    if (providers.length === 0) {
        providers = [...DEFAULT_PROVIDERS];
        await saveProviders();
    }
    
    console.log('[ProviderManager] Initialized with', providers.length, 'providers');
}

/**
 * 加载提供商配置
 */
async function loadProviders() {
    try {
        const saved = GM_getValue('providers', []);
        providers = Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.error('[ProviderManager] Failed to load providers:', error);
        providers = [];
    }
}

/**
 * 保存提供商配置
 */
async function saveProviders() {
    try {
        GM_setValue('providers', providers);
    } catch (error) {
        console.error('[ProviderManager] Failed to save providers:', error);
    }
}

/**
 * 获取所有提供商
 */
function getAllProviders() {
    return providers.map(p => ({
        ...p,
        apiKey: p.apiKey ? '***' + p.apiKey.slice(-4) : ''  // 隐藏 API Key
    }));
}

/**
 * 获取启用的提供商（按优先级排序）
 */
function getEnabledProviders() {
    return providers
        .filter(p => p.enabled)
        .sort((a, b) => a.priority - b.priority);
}

/**
 * 获取单个提供商（包含完整信息，包括 API Key）
 */
function getProviderById(id) {
    return providers.find(p => p.id === id);
}

/**
 * 根据模型 ID 查找对应的提供商
 */
function getProviderByModel(modelId) {
    for (const provider of providers) {
        if (!provider.enabled) continue;
        
        // 检查模型是否属于该提供商
        if (provider.models.some(m => m.id === modelId)) {
            return provider;
        }
    }
    
    // 如果没找到，返回第一个启用的提供商（向后兼容）
    return getEnabledProviders()[0] || null;
}

/**
 * 添加提供商
 */
async function addProvider(provider) {
    // 验证必填字段
    if (!provider.id || !provider.name || !provider.baseUrl || !provider.template) {
        throw new Error('Provider must have id, name, baseUrl, and template');
    }
    
    // 检查 ID 是否已存在
    if (providers.some(p => p.id === provider.id)) {
        throw new Error(`Provider with id "${provider.id}" already exists`);
    }
    
    // 设置默认值
    const newProvider = {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey || '',
        template: provider.template,
        enabled: provider.enabled !== undefined ? provider.enabled : true,
        priority: provider.priority || providers.length + 1,
        models: provider.models || [],
        autoDiscover: provider.autoDiscover || false,
        createdAt: Date.now()
    };
    
    providers.push(newProvider);
    await saveProviders();
    
    EventManager.emit('providerAdded', newProvider);
    console.log('[ProviderManager] Added provider:', newProvider.id);
    
    return newProvider;
}

/**
 * 更新提供商
 */
async function updateProvider(id, updates) {
    const index = providers.findIndex(p => p.id === id);
    if (index === -1) {
        throw new Error(`Provider "${id}" not found`);
    }
    
    // 不允许修改 ID
    if (updates.id && updates.id !== id) {
        throw new Error('Cannot change provider ID');
    }
    
    providers[index] = {
        ...providers[index],
        ...updates,
        updatedAt: Date.now()
    };
    
    await saveProviders();
    
    EventManager.emit('providerUpdated', providers[index]);
    console.log('[ProviderManager] Updated provider:', id);
    
    return providers[index];
}

/**
 * 删除提供商
 */
async function deleteProvider(id) {
    const index = providers.findIndex(p => p.id === id);
    if (index === -1) {
        throw new Error(`Provider "${id}" not found`);
    }
    
    const deleted = providers.splice(index, 1)[0];
    await saveProviders();
    
    EventManager.emit('providerDeleted', deleted);
    console.log('[ProviderManager] Deleted provider:', id);
    
    return deleted;
}

/**
 * 为提供商添加模型
 */
async function addModelsToProvider(providerId, models) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        throw new Error(`Provider "${providerId}" not found`);
    }
    
    // 合并模型列表（去重）
    const existingIds = new Set(provider.models.map(m => m.id));
    const newModels = models.filter(m => !existingIds.has(m.id));
    
    provider.models = [
        ...provider.models,
        ...newModels.map(m => ({
            id: m.id,
            name: m.name || m.id,
            provider: providerId,
            ...m
        }))
    ];
    
    await saveProviders();
    
    EventManager.emit('modelsUpdated', providerId);
    console.log('[ProviderManager] Added', newModels.length, 'models to', providerId);
    
    return provider.models;
}

/**
 * 清除提供商的模型列表
 */
async function clearProviderModels(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        throw new Error(`Provider "${providerId}" not found`);
    }
    
    provider.models = [];
    await saveProviders();
    
    EventManager.emit('modelsCleared', providerId);
    console.log('[ProviderManager] Cleared models for', providerId);
}

/**
 * 获取所有可用模型（来自所有启用的提供商）
 */
function getAllAvailableModels() {
    const allModels = [];
    
    for (const provider of providers) {
        if (!provider.enabled) continue;
        
        for (const model of provider.models) {
            allModels.push({
                ...model,
                providerId: provider.id,
                providerName: provider.name,
                template: provider.template
            });
        }
    }
    
    return allModels;
}

/**
 * 获取所有可用的模板
 */
function getAvailableTemplates() {
    return Object.keys(templates).map(key => ({
        id: key,
        name: templates[key].name
    }));
}

/**
 * 获取官方供应商预设模板列表
 */
function getOfficialProviderTemplates() {
    return Object.values(OFFICIAL_PROVIDER_TEMPLATES);
}

/**
 * 根据 ID 获取官方供应商预设模板
 */
function getOfficialProviderTemplateById(id) {
    return OFFICIAL_PROVIDER_TEMPLATES[id] || null;
}

/**
 * 获取模板详情
 */
function getTemplate(templateId) {
    return templates[templateId] || null;
}

/**
 * 注册自定义模板
 */
function registerTemplate(id, template) {
    if (templates[id]) {
        console.warn('[ProviderManager] Template', id, 'already exists, overwriting');
    }
    
    templates[id] = template;
    console.log('[ProviderManager] Registered template:', id);
}

/**
 * 测试提供商连接
 */
async function testProviderConnection(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        throw new Error(`Provider "${providerId}" not found`);
    }
    
    const template = templates[provider.template];
    if (!template) {
        throw new Error(`Template "${provider.template}" not found`);
    }
    
    try {
        // 构建测试请求
        const testEndpoint = template.endpoint
            .replace('{baseUrl}', provider.baseUrl)
            .replace('{apiKey}', provider.apiKey || '')
            .replace('{model}', 'test');
        
        const headers = template.headers(provider.apiKey);
        const requestBody = template.buildRequest('test', [
            { role: 'user', content: 'Hello' }
        ], {});
        
        // 发送测试请求（使用 GM_xmlhttpRequest）
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: testEndpoint,
                headers,
                data: JSON.stringify(requestBody),
                timeout: 10000,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve({
                            success: true,
                            message: 'Connection successful',
                            status: response.status
                        });
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: (error) => {
                    reject(new Error(`Connection failed: ${error}`));
                },
                ontimeout: () => {
                    reject(new Error('Connection timeout'));
                }
            });
        });
    } catch (error) {
        throw new Error(`Test failed: ${error.message}`);
    }
}

/**
 * 自动发现本地服务（LM Studio、Ollama）
 */
async function autoDiscoverLocalServices() {
    const discovered = [];
    
    // 检测 LM Studio
    try {
        const lmStudioProvider = {
            id: 'lm-studio',
            name: 'LM Studio (Local)',
            baseUrl: 'http://localhost:1234/v1',
            apiKey: '',
            template: 'OPENAI',
            enabled: false,
            priority: 2,
            models: [],
            autoDiscover: true
        };
        
        // 尝试连接
        const result = await testProviderConnectionInternal(lmStudioProvider);
        if (result.success) {
            discovered.push(lmStudioProvider);
            console.log('[ProviderManager] Discovered LM Studio');
        }
    } catch (error) {
        // LM Studio 未运行
    }
    
    // 检测 Ollama
    try {
        const ollamaProvider = {
            id: 'ollama',
            name: 'Ollama (Local)',
            baseUrl: 'http://localhost:11434',
            apiKey: '',
            template: 'OLLAMA',
            enabled: false,
            priority: 3,
            models: [],
            autoDiscover: true
        };
        
        const result = await testProviderConnectionInternal(ollamaProvider);
        if (result.success) {
            discovered.push(ollamaProvider);
            console.log('[ProviderManager] Discovered Ollama');
        }
    } catch (error) {
        // Ollama 未运行
    }
    
    return discovered;
}

/**
 * 内部测试方法（不抛出异常）
 */
async function testProviderConnectionInternal(provider) {
    const template = templates[provider.template];
    if (!template) return { success: false };
    
    try {
        const testEndpoint = template.endpoint
            .replace('{baseUrl}', provider.baseUrl)
            .replace('{apiKey}', provider.apiKey || '');
        
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: testEndpoint,
                timeout: 3000,
                onload: (response) => {
                    resolve({
                        success: response.status >= 200 && response.status < 300
                    });
                },
                onerror: () => resolve({ success: false }),
                ontimeout: () => resolve({ success: false })
            });
        });
    } catch (error) {
        return { success: false };
    }
}

/**
 * v4.0.0: 数据迁移 - 为本地服务自动添加 isLocal 标志
 */
async function migrateProvidersData() {
    console.log('[ProviderManager] ========== 开始数据迁移检查 ==========');
    console.log('[ProviderManager] 当前供应商数量:', providers.length);
    
    const migrated = [];
    
    // 需要标记为本地服务的供应商 ID 模式
    const localPatterns = ['lm-studio', 'ollama', 'localhost'];
    
    for (const provider of providers) {
        console.log(`[ProviderManager] 检查供应商: ${provider.id}, isLocal=${provider.isLocal}, baseUrl=${provider.baseUrl}`);
        
        let shouldMigrate = false;
        
        // 检查是否匹配本地服务模式
        if (!provider.isLocal) {
            // 1. ID 包含本地关键词
            if (localPatterns.some(pattern => provider.id.includes(pattern))) {
                console.log(`[ProviderManager]   -> 匹配 ID 模式`);
                shouldMigrate = true;
            }
            // 2. baseUrl 指向 localhost
            else if (provider.baseUrl && provider.baseUrl.includes('localhost')) {
                console.log(`[ProviderManager]   -> 匹配 localhost URL`);
                shouldMigrate = true;
            }
            // 3. 名称包含"本地"
            else if (provider.name && provider.name.includes('本地')) {
                console.log(`[ProviderManager]   -> 匹配名称`);
                shouldMigrate = true;
            }
        }
        
        if (shouldMigrate) {
            console.log(`[ProviderManager] ✅ 迁移供应商: ${provider.id} -> isLocal=true`);
            provider.isLocal = true;
            migrated.push(provider.id);
        }
    }
    
    if (migrated.length > 0) {
        await saveProviders();
        console.log(`[ProviderManager] ========== 迁移完成: ${migrated.length} 个供应商已更新 ==========`);
    } else {
        console.log('[ProviderManager] ========== 无需迁移 ==========');
    }
    
    return migrated;
}

// ==================== 导出接口 ====================

const ProviderManager = {
    init,
    getAllProviders,
    getEnabledProviders,
    getProviderById,
    getProviderByModel,
    addProvider,
    updateProvider,
    deleteProvider,
    addModelsToProvider,
    clearProviderModels,
    getAllAvailableModels,
    getAvailableTemplates,
    getTemplate,
    registerTemplate,
    getOfficialProviderTemplates,
    getOfficialProviderTemplateById,
    testProviderConnection,
    autoDiscoverLocalServices,
    migrateProvidersData
};


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
                position: relative; /* ✅ v4.0.0: 为调整大小手柄提供定位上下文 */
            }
            
            /* ✅ v4.0.0: 调整大小手柄样式 */
            .resize-handle {
                position: absolute;
                z-index: 10;
                pointer-events: auto !important;
            }
            
            /* 四边手柄 */
            .resize-n { top: -5px; left: 10px; right: 10px; height: 10px; cursor: n-resize; }
            .resize-e { top: 10px; right: -5px; bottom: 10px; width: 10px; cursor: e-resize; }
            .resize-s { bottom: -5px; left: 10px; right: 10px; height: 10px; cursor: s-resize; }
            .resize-w { top: 10px; left: -5px; bottom: 10px; width: 10px; cursor: w-resize; }
            
            /* 四角手柄 */
            .resize-ne { top: -5px; right: -5px; width: 15px; height: 15px; cursor: ne-resize; }
            .resize-nw { top: -5px; left: -5px; width: 15px; height: 15px; cursor: nw-resize; }
            .resize-se { bottom: -5px; right: -5px; width: 15px; height: 15px; cursor: se-resize; }
            .resize-sw { bottom: -5px; left: -5px; width: 15px; height: 15px; cursor: sw-resize; }
            
            /* 鼠标悬停时显示视觉反馈 */
            .resize-handle:hover {
                background: rgba(102, 126, 234, 0.3);
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
            
            /* v4.0.0: 模型选择器样式 */
            #model-selector-bar {
                padding: 8px 16px;
                background: white;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
            .model-select {
                flex: 1;
                padding: 6px 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 13px;
                background: white;
                cursor: pointer;
                transition: border-color 0.2s;
            }
            .model-select:hover {
                border-color: #667eea;
            }
            .model-select:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            .model-status {
                font-size: 11px;
                color: #6b7280;
                white-space: nowrap;
            }
            
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
                transition: all 0.3s ease;
            }
            /* 消息高亮效果 */
            .message-highlighted {
                box-shadow: 0 0 0 3px #fbbf24, 0 4px 12px rgba(251, 191, 36, 0.4);
                transform: scale(1.02);
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
                <!-- ✅ v4.0.0: 调整大小手柄 -->
                <div class="resize-handle resize-n" data-resize="n"></div>
                <div class="resize-handle resize-e" data-resize="e"></div>
                <div class="resize-handle resize-s" data-resize="s"></div>
                <div class="resize-handle resize-w" data-resize="w"></div>
                <div class="resize-handle resize-ne" data-resize="ne"></div>
                <div class="resize-handle resize-nw" data-resize="nw"></div>
                <div class="resize-handle resize-se" data-resize="se"></div>
                <div class="resize-handle resize-sw" data-resize="sw"></div>
                
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
                
                <!-- v4.0.0: 模型选择器 -->
                <div id="model-selector-bar">
                    <select id="main-model-select" class="model-select">
                        <option value="auto">🔄 Auto (智能路由)</option>
                    </select>
                    <span id="model-status" class="model-status"></span>
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
        
        // v4.0.0: 数据迁移（为本地服务添加 isLocal 标志）
        ProviderManager.migrateProvidersData().catch(err => {
            console.error('[UI] Migration failed:', err);
        });
        
        // v4.0.0: 初始化模型选择器
        initializeMainModelSelect(config.model);
        
        // ✅ v4.0.0: 加载保存的窗口大小
        loadWindowSize();
        
        setupEventListeners();
        setupChatEventDelegation();
        setupDragEvents();
        setupResizeEvents(); // ✅ v4.0.0: 设置调整大小功能
        
        return assistant;
    }

    /**
     * 构建主界面 HTML（从 UITemplates 模块获取）
     */
    function buildMainHTML(config) {
        return UITemplates.buildMainHTML(config);
    }
    
    /**
     * v4.0.0: 初始化主界面模型选择器
     */
    async function initializeMainModelSelect(currentModel) {
        const select = document.getElementById('main-model-select');
        const statusSpan = document.getElementById('model-status');
        
        if (!select) {
            console.warn('[UI] Model select not found');
            return;
        }
        
        // 从 ProviderManager 获取所有可用模型
        const models = ProviderManager.getAllAvailableModels();
        
        if (models.length === 0) {
            // 没有模型，显示提示
            if (statusSpan) {
                statusSpan.textContent = '⚠️ 未配置供应商';
                statusSpan.style.color = '#f59e0b';
            }
            return;
        }
        
        // 清空现有选项（保留 Auto）
        select.innerHTML = '<option value="auto">🔄 Auto (智能路由)</option>';
        
        // 按供应商分组添加模型
        const groupedModels = {};
        models.forEach(model => {
            const providerId = model.providerId || model.provider || 'unknown';
            const providerName = model.providerName || providerId;
            
            if (!groupedModels[providerId]) {
                groupedModels[providerId] = { name: providerName, models: [] };
            }
            groupedModels[providerId].models.push(model);
        });
        
        // 添加分组选项
        Object.keys(groupedModels).forEach(providerId => {
            const group = groupedModels[providerId];
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${group.name} (${group.models.length})`;
            
            group.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = getModelDisplayName(model);
                if (model.id === currentModel) {
                    option.selected = true;
                }
                optgroup.appendChild(option);
            });
            
            select.appendChild(optgroup);
        });
        
        // 更新状态显示
        if (statusSpan) {
            const providerCount = ProviderManager.getAllProviders().filter(p => p.enabled).length;
            statusSpan.textContent = `✅ ${models.length} 个模型 | ${providerCount} 个供应商`;
            statusSpan.style.color = '#10b981';
        }
        
        // 绑定变化事件
        select.addEventListener('change', (e) => {
            const selectedModel = e.target.value;
            console.log('[UI] Model select changed to:', selectedModel);
            
            ConfigManager.set('model', selectedModel);
            
            // 验证是否保存成功
            const savedModel = ConfigManager.get('model');
            console.log('[UI] Model saved to config:', savedModel);
            console.log('[UI] Select value matches config:', selectedModel === savedModel);
        });
        
        console.log('[UI] Model selector initialized with', models.length, 'models');
    }

    /**
     * v4.0.0: 刷新主界面模型选择器（用于供应商列表更新后）
     */
    function refreshMainModelSelect() {
        const select = document.getElementById('main-model-select');
        if (!select) {
            console.warn('[UI] Model select not found for refresh');
            return;
        }
        
        // 获取当前选中的模型
        const currentModel = select.value;
        
        // 重新初始化
        initializeMainModelSelect(currentModel);
        console.log('[UI] Model selector refreshed');
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
     * ✅ v4.0.0: 设置调整大小事件
     */
    function setupResizeEvents() {
        const handles = document.querySelectorAll('.resize-handle');
        let isResizing = false;
        let resizeDirection = '';
        let resizeStartPos = { x: 0, y: 0 };
        let resizeStartSize = { width: 0, height: 0 };
        let resizeStartPos2 = { left: 0, top: 0 }; // 用于记录初始位置
        let resizeRafId = null;
        
        // 最小尺寸限制
        const MIN_WIDTH = 300;
        const MIN_HEIGHT = 400;
        
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                isResizing = true;
                resizeDirection = handle.dataset.resize;
                resizeStartPos.x = e.clientX;
                resizeStartPos.y = e.clientY;
                resizeStartSize.width = assistant.offsetWidth;
                resizeStartSize.height = assistant.offsetHeight;
                resizeStartPos2.left = assistant.offsetLeft;
                resizeStartPos2.top = assistant.offsetTop;
                
                // 添加全局鼠标事件监听
                document.addEventListener('mousemove', handleResizeMove);
                document.addEventListener('mouseup', handleResizeEnd);
            });
        });
        
        function handleResizeMove(e) {
            if (!isResizing) return;
            
            // 使用 requestAnimationFrame 优化性能
            if (resizeRafId !== null) return;
            
            resizeRafId = requestAnimationFrame(() => {
                performResize(e);
                resizeRafId = null;
            });
        }
        
        function performResize(e) {
            const deltaX = e.clientX - resizeStartPos.x;
            const deltaY = e.clientY - resizeStartPos.y;
            
            let newWidth = resizeStartSize.width;
            let newHeight = resizeStartSize.height;
            let newLeft = resizeStartPos2.left;
            let newTop = resizeStartPos2.top;
            
            // 根据拖拽方向计算新尺寸和位置
            if (resizeDirection.includes('e')) {
                // 东边（右）
                newWidth = Math.max(MIN_WIDTH, resizeStartSize.width + deltaX);
            }
            if (resizeDirection.includes('w')) {
                // 西边（左）
                const proposedWidth = Math.max(MIN_WIDTH, resizeStartSize.width - deltaX);
                if (proposedWidth > MIN_WIDTH) {
                    newWidth = proposedWidth;
                    newLeft = resizeStartPos2.left + (resizeStartSize.width - proposedWidth);
                }
            }
            if (resizeDirection.includes('s')) {
                // 南边（下）
                newHeight = Math.max(MIN_HEIGHT, resizeStartSize.height + deltaY);
            }
            if (resizeDirection.includes('n')) {
                // 北边（上）
                const proposedHeight = Math.max(MIN_HEIGHT, resizeStartSize.height - deltaY);
                if (proposedHeight > MIN_HEIGHT) {
                    newHeight = proposedHeight;
                    newTop = resizeStartPos2.top + (resizeStartSize.height - proposedHeight);
                }
            }
            
            // 应用新尺寸和位置
            assistant.style.width = newWidth + 'px';
            assistant.style.height = newHeight + 'px';
            assistant.style.left = newLeft + 'px';
            assistant.style.top = newTop + 'px';
            assistant.style.right = 'auto';
            assistant.style.bottom = 'auto';
        }
        
        function handleResizeEnd() {
            if (!isResizing) return;
            
            isResizing = false;
            resizeDirection = '';
            
            // 取消 pending 的 rAF
            if (resizeRafId !== null) {
                cancelAnimationFrame(resizeRafId);
                resizeRafId = null;
            }
            
            // 移除全局事件监听
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
            
            // 保存窗口大小到本地存储
            saveWindowSize();
        }
        
        console.log('[UI] 调整大小功能已启用');
    }
    
    /**
     * ✅ v4.0.0: 保存窗口大小
     */
    function saveWindowSize() {
        try {
            const size = {
                width: assistant.offsetWidth,
                height: assistant.offsetHeight
            };
            GM_setValue('window_size', size);
        } catch (e) {
            console.error('[UI] 保存窗口大小失败:', e);
        }
    }
    
    /**
     * ✅ v4.0.0: 加载窗口大小
     */
    function loadWindowSize() {
        try {
            const size = GM_getValue('window_size', null);
            if (size && size.width && size.height) {
                assistant.style.width = size.width + 'px';
                assistant.style.height = size.height + 'px';
                return true;
            }
        } catch (e) {
            console.error('[UI] 加载窗口大小失败:', e);
        }
        return false;
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
            Utils.debugError('未找到代码块:', blockId);
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
     * 显示设置对话框（v4.0.0: 异步初始化模型）
     */
    async function showSettings() {
        // 检查是否已经存在设置对话框
        const existingModal = document.getElementById('settings-modal');
        if (existingModal) {
            Utils.debugLog('⚙️ 设置对话框已存在，跳过创建');
            return;
        }
        
        const config = ConfigManager.getAll();
        
        // 添加设置对话框样式
        GM_addStyle(getSettingsStyles());

        const modalHTML = buildSettingsHTML(config);
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // v4.0.0: 异步初始化模型选择
        await initializeModelSelect(config.model);

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
                z-index: 2147483648; /* 比聊天窗口 (2147483647) 高一层 */
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
            
            /* v4.0.0: 标签页样式 */
            .settings-tabs {
                display: flex;
                gap: 8px;
                border-bottom: 2px solid #e5e7eb;
                margin-bottom: 20px;
            }
            .tab-btn {
                padding: 10px 16px;
                border: none;
                background: none;
                cursor: pointer;
                font-size: 14px;
                color: #6b7280;
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
                transition: all 0.2s;
            }
            .tab-btn:hover {
                color: #374151;
                background: #f9fafb;
            }
            .tab-btn.active {
                color: #667eea;
                border-bottom-color: #667eea;
                font-weight: 500;
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            
            /* v4.0.0: 供应商卡片样式 */
            .provider-list {
                max-height: 400px;
                overflow-y: auto;
                margin-bottom: 16px;
            }
            .provider-card {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 12px;
                transition: all 0.2s;
            }
            .provider-card:hover {
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                border-color: #d1d5db;
            }
            .provider-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            .provider-info {
                flex: 1;
            }
            .provider-name {
                font-size: 16px;
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 4px;
            }
            .provider-id {
                font-size: 12px;
                color: #6b7280;
                font-family: monospace;
            }
            .provider-status {
                font-size: 13px;
                font-weight: 500;
            }
            .provider-details {
                background: white;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 12px;
            }
            .provider-detail-row {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                border-bottom: 1px solid #f3f4f6;
                font-size: 13px;
            }
            .provider-detail-row:last-child {
                border-bottom: none;
            }
            .detail-label {
                color: #6b7280;
                font-weight: 500;
            }
            .detail-value {
                color: #374151;
                font-family: monospace;
                max-width: 300px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .provider-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            .add-provider-section {
                margin-top: 16px;
            }
            .provider-form {
                background: #f9fafb;
                border: 2px solid #667eea;
                border-radius: 8px;
                padding: 20px;
                margin-top: 16px;
            }
            
            /* v4.0.0: 表单分隔符 */
            .form-divider {
                text-align: center;
                margin: 16px 0;
                position: relative;
                color: #9ca3af;
                font-size: 13px;
            }
            .form-divider::before,
            .form-divider::after {
                content: '';
                position: absolute;
                top: 50%;
                width: 40%;
                height: 1px;
                background: #e5e7eb;
            }
            .form-divider::before {
                left: 0;
            }
            .form-divider::after {
                right: 0;
            }
            
            /* v4.0.0: 模型列表样式 */
            .models-section {
                margin-top: 12px;
                border-top: 1px solid #e5e7eb;
                padding-top: 12px;
            }
            .models-header {
                font-size: 13px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .models-bulk-actions {
                display: flex;
                gap: 6px;
            }
            .models-bulk-actions button {
                padding: 4px 8px;
                font-size: 11px;
                background: #f3f4f6;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .models-bulk-actions button:hover {
                background: #e5e7eb;
            }
            .models-list {
                max-height: 300px;
                overflow-y: auto;
                background: white;
                border-radius: 6px;
                padding: 8px;
                border: 1px solid #e5e7eb;
            }
            .model-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                font-size: 12px;
                color: #4b5563;
                border-radius: 4px;
                margin-bottom: 4px;
                background: #f9fafb;
                border: 1px solid transparent;
                transition: all 0.2s;
            }
            .model-item:hover {
                background: #f3f4f6;
                border-color: #d1d5db;
            }
            .model-item.dragging {
                opacity: 0.5;
                background: #e0e7ff;
                border-color: #667eea;
            }
            .model-item.disabled {
                opacity: 0.5;
                background: #f3f4f6;
            }
            .model-drag-handle {
                cursor: grab;
                color: #9ca3af;
                font-size: 14px;
                user-select: none;
                padding: 0 4px;
            }
            .model-drag-handle:active {
                cursor: grabbing;
            }
            .model-name {
                flex: 1;
                font-family: monospace;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .model-actions {
                display: flex;
                gap: 4px;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .model-item:hover .model-actions {
                opacity: 1;
            }
            .model-actions button {
                padding: 2px 6px;
                font-size: 12px;
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .model-actions button:hover {
                background: #f3f4f6;
                border-color: #667eea;
            }
            .models-hint {
                margin-top: 8px;
                padding: 8px;
                font-size: 11px;
                color: #6b7280;
                background: #f9fafb;
                border-radius: 4px;
                text-align: center;
            }
            .models-empty {
                padding: 20px;
                text-align: center;
                font-size: 13px;
                color: #9ca3af;
                font-style: italic;
            }
        `;
    }

    /**
     * 构建供应商列表 HTML
     */
    function buildProviderListHTML(providers) {
        if (!providers || providers.length === 0) {
            return `
                <div style="text-align: center; padding: 40px 20px; color: #6b7280;">
                    <div style="font-size: 48px; margin-bottom: 12px;">🔌</div>
                    <div style="font-size: 14px; margin-bottom: 8px;">还没有配置任何供应商</div>
                    <div style="font-size: 12px;">点击“嗅探本地服务”或“手动添加供应商”开始配置</div>
                </div>
            `;
        }
        
        return providers.map(provider => {
            const template = ProviderManager.getTemplate(provider.template);
            const models = provider.models || [];
            const modelCount = models.length;
            const statusColor = provider.enabled ? '#10b981' : '#ef4444';
            const statusText = provider.enabled ? '已启用' : '已禁用';
            const maskedKey = provider.apiKey ? 
                (provider.apiKey.substring(0, 8) + '...' + provider.apiKey.substring(provider.apiKey.length - 4)) : 
                '未设置';
            
            // 构建模型列表 HTML
            let modelsSection = '';
            if (modelCount > 0) {
                // v4.0.0: 生成完整的模型列表，支持编辑和排序
                const modelsHtml = models.map((model, index) => {
                    const modelName = typeof model === 'string' ? model : (model.name || model.id);
                    const modelId = typeof model === 'string' ? model : model.id;
                    const isEnabled = model.enabled !== false; // 默认启用
                    
                    return `
                        <div class="model-item" data-model-id="${modelId}" data-index="${index}" draggable="true">
                            <span class="model-drag-handle" title="拖拽排序">⋮⋮</span>
                            <span class="model-name">${modelName}</span>
                            <div class="model-actions">
                                <button class="btn-model-up" data-action="move-up" data-model-id="${modelId}" data-provider-id="${provider.id}" title="上移">↑</button>
                                <button class="btn-model-down" data-action="move-down" data-model-id="${modelId}" data-provider-id="${provider.id}" title="下移">↓</button>
                                <button class="btn-model-toggle" data-action="toggle-enable" data-model-id="${modelId}" data-provider-id="${provider.id}" 
                                        title="${isEnabled ? '禁用' : '启用'}" style="color: ${isEnabled ? '#10b981' : '#9ca3af'};">
                                    ${isEnabled ? '✓' : '✗'}
                                </button>
                                <button class="btn-model-delete" data-action="delete-model" data-model-id="${modelId}" data-provider-id="${provider.id}" title="删除">🗑️</button>
                            </div>
                        </div>
                    `;
                }).join('');
                
                modelsSection = `
                    <div class="models-section" id="models-${provider.id}" style="display: none;">
                        <div class="models-header">
                            <span>📦 可用模型 (${modelCount})</span>
                            <div class="models-bulk-actions">
                                <button class="btn-add-model" data-action="add-model" data-provider-id="${provider.id}" 
                                        style="padding: 4px 8px; font-size: 11px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    ➕ 添加模型
                                </button>
                                <button class="btn-test-models" data-action="test-models" data-provider-id="${provider.id}" 
                                        style="padding: 4px 8px; font-size: 11px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    🧪 测试模型
                                </button>
                                <button class="btn-remove-invalid" data-action="remove-invalid" data-provider-id="${provider.id}"
                                        style="padding: 4px 8px; font-size: 11px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    🗑️ 删除无效
                                </button>
                                <button class="btn-bulk-enable" data-action="bulk-enable" data-provider-id="${provider.id}">全部启用</button>
                                <button class="btn-bulk-disable" data-action="bulk-disable" data-provider-id="${provider.id}">全部禁用</button>
                            </div>
                        </div>
                        <div class="models-list" data-provider-id="${provider.id}">
                            ${modelsHtml}
                        </div>
                        <div class="models-hint">
                            💡 提示：拖拽 ⋮⋮ 图标可调整顺序，点击 ✓/✗ 可启用/禁用模型，🧪 测试后可一键删除无效模型
                        </div>
                    </div>
                `;
            } else {
                modelsSection = `
                    <div class="models-section" id="models-${provider.id}" style="display: none;">
                        <div class="models-empty">
                            暂无模型，点击“刷新模型”按钮获取
                        </div>
                    </div>
                `;
            }
            
            return `
                <div class="provider-card" data-provider-id="${provider.id}">
                    <div class="provider-header">
                        <div class="provider-info">
                            <div class="provider-name">${provider.name}</div>
                            <div class="provider-id">ID: ${provider.id}</div>
                        </div>
                        <div class="provider-status" style="color: ${statusColor};">
                            ● ${statusText}
                        </div>
                    </div>
                    
                    <div class="provider-details">
                        <div class="provider-detail-row">
                            <span class="detail-label">Base URL:</span>
                            <span class="detail-value" title="${provider.baseUrl}">${truncateUrl(provider.baseUrl)}</span>
                        </div>
                        <div class="provider-detail-row">
                            <span class="detail-label">API Key:</span>
                            <span class="detail-value">${maskedKey}</span>
                        </div>
                        <div class="provider-detail-row">
                            <span class="detail-label">模板:</span>
                            <span class="detail-value">${template ? template.name : provider.template}</span>
                        </div>
                        <div class="provider-detail-row">
                            <span class="detail-label">模型数量:</span>
                            <span class="detail-value">${modelCount} 个</span>
                        </div>
                        <div class="provider-detail-row">
                            <span class="detail-label">优先级:</span>
                            <span class="detail-value">${provider.priority || 1}</span>
                        </div>
                    </div>
                    
                    <div class="provider-actions">
                        <button class="btn-toggle-models" data-action="toggle-models" data-provider-id="${provider.id}" 
                                style="padding: 6px 12px; font-size: 12px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            📦 查看模型
                        </button>
                        <button class="btn-test-connection" data-action="test" data-provider-id="${provider.id}" 
                                style="padding: 6px 12px; font-size: 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            🔍 测试连接
                        </button>
                        <button class="btn-refresh-models" data-action="refresh" data-provider-id="${provider.id}"
                                style="padding: 6px 12px; font-size: 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            🔄 刷新模型
                        </button>
                        <button class="btn-edit-provider" data-action="edit" data-provider-id="${provider.id}"
                                style="padding: 6px 12px; font-size: 12px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            ✏️ 编辑
                        </button>
                        <button class="btn-delete-provider" data-action="delete" data-provider-id="${provider.id}"
                                style="padding: 6px 12px; font-size: 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            🗑️ 删除
                        </button>
                    </div>
                    
                    ${modelsSection}
                </div>
            `;
        }).join('');
    }
    
    /**
     * 截断 URL 显示
     */
    function truncateUrl(url, maxLength = 50) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength) + '...';
    }
    
    /**
     * 构建官方供应商选项 HTML
     */
    function buildOfficialProviderOptions() {
        const templates = ProviderManager.getOfficialProviderTemplates();
        
        return templates.map(template => {
            const icon = template.isLocal ? '💻' : '☁️';
            return `<option value="${template.id}">${icon} ${template.name}</option>`;
        }).join('');
    }

    /**
     * 构建设置对话框 HTML（v4.0.0: 供应商管理为核心）
     */
    function buildSettingsHTML(config) {
        // 获取所有供应商
        const providers = ProviderManager.getAllProviders();
        const templates = ProviderManager.getAvailableTemplates();
        
        return `
            <div class="modal-overlay" id="settings-modal">
                <div class="modal-content" style="max-width: 700px;">
                    <div class="modal-title">⚙️ 设置</div>
                    
                    <!-- v4.0.0: 供应商与模型管理标签页（核心） -->
                    <div class="settings-tabs">
                        <button class="tab-btn active" data-tab="providers">🔌 供应商与模型</button>
                        <button class="tab-btn" data-tab="advanced">⚡ 高级设置</button>
                    </div>
                    
                    <!-- 供应商与模型管理标签页 -->
                    <div class="tab-content active" id="tab-providers">
                        <!-- 本地服务嗅探按钮 -->
                        <div style="margin-bottom: 16px; display: flex; gap: 8px;">
                            <button class="btn-primary" id="scan-local-services" 
                                    style="flex: 1; padding: 10px; font-size: 13px;">
                                🔍 嗅探本地服务
                            </button>
                            <button class="btn-secondary" id="add-provider-btn" 
                                    style="flex: 1; padding: 10px; font-size: 13px;">
                                ➕ 手动添加供应商
                            </button>
                        </div>
                        
                        <div class="provider-list" id="provider-list">
                            ${buildProviderListHTML(providers)}
                        </div>
                        
                        <!-- 添加/编辑供应商表单 -->
                        <div class="provider-form" id="provider-form" style="display: none;">
                            <!-- v4.0.0: 官方供应商快速选择 -->
                            <div class="form-group">
                                <label class="form-label">🚀 快速选择官方供应商</label>
                                <select class="form-input" id="official-provider-select">
                                    <option value="">-- 选择官方供应商（自动填充配置） --</option>
                                    ${buildOfficialProviderOptions()}
                                </select>
                                <div class="form-hint">选择后将自动填充 Base URL、API 模板等配置</div>
                            </div>
                            
                            <div class="form-divider">或手动填写</div>
                            
                            <div class="form-group">
                                <label class="form-label">供应商 ID *</label>
                                <input type="text" class="form-input" id="provider-id" 
                                       placeholder="例如: openrouter, lm-studio, ollama">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">供应商名称 *</label>
                                <input type="text" class="form-input" id="provider-name" 
                                       placeholder="例如: OpenRouter, LM Studio">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">API Base URL *</label>
                                <input type="text" class="form-input" id="provider-base-url" 
                                       placeholder="https://openrouter.ai/api/v1">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">API Key</label>
                                <input type="password" class="form-input" id="provider-api-key" 
                                       placeholder="sk-or-... (本地服务可留空)">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">API 模板 *</label>
                                <select class="form-input" id="provider-template">
                                    ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">优先级</label>
                                <input type="number" class="form-input" id="provider-priority" 
                                       value="1" min="1" max="100">
                                <div class="form-hint">数字越小优先级越高，故障转移时按此顺序尝试</div>
                            </div>
                            
                            <div style="display: flex; gap: 8px; margin-top: 16px;">
                                <button class="btn-secondary" id="cancel-provider-form" style="flex: 1;">取消</button>
                                <button class="btn-primary" id="save-provider" style="flex: 1;">保存</button>
                            </div>
                        </div>
                        
                        <div class="form-hint" style="margin-top: 12px;">
                            💡 提示: 每个供应商独立配置，系统会自动按优先级进行故障转移。
                            模型列表在下方展开显示，可针对单个供应商刷新或测试。
                        </div>
                    </div>
                    
                    <!-- 高级设置标签页 -->
                    <div class="tab-content" id="tab-advanced">
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
                    </div>

                    <div class="modal-actions">
                        <button class="btn-secondary" id="cancel-settings">取消</button>
                        <button class="btn-primary" id="save-settings">保存设置</button>
                    </div>
                </div>
            </div>
        `;
    }

    // ========== v4.0.0: 供应商管理辅助函数 ==========
    
    /**
     * 显示供应商表单（添加/编辑）
     */
    function showProviderForm(providerId = null) {
        const form = document.getElementById('provider-form');
        const addBtn = document.getElementById('add-provider-btn');
        
        if (!form || !addBtn) return;
        
        form.style.display = 'block';
        addBtn.style.display = 'none';
        
        // 重置官方选择器
        const officialSelect = document.getElementById('official-provider-select');
        if (officialSelect) {
            officialSelect.value = '';
        }
        
        // 如果是编辑模式，填充数据
        if (providerId) {
            const provider = ProviderManager.getProviderById(providerId);
            if (provider) {
                document.getElementById('provider-id').value = provider.id;
                document.getElementById('provider-id').disabled = true; // ID 不可修改
                document.getElementById('provider-name').value = provider.name;
                document.getElementById('provider-base-url').value = provider.baseUrl;
                document.getElementById('provider-api-key').value = provider.apiKey || '';
                document.getElementById('provider-template').value = provider.template;
                document.getElementById('provider-priority').value = provider.priority || 1;
                
                // 标记为编辑模式
                form.dataset.editMode = 'true';
                form.dataset.providerId = providerId;
            }
        } else {
            // 清空表单
            document.getElementById('provider-id').value = '';
            document.getElementById('provider-id').disabled = false;
            document.getElementById('provider-name').value = '';
            document.getElementById('provider-base-url').value = '';
            document.getElementById('provider-api-key').value = '';
            document.getElementById('provider-template').value = 'OPENAI';
            document.getElementById('provider-priority').value = '1';
            
            form.dataset.editMode = 'false';
            delete form.dataset.providerId;
        }
        
        // 滚动到表单
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    /**
     * 从官方模板填充表单
     */
    function fillProviderFormFromTemplate(templateId) {
        const template = ProviderManager.getOfficialProviderTemplateById(templateId);
        if (!template) return;
        
        // 设置为添加模式（非编辑模式）
        const form = document.getElementById('provider-form');
        form.dataset.editMode = 'false';
        delete form.dataset.providerId;
        
        // 填充表单字段
        document.getElementById('provider-id').value = template.id;
        document.getElementById('provider-id').disabled = false;
        document.getElementById('provider-name').value = template.name;
        document.getElementById('provider-base-url').value = template.baseUrl;
        document.getElementById('provider-api-key').value = '';
        document.getElementById('provider-template').value = template.template;
        document.getElementById('provider-priority').value = template.priority || 1;
        
        // 聚焦到 API Key 字段
        document.getElementById('provider-api-key').focus();
        
        // 显示提示
        const hint = document.createElement('div');
        hint.style.cssText = 'margin-top: 8px; padding: 8px; background: #dbeafe; border-radius: 4px; font-size: 12px; color: #1e40af;';
        hint.innerHTML = `✅ 已自动填充配置！请填写 API Key 后保存。<br><small>了解更多: <a href="${template.website}" target="_blank" style="color: #1e40af;">${template.website}</a></small>`;
        
        // 移除旧的提示
        const oldHint = document.querySelector('.auto-fill-hint');
        if (oldHint) oldHint.remove();
        
        hint.className = 'auto-fill-hint';
        document.getElementById('provider-form').appendChild(hint);
    }
    
    /**
     * 隐藏供应商表单
     */
    function hideProviderForm() {
        const form = document.getElementById('provider-form');
        const addBtn = document.getElementById('add-provider-btn');
        
        if (!form || !addBtn) return;
        
        form.style.display = 'none';
        addBtn.style.display = 'block';
        
        // 清空表单状态
        delete form.dataset.editMode;
        delete form.dataset.providerId;
    }
    
    /**
     * 处理保存供应商
     */
    async function handleSaveProvider() {
        console.log('[UI] Save provider button clicked');
        
        const id = document.getElementById('provider-id').value.trim();
        const name = document.getElementById('provider-name').value.trim();
        const baseUrl = document.getElementById('provider-base-url').value.trim();
        const apiKey = document.getElementById('provider-api-key').value.trim();
        const template = document.getElementById('provider-template').value;
        const priority = parseInt(document.getElementById('provider-priority').value) || 1;
        
        console.log('[UI] Form data:', { id, name, baseUrl, template, priority });
        
        // 验证必填字段
        if (!id || !name || !baseUrl || !template) {
            alert('请填写所有必填字段（ID、名称、Base URL、模板）');
            return;
        }
        
        // 验证 ID 格式
        if (!/^[a-z0-9_-]+$/.test(id)) {
            alert('供应商 ID 只能包含小写字母、数字、下划线和连字符');
            return;
        }
        
        try {
            const form = document.getElementById('provider-form');
            const isEditMode = form.dataset.editMode === 'true';
            
            console.log('[UI] Save mode:', isEditMode ? 'update' : 'add');
            
            if (isEditMode) {
                // 更新现有供应商
                await ProviderManager.updateProvider(id, {
                    name,
                    baseUrl,
                    apiKey,
                    template,
                    priority
                });
                console.log('[UI] Provider updated:', id);
            } else {
                // 添加新供应商
                await ProviderManager.addProvider({
                    id,
                    name,
                    baseUrl,
                    apiKey,
                    template,
                    priority,
                    enabled: true
                });
                console.log('[UI] Provider added:', id);
            }
            
            // 刷新列表
            refreshProviderList();
            
            // 隐藏表单
            hideProviderForm();
            
            // 显示成功提示
            alert(isEditMode ? '✅ 供应商已更新！' : '✅ 供应商已添加！');
            
        } catch (error) {
            console.error('[UI] Failed to save provider:', error);
            alert('❌ 保存失败: ' + error.message);
        }
    }
    
    /**
     * 处理测试连接
     */
    async function handleTestConnection(providerId, button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = '⏳ 测试中...';
        
        try {
            const result = await ProviderManager.testProviderConnection(providerId);
            
            if (result.success) {
                button.textContent = '✅ 连接成功';
                button.style.background = '#10b981';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#3b82f6';
                    button.disabled = false;
                }, 2000);
            } else {
                button.textContent = '❌ 连接失败';
                button.style.background = '#ef4444';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#3b82f6';
                    button.disabled = false;
                }, 2000);
                
                alert(`连接测试失败:\n${result.error}`);
            }
        } catch (error) {
            console.error('[UI] Test connection failed:', error);
            button.textContent = '❌ 错误';
            button.style.background = '#ef4444';
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#3b82f6';
                button.disabled = false;
            }, 2000);
            
            alert('测试出错: ' + error.message);
        }
    }
    
    /**
     * 处理刷新模型
     */
    async function handleRefreshModels(providerId, button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = '⏳ 刷新中...';
        
        try {
            const provider = ProviderManager.getProviderById(providerId);
            if (!provider) {
                throw new Error('供应商不存在');
            }
            
            // 保存旧模型列表用于对比
            const oldModels = provider.models || [];
            const oldModelIds = oldModels.map(m => typeof m === 'string' ? m : m.id);
            
            // 根据提供商类型选择不同的刷新策略
            let models = [];
            
            if (providerId === 'openrouter') {
                // OpenRouter: 从 API 获取
                models = await fetchModelsFromOpenRouter();
            } else if (provider.baseUrl.includes('localhost') || provider.baseUrl.includes('127.0.0.1')) {
                // 本地服务: 尝试自动发现
                models = await ProviderManager.autoDiscoverLocalServices(provider.baseUrl);
            } else {
                // ✅ 其他提供商: 尝试使用标准 OpenAI 兼容的 /v1/models 接口
                console.log('[UI] 尝试通过 /v1/models 接口获取模型列表...');
                
                try {
                    const modelsUrl = `${provider.baseUrl}/models`;
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    
                    // 如果有 API Key，添加到请求头
                    if (provider.apiKey) {
                        headers['Authorization'] = `Bearer ${provider.apiKey}`;
                    }
                    
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: modelsUrl,
                            headers: headers,
                            timeout: 10000,
                            onload: (resp) => {
                                if (resp.status >= 200 && resp.status < 300) {
                                    resolve(resp);
                                } else {
                                    reject(new Error(`HTTP ${resp.status}: ${resp.statusText}`));
                                }
                            },
                            onerror: () => reject(new Error('网络请求失败')),
                            ontimeout: () => reject(new Error('请求超时'))
                        });
                    });
                    
                    const data = JSON.parse(response.responseText);
                    
                    // 解析模型列表（支持多种格式）
                    if (data.data && Array.isArray(data.data)) {
                        // OpenAI 格式: { data: [{ id: 'xxx', ... }, ...] }
                        models = data.data.map(m => ({
                            id: m.id,
                            name: m.id,
                            provider: providerId
                        }));
                        console.log(`[UI] 成功获取 ${models.length} 个模型`);
                    } else if (Array.isArray(data)) {
                        // 直接返回数组格式
                        models = data.map(m => ({
                            id: typeof m === 'string' ? m : m.id,
                            name: typeof m === 'string' ? m : (m.name || m.id),
                            provider: providerId
                        }));
                        console.log(`[UI] 成功获取 ${models.length} 个模型`);
                    } else {
                        throw new Error('无法解析模型列表格式');
                    }
                    
                } catch (error) {
                    console.warn('[UI] /v1/models 接口失败:', error.message);
                    alert(`该供应商暂不支持自动刷新模型。

错误信息: ${error.message}

您可以:
1. 在 "模型选择" 标签页中使用 Auto 模式
2. 或手动添加模型 ID
3. 或联系开发者添加支持`);
                    button.textContent = originalText;
                    button.disabled = false;
                    return;
                }
            }
            
            if (models && models.length > 0) {
                // ✅ 检查是否有旧模型不在新列表中
                const newModelIds = models.map(m => typeof m === 'string' ? m : m.id);
                const missingModels = oldModelIds.filter(id => !newModelIds.includes(id));
                
                // 如果有缺失的模型，询问用户是否保留
                if (missingModels.length > 0) {
                    const confirmMsg = `发现 ${missingModels.length} 个模型不在最新名单中：\n\n${missingModels.slice(0, 10).join('\n')}${missingModels.length > 10 ? '\n...' : ''}\n\n是否保留这些模型？\n- 点击“确定”保留（合并到最新列表）\n- 点击“取消”只保留最新模型`;
                    
                    if (confirm(confirmMsg)) {
                        // 用户选择保留：将旧模型添加到新列表中
                        const modelsToAdd = oldModels.filter(m => {
                            const modelId = typeof m === 'string' ? m : m.id;
                            return missingModels.includes(modelId);
                        });
                        
                        // 合并模型列表
                        models = [...models, ...modelsToAdd];
                        console.log(`[UI] 保留了 ${modelsToAdd.length} 个旧模型`);
                    } else {
                        console.log(`[UI] 删除了 ${missingModels.length} 个不在最新名单中的模型`);
                    }
                }
                
                // ✅ 使用 updateProvider 替换模型列表（而不是追加）
                await ProviderManager.updateProvider(providerId, { models: models });
                
                // 刷新列表
                refreshProviderList();
                
                button.textContent = `✅ ${models.length}个模型`;
                button.style.background = '#10b981';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#10b981';
                    button.disabled = false;
                }, 2000);
            } else {
                throw new Error('未找到任何模型');
            }
            
        } catch (error) {
            console.error('[UI] Refresh models failed:', error);
            button.textContent = '❌ 失败';
            button.style.background = '#ef4444';
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#10b981';
                button.disabled = false;
            }, 2000);
            
            alert('刷新模型失败: ' + error.message);
        }
    }
    
    /**
     * 处理编辑供应商
     */
    function handleEditProvider(providerId) {
        showProviderForm(providerId);
    }
    
    /**
     * 处理删除供应商
     */
    async function handleDeleteProvider(providerId) {
        if (!confirm(`确定要删除供应商 "${providerId}" 吗？\n\n此操作不可恢复！`)) {
            return;
        }
        
        try {
            await ProviderManager.deleteProvider(providerId);
            
            // 刷新列表
            refreshProviderList();
            
            alert('✅ 供应商已删除');
        } catch (error) {
            console.error('[UI] Delete provider failed:', error);
            alert('❌ 删除失败: ' + error.message);
        }
    }
    
    /**
     * 刷新供应商列表
     */
    function refreshProviderList() {
        const providers = ProviderManager.getAllProviders();
        const providerListEl = document.getElementById('provider-list');
        
        if (providerListEl) {
            providerListEl.innerHTML = buildProviderListHTML(providers);
        }
        
        // v4.0.0: 同时刷新主界面的模型选择器
        refreshMainModelSelect();
    }

    /**
     * 处理切换模型列表显示/隐藏
     */
    function handleToggleModels(providerId, button) {
        const modelsSection = document.getElementById(`models-${providerId}`);
        if (!modelsSection) return;
        
        const isVisible = modelsSection.style.display !== 'none';
        
        if (isVisible) {
            modelsSection.style.display = 'none';
            button.textContent = '📦 查看模型';
        } else {
            modelsSection.style.display = 'block';
            button.textContent = '🔼 隐藏模型';
        }
    }

    /**
     * v4.0.0: 处理模型上移
     */
    async function handleMoveModelUp(providerId, modelId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const index = provider.models.findIndex(m => (typeof m === 'string' ? m : m.id) === modelId);
        if (index <= 0) return; // 已经在最上面
        
        // 创建新数组并交换位置
        const newModels = [...provider.models];
        [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] Model moved up:', modelId);
    }

    /**
     * v4.0.0: 处理模型下移
     */
    async function handleMoveModelDown(providerId, modelId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const index = provider.models.findIndex(m => (typeof m === 'string' ? m : m.id) === modelId);
        if (index < 0 || index >= provider.models.length - 1) return; // 已经在最下面
        
        // 创建新数组并交换位置
        const newModels = [...provider.models];
        [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] Model moved down:', modelId);
    }

    /**
     * v4.0.0: 处理启用/禁用模型
     */
    async function handleToggleModelEnable(providerId, modelId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const modelIndex = provider.models.findIndex(m => (typeof m === 'string' ? m : m.id) === modelId);
        if (modelIndex < 0) return;
        
        // 创建新数组
        const newModels = [...provider.models];
        const model = newModels[modelIndex];
        
        // 切换 enabled 状态
        if (typeof model === 'object') {
            newModels[modelIndex] = { ...model, enabled: model.enabled !== false ? false : true };
        } else {
            // 如果是字符串，转换为对象
            newModels[modelIndex] = { id: model, enabled: false };
        }
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] Model toggled:', modelId, 'enabled:', newModels[modelIndex].enabled);
    }

    /**
     * v4.0.0: 处理删除模型
     */
    async function handleDeleteModel(providerId, modelId) {
        if (!confirm(`确定要删除模型 "${modelId}" 吗？`)) return;
        
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const newModels = provider.models.filter(m => (typeof m === 'string' ? m : m.id) !== modelId);
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] Model deleted:', modelId);
    }

    /**
     * v4.0.0: 处理批量启用模型
     */
    async function handleBulkEnableModels(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const newModels = provider.models.map(m => {
            if (typeof m === 'object') {
                return { ...m, enabled: true };
            }
            return m;
        });
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] All models enabled');
    }

    /**
     * v4.0.0: 处理批量禁用模型
     */
    async function handleBulkDisableModels(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const newModels = provider.models.map(m => {
            if (typeof m === 'object') {
                return { ...m, enabled: false };
            }
            return { id: typeof m === 'string' ? m : m.id, enabled: false };
        });
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] All models disabled');
    }

    /**
     * v4.0.0: 处理测试所有模型
     */
    async function handleTestModels(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models || provider.models.length === 0) {
            alert('没有可测试的模型');
            return;
        }
        
        // 检查是否有 API Key（本地服务不需要）
        if (!provider.apiKey && !provider.isLocal) {
            alert('请先配置 API Key');
            return;
        }
        
        const testBtn = document.querySelector(`[data-action="test-models"][data-provider-id="${providerId}"]`);
        if (testBtn) {
            testBtn.disabled = true;
            testBtn.textContent = '⏳ 测试中...';
        }
        
        try {
            let successCount = 0;
            let failCount = 0;
            const total = provider.models.length;
            
            console.log(`[UI] 开始测试 ${total} 个模型...`);
            
            // 获取供应商的模板和配置
            const template = ProviderManager.getTemplate(provider.template || 'openai');
            if (!template) {
                alert('无法获取 API 模板');
                return;
            }
            
            // 逐个测试模型
            for (let i = 0; i < provider.models.length; i++) {
                const model = provider.models[i];
                const modelId = typeof model === 'string' ? model : model.id;
                
                console.log(`[UI] 测试模型 ${i + 1}/${total}: ${modelId}`);
                
                try {
                    // 构建测试请求
                    const testUrl = `${provider.baseUrl}${template.endpoint}`;
                    const testHeaders = {};
                    
                    // 添加模板定义的 headers
                    if (template.headers) {
                        Object.keys(template.headers).forEach(key => {
                            let value = template.headers[key];
                            // 替换变量
                            if (value === '{{apiKey}}') {
                                value = provider.apiKey || '';
                            } else if (value === '{{model}}') {
                                value = modelId;
                            }
                            testHeaders[key] = value;
                        });
                    }
                    
                    // 添加 Content-Type
                    if (!testHeaders['Content-Type']) {
                        testHeaders['Content-Type'] = 'application/json';
                    }
                    
                    // 构建请求体
                    const testBody = {
                        model: modelId,
                        messages: [{ role: 'user', content: 'Hi' }],
                        max_tokens: 5
                    };
                    
                    // 发送测试请求
                    const result = await new Promise((resolve) => {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: testUrl,
                            headers: testHeaders,
                            data: JSON.stringify(testBody),
                            timeout: 10000, // 10秒超时
                            onload: (response) => {
                                resolve(response.status >= 200 && response.status < 300);
                            },
                            onerror: () => resolve(false),
                            ontimeout: () => resolve(false)
                        });
                    });
                    
                    if (result) {
                        successCount++;
                        // ✅ 保存测试结果
                        ModelManager.markModelTest(modelId, true);
                        console.log(`[UI] ✅ ${modelId} 测试成功`);
                    } else {
                        failCount++;
                        // ✅ 保存测试结果
                        ModelManager.markModelTest(modelId, false);
                        console.warn(`[UI] ❌ ${modelId} 测试失败`);
                    }
                    
                    // 更新按钮显示进度
                    if (testBtn) {
                        testBtn.textContent = `⏳ ${i + 1}/${total}`;
                    }
                    
                } catch (error) {
                    failCount++;
                    console.error(`[UI] ❌ ${modelId} 测试异常:`, error.message);
                }
            }
            
            // 显示测试结果
            const message = `测试完成！\n\n总计: ${total}\n✅ 成功: ${successCount}\n❌ 失败: ${failCount}\n\n可以点击“删除无效”按钮移除失败的模型。`;
            alert(message);
            
            console.log(`[UI] 测试完成: 成功 ${successCount}, 失败 ${failCount}`);
            
        } catch (error) {
            console.error('[UI] 测试过程出错:', error);
            alert('测试过程中出现错误: ' + error.message);
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.textContent = '🧪 测试模型';
            }
        }
    }

    /**
     * v4.0.0: 处理删除无效模型（测试失败的模型）
     */
    async function handleRemoveInvalidModels(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models || provider.models.length === 0) {
            alert('没有可删除的模型');
            return;
        }
        
        // 获取所有测试失败的模型
        const invalidModels = [];
        const validModels = [];
        
        for (const model of provider.models) {
            const modelId = typeof model === 'string' ? model : model.id;
            const isAvailable = ModelManager.isModelAvailable(modelId);
            
            if (isAvailable) {
                validModels.push(model);
            } else {
                invalidModels.push(modelId);
            }
        }
        
        if (invalidModels.length === 0) {
            alert('没有找到无效的模型，所有模型都可用！');
            return;
        }
        
        // 确认删除
        const confirmMsg = `确定要删除以下 ${invalidModels.length} 个无效模型吗？\n\n${invalidModels.slice(0, 10).join('\n')}${invalidModels.length > 10 ? '\n...' : ''}`;
        if (!confirm(confirmMsg)) {
            return;
        }
        
        // 更新模型列表
        await ProviderManager.updateProvider(providerId, { models: validModels });
        
        // ✅ 清除已删除模型的测试缓存
        invalidModels.forEach(modelId => {
            // 从 ModelManager 的状态中移除
            const status = GM_getValue('model_status', {});
            delete status[modelId];
            GM_setValue('model_status', status);
        });
        
        refreshProviderList();
        
        console.log(`[UI] 已删除 ${invalidModels.length} 个无效模型`);
        alert(`已删除 ${invalidModels.length} 个无效模型`);
    }

    /**
     * v4.0.0: 处理手动添加模型
     */
    function handleAddModel(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider) {
            alert('供应商不存在');
            return;
        }
        
        // 弹窗输入模型 ID
        const modelId = prompt('请输入模型 ID：\n\n例如：gpt-4、claude-3-opus、qwen-max 等');
        
        if (!modelId || !modelId.trim()) {
            return; // 用户取消或输入为空
        }
        
        const trimmedModelId = modelId.trim();
        
        // 检查是否已存在
        const existingModels = provider.models || [];
        const exists = existingModels.some(m => {
            const id = typeof m === 'string' ? m : m.id;
            return id === trimmedModelId;
        });
        
        if (exists) {
            alert(`模型 "${trimmedModelId}" 已存在！`);
            return;
        }
        
        // 添加模型
        const newModel = {
            id: trimmedModelId,
            name: trimmedModelId,
            provider: providerId,
            enabled: true
        };
        
        const updatedModels = [...existingModels, newModel];
        
        ProviderManager.updateProvider(providerId, { models: updatedModels })
            .then(() => {
                refreshProviderList();
                console.log(`[UI] 已添加模型: ${trimmedModelId}`);
                alert(`✅ 模型 "${trimmedModelId}" 已添加！\n\n建议：\n1. 点击“🧪 测试模型”验证可用性\n2. 拖拽 ⋮⋮ 调整优先级`);
            })
            .catch(error => {
                console.error('[UI] 添加模型失败:', error);
                alert('❌ 添加模型失败: ' + error.message);
            });
    }

    /**
     * v4.0.0: 设置模型列表拖拽排序
     */
    function setupModelDragAndDrop(container) {
        let draggedItem = null;
        let dragSourceProvider = null;
        
        // 监听拖拽开始
        container.addEventListener('dragstart', (e) => {
            const modelItem = e.target.closest('.model-item');
            if (!modelItem) return;
            
            draggedItem = modelItem;
            dragSourceProvider = modelItem.closest('.models-list')?.dataset.providerId;
            
            modelItem.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', modelItem.dataset.modelId);
        });
        
        // 监听拖拽结束
        container.addEventListener('dragend', (e) => {
            const modelItem = e.target.closest('.model-item');
            if (modelItem) {
                modelItem.classList.remove('dragging');
            }
            draggedItem = null;
            dragSourceProvider = null;
        });
        
        // 监听拖拽经过
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const modelItem = e.target.closest('.model-item');
            if (!modelItem || !draggedItem || modelItem === draggedItem) return;
            
            // 确保是同一个供应商的模型
            const targetProvider = modelItem.closest('.models-list')?.dataset.providerId;
            if (targetProvider !== dragSourceProvider) return;
            
            e.dataTransfer.dropEffect = 'move';
            
            // 获取鼠标位置，决定插入位置
            const rect = modelItem.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            
            if (e.clientY < midpoint) {
                modelItem.parentNode.insertBefore(draggedItem, modelItem);
            } else {
                modelItem.parentNode.insertBefore(draggedItem, modelItem.nextSibling);
            }
        });
        
        // 监听放置
        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            
            if (!draggedItem || !dragSourceProvider) return;
            
            const modelId = draggedItem.dataset.modelId;
            const modelsList = draggedItem.closest('.models-list');
            
            // 获取新的顺序
            const newOrder = Array.from(modelsList.querySelectorAll('.model-item'))
                .map(item => item.dataset.modelId);
            
            console.log('[UI] New model order:', newOrder);
            
            // 更新供应商的模型顺序
            const provider = ProviderManager.getProviderById(dragSourceProvider);
            if (!provider || !provider.models) return;
            
            // 根据新顺序重新排列模型
            const reorderedModels = [];
            for (const id of newOrder) {
                const model = provider.models.find(m => (typeof m === 'string' ? m : m.id) === id);
                if (model) {
                    reorderedModels.push(model);
                }
            }
            
            await ProviderManager.updateProvider(dragSourceProvider, { models: reorderedModels });
            
            // 刷新显示
            refreshProviderList();
            console.log('[UI] Model order updated via drag & drop');
        });
    }
    
    /**
     * 处理嗅探本地服务
     */
    async function handleScanLocalServices() {
        const scanBtn = document.getElementById('scan-local-services');
        if (!scanBtn) return;
        
        const originalText = scanBtn.textContent;
        scanBtn.disabled = true;
        scanBtn.textContent = '⏳ 嗅探中...';
        
        try {
            // 常见的本地服务端口
            const commonPorts = [
                { name: 'LM Studio', port: 1234 },
                { name: 'Ollama', port: 11434 },
                { name: 'Text Generation WebUI', port: 5000 },
                { name: 'KoboldAI', port: 5001 }
            ];
            
            let foundCount = 0;
            const results = [];
            
            for (const service of commonPorts) {
                const baseUrl = `http://localhost:${service.port}/v1`;
                
                try {
                    // 尝试连接测试
                    const result = await new Promise((resolve) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: `${baseUrl}/models`,
                            timeout: 2000,
                            onload: (response) => {
                                if (response.status === 200) {
                                    resolve({ success: true, data: response.responseText });
                                } else {
                                    resolve({ success: false });
                                }
                            },
                            onerror: () => resolve({ success: false }),
                            ontimeout: () => resolve({ success: false })
                        });
                    });
                    
                    if (result.success) {
                        const data = JSON.parse(result.data);
                        const models = data.data || [];
                        
                        if (models.length > 0) {
                            // 检查是否已存在该供应商
                            const existingProvider = ProviderManager.getProviderById(service.name.toLowerCase().replace(/\s+/g, '-'));
                            
                            if (!existingProvider) {
                                // 创建新供应商
                                await ProviderManager.addProvider({
                                    id: service.name.toLowerCase().replace(/\s+/g, '-'),
                                    name: service.name,
                                    baseUrl: baseUrl,
                                    apiKey: '',
                                    template: 'OPENAI',
                                    priority: 10,
                                    enabled: true,
                                    isLocal: true  // v4.0.0: 标记为本地服务
                                });
                                
                                // 添加模型
                                const modelList = models.map(m => ({
                                    id: m.id,
                                    name: m.id,
                                    provider: service.name.toLowerCase().replace(/\s+/g, '-')
                                }));
                                
                                await ProviderManager.addModelsToProvider(
                                    service.name.toLowerCase().replace(/\s+/g, '-'),
                                    modelList
                                );
                                
                                foundCount++;
                                results.push(`${service.name} (${models.length} 个模型)`);
                            }
                        }
                    }
                } catch (error) {
                    // 忽略单个服务的错误，继续尝试其他端口
                }
            }
            
            // 刷新列表
            refreshProviderList();
            
            if (foundCount > 0) {
                scanBtn.textContent = `✅ 找到 ${foundCount} 个服务`;
                scanBtn.style.background = '#10b981';
                setTimeout(() => {
                    scanBtn.textContent = originalText;
                    scanBtn.style.background = '';
                    scanBtn.disabled = false;
                }, 3000);
                
                alert(`✅ 发现 ${foundCount} 个本地服务:\n\n${results.join('\n')}\n\n已自动添加到供应商列表。`);
            } else {
                scanBtn.textContent = '❌ 未找到服务';
                scanBtn.style.background = '#ef4444';
                setTimeout(() => {
                    scanBtn.textContent = originalText;
                    scanBtn.style.background = '';
                    scanBtn.disabled = false;
                }, 3000);
                
                alert('❌ 未检测到任何本地服务。\n\n请确保:\n• LM Studio / Ollama 等服务正在运行\n• 使用默认端口（1234, 11434 等）\n• 或手动添加供应商');
            }
            
        } catch (error) {
            console.error('[UI] Scan local services failed:', error);
            scanBtn.textContent = '❌ 错误';
            scanBtn.style.background = '#ef4444';
            setTimeout(() => {
                scanBtn.textContent = originalText;
                scanBtn.style.background = '';
                scanBtn.disabled = false;
            }, 3000);
            
            alert('嗅探失败: ' + error.message);
        }
    }

    /**
     * 从 OpenRouter API 获取模型列表
     */
    async function fetchModelsFromOpenRouter() {
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
                                    provider: 'openrouter',
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
     * 绑定设置对话框的事件监听
     */
    function bindSettingsEvents() {
        console.log('[UI] Binding settings events...');
        
        // v4.0.0: 标签页切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // 移除所有活动状态
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // 激活当前标签
                btn.classList.add('active');
                const tabId = `tab-${btn.dataset.tab}`;
                document.getElementById(tabId).classList.add('active');
            });
        });
        
        // v4.0.0: 使用事件委托处理表单按钮（更可靠）
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
            modalContent.addEventListener('click', (e) => {
                const target = e.target;
                
                // 添加供应商按钮
                if (target.id === 'add-provider-btn') {
                    console.log('[UI] Add provider button clicked');
                    showProviderForm();
                    return;
                }
                
                // 取消表单按钮
                if (target.id === 'cancel-provider-form') {
                    console.log('[UI] Cancel form button clicked');
                    hideProviderForm();
                    return;
                }
                
                // 保存供应商按钮
                if (target.id === 'save-provider') {
                    console.log('[UI] Save provider button clicked (via delegation)');
                    handleSaveProvider();
                    return;
                }
                
                // 保存设置按钮
                if (target.id === 'save-settings') {
                    console.log('[UI] Save settings button clicked (via delegation)');
                    saveSettings();
                    return;
                }
                
                // 取消设置按钮
                if (target.id === 'cancel-settings') {
                    console.log('[UI] Cancel settings button clicked (via delegation)');
                    closeModal();
                    return;
                }
            });
            
            // 官方供应商选择器变化事件
            const officialSelect = document.getElementById('official-provider-select');
            if (officialSelect) {
                officialSelect.addEventListener('change', (e) => {
                    const templateId = e.target.value;
                    if (templateId) {
                        console.log('[UI] Official provider selected:', templateId);
                        fillProviderFormFromTemplate(templateId);
                    }
                });
            } else {
                console.warn('[UI] official-provider-select not found');
            }
        } else {
            console.error('[UI] Modal content not found!');
        }
        
        // v4.0.0: 供应商卡片操作按钮（事件委托）
        const providerList = document.getElementById('provider-list');
        if (providerList) {
            providerList.addEventListener('click', async (e) => {
                const button = e.target.closest('[data-action]');
                if (!button) return;
                
                const action = button.dataset.action;
                const providerId = button.dataset.providerId;
                
                switch(action) {
                    case 'toggle-models':
                        handleToggleModels(providerId, button);
                        break;
                    case 'test':
                        await handleTestConnection(providerId, button);
                        break;
                    case 'refresh':
                        await handleRefreshModels(providerId, button);
                        break;
                    case 'edit':
                        handleEditProvider(providerId);
                        break;
                    case 'delete':
                        await handleDeleteProvider(providerId);
                        break;
                    // v4.0.0: 模型操作
                    case 'move-up':
                        await handleMoveModelUp(providerId, button.dataset.modelId);
                        break;
                    case 'move-down':
                        await handleMoveModelDown(providerId, button.dataset.modelId);
                        break;
                    case 'toggle-enable':
                        await handleToggleModelEnable(providerId, button.dataset.modelId);
                        break;
                    case 'delete-model':
                        await handleDeleteModel(providerId, button.dataset.modelId);
                        break;
                    case 'bulk-enable':
                        await handleBulkEnableModels(button.dataset.providerId);
                        break;
                    case 'bulk-disable':
                        await handleBulkDisableModels(button.dataset.providerId);
                        break;
                    // v4.0.0: 模型测试功能
                    case 'test-models':
                        await handleTestModels(button.dataset.providerId);
                        break;
                    case 'remove-invalid':
                        await handleRemoveInvalidModels(button.dataset.providerId);
                        break;
                    // v4.0.0: 手动添加模型
                    case 'add-model':
                        handleAddModel(button.dataset.providerId);
                        break;
                }
            });
            
            // v4.0.0: 模型列表拖拽排序
            setupModelDragAndDrop(providerList);
        }
        
        // v4.0.0: 嗅探本地服务
        const scanLocalBtn = document.getElementById('scan-local-services');
        if (scanLocalBtn) {
            scanLocalBtn.addEventListener('click', handleScanLocalServices);
        }
        
        // 温度滑块实时更新
        const tempSlider = document.getElementById('setting-temperature');
        if (tempSlider) {
            tempSlider.addEventListener('input', (e) => {
                const tempValue = document.getElementById('temp-value');
                if (tempValue) tempValue.textContent = e.target.value;
            });
        }

        // Top P 滑块实时更新
        const topPSlider = document.getElementById('setting-top-p');
        if (topPSlider) {
            topPSlider.addEventListener('input', (e) => {
                const toppValue = document.getElementById('topp-value');
                if (toppValue) toppValue.textContent = e.target.value;
            });
        }

        // 刷新模型列表
        setupModelRefresh();
        
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
     * 初始化模型选择（v4.0.0: 从 ProviderManager 获取）
     */
    async function initializeModelSelect(currentModel) {
        // v4.0.0: 从 ProviderManager 获取所有可用模型
        const models = ProviderManager.getAllAvailableModels();
        
        if (models.length === 0) {
            console.warn('[UI] No models available from providers');
            // 显示提示信息
            const modelsStatus = document.getElementById('models-status');
            if (modelsStatus) {
                modelsStatus.innerHTML = '<span style="color: #f59e0b;">⚠️ 没有可用模型，请配置提供商</span>';
            }
            return;
        }
        
        ModelManager.updateModelSelect(models, currentModel);
        
        // 显示模型统计信息
        const modelsStatus = document.getElementById('models-status');
        if (modelsStatus) {
            const providerCount = ProviderManager.getAllProviders().filter(p => p.enabled).length;
            modelsStatus.innerHTML = `<span style="color: #6b7280;">📦 已加载 ${models.length} 个模型 | ${providerCount} 个启用的提供商</span>`;
        }
    }

    /**
     * 设置模型刷新功能（v4.0.0: 已废弃，模型管理移至供应商管理）
     */
    function setupModelRefresh() {
        // v4.0.0: 此功能已移至供应商管理界面
        console.log('[UI] setupModelRefresh is deprecated in v4.0.0');
    }

    /**
     * 保存设置
     */
    function saveSettings() {
        console.log('[UI] Saving settings...');
        
        // v4.0.0: API Key 现在在供应商管理中配置，不再在这里设置
        const model = document.getElementById('setting-model')?.value || 'auto';
        const temperature = parseFloat(document.getElementById('setting-temperature')?.value || '0.7');
        const topP = parseFloat(document.getElementById('setting-top-p')?.value || '0.95');
        let maxTokens = parseInt(document.getElementById('setting-max-tokens')?.value || '2048');
        const jsEnabled = document.getElementById('setting-js-enabled')?.checked ?? true;

        console.log('[UI] Settings:', { model, temperature, topP, maxTokens, jsEnabled });

        // 验证并限制 maxTokens 范围
        if (isNaN(maxTokens) || maxTokens < 100) {
            maxTokens = 2048;
        } else if (maxTokens > 8192) {
            maxTokens = 8192;
            alert('⚠️ maxTokens 已自动限制为 8192，避免超出 API 限制');
        }

        // 保存到配置管理器 (浏览器存储)
        ConfigManager.set('model', model);
        ConfigManager.set('temperature', temperature);
        ConfigManager.set('topP', topP);
        ConfigManager.set('maxTokens', maxTokens);
        ConfigManager.set('jsExecutionEnabled', jsEnabled);

        console.log('[UI] 设置保存成功');

        closeModal();
        
        // 更新 UI 状态徽章
        updateStatusBadge(true); // v4.0.0: 只要有供应商就认为已配置
        
        // 显示成功消息
        appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #10b981;">
                    ✅ 设置已保存！
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

    // ========== 流式消息管理 ==========

    // 流式更新节流状态
    let streamingUpdateState = {
        lastUpdateTime: 0,
        pendingUpdate: null,
        rafId: null
    };

    /**
     * 创建流式消息容器
     * @returns {string} 消息 ID
     */
    function createStreamingMessage() {
        const messageId = 'streaming_' + Date.now();
        const messageHTML = `
            <div class="assistant-message" id="${messageId}">
                <div class="message-content"></div>
            </div>
        `;
        appendMessage(messageHTML);
        return messageId;
    }

    /**
     * 更新流式消息内容（带节流优化）
     * @param {string} messageId - 消息 ID
     * @param {string} text - 完整文本
     */
    function updateStreamingMessage(messageId, text) {
        console.log('[UI] updateStreamingMessage called:', messageId, 'text length:', text.length, 'first 50 chars:', text.substring(0, 50));
        
        const now = Date.now();
        const timeSinceLastUpdate = now - streamingUpdateState.lastUpdateTime;
        
        // 调试：记录节流决策
        console.log('[UI] Throttle check: timeSinceLastUpdate =', timeSinceLastUpdate, 'ms');
        
        // 如果距离上次更新不足 50ms，使用 requestAnimationFrame 延迟更新
        if (timeSinceLastUpdate < 50 && streamingUpdateState.lastUpdateTime !== 0) {
            console.log('[UI] Throttling: queuing update');
            
            // 取消之前的 pending 更新
            if (streamingUpdateState.rafId !== null) {
                cancelAnimationFrame(streamingUpdateState.rafId);
                console.log('[UI] Cancelled previous RAF');
            }
            
            // 保存最新的文本
            streamingUpdateState.pendingUpdate = { messageId, text };
            
            // 安排在下一帧更新
            streamingUpdateState.rafId = requestAnimationFrame(() => {
                if (streamingUpdateState.pendingUpdate) {
                    console.log('[UI] Performing pending update, text length:', streamingUpdateState.pendingUpdate.text.length);
                    performStreamingUpdate(
                        streamingUpdateState.pendingUpdate.messageId,
                        streamingUpdateState.pendingUpdate.text
                    );
                    streamingUpdateState.pendingUpdate = null;
                    streamingUpdateState.rafId = null;
                }
            });
        } else {
            // 直接更新
            console.log('[UI] Performing direct update');
            performStreamingUpdate(messageId, text);
        }
    }

    /**
     * 执行实际的流式更新（内部函数）
     */
    function performStreamingUpdate(messageId, text) {
        console.log('[UI] performStreamingUpdate:', messageId, 'text length:', text.length);
        
        const messageEl = document.getElementById(messageId);
        if (!messageEl) {
            // 元素不存在可能是因为已经被 finalize 移除了 ID
            // 这是正常的竞态条件，静默忽略即可
            console.log('[UI] Message element not found (already finalized or removed):', messageId);
            return;
        }
        
        const contentEl = messageEl.querySelector('.message-content');
        if (contentEl) {
            console.log('[UI] Updating content, text preview:', text.substring(0, 100));
            // 格式化文本（支持代码块等）
            const formattedText = formatStreamingText(text);
            contentEl.innerHTML = formattedText;
            
            // 自动滚动到底部
            const chat = document.getElementById('agent-chat');
            if (chat) {
                chat.scrollTop = chat.scrollHeight;
            }
        } else {
            console.error('[UI] Content element not found in message:', messageId);
        }
        
        // 更新最后更新时间
        streamingUpdateState.lastUpdateTime = Date.now();
    }

    /**
     * 完成流式消息
     * @param {string} messageId - 消息 ID
     */
    function finalizeStreamingMessage(messageId) {
        console.log('[UI] Finalizing streaming message:', messageId);
        
        // 取消任何 pending 的更新
        if (streamingUpdateState.rafId !== null) {
            cancelAnimationFrame(streamingUpdateState.rafId);
            console.log('[UI] Cancelled pending RAF during finalize');
            streamingUpdateState.rafId = null;
        }
        
        // 清空 pending update
        if (streamingUpdateState.pendingUpdate) {
            // 如果 pending 的是当前消息，先执行最后一次更新
            if (streamingUpdateState.pendingUpdate.messageId === messageId) {
                console.log('[UI] Flushing final pending update before finalize');
                performStreamingUpdate(
                    streamingUpdateState.pendingUpdate.messageId,
                    streamingUpdateState.pendingUpdate.text
                );
            }
            streamingUpdateState.pendingUpdate = null;
        }
        
        const messageEl = document.getElementById(messageId);
        if (messageEl) {
            // 移除 ID，标记为完成
            messageEl.removeAttribute('id');
            console.log('[UI] Message finalized, ID removed');
        } else {
            console.warn('[UI] Message element not found during finalize:', messageId);
        }
    }

    /**
     * 格式化流式文本（增强版，支持更多 Markdown 格式）
     */
    function formatStreamingText(text) {
        // 转义 HTML
        let formatted = UITemplates.escapeHtml(text);
        
        // 处理代码块（简单匹配）
        formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<div class="code-block"><div class="code-language">${lang || 'text'}</div><pre>${code.trim()}</pre></div>`;
        });
        
        // 处理行内代码
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>');
        
        // 处理粗体 **text** 或 __text__
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
        
        // 处理斜体 *text* 或 _text_
        formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
        
        // 处理链接 [text](url)
        formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #667eea; text-decoration: underline;">$1</a>');
        
        // 处理无序列表 - item 或 * item
        formatted = formatted.replace(/^[\-\*]\s+(.+)$/gm, '<li style="margin-left: 20px;">$1</li>');
        
        // 处理有序列表 1. item
        formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-left: 20px; list-style-type: decimal;">$1</li>');
        
        // 处理换行（在列表项之后）
        formatted = formatted.replace(/<\/li>\n/g, '</li>');
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
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
        closeModal,
        createStreamingMessage,
        updateStreamingMessage,
        finalizeStreamingMessage,
        initializeMainModelSelect,  // v4.0.0
        refreshMainModelSelect      // v4.0.0
    };
})();


// =====================================================
// 模块: models.js
// =====================================================

// ==================== 模型管理模块 ====================
// v4.0.0: 重构为从 ProviderManager 动态获取模型

// 注意：此文件通过 build.js 合并，ProviderManager 已在全局作用域

const ModelManager = (function() {
    const CACHE_KEY = 'cached_models';
    const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时
    const STATUS_KEY = 'model_status';

    // 模型状态管理: { modelId: { available: boolean, lastTest: timestamp } }
    let modelStatus = {};

    /**
     * 初始化模型管理器
     */
    async function init() {
        await loadModelStatus();
        console.log('[ModelManager] Initialized');
    }

    /**
     * 获取所有可用模型（从 ProviderManager）
     */
    async function getAvailableModels() {
        // 从 ProviderManager 获取所有可用模型
        const models = ProviderManager.getAllAvailableModels();
        
        // 如果没有任何模型，返回默认模型列表（向后兼容）
        if (models.length === 0) {
            console.warn('[ModelManager] No models found, using fallback');
            return [
                { id: 'openrouter/auto', name: '🎲 Auto (智能路由)', provider: 'openrouter' }
            ];
        }
        
        return models;
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
     * 初始化模型管理器
     */
    function init() {
        loadCachedModels();
        loadModelStatus();
    }

    /**
     * 加载模型状态
     */
    function loadModelStatus() {
        try {
            modelStatus = GM_getValue(STATUS_KEY, {});
        } catch (e) {
            modelStatus = {};
        }
    }

    /**
     * 保存模型状态
     */
    function saveModelStatus() {
        GM_setValue(STATUS_KEY, modelStatus);
    }

    /**
     * 标记模型测试结果
     * @param {string} modelId - 模型ID
     * @param {boolean} success - 是否成功
     */
    function markModelTest(modelId, success) {
        const now = Date.now();
        
        if (!modelStatus[modelId]) {
            modelStatus[modelId] = {
                available: true,
                lastTest: now,
                consecutiveFailures: 0  // 连续失败次数
            };
        }
        
        if (success) {
            // 成功：重置失败计数，标记为可用
            modelStatus[modelId].available = true;
            modelStatus[modelId].consecutiveFailures = 0;
            modelStatus[modelId].lastTest = now;
        } else {
            // 失败：增加失败计数
            modelStatus[modelId].consecutiveFailures++;
            modelStatus[modelId].lastTest = now;
            
            console.log(`[ModelManager] 📊 模型 ${modelId} 失败计数: ${modelStatus[modelId].consecutiveFailures}/3`);
            
            // ✅ 连续失败 3 次后才标记为不可用
            if (modelStatus[modelId].consecutiveFailures >= 3) {
                modelStatus[modelId].available = false;
                console.warn(`[ModelManager] ⛔ 模型 ${modelId} 已连续失败 ${modelStatus[modelId].consecutiveFailures} 次，标记为不可用（1小时后自动恢复）`);
                console.log(`[ModelManager] 💾 当前状态:`, JSON.stringify(modelStatus[modelId]));
                ErrorTracker.report(
                    `模型 ${modelId} 连续失败 ${modelStatus[modelId].consecutiveFailures} 次`,
                    { modelId, failures: modelStatus[modelId].consecutiveFailures },
                    ErrorTracker.ErrorCategory.API,
                    ErrorTracker.ErrorLevel.WARN
                );
            }
        }
        
        saveModelStatus();
        console.log(`[ModelManager] ✅ 已保存模型状态到 GM_setValue`);
    }

    /**
     * 获取模型可用性状态
     * @param {string} modelId - 模型ID
     * @returns {boolean}
     */
    function isModelAvailable(modelId) {
        const status = modelStatus[modelId];
        
        console.log(`[ModelManager] 🔍 检查模型 ${modelId}:`, status ? `存在 (available=${status.available}, failures=${status.consecutiveFailures})` : '不存在');
        
        // 未测试或超过1小时：视为可用，并重置状态
        if (!status || (Date.now() - status.lastTest > 60 * 60 * 1000)) {
            if (status) {
                // ✅ 1小时后自动恢复：重置失败计数
                console.log(`[ModelManager] ⏰ 模型 ${modelId} 超过1小时未测试，自动恢复为可用状态`);
                delete modelStatus[modelId];
                saveModelStatus();
            } else {
                console.log(`[ModelManager] ✨ 模型 ${modelId} 从未测试过，视为可用`);
            }
            return true;
        }
        
        const isAvail = status.available;
        console.log(`[ModelManager] 📊 模型 ${modelId} 可用性: ${isAvail ? '✅ 可用' : '❌ 不可用'} (失败次数: ${status.consecutiveFailures}, lastTest: ${new Date(status.lastTest).toLocaleTimeString()})`);
        return isAvail;
    }

    /**
     * 对模型列表进行排序：可用的在前，不可用的在后
     * @param {Array} models - 模型数组
     * @returns {Array} 排序后的模型数组
     */
    function sortModelsByAvailability(models) {
        return [...models].sort((a, b) => {
            const aAvail = isModelAvailable(a.id);
            const bAvail = isModelAvailable(b.id);
            if (aAvail === bAvail) return 0;
            return aAvail ? -1 : 1;
        });
    }

    /**
     * 测试单个模型
     * @param {string} modelId - 模型ID
     * @param {string} apiKey - API Key
     * @returns {Promise<boolean>}
     */
    function testModel(modelId, apiKey) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: JSON.stringify({
                    model: modelId,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 5
                }),
                onload: (response) => {
                    resolve(response.status >= 200 && response.status < 300);
                },
                onerror: () => resolve(false),
                ontimeout: () => resolve(false)
            });
        });
    }

    /**
     * 批量测试所有模型
     * @param {Array} models - 模型列表
     * @param {string} apiKey - API Key
     * @param {Function} onProgress - 进度回调 (current, total, modelId, success)
     */
    async function batchTestModels(models, apiKey, onProgress) {
        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            const success = await testModel(model.id, apiKey);
            markModelTest(model.id, success);
            if (onProgress) {
                onProgress(i + 1, models.length, model.id, success);
            }
        }
    }

    /**
     * 更新模型选择下拉框（按提供商分组显示）
     */
    function updateModelSelect(models, currentModel) {
        const select = document.getElementById('setting-model');
        if (!select) return;
        
        const currentValue = currentModel || select.value;
        select.innerHTML = '';
        
        // Auto 选项
        const autoOption = document.createElement('option');
        autoOption.value = 'openrouter/auto';
        autoOption.textContent = '🎲 Auto (智能路由 - 推荐)';
        if (currentValue === 'openrouter/auto') autoOption.selected = true;
        select.appendChild(autoOption);
        
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────────';
        select.appendChild(separator);
        
        // 按提供商分组
        const groupedModels = {};
        models.forEach(model => {
            const providerId = model.providerId || model.provider || 'unknown';
            const providerName = model.providerName || providerId;
            
            if (!groupedModels[providerId]) {
                groupedModels[providerId] = {
                    name: providerName,
                    models: []
                };
            }
            groupedModels[providerId].models.push(model);
        });
        
        // 添加每个提供商的模型
        Object.keys(groupedModels).forEach(providerId => {
            const group = groupedModels[providerId];
            
            // 提供商标题
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${group.name} (${group.models.length})`;
            
            // 排序并添加模型
            const sortedModels = sortModelsByAvailability(group.models);
            sortedModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                const isAvail = isModelAvailable(model.id);
                option.textContent = isAvail ? model.name : `${model.name} (不可用)`;
                if (!isAvail) {
                    option.style.color = '#999';
                }
                if (model.id === currentValue) {
                    option.selected = true;
                }
                optgroup.appendChild(option);
            });
            
            select.appendChild(optgroup);
        });
    }

    /**
     * 加载缓存的模型列表（v4.0.0: 已废弃，使用 ProviderManager）
     */
    function loadCachedModels() {
        // v4.0.0: 此函数已废弃，保留仅为向后兼容
        console.warn('[ModelManager] loadCachedModels is deprecated, use ProviderManager instead');
        return { models: [], isExpired: true, hoursAgo: 0 };
    }

    /**
     * 保存模型列表到缓存（v4.0.0: 已废弃）
     */
    function saveToCache(models) {
        // v4.0.0: 此函数已废弃
        console.warn('[ModelManager] saveToCache is deprecated');
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

    /**
     * ✅ v4.0.0: 获取模型状态（供 API Router 使用）
     * @param {string} modelId - 模型ID
     * @returns {Object|null} 模型状态对象
     */
    function getModelStatus(modelId) {
        return modelStatus[modelId] || null;
    }

    return {
        init,
        getAvailableModels,
        updateModelSelect,
        loadCachedModels,
        saveToCache,
        isModelAvailable,
        testModel,
        batchTestModels,
        markModelTest,
        getModelStatus  // ✅ v4.0.0: 导出
    };
})();


// =====================================================
// 模块: api-router.js
// =====================================================

// ==================== API 路由模块 ====================
// v4.0.0: 重构为使用 ProviderManager
// 负责模型选择、故障转移和重试逻辑

const APIRouter = (function() {
    'use strict';

    /**
     * 获取可用模型列表（按优先级排序）
     */
    function getAvailableModels(currentModel) {
        // v4.0.0: 从 ProviderManager 获取所有可用模型
        const allModels = ProviderManager.getAllAvailableModels();
        
        let models = [...allModels];
        
        console.log(`[API Router] 📋 总模型数: ${models.length}, 当前模式: ${currentModel || 'auto'}`);

        // 将当前选中的模型排在最前面
        if (currentModel && currentModel !== 'openrouter/auto') {
            models.sort((a, b) => {
                if (a.id === currentModel) return -1;
                if (b.id === currentModel) return 1;
                return 0;
            });
        }

        // 过滤掉明确标记为不可用的模型（除非是用户强制选中的）
        if (currentModel && currentModel !== 'openrouter/auto') {
            console.log(`[API Router] ⚠️ 用户指定模型，不过滤可用性`);
            return models; // 如果用户指定了模型，则不根据可用性过滤，交给路由层去试
        }

        // ✅ Auto 模式：过滤掉不可用的模型
        const availableModels = models.filter(m => {
            const isAvail = ModelManager.isModelAvailable(m.id);
            if (!isAvail) {
                console.log(`[API Router] 🚫 过滤掉不可用模型: ${m.id}`);
            }
            return isAvail;
        });
        
        console.log(`[API Router] ✅ 过滤后可用模型数: ${availableModels.length} / ${models.length}`);
        return availableModels;
    }

    /**
     * 发送请求（带自动重试和故障转移）
     * @param {Object} params - 请求参数
     * @param {Function} onChunk - 流式回调
     * @returns {Promise<Object>}
     */
    async function sendRequest(params, onChunk) {
        const { userMessage, conversationHistory, config, abortController } = params;
        
        console.log('[API Router] 🎯 开始获取可用模型列表...');
        let modelsToTry = getAvailableModels(config.model);
        console.log(`[API Router] 📦 最终要尝试的模型数: ${modelsToTry.length}`);
        
        if (modelsToTry.length === 0) {
            // 如果没有可用模型，返回错误
            return { 
                success: false, 
                error: '没有可用的模型。请检查提供商配置。',
                attempts: 0 
            };
        }

        let lastError = null;
        let attempts = 0;
        const MAX_ATTEMPTS_PER_MODEL = 3; // ✅ 每个模型最多测试 3 次

        for (const model of modelsToTry) {
            console.log(`[API Router] ➡️ 准备尝试模型: ${model.id}`);
            // 创建当前模型的配置副本
            const currentConfig = { ...config, model: model.id };
            
            for (let i = 0; i < MAX_ATTEMPTS_PER_MODEL; i++) {
                if (abortController?.signal.aborted) {
                    return { success: false, cancelled: true, error: '请求已取消' };
                }

                attempts++;
                console.log(`[API Router] 🔄 尝试模型: ${model.id} (第 ${i + 1} 次)`);
                Utils.debugLog(`🔄 尝试模型: ${model.id} (第 ${i + 1} 次)`);

                try {
                    const result = await APIManager.callAPIStreaming(
                        userMessage, 
                        conversationHistory, 
                        currentConfig, 
                        abortController, 
                        onChunk
                    );

                    if (result.success) {
                        // 标记模型可用
                        ModelManager.markModelTest(model.id, true);
                        return result;
                    }

                    // 如果是因为被取消，直接返回
                    if (result.cancelled) {
                        console.log('[API Router] Request cancelled');
                        return result;
                    }

                    // 请求失败，记录错误
                    lastError = new Error(result.error || '未知错误');
                    console.log(`[API Router] ❌ 模型 ${model.id} 第 ${i + 1}/${MAX_ATTEMPTS_PER_MODEL} 次尝试失败`);
                    ErrorTracker.report(lastError, {
                        model: model.id,
                        attempt: i + 1,
                        error: result.error
                    }, ErrorTracker.ErrorCategory.API, ErrorTracker.ErrorLevel.WARN);
                    ModelManager.markModelTest(model.id, false);
                    
                    // ✅ 检查是否已达到最大失败次数，如果是则跳出内层循环
                    const status = ModelManager.getModelStatus(model.id);
                    if (status && !status.available) {
                        console.warn(`[API Router] ⛔ 模型 ${model.id} 已标记为不可用，停止重试，切换到下一个模型`);
                        break; // 跳出内层循环，尝试下一个模型
                    }
                    
                } catch (error) {
                    lastError = error;
                    ModelManager.markModelTest(model.id, false);
                    
                    ErrorTracker.report(error, {
                        model: model.id,
                        attempt: i + 1,
                        category: 'API_REQUEST'
                    }, ErrorTracker.ErrorCategory.API, ErrorTracker.ErrorLevel.ERROR);
                    
                    // ✅ 检查是否已达到最大失败次数
                    const status = ModelManager.getModelStatus(model.id);
                    if (status && !status.available) {
                        console.warn(`[API Router] ⛔ 模型 ${model.id} 已标记为不可用，停止重试，切换到下一个模型`);
                        break; // 跳出内层循环
                    }
                    
                    if (error.name === 'AbortError') {
                        return { success: false, cancelled: true, error: '请求已取消' };
                    }
                }
            }
        }

        return { 
            success: false, 
            error: `所有模型均失败。最后错误: ${lastError?.message || '未知'}`,
            attempts 
        };
    }

    return {
        sendRequest,
        getAvailableModels
    };
})();


// =====================================================
// 模块: api.js
// =====================================================

// ==================== API 调用模块 ====================
// v4.0.0: 支持多提供商 API 调用

const APIManager = (function() {
    let isProcessing = false;

    /**
     * 根据模型 ID 获取对应的提供商配置
     */
    function getProviderConfig(modelId) {
        const provider = ProviderManager.getProviderByModel(modelId);
        if (!provider) {
            throw new Error(`未找到模型 "${modelId}" 的提供商配置`);
        }
        
        const template = ProviderManager.getTemplate(provider.template);
        if (!template) {
            throw new Error(`未找到模板 "${provider.template}"`);
        }
        
        return { provider, template };
    }

    /**
     * 构建请求（使用模板）
     */
    function buildRequestWithTemplate(template, provider, model, messages, params) {
        // 构建端点 URL
        let endpoint = template.endpoint
            .replace('{baseUrl}', provider.baseUrl)
            .replace('{apiKey}', provider.apiKey || '')
            .replace('{model}', model);
        
        // 构建请求头
        const headers = template.headers(provider.apiKey);
        
        // 构建请求体
        const body = template.buildRequest(model, messages, params);
        
        return { endpoint, headers, body };
    }

    /**
     * 解析流式响应（使用模板）
     */
    function parseStreamChunk(template, chunk) {
        return template.parseStreamChunk(chunk);
    }

    /**
     * 检查流是否结束（使用模板）
     */
    function isStreamFinished(template, chunk) {
        return template.isStreamFinished ? template.isStreamFinished(chunk) : false;
    }

    /**
     * 调用 AI API（流式输出版本 - v4.0.0 多提供商支持）
     */
    async function callAPIStreaming(userMessage, conversationHistory, config, abortController, onChunk) {
        if (isProcessing) return null;
        
        isProcessing = true;
        let fullText = '';
        
        try {
            // 验证配置
            if (!config.model) {
                throw new Error('模型未设置');
            }
            
            console.log('[API] Using model:', config.model);
            
            // v4.0.0: 获取提供商配置和模板
            const { provider, template } = getProviderConfig(config.model);
            
            console.log('[API] Provider:', provider.name, '(', provider.id, ')');
            console.log('[API] Template:', template.name);
            
            // v4.0.0: 验证 API Key（本地服务不需要）
            if (!provider.apiKey && !provider.isLocal && template.headers.toString().includes('apiKey')) {
                throw new Error(`提供商 "${provider.name}" 的 API Key 未设置`);
            }
            
            const messages = buildMessages(userMessage, conversationHistory, config);
            
            // v4.0.0: 使用模板构建请求
            const params = {
                temperature: config.temperature || 0.7,
                top_p: config.topP || 0.95,
                max_tokens: Math.min(config.maxTokens || 2048, 8192)
            };
            
            const { endpoint, headers, body } = buildRequestWithTemplate(
                template, provider, config.model, messages, params
            );
            
            Utils.debugLog('📤 API 流式请求:', { 
                model: config.model, 
                provider: provider.name,
                template: provider.template,
                messagesCount: messages.length 
            });
            
            // v4.0.0: 根据提供商类型选择请求方法
            // 对于本地服务（localhost），使用 GM_xmlhttpRequest 绕过 CORS
            const isLocalhost = provider.baseUrl.includes('localhost') || 
                               provider.baseUrl.includes('127.0.0.1');
            
            let response;
            if (isLocalhost) {
                // 使用 GM_xmlhttpRequest 处理本地请求
                response = await makeGMRequest(endpoint, headers, body, abortController);
            } else {
                // 使用 fetch 处理远程请求
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'HTTP-Referer': window.location.href,
                        'X-Title': 'AI Browser Agent'
                    },
                    body: JSON.stringify(body),
                    signal: abortController?.signal
                });
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            // 获取 ReadableStream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            // 读取流式数据
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                // 解码数据块
                buffer += decoder.decode(value, { stream: true });
                
                // 分割 SSE 消息
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留不完整的行
                
                // 处理每一行
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                    
                    const dataStr = trimmedLine.slice(6);
                    
                    // 检查是否结束
                    if (dataStr === '[DONE]') {
                        Utils.debugLog('✅ 流式输出完成');
                        return { success: true, message: fullText };
                    }
                    
                    try {
                        const data = JSON.parse(dataStr);
                        
                        // v4.0.0: 使用模板解析响应
                        const content = parseStreamChunk(template, data);
                        
                        if (content) {
                            fullText += content;
                            // 调用回调，传递增量文本
                            onChunk(content, fullText);
                        }
                        
                        // v4.0.0: 检查流是否结束
                        if (isStreamFinished(template, data)) {
                            Utils.debugLog('✅ 流式输出完成（模板标记）');
                            return { success: true, message: fullText };
                        }
                    } catch (e) {
                        Utils.debugWarn('⚠️ SSE 解析失败:', e);
                    }
                }
            }
            
            Utils.debugLog('📥 流式响应完成，总长度:', fullText.length);
            return { success: true, message: fullText };
            
        } catch (error) {
            Utils.debugError('API 流式调用失败:', error);
            
            // 检查是否是用户主动取消
            if (error.name === 'AbortError') {
                return { success: false, cancelled: true, error: '请求已取消', message: fullText };
            }
            
            return { success: false, error: error.message, message: fullText };
        } finally {
            isProcessing = false;
        }
    }

    /**
     * 调用 AI API（旧版阻塞式）
     * @note 保留作为 fallback，当浏览器不支持 ReadableStream 时使用
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
            
            Utils.debugLog('📤 API 请求:', { model: config.model, messagesCount: messages.length });
            
            const response = await makeRequest(requestBody, config.apiKey, abortController);
            
            Utils.debugLog('📥 API 响应:', response.choices ? '成功' : '失败');
            
            if (response.choices && response.choices.length > 0) {
                const assistantMessage = response.choices[0].message.content;
                return { success: true, message: assistantMessage };
            } else {
                throw new Error('无效的 API 响应');
            }

        } catch (error) {
            Utils.debugError('API 调用失败:', error);
            
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
     * 使用 GM_xmlhttpRequest 发起请求（用于本地服务，绕过 CORS）
     */
    function makeGMRequest(endpoint, headers, body, abortController) {
        return new Promise((resolve, reject) => {
            let aborted = false;
            
            // 监听中止信号
            if (abortController && abortController.signal) {
                try {
                    abortController.signal.addEventListener('abort', () => {
                        aborted = true;
                        reject(new DOMException('The user aborted a request.', 'AbortError'));
                    });
                } catch (error) {
                    console.warn('[API] Failed to add abort listener:', error);
                }
            }
            
            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(body),
                responseType: 'text',
                timeout: 60000, // 60秒超时
                onload: (response) => {
                    if (aborted) return;
                    
                    // 创建模拟的 Response 对象
                    const mockResponse = {
                        ok: response.status >= 200 && response.status < 300,
                        status: response.status,
                        statusText: response.statusText,
                        body: {
                            getReader: () => {
                                // 将文本转换为 ReadableStream
                                const encoder = new TextEncoder();
                                const chunks = [];
                                let position = 0;
                                
                                // 按行分割响应
                                const lines = response.responseText.split('\n');
                                lines.forEach(line => {
                                    if (line.trim()) {
                                        chunks.push(encoder.encode(line + '\n'));
                                    }
                                });
                                
                                return {
                                    read: async () => {
                                        if (position >= chunks.length) {
                                            return { done: true, value: undefined };
                                        }
                                        return { done: false, value: chunks[position++] };
                                    }
                                };
                            }
                        },
                        text: async () => response.responseText
                    };
                    
                    resolve(mockResponse);
                },
                onerror: (error) => {
                    if (!aborted) {
                        reject(new Error(`GM_xmlhttpRequest error: ${error}`));
                    }
                },
                ontimeout: () => {
                    if (!aborted) {
                        reject(new Error('Request timeout'));
                    }
                }
            });
        });
    }

    /**
     * 估算文本的 token 数量（粗略估算）
     * 中文约 1.5-2 字符/token，英文约 4 字符/token
     */
    function estimateTokens(text) {
        if (!text) return 0;
        
        // 简单估算：中文字符和英文字符分开计算
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = text.length - chineseChars;
        
        // 中文：1.8 字符/token，其他：4 字符/token
        const tokens = Math.ceil(chineseChars / 1.8) + Math.ceil(otherChars / 4);
        
        return tokens;
    }

    /**
     * 构建消息数组（带智能上下文管理）
     */
    function buildMessages(currentMessage, history, config) {
        // 系统提示词
        const systemMessage = {
            role: 'system',
            content: `你是运行在浏览器中的 AI Web 助手，通过 Tampermonkey 用户脚本运行在当前网页中。

## 核心能力
- **执行 JavaScript 代码**：你可以发送 \`\`\`js 包裹的 JavaScript 代码块，系统会自动执行并显示结果
- **操作当前页面**：可以读取和修改当前网页的 DOM、样式、内容等
- **获取页面信息**：可以提取页面文本、链接、图片等信息
- **与页面交互**：可以模拟点击、输入、滚动等操作
- 你的回复应该明确且有针对性，旨在解决用户的问题或完成用户任务

## ⚠️ 重要：代码执行规则
1. **代码在全局作用域执行**，不能使用 return 语句
2. **直接写表达式或语句**，系统会自动捕获最后一个表达式的值
3. **如需返回复杂数据**，直接写出变量名或对象即可
4. **异步代码需用 async/await**：如需执行异步操作，使用 async 函数
5. **避免阻塞操作**：不要执行长时间运行的同步代码

## ✅ 正确示例

**查询页面标题：**
\`\`\`js
document.title
\`\`\`

**统计页面元素数量：**
\`\`\`js
document.querySelectorAll('body *').length
\`\`\`

**获取所有链接：**
\`\`\`js
Array.from(document.querySelectorAll('a')).map(a => ({
  text: a.textContent.trim(),
  href: a.href
})).slice(0, 10)
\`\`\`

**修改页面背景色：**
\`\`\`js
document.body.style.backgroundColor = '#f0f0f0';
'背景色已修改'
\`\`\`

## ❌ 错误示例

**不要使用 return：**
\`\`\`js
return document.title;  // ❌ 错误：SyntaxError: Illegal return statement
\`\`\`

**正确做法：**
\`\`\`js
document.title  // ✅ 正确：直接写表达式
\`\`\``
        };

        // v4.0.0: 智能上下文管理
        const maxTokens = config.maxTokens || 2048;
        
        // 为响应预留空间（至少 512，最多 1024 tokens）
        const reservedForResponse = Math.max(512, Math.min(maxTokens, 1024));
        
        // 假设模型的上下文窗口为 8K（保守估计，适用于大多数模型）
        // 常见模型的上下文窗口：
        // - GPT-3.5/4: 4K-128K
        // - Claude: 8K-200K
        // - Llama 3: 8K-128K
        // - Qwen: 8K-32K
        // - Mistral: 8K-32K
        const CONTEXT_WINDOW = 8192;
        const availableForContext = CONTEXT_WINDOW - reservedForResponse;
        
        console.log('[API] Context management: maxTokens=', maxTokens, ', reserved=', reservedForResponse, ', available=', availableForContext);
        
        // 计算当前消息和系统提示词的 token 数
        const currentMessageTokens = estimateTokens(currentMessage);
        const systemMessageTokens = estimateTokens(systemMessage.content);
        const fixedTokens = currentMessageTokens + systemMessageTokens;
        
        console.log('[API] Fixed tokens: system=', systemMessageTokens, ', current=', currentMessageTokens, ', total=', fixedTokens);
        
        // 如果固定部分已经超过可用上下文，只保留系统提示词和当前消息
        if (fixedTokens >= availableForContext) {
            console.warn('[API] ⚠️ 当前消息过长，可能超出上下文限制');
            return [
                systemMessage,
                {
                    role: 'user',
                    content: currentMessage
                }
            ];
        }
        
        // 计算可用于历史对话的 token 数
        const availableForHistory = availableForContext - fixedTokens;
        console.log('[API] Available for history:', availableForHistory, 'tokens');
        
        // 从最近的对话开始，逐步添加历史消息，直到达到 token 限制
        const recentHistory = (history || []).slice().reverse(); // 反转，从最近的消息开始
        const selectedHistory = [];
        let usedTokens = 0;
        
        for (const msg of recentHistory) {
            const msgTokens = estimateTokens(msg.content);
            
            // 如果添加这条消息会超出限制，停止
            if (usedTokens + msgTokens > availableForHistory) {
                console.log('[API] History truncated: used', usedTokens, '/', availableForHistory, 'tokens');
                break;
            }
            
            selectedHistory.unshift({  // unshift 保持原始顺序
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.content
            });
            usedTokens += msgTokens;
        }
        
        console.log('[API] Selected', selectedHistory.length, 'history messages, using', usedTokens, 'tokens');
        
        // 构建完整的消息数组
        const messages = [
            systemMessage,
            ...selectedHistory,
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
            if (abortController && abortController.signal) {
                try {
                    abortController.signal.addEventListener('abort', () => {
                        xhr.abort();
                        reject(new DOMException('The user aborted a request.', 'AbortError'));
                    });
                } catch (error) {
                    console.warn('[API] Failed to add abort listener:', error);
                }
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
        callAPIStreaming,
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
        historyLoaded: false,  // 标记历史记录是否已加载
        executionQueue: []     // 本地代码执行任务队列
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
        
        // 3. 清空执行队列
        state.executionQueue = [];
        
        // 4. 重置处理状态
        state.isProcessing = false;
        
        // 5. 隐藏打字指示器
        UIManager.hideTypingIndicator();
        
        // 6. 更新按钮状态
        UIManager.updateSendButtonState(false);
        
        // 7. 添加系统提示
        addAssistantMessage('已停止');
    }

    // ========== 消息处理核心 ==========

    /**
     * 处理用户消息（主入口）
     */
    async function handleMessage(message) {
        // 如果正在处理，将消息加入队列
        if (state.isProcessing) {
            state.messageQueue.push(message);
            Utils.debugLog('⏳ 消息已加入队列，等待处理');
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
            console.log('[Chat] Current config model:', config.model);
            
            const history = HistoryManager.getHistory();
            
            // 创建 AbortController 用于取消请求
            state.currentAbortController = new AbortController();
            
            // 创建流式消息容器
            const messageId = UIManager.createStreamingMessage();
            let fullText = '';
            
            // 使用流式 API 调用（通过路由层）
            const response = await APIRouter.sendRequest(
                { userMessage: message, conversationHistory: history, config, abortController: state.currentAbortController },
                (chunk, accumulatedText) => {
                    // 实时更新消息内容
                    fullText = accumulatedText;
                    UIManager.updateStreamingMessage(messageId, accumulatedText);
                }
            );
            
            // 请求完成，清除 AbortController
            state.currentAbortController = null;
            
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false); // 恢复按钮状态
            
            // 完成流式消息
            UIManager.finalizeStreamingMessage(messageId);

            if (response.success) {
                // 保存完整消息到历史
                saveToHistory({ role: 'assistant', content: fullText });
                
                // 提取代码块加入本地执行队列（不立即执行）
                extractAndQueueCodeBlocks(fullText);
                
                // 交互完成后，尝试执行队列中的任务
                await processExecutionQueue();
            } else {
                // 检查是否是用户主动取消
                if (response.cancelled) {
                    Utils.debugLog('✅ 请求已被用户取消');
                    // 如果已有部分内容，仍然保存
                    if (fullText.length > 0) {
                        saveToHistory({ role: 'assistant', content: fullText });
                    }
                    return; // 不显示错误消息，因为已经显示了停止提示
                }
                addAssistantMessage(`❌ API 错误: ${response.error}`);
            }

        } catch (error) {
            Utils.debugError('❌ 消息处理失败:', error);
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false); // 恢复按钮状态
            
            // 检查是否是中止错误
            if (error.name === 'AbortError') {
                Utils.debugLog('✅ 请求已中止');
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
            Utils.debugLog('📤 从队列取出消息处理');
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
     * 提取代码块并加入本地执行队列
     */
    function extractAndQueueCodeBlocks(text) {
        const codeBlocks = extractCodeBlocks(text);
        const jsCodeBlocks = codeBlocks.filter(block => block.lang === 'javascript' || block.lang === 'js');
        
        jsCodeBlocks.forEach(block => {
            state.executionQueue.push({
                code: block.code,
                status: 'pending'
            });
        });
        
        if (jsCodeBlocks.length > 0) {
            Utils.debugLog(`📥 已将 ${jsCodeBlocks.length} 个代码块加入执行队列`);
        }
    }

    /**
     * 处理本地执行队列
     */
    async function processExecutionQueue() {
        if (state.executionQueue.length === 0) return;
        
        Utils.debugLog(`🚀 开始处理执行队列 (${state.executionQueue.length} 个任务)`);
        
        const results = [];
        while (state.executionQueue.length > 0) {
            const task = state.executionQueue.shift();
            if (task.status === 'pending') {
                const result = await executeWithRetry(task.code, results.length + 1, 3);
                results.push(result);
            }
        }
        
        if (results.length > 0) {
            await sendCombinedResultsToAI(results);
        }
    }

    /**
     * 执行消息中的代码块（自动执行安全代码，高危代码需要确认）
     * @deprecated 此函数现在主要用于手动触发或高危代码检测，常规执行由队列处理
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
            Utils.debugError('❌ 代码块执行失败:', error);
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
                Utils.debugLog(`🔄 执行代码块 ${index} (尝试 ${attempt}/${maxRetries})`);
                
                const result = unsafeWindow.eval(code);
                const resultStr = safeStringify(result);
                
                Utils.debugLog(`✅ 代码块 ${index} 执行成功 (尝试 ${attempt})`);
                
                return {
                    index,
                    status: 'success',
                    result: resultStr,
                    attempts: attempt
                };
                
            } catch (error) {
                lastError = error;
                Utils.debugWarn(`⚠️ 代码块 ${index} 执行失败 (尝试 ${attempt}/${maxRetries}):`, error.message);
                
                // 如果不是最后一次尝试，等待一小段时间再重试
                if (attempt < maxRetries) {
                    await sleep(500); // 等待 500ms 后重试
                }
            }
        }
        
        // 所有尝试都失败了
        Utils.debugError(`❌ 代码块 ${index} 执行失败，已重试 ${maxRetries} 次`);
        
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
        
        // 创建流式消息容器
        const messageId = UIManager.createStreamingMessage();
        let fullText = '';
        
        const response = await APIRouter.sendRequest(
            { userMessage: feedbackMessage, conversationHistory: history, config, abortController: state.currentAbortController },
            (chunk, accumulatedText) => {
                fullText = accumulatedText;
                UIManager.updateStreamingMessage(messageId, accumulatedText);
            }
        );
        
        // 请求完成，清除 AbortController
        state.currentAbortController = null;
        
        UIManager.hideTypingIndicator();
        UIManager.updateSendButtonState(false); // 恢复按钮状态
        
        // 完成流式消息
        UIManager.finalizeStreamingMessage(messageId);
        
        // 重置处理状态
        state.isProcessing = false;
        
        // 显示 AI 回复
        if (response.success) {
            // 保存完整消息到历史
            saveToHistory({ role: 'assistant', content: fullText });
            
            // 检查 AI 回复中是否有新的代码块需要执行
            setTimeout(() => executeCodeBlocksFromMessage(fullText), 100);
        } else {
            // 检查是否是用户主动取消
            if (response.cancelled) {
                Utils.debugLog('✅ 代码执行反馈请求已被用户取消');
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
                            Utils.debugLog('⚠️ 用户确认执行高危代码:', wid);
                            
                            if (typeof ChatManager !== 'undefined' && ChatManager.getCodeFromStore) {
                                const code = ChatManager.getCodeFromStore(wid);
                                if (code) {
                                    ChatManager.executeJavaScript(code);
                                    // 移除警告框
                                    const warningBox = btn.closest('.assistant-message');
                                    if (warningBox) warningBox.remove();
                                }
                            } else {
                                Utils.debugError('❌ ChatManager 未初始化');
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
            // 使用纯数字索引，便于排序和清理
            state.codeBlockIndex++;
            const blockId = 'code_' + state.codeBlockIndex;
            state.codeBlockStore[blockId] = block.code;
            
            // 如果超过限制，删除最旧的 20 个
            const keys = Object.keys(state.codeBlockStore);
            if (keys.length > MAX_CODE_BLOCKS) {
                // 按数字索引排序（提取 code_ 后面的数字）
                keys.sort((a, b) => {
                    const numA = parseInt(a.split('_')[1]) || 0;
                    const numB = parseInt(b.split('_')[1]) || 0;
                    return numA - numB;
                });
                // 删除最旧的 20 个
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
        Utils.debugLog('🗑️ 聊天记录已清空，重置加载标志');
        
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
        Utils.debugLog(`✅ 历史记录加载完成，共 ${history.length} 条消息`);
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

    /**
     * 导航到上一条用户消息（滚动定位）
     */
    function navigateToPreviousUserMessage() {
        const chat = document.getElementById('agent-chat');
        if (!chat) return false;
        
        // 获取所有用户消息元素
        const userMessages = Array.from(chat.querySelectorAll('.user-message'));
        
        if (userMessages.length === 0) {
            console.log('ℹ️ 没有用户消息');
            return false;
        }
        
        // 找到当前可见的用户消息索引
        const chatRect = chat.getBoundingClientRect();
        let currentIndex = -1;
        
        for (let i = userMessages.length - 1; i >= 0; i--) {
            const msgRect = userMessages[i].getBoundingClientRect();
            // 如果消息在可视区域内或接近顶部
            if (msgRect.top <= chatRect.top + 50) {
                currentIndex = i;
                break;
            }
        }
        
        // 如果没有找到当前消息，定位到最后一条
        if (currentIndex === -1) {
            currentIndex = userMessages.length;
        }
        
        // 定位到上一条消息
        const targetIndex = currentIndex - 1;
        if (targetIndex < 0) {
            console.log('ℹ️ 已经是第一条消息');
            // 滚动到顶部
            chat.scrollTo({ top: 0, behavior: 'smooth' });
            return false;
        }
        
        const targetMessage = userMessages[targetIndex];
        targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 添加高亮效果
        highlightMessage(targetMessage);
        
        console.log(`⬆️ 已定位到第 ${targetIndex + 1} 条用户消息`);
        return true;
    }
    
    /**
     * 导航到下一条用户消息（滚动定位）
     */
    function navigateToNextUserMessage() {
        const chat = document.getElementById('agent-chat');
        if (!chat) return false;
        
        // 获取所有用户消息元素
        const userMessages = Array.from(chat.querySelectorAll('.user-message'));
        
        if (userMessages.length === 0) {
            console.log('ℹ️ 没有用户消息');
            return false;
        }
        
        // 找到当前可见的用户消息索引
        const chatRect = chat.getBoundingClientRect();
        let currentIndex = -1;
        
        for (let i = 0; i < userMessages.length; i++) {
            const msgRect = userMessages[i].getBoundingClientRect();
            // 如果消息在可视区域内或接近底部
            if (msgRect.bottom >= chatRect.bottom - 50) {
                currentIndex = i;
                break;
            }
        }
        
        // 如果没有找到当前消息，定位到第一条
        if (currentIndex === -1) {
            currentIndex = -1;
        }
        
        // 定位到下一条消息
        const targetIndex = currentIndex + 1;
        if (targetIndex >= userMessages.length) {
            console.log('ℹ️ 已经是最后一条消息');
            // 滚动到底部
            chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
            return false;
        }
        
        const targetMessage = userMessages[targetIndex];
        targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 添加高亮效果
        highlightMessage(targetMessage);
        
        console.log(`⬇️ 已定位到第 ${targetIndex + 1} 条用户消息`);
        return true;
    }
    
    /**
     * 高亮显示消息（临时效果）
     */
    function highlightMessage(messageElement) {
        const chat = document.getElementById('agent-chat');
        if (!chat) return;
        
        // 移除之前的高亮
        const previousHighlight = chat.querySelector('.message-highlighted');
        if (previousHighlight) {
            previousHighlight.classList.remove('message-highlighted');
        }
        
        // 添加高亮类
        messageElement.classList.add('message-highlighted');
        
        // 2秒后移除高亮
        setTimeout(() => {
            messageElement.classList.remove('message-highlighted');
        }, 2000);
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
        navigateToPreviousUserMessage,  // 导航到上一条用户消息
        navigateToNextUserMessage,  // 导航到下一条用户消息
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
            
            // 4. 初始化快捷键系统
            initShortcuts();
            console.log('✅ 快捷键系统已初始化');
            
            // 5. 创建启动按钮
            createLauncherButton();
            console.log('✅ 启动按钮已创建');
            
            // 6. 启动应用
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
        // ✅ v4.0.0: 初始化错误追踪器（最先初始化）
        ErrorTracker.init();
        console.log('✅ ErrorTracker 已初始化');
        
        // 初始化配置管理器（带依赖注入）
        await ConfigManager.init({
            eventManager: EventManager
        });
        
        // 初始化历史管理器
        await HistoryManager.init();
        
        // 初始化状态管理器
        await StateManager.init();
        
        // v4.0.0: 初始化提供商管理器
        await ProviderManager.init();
        console.log('✅ ProviderManager 已初始化');
        
        // 初始化模型管理器
        await ModelManager.init();
        console.log('✅ ModelManager 已初始化');
        
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
     * 初始化快捷键系统
     */
    function initShortcuts() {
        // 初始化快捷键管理器
        ShortcutManager.init();
        
        // 注册核心快捷键
        
        // 1. Ctrl+Enter: 发送消息
        ShortcutManager.register('Ctrl+Enter', (e) => {
            const input = document.getElementById('agent-input');
            if (input && document.activeElement === input) {
                const message = input.value.trim();
                if (message) {
                    EventManager.emit(EventManager.EventTypes.CHAT_MESSAGE_SENT, message);
                    input.value = '';
                }
            }
        }, '发送消息');
        
        // 2. Escape: 隐藏窗口
        ShortcutManager.register('Escape', (e) => {
            // 如果设置对话框打开，先关闭设置对话框
            const modal = document.getElementById('settings-modal');
            if (modal) {
                UIManager.closeModal();
                return;
            }
            
            // 否则隐藏聊天窗口
            UIManager.hide();
        }, '隐藏窗口');
        
        // 3. Ctrl+ArrowUp: 导航到上一条用户消息
        ShortcutManager.register('Ctrl+ArrowUp', (e) => {
            const chat = document.getElementById('agent-chat');
            if (chat && chat.style.display !== 'none') {
                ChatManager.navigateToPreviousUserMessage();
            }
        }, '导航到上一条消息');
        
        // 4. Ctrl+ArrowDown: 导航到下一条用户消息
        ShortcutManager.register('Ctrl+ArrowDown', (e) => {
            const chat = document.getElementById('agent-chat');
            if (chat && chat.style.display !== 'none') {
                ChatManager.navigateToNextUserMessage();
            }
        }, '导航到下一条消息');
        
        // ✅ v4.0.0: Ctrl+Shift+E: 打开错误追踪面板
        ShortcutManager.register('Ctrl+Shift+E', (e) => {
            ErrorTracker.showPanel();
        }, '打开错误面板');
        
        console.log('⌨️ 已注册 5 个核心快捷键');
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

