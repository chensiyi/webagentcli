// ==UserScript==
// @name         Web AI Agent
// @namespace    https://github.com/chensiyi1994
// @version      5.1.0
// @description  基于ai模型的Web AI 助手,支持 JS 执行
// @author       chensiyi1994
// @match        *://*/*
// @match        file:///*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

// 构建信息
// 版本: 5.1.0
// 日期: 2026-04-19
// 模块数: 26


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
        UI_STATE_CHANGED: 'agent:ui:state:changed',
        
        // 聊天相关
        CHAT_MESSAGE_SENT: 'agent:chat:message:sent',
        CHAT_MESSAGE_RECEIVED: 'agent:chat:message:received',
        CHAT_CLEAR: 'agent:chat:clear',
        
        // 消息流式处理
        MESSAGE_STREAMING: 'agent:message:streaming',
        MESSAGE_COMPLETE: 'agent:message:complete',
        MESSAGE_ERROR: 'agent:message:error',
        
        // 代码执行
        CODE_BLOCKS_DETECTED: 'agent:code:blocks:detected',
        CODE_BLOCK_DETECTED: 'agent:code:block:detected',  // P0: 单个代码块检测
        CODE_EXECUTED: 'agent:code:executed',
        CODE_EXECUTION_ERROR: 'agent:code:execution:error',
        CODE_BATCH_EXECUTED: 'agent:code:batch:executed',
        CODE_CONFIRMATION_REQUIRED: 'agent:code:confirmation:required',  // P0: 高危代码确认
        
        // 会话管理
        CHAT_CLEARED: 'agent:chat:cleared',
        REQUEST_CANCELLED: 'agent:request:cancelled',
        
        // 配置相关(统一使用 SETTINGS_*)
        SETTINGS_OPEN: 'agent:settings:open',
        SETTINGS_SAVED: 'agent:settings:saved',
        SETTINGS_UPDATED: 'agent:settings:updated',
        
        // P2: 模型和供应商管理
        MODELS_UPDATED: 'agent:models:updated',  // 模型列表更新
        PROVIDER_UPDATED: 'agent:provider:updated',  // 供应商配置更新
        
        // P2: 会话管理
        SESSION_RESTORED: 'agent:session:restored',  // 会话恢复
        
        // API 相关
        API_CALL_START: 'agent:api:call:start',
        API_CALL_SUCCESS: 'agent:api:call:success',
        API_CALL_ERROR: 'agent:api:call:error',
        
        // 错误处理
        NETWORK_ERROR: 'agent:error:network',
        MODEL_ERROR: 'agent:error:model',
        GENERAL_ERROR: 'agent:error:general',
        
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
        
        // 使用 Shadow DOM 绕过 CSP 限制（YouTube 等严格网站需要）
        const shadow = panel.attachShadow({ mode: 'open' });
        
        // 注入样式
        const style = document.createElement('style');
        style.textContent = `
            .container {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                padding: 20px;
            }
            button {
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            button:hover {
                opacity: 0.9;
            }
        `;
        shadow.appendChild(style);
        
        // 使用 DOMParser 安全地解析 HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const content = doc.body;
        
        // 复制所有子元素到 Shadow DOM
        while (content.firstChild) {
            shadow.appendChild(content.firstChild);
        }
        
        // 添加关闭按钮事件
        const closeButton = shadow.querySelector('button[onclick*="clear"]');
        if (closeButton) {
            closeButton.removeAttribute('onclick');
            closeButton.addEventListener('click', () => {
                ErrorTracker.clear();
            });
        }
        
        const exportButton = shadow.querySelector('button[onclick*="exportReport"]');
        if (exportButton) {
            exportButton.removeAttribute('onclick');
            exportButton.addEventListener('click', () => {
                console.log(ErrorTracker.exportReport());
            });
        }

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
// 模块: services/storage/StorageManager.js
// =====================================================

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
            const config = GM_getValue(STORAGE_KEYS.CONFIG(), null);
            if (config) state.config = { ...state.config, ...config };

            const ui = GM_getValue(STORAGE_KEYS.UI(), null);
            if (ui) state.ui = { ...state.ui, ...ui };

            const session = GM_getValue(STORAGE_KEYS.SESSION(), null);
            if (session) state.session = { ...state.session, ...session };

            const models = GM_getValue(STORAGE_KEYS.MODELS(), null);
            if (models) state.models = { ...state.models, ...models };

            console.log('[UnifiedStateManager] 已加载持久化状态 (域名:', getDomainKey(), ')');
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
                GM_setValue(STORAGE_KEYS.CONFIG(), state.config);
            } else if (path.startsWith('ui.')) {
                GM_setValue(STORAGE_KEYS.UI(), state.ui);
            } else if (path.startsWith('session.')) {
                GM_setValue(STORAGE_KEYS.SESSION(), state.session);
            } else if (path.startsWith('models.')) {
                GM_setValue(STORAGE_KEYS.MODELS(), state.models);
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
            GM_setValue(STORAGE_KEYS.CONFIG(), state.config);
            GM_setValue(STORAGE_KEYS.UI(), state.ui);
            GM_setValue(STORAGE_KEYS.SESSION(), state.session);
            GM_setValue(STORAGE_KEYS.MODELS(), state.models);
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


// =====================================================
// 模块: services/provider/ProviderManager.js
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
    
    // P2: 加载所有启用供应商的模型列表
    const enabledProviders = providers.filter(p => {
        // 启用的供应商
        if (p.enabled === false) return false;
        
        // 本地服务不需要 API Key
        if (p.isLocal) return true;
        
        // 云端服务需要 API Key
        return p.apiKey;
    });
    
    console.log(`[ProviderManager] 🔄 正在加载 ${enabledProviders.length} 个启用供应商的模型...`);
    
    for (const provider of enabledProviders) {
        try {
            await loadProviderModels(provider.id);
        } catch (error) {
            console.error(`[ProviderManager] ⚠️ 加载 ${provider.name} 模型失败:`, error.message);
        }
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
 * P2: 通用模型拉取（根据供应商 template）
 * @param {Object} provider - 供应商对象
 * @returns {Promise<Array>} 模型列表
 */
async function fetchModelsFromProvider(provider) {
    // P2: 本地服务不需要 API Key
    if (!provider.isLocal && !provider.apiKey) {
        throw new Error('API Key 未配置');
    }
    
    // P2: 统一转换为小写进行比较
    const template = (provider.template || '').toLowerCase();
    
    // 根据不同 template 调用不同 API
    switch (template) {
        case 'openai':
            return await fetchOpenAIModels(provider);
        case 'openrouter':
            return await fetchOpenRouterModels(provider);
        default:
            throw new Error(`不支持的 template: ${provider.template}`);
    }
}

/**
 * 获取 OpenAI 兼容接口的模型列表
 */
async function fetchOpenAIModels(provider) {
    const url = `${provider.baseUrl}/models`;
    
    // P2: 本地服务不需要 API Key
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (!provider.isLocal && provider.apiKey) {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
        return data.data.map(model => ({
            id: model.id,
            name: model.name || model.id,
            enabled: true,
            contextLength: null,
            pricing: null
        }));
    }
    
    return [];
}

/**
 * 获取 OpenRouter 模型列表
 */
async function fetchOpenRouterModels(provider) {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
        return data.data.map(model => ({
            id: model.id,
            name: model.name || model.id,
            enabled: true,
            contextLength: model.context_length,
            pricing: model.pricing
        }));
    }
    
    return [];
}

/**
 * P2: 加载指定供应商的模型列表（智能对比）
 * @param {string} providerId - 供应商 ID
 */
async function loadProviderModels(providerId) {
    try {
        const provider = providers.find(p => p.id === providerId);
        if (!provider) {
            console.log('[ProviderManager] 供应商不存在:', providerId);
            return;
        }
        
        // 如果供应商被禁用，跳过
        if (provider.enabled === false) {
            console.log('[ProviderManager] 供应商已禁用，跳过模型加载:', provider.name);
            return;
        }
        
        console.log(`[ProviderManager] 🔄 正在加载 ${provider.name} 模型列表...`);
        
        // 通用拉取
        const newModels = await fetchModelsFromProvider(provider);
        
        if (newModels.length === 0) {
            console.log(`[ProviderManager] ⚠️ ${provider.name} 未返回模型列表`);
            return;
        }
        
        // P2: 智能对比新旧模型
        if (provider.models && provider.models.length > 0) {
            const oldModelIds = new Set(provider.models.map(m => m.id));
            const newModelIds = new Set(newModels.map(m => m.id));
            
            // 新增的模型
            const added = newModels.filter(m => !oldModelIds.has(m.id));
            // 移除的模型
            const removed = provider.models.filter(m => !newModelIds.has(m.id));
            // 保留的模型（保持原有 enabled 状态）
            const kept = newModels.map(m => {
                const oldModel = provider.models.find(om => om.id === m.id);
                return oldModel ? { ...m, enabled: oldModel.enabled } : m;
            });
            
            console.log(`[ProviderManager] 📊 ${provider.name} 模型变化:`);
            console.log(`   ➕ 新增: ${added.length} 个`);
            console.log(`   ➖ 移除: ${removed.length} 个`);
            console.log(`   ✅ 保留: ${kept.length} 个`);
            
            if (added.length > 0) {
                console.log('[ProviderManager] 新增模型:', added.slice(0, 5).map(m => m.id).join(', '));
                if (added.length > 5) {
                    console.log(`   ... 还有 ${added.length - 5} 个`);
                }
            }
            if (removed.length > 0) {
                console.log('[ProviderManager] 移除模型:', removed.slice(0, 5).map(m => m.id).join(', '));
            }
            
            // 合并模型列表
            provider.models = [...kept, ...added];
        } else {
            // 首次加载，直接使用新列表
            provider.models = newModels;
        }
        
        await saveProviders();
        console.log(`[ProviderManager] ✅ ${provider.name} 总计 ${provider.models.length} 个模型`);
        
    } catch (error) {
        console.error(`[ProviderManager] ❌ 加载 ${providerId} 模型失败:`, error);
    }
}

/**
 * 加载 OpenRouter 模型列表（P2: 智能对比）- 向后兼容
 */
async function loadOpenRouterModels() {
    await loadProviderModels('openrouter');
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
    
    console.log('[ProviderManager] 🔍 获取可用模型，供应商数量:', providers.length);
    
    for (const provider of providers) {
        // P2: 跳过禁用的供应商
        if (provider.enabled === false) {
            console.log(`[ProviderManager] ⚠️ 跳过禁用供应商: ${provider.name}`);
            continue;
        }
        
        // P2: 检查 API Key（本地服务不需要）
        if (!provider.isLocal && !provider.apiKey) {
            console.log(`[ProviderManager] ⚠️ 跳过无 API Key 供应商: ${provider.name}`);
            continue;
        }
        
        console.log(`[ProviderManager] ✅ 处理供应商: ${provider.name}, 模型数量: ${provider.models?.length || 0}`);
        
        for (const model of provider.models) {
            // P2: 跳过禁用的模型
            if (model.enabled === false) continue;
            
            allModels.push({
                ...model,
                providerId: provider.id,
                providerName: provider.name,
                template: provider.template
            });
        }
    }
    
    console.log('[ProviderManager] 📊 总计可用模型:', allModels.length);
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
 * P2: 刷新指定供应商的模型列表
 * @param {string} providerId - 供应商 ID
 * @returns {Promise<Object>} 返回变化统计
 */
async function refreshProviderModels(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        throw new Error(`供应商 ${providerId} 不存在`);
    }
    
    const oldCount = provider.models ? provider.models.length : 0;
    await loadProviderModels(providerId);
    const newCount = provider.models ? provider.models.length : 0;
    
    return {
        success: true,
        oldCount,
        newCount,
        added: newCount > oldCount ? newCount - oldCount : 0,
        removed: oldCount > newCount ? oldCount - newCount : 0
    };
}

/**
 * P2: 切换供应商启用状态
 * @param {string} providerId - 供应商 ID
 * @param {boolean} enabled - 是否启用
 */
async function toggleProviderEnabled(providerId, enabled) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        throw new Error(`供应商 ${providerId} 不存在`);
    }
    
    provider.enabled = enabled;
    
    // P2: 如果禁用供应商，同时禁用其所有模型（但保留在列表中）
    if (!enabled && provider.models) {
        provider.models = provider.models.map(m => ({ ...m, enabled: false }));
        console.log(`[ProviderManager] ⚠️ 已禁用 ${provider.name} 及其所有模型`);
    } else if (enabled && provider.models) {
        // 启用时，恢复模型的原始状态（不自动启用，由用户手动控制）
        console.log(`[ProviderManager] ✅ 已启用 ${provider.name}，请手动启用需要的模型`);
    }
    
    await saveProviders();
    console.log(`[ProviderManager] ${enabled ? '✅ 启用' : '⚠️ 禁用'} 供应商: ${provider.name}`);
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
    toggleProviderEnabled,  // P2: 切换供应商启用状态
    addModelsToProvider,
    clearProviderModels,
    refreshProviderModels,  // P2: 刷新模型列表
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
// 模块: services/model-manager/ModelManager.js
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
            
            // ✅ 连续失败 3 次后才标记为不可用
            if (modelStatus[modelId].consecutiveFailures >= 3) {
                modelStatus[modelId].available = false;
                ErrorTracker.report(
                    `模型 ${modelId} 连续失败 ${modelStatus[modelId].consecutiveFailures} 次，标记为不可用`,
                    { modelId, failures: modelStatus[modelId].consecutiveFailures },
                    ErrorTracker.ErrorCategory.API,
                    ErrorTracker.ErrorLevel.WARN
                );
            }
        }
        
        saveModelStatus();
    }

    /**
     * 获取模型可用性状态
     * @param {string} modelId - 模型ID
     * @returns {boolean}
     */
    function isModelAvailable(modelId) {
        const status = modelStatus[modelId];
        
        // 未测试或超过1小时：视为可用，并重置状态
        if (!status || (Date.now() - status.lastTest > 60 * 60 * 1000)) {
            if (status) {
                // ✅ 1小时后自动恢复：重置失败计数
                delete modelStatus[modelId];
                saveModelStatus();
            }
            return true;
        }
        
        return status.available;
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
     * 刷新模型列表（从 ProviderManager 同步）
     */
    async function refreshModels() {
        try {
            // 从 ProviderManager 获取最新模型列表
            const models = await getAvailableModels();
            return { 
                success: true, 
                models, 
                count: models.length 
            };
        } catch (error) {
            console.error('[ModelManager] 刷新模型列表失败:', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
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
        refreshModels,
        isModelAvailable,
        testModel,
        batchTestModels,
        markModelTest,
        getModelStatus,
        sortModelsByAvailability
    };
})();


// =====================================================
// 模块: services/page-analyzer/PageAnalyzer.js
// =====================================================

// ==================== 页面分析器 ====================
// v4.3.0: 智能提取和理解网页内容
// 为 AI 提供结构化的页面上下文

const PageAnalyzer = (function() {
    'use strict';

    /**
     * 分析当前页面
     * @param {Object} options - 分析选项
     * @returns {Object} 页面分析结果
     */
    function analyzePage(options = {}) {
        const config = {
            maxContentLength: options.maxContentLength || 10000, // 最大内容长度
            includeLinks: options.includeLinks !== false, // 是否包含链接
            includeImages: options.includeImages || false, // 是否包含图片
            detectForms: options.detectForms !== false, // 是否检测表单
            ...options
        };

        return {
            url: window.location.href,
            title: document.title,
            meta: extractMetaInfo(),
            content: extractMainContent(config.maxContentLength),
            structure: detectPageStructure(),
            interactiveElements: config.detectForms ? findInteractiveElements() : [],
            links: config.includeLinks ? extractLinks() : [],
            images: config.includeImages ? extractImages() : [],
            timestamp: Date.now()
        };
    }

    /**
     * 提取元信息
     */
    function extractMetaInfo() {
        const meta = {};
        
        // 描述
        const description = document.querySelector('meta[name="description"]');
        if (description) meta.description = description.content;
        
        // 关键词
        const keywords = document.querySelector('meta[name="keywords"]');
        if (keywords) meta.keywords = keywords.content;
        
        // Open Graph
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) meta.ogTitle = ogTitle.content;
        
        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) meta.ogDescription = ogDescription.content;
        
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) meta.ogImage = ogImage.content;
        
        return meta;
    }

    /**
     * 提取主要内容（智能算法）
     */
    function extractMainContent(maxLength) {
        // 尝试多种策略提取主要内容
        let content = '';
        
        // 策略 1: 查找 article 标签
        const article = document.querySelector('article');
        if (article) {
            content = extractTextFromElement(article);
        }
        
        // 策略 2: 查找 main 标签
        if (!content) {
            const main = document.querySelector('main');
            if (main) {
                content = extractTextFromElement(main);
            }
        }
        
        // 策略 3: 查找具有大量文本的元素
        if (!content) {
            content = findContentRichElement();
        }
        
        // 策略 4: 使用 body（最后手段）
        if (!content) {
            content = extractTextFromElement(document.body);
        }
        
        // 清理和截断
        content = cleanText(content);
        
        if (content.length > maxLength) {
            content = content.substring(0, maxLength) + '... [内容已截断]';
        }
        
        return content;
    }

    /**
     * 从元素中提取文本
     */
    function extractTextFromElement(element) {
        if (!element) return '';
        
        // 移除脚本和样式
        const clone = element.cloneNode(true);
        const scripts = clone.querySelectorAll('script, style, nav, footer, header, aside');
        scripts.forEach(el => el.remove());
        
        return clone.innerText || clone.textContent || '';
    }

    /**
     * 查找内容丰富的元素
     */
    function findContentRichElement() {
        const candidates = [];
        
        // 查找所有 div 和 section
        const elements = document.querySelectorAll('div, section');
        
        elements.forEach(el => {
            const text = el.innerText || '';
            const length = text.trim().length;
            
            // 只考虑文本长度超过 200 字符的元素
            if (length > 200) {
                candidates.push({ element: el, length });
            }
        });
        
        // 按文本长度排序，返回最长的
        candidates.sort((a, b) => b.length - a.length);
        
        if (candidates.length > 0) {
            return extractTextFromElement(candidates[0].element);
        }
        
        return '';
    }

    /**
     * 清理文本
     */
    function cleanText(text) {
        return text
            .replace(/\n\s*\n/g, '\n') // 移除多余空行
            .replace(/[ \t]+/g, ' ') // 合并多个空格
            .trim();
    }

    /**
     * 检测页面结构
     */
    function detectPageStructure() {
        const structure = {
            headings: [],
            paragraphs: 0,
            lists: 0,
            tables: 0,
            codeBlocks: 0
        };
        
        // 提取标题
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(h => {
            structure.headings.push({
                level: parseInt(h.tagName[1]),
                text: h.innerText.trim()
            });
        });
        
        // 统计段落
        structure.paragraphs = document.querySelectorAll('p').length;
        
        // 统计列表
        structure.lists = document.querySelectorAll('ul, ol').length;
        
        // 统计表格
        structure.tables = document.querySelectorAll('table').length;
        
        // 统计代码块
        structure.codeBlocks = document.querySelectorAll('pre, code').length;
        
        return structure;
    }

    /**
     * 查找交互元素
     */
    function findInteractiveElements() {
        const elements = [];
        
        // 查找按钮
        const buttons = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
        buttons.forEach(btn => {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { // 只包括可见元素
                elements.push({
                    type: 'button',
                    text: btn.innerText || btn.value || '',
                    selector: generateSelector(btn),
                    visible: true
                });
            }
        });
        
        // 查找表单输入
        const inputs = document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea, select');
        inputs.forEach(input => {
            const rect = input.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                elements.push({
                    type: input.tagName.toLowerCase(),
                    name: input.name || input.id || '',
                    placeholder: input.placeholder || '',
                    selector: generateSelector(input),
                    visible: true
                });
            }
        });
        
        // 限制返回数量（避免过多）
        return elements.slice(0, 50);
    }

    /**
     * 提取链接
     */
    function extractLinks() {
        const links = [];
        const anchorElements = document.querySelectorAll('a[href]');
        
        anchorElements.forEach(a => {
            const rect = a.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { // 只包括可见链接
                links.push({
                    text: a.innerText.trim(),
                    href: a.href,
                    title: a.title || ''
                });
            }
        });
        
        // 限制数量
        return links.slice(0, 100);
    }

    /**
     * 提取图片信息
     */
    function extractImages() {
        const images = [];
        const imgElements = document.querySelectorAll('img');
        
        imgElements.forEach(img => {
            const rect = img.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                images.push({
                    src: img.src,
                    alt: img.alt || '',
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height
                });
            }
        });
        
        return images.slice(0, 50);
    }

    /**
     * 生成 CSS 选择器
     */
    function generateSelector(element) {
        if (element.id) {
            return `#${element.id}`;
        }
        
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).slice(0, 3).join('.');
            if (classes) {
                return `${element.tagName.toLowerCase()}.${classes}`;
            }
        }
        
        return element.tagName.toLowerCase();
    }

    /**
     * 生成页面摘要（用于 AI 上下文）
     */
    function generateSummary(options = {}) {
        const analysis = analyzePage(options);
        
        let summary = `# 页面分析结果\n\n`;
        summary += `**URL**: ${analysis.url}\n`;
        summary += `**标题**: ${analysis.title}\n\n`;
        
        if (analysis.meta.description) {
            summary += `**描述**: ${analysis.meta.description}\n\n`;
        }
        
        summary += `## 内容结构\n`;
        summary += `- 标题数: ${analysis.structure.headings.length}\n`;
        summary += `- 段落数: ${analysis.structure.paragraphs}\n`;
        summary += `- 列表数: ${analysis.structure.lists}\n`;
        summary += `- 表格数: ${analysis.structure.tables}\n\n`;
        
        if (analysis.structure.headings.length > 0) {
            summary += `## 标题层级\n`;
            analysis.structure.headings.slice(0, 10).forEach(h => {
                const indent = '  '.repeat(h.level - 1);
                summary += `${indent}- ${h.text}\n`;
            });
            summary += '\n';
        }
        
        if (analysis.interactiveElements.length > 0) {
            summary += `## 交互元素 (${analysis.interactiveElements.length}个)\n`;
            const buttons = analysis.interactiveElements.filter(e => e.type === 'button');
            const inputs = analysis.interactiveElements.filter(e => e.type !== 'button');
            
            if (buttons.length > 0) {
                summary += `### 按钮\n`;
                buttons.slice(0, 10).forEach(btn => {
                    summary += `- ${btn.text || '(无文本)'}\n`;
                });
                summary += '\n';
            }
            
            if (inputs.length > 0) {
                summary += `### 输入框\n`;
                inputs.slice(0, 10).forEach(input => {
                    summary += `- ${input.name || input.placeholder || '(未命名)'}\n`;
                });
                summary += '\n';
            }
        }
        
        summary += `## 主要内容\n\n`;
        summary += analysis.content.substring(0, 2000);
        
        if (analysis.content.length > 2000) {
            summary += '\n\n... [内容已截断]';
        }
        
        return summary;
    }

    return {
        analyzePage,
        generateSummary,
        extractMainContent,
        findInteractiveElements,
        extractLinks
    };
})();


// =====================================================
// 模块: services/api/BaseAPIClient.js
// =====================================================

// ==================== API 基础客户端 ====================
// v4.1.0: 所有 API 客户端的基类
// 定义统一的接口规范

class BaseAPIClient {
    /**
     * 构造函数
     * @param {Object} config - 配置对象
     * @param {string} config.baseUrl - API 基础 URL
     * @param {string} config.apiKey - API 密钥（可选）
     * @param {string} config.model - 模型 ID
     */
    constructor(config) {
        if (new.target === BaseAPIClient) {
            throw new TypeError('Cannot construct BaseAPIClient directly');
        }
        
        this.baseUrl = config.baseUrl;
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.timeout = config.timeout || 30000; // 默认 30 秒超时
    }

    /**
     * 构建请求头（子类必须实现）
     * @returns {Object} 请求头对象
     */
    buildHeaders() {
        throw new Error('Method buildHeaders() must be implemented');
    }

    /**
     * 构建请求体（子类必须实现）
     * @param {Array} messages - 消息数组
     * @param {Object} params - 额外参数
     * @returns {Object} 请求体
     */
    buildBody(messages, params = {}) {
        throw new Error('Method buildBody() must be implemented');
    }

    /**
     * 获取端点 URL（子类必须实现）
     * @returns {string} 完整的 API 端点 URL
     */
    getEndpoint() {
        throw new Error('Method getEndpoint() must be implemented');
    }

    /**
     * 解析流式响应块（子类必须实现）
     * @param {string} chunk - 原始数据块
     * @returns {Object|null} 解析后的内容，null 表示跳过
     */
    parseStreamChunk(chunk) {
        throw new Error('Method parseStreamChunk() must be implemented');
    }

    /**
     * 发送非流式请求（默认实现，子类可覆盖）
     * @param {Array} messages - 消息数组
     * @param {Object} params - 额外参数
     * @param {AbortController} abortController - 中止控制器
     * @returns {Promise<Object>} 响应结果
     */
    async sendRequest(messages, params = {}, abortController = null) {
        const endpoint = this.getEndpoint();
        const headers = this.buildHeaders();
        const body = this.buildBody(messages, params);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: headers,
                data: JSON.stringify(body),
                timeout: this.timeout,
                ontimeout: () => {
                    reject(new Error(`请求超时 (${this.timeout}ms)`));
                },
                onerror: (error) => {
                    reject(new Error(`网络错误: ${error.statusText || error}`));
                },
                onload: (response) => {
                    try {
                        if (response.status >= 200 && response.status < 300) {
                            const data = JSON.parse(response.responseText);
                            resolve({
                                success: true,
                                data: data,
                                status: response.status
                            });
                        } else {
                            reject(new Error(`HTTP ${response.status}: ${response.responseText}`));
                        }
                    } catch (e) {
                        reject(new Error(`解析响应失败: ${e.message}`));
                    }
                }
            });
        });
    }

    /**
     * 发送流式请求（默认实现，子类可覆盖）
     * @param {Array} messages - 消息数组
     * @param {Function} onChunk - 每个块的回调函数
     * @param {Object} params - 额外参数
     * @param {AbortController} abortController - 中止控制器
     * @returns {Promise<Object>} 最终结果
     */
    async sendStreamingRequest(messages, onChunk, params = {}, abortController = null) {
        const endpoint = this.getEndpoint();
        const headers = this.buildHeaders();
        const body = this.buildBody(messages, { ...params, stream: true });

        let fullContent = '';
        let isComplete = false;

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: headers,
                data: JSON.stringify(body),
                responseType: 'text',
                timeout: this.timeout,
                ontimeout: () => {
                    reject(new Error(`请求超时 (${this.timeout}ms)`));
                },
                onerror: (error) => {
                    reject(new Error(`网络错误: ${error.statusText || error}`));
                },
                onreadystatechange: (response) => {
                    if (response.readyState === 3 || response.readyState === 4) {
                        const text = response.responseText;
                        
                        // 处理 SSE 格式的数据
                        const lines = text.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6).trim();
                                
                                if (data === '[DONE]') {
                                    isComplete = true;
                                    continue;
                                }

                                try {
                                    const parsed = this.parseStreamChunk(data);
                                    if (parsed && parsed.content) {
                                        fullContent += parsed.content;
                                        onChunk(parsed.content);
                                    }
                                } catch (e) {
                                    console.warn('[BaseAPIClient] 解析块失败:', e);
                                }
                            }
                        }
                    }
                },
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve({
                            success: true,
                            content: fullContent,
                            complete: isComplete
                        });
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${response.responseText}`));
                    }
                }
            });
        });
    }

    /**
     * 验证配置是否有效（子类可覆盖）
     * @returns {boolean}
     */
    validateConfig() {
        if (!this.baseUrl) {
            throw new Error('baseUrl 不能为空');
        }
        return true;
    }
}


// =====================================================
// 模块: services/api/OpenRouterClient.js
// =====================================================

// ==================== OpenRouter API 客户端 ====================
// v4.1.0: OpenRouter 专用实现

class OpenRouterClient extends BaseAPIClient {
    /**
     * 构造函数
     * @param {Object} config - 配置对象
     */
    constructor(config) {
        super({
            baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
            apiKey: config.apiKey,
            model: config.model,
            timeout: config.timeout
        });
        
        this.validateConfig();
    }

    /**
     * 构建请求头
     */
    buildHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        
        // OpenRouter 特定的头部
        headers['HTTP-Referer'] = window.location.href;
        headers['X-Title'] = 'Web AI Agent';
        
        return headers;
    }

    /**
     * 构建请求体
     */
    buildBody(messages, params = {}) {
        return {
            model: this.model,
            messages: messages,
            stream: params.stream || false,
            temperature: params.temperature || 0.7,
            max_tokens: params.maxTokens || 4096,
            ...params
        };
    }

    /**
     * 获取端点 URL
     */
    getEndpoint() {
        return `${this.baseUrl}/chat/completions`;
    }

    /**
     * 解析流式响应块
     */
    parseStreamChunk(chunk) {
        try {
            const data = JSON.parse(chunk);
            
            if (data.choices && data.choices[0] && data.choices[0].delta) {
                const delta = data.choices[0].delta;
                return {
                    content: delta.content || '',
                    role: delta.role || null,
                    finish_reason: data.choices[0].finish_reason || null
                };
            }
            
            return null;
        } catch (e) {
            console.warn('[OpenRouterClient] 解析失败:', e);
            return null;
        }
    }

    /**
     * 验证配置
     */
    validateConfig() {
        super.validateConfig();
        
        if (!this.model) {
            throw new Error('model 不能为空');
        }
        
        return true;
    }
}


// =====================================================
// 模块: services/api/LMStudioClient.js
// =====================================================

// ==================== LM Studio API 客户端 ====================
// v4.1.0: LM Studio 本地服务实现

class LMStudioClient extends BaseAPIClient {
    /**
     * 构造函数
     * @param {Object} config - 配置对象
     */
    constructor(config) {
        super({
            baseUrl: config.baseUrl || 'http://localhost:1234/v1',
            apiKey: config.apiKey || 'lm-studio', // LM Studio 不需要真实 API Key
            model: config.model,
            timeout: config.timeout || 60000 // 本地服务可能需要更长时间
        });
        
        this.validateConfig();
    }

    /**
     * 构建请求头
     */
    buildHeaders() {
        return {
            'Content-Type': 'application/json'
        };
    }

    /**
     * 构建请求体
     */
    buildBody(messages, params = {}) {
        return {
            model: this.model,
            messages: messages,
            stream: params.stream || false,
            temperature: params.temperature || 0.7,
            max_tokens: params.maxTokens || 4096,
            ...params
        };
    }

    /**
     * 获取端点 URL
     */
    getEndpoint() {
        return `${this.baseUrl}/chat/completions`;
    }

    /**
     * 解析流式响应块
     */
    parseStreamChunk(chunk) {
        try {
            const data = JSON.parse(chunk);
            
            if (data.choices && data.choices[0] && data.choices[0].delta) {
                const delta = data.choices[0].delta;
                return {
                    content: delta.content || '',
                    role: delta.role || null,
                    finish_reason: data.choices[0].finish_reason || null
                };
            }
            
            return null;
        } catch (e) {
            console.warn('[LMStudioClient] 解析失败:', e);
            return null;
        }
    }

    /**
     * 验证配置
     */
    validateConfig() {
        super.validateConfig();
        
        if (!this.model) {
            throw new Error('model 不能为空');
        }
        
        // LM Studio 是本地服务，检查是否为 localhost
        if (!this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1')) {
            console.warn('[LMStudioClient] LM Studio 通常运行在 localhost，请确认 baseUrl 是否正确');
        }
        
        return true;
    }
}


// =====================================================
// 模块: services/api/OllamaClient.js
// =====================================================

// ==================== Ollama API 客户端 ====================
// v4.0.0: 支持 Ollama 本地服务
// 文档: https://github.com/ollama/ollama/blob/main/docs/api.md

class OllamaClient extends BaseAPIClient {
    constructor(config) {
        super({
            ...config,
            baseUrl: config.baseUrl || 'http://localhost:11434'
        });
        
        this.model = config.model;
    }

    /**
     * 构建请求体
     */
    buildRequestBody(messages, options = {}) {
        return {
            model: this.model,
            messages: messages.map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            })),
            stream: true,
            options: {
                temperature: options.temperature || 0.7,
                top_p: options.topP || 0.9,
                num_predict: options.maxTokens || 4096
            }
        };
    }

    /**
     * 发送流式请求
     */
    async sendStreamingRequest(messages, onChunk, options = {}, abortController = null) {
        try {
            const requestBody = this.buildRequestBody(messages, options);
            
            Utils.debugLog('[OllamaClient] Sending request:', {
                model: this.model,
                messageCount: messages.length,
                temperature: options.temperature
            });

            return new Promise((resolve, reject) => {
                let fullContent = '';
                let isComplete = false;

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${this.baseUrl}/api/chat`,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(requestBody),
                    responseType: 'text',
                    timeout: this.timeout || 60000,
                    
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            // Ollama 的流式响应是 NDJSON 格式（每行一个 JSON）
                            const lines = response.responseText.split('\n').filter(line => line.trim());
                            
                            for (const line of lines) {
                                try {
                                    const chunk = JSON.parse(line);
                                    
                                    // 检查是否完成
                                    if (chunk.done) {
                                        isComplete = true;
                                        break;
                                    }
                                    
                                    // 提取内容
                                    const content = chunk.message?.content || '';
                                    if (content) {
                                        fullContent += content;
                                        
                                        // 调用回调
                                        if (onChunk) {
                                            onChunk(content);
                                        }
                                    }
                                } catch (e) {
                                    ErrorTracker.report(
                                        `解析 Ollama 响应失败: ${e.message}`,
                                        { line },
                                        ErrorTracker.ErrorCategory.API,
                                        ErrorTracker.ErrorLevel.WARN
                                    );
                                }
                            }
                            
                            resolve({
                                success: true,
                                content: fullContent,
                                complete: isComplete
                            });
                        } else {
                            reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                        }
                    },
                    
                    onerror: (error) => {
                        ErrorTracker.report(
                            'Ollama 请求失败',
                            { error, model: this.model },
                            ErrorTracker.ErrorCategory.API,
                            ErrorTracker.ErrorLevel.ERROR
                        );
                        reject(new Error(`Ollama 连接失败: ${error}`));
                    },
                    
                    ontimeout: () => {
                        reject(new Error('Ollama 请求超时'));
                    },
                    
                    onabort: () => {
                        reject(new DOMException('请求已取消', 'AbortError'));
                    }
                });

                // 监听中止信号
                if (abortController?.signal) {
                    abortController.signal.addEventListener('abort', () => {
                        // GM_xmlhttpRequest 不支持直接中止，但我们可以在这里标记
                        reject(new DOMException('请求已取消', 'AbortError'));
                    });
                }
            });
        } catch (error) {
            ErrorTracker.report(
                'Ollama 客户端错误',
                { error, model: this.model },
                ErrorTracker.ErrorCategory.API,
                ErrorTracker.ErrorLevel.ERROR
            );
            throw error;
        }
    }

    /**
     * 测试连接
     */
    async testConnection() {
        try {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${this.baseUrl}/api/tags`,
                    timeout: 5000,
                    
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve({
                                success: true,
                                message: 'Ollama 连接成功'
                            });
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    
                    onerror: () => {
                        reject(new Error('无法连接到 Ollama 服务'));
                    },
                    
                    ontimeout: () => {
                        reject(new Error('连接超时'));
                    }
                });
            });
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取可用模型列表
     */
    async fetchModels() {
        try {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${this.baseUrl}/api/tags`,
                    timeout: 5000,
                    
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const data = JSON.parse(response.responseText);
                                const models = (data.models || []).map(model => ({
                                    id: model.name,
                                    name: model.name,
                                    provider: 'ollama',
                                    size: model.size ? this.formatSize(model.size) : '未知'
                                }));
                                
                                resolve({
                                    success: true,
                                    models
                                });
                            } catch (e) {
                                reject(new Error(`解析响应失败: ${e.message}`));
                            }
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    
                    onerror: () => {
                        reject(new Error('获取模型列表失败'));
                    },
                    
                    ontimeout: () => {
                        reject(new Error('请求超时'));
                    }
                });
            });
        } catch (error) {
            return {
                success: false,
                error: error.message,
                models: []
            };
        }
    }

    /**
     * 格式化文件大小
     */
    formatSize(bytes) {
        if (!bytes) return '未知';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
}


// =====================================================
// 模块: services/api/APIRouter.js
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

        // 将当前选中的模型排在最前面
        const isAutoMode = !currentModel || currentModel === 'auto' || currentModel === 'openrouter/auto';
        
        if (!isAutoMode) {
            models.sort((a, b) => {
                if (a.id === currentModel) return -1;
                if (b.id === currentModel) return 1;
                return 0;
            });
        }

        // 过滤掉明确标记为不可用的模型（除非是用户强制选中的）
        if (!isAutoMode) {
            return models; // 如果用户指定了模型，则不根据可用性过滤，交给路由层去试
        }

        // ✅ Auto 模式：过滤掉不可用的模型
        const availableModels = models.filter(m => ModelManager.isModelAvailable(m.id));
        
        // 记录过滤统计（仅在过滤掉模型时记录）
        if (availableModels.length < models.length) {
            ErrorTracker.report(
                `自动过滤 ${models.length - availableModels.length} 个不可用模型`,
                { total: models.length, available: availableModels.length },
                ErrorTracker.ErrorCategory.API,
                ErrorTracker.ErrorLevel.INFO
            );
        }
        
        return availableModels;
    }

    /**
     * 发送请求（带自动重试和故障转移）
     * @param {Object} params - 请求参数
     * @param {Function} onChunk - 流式回调
     * @returns {Promise<Object>}
     */
    async function sendRequest(params, onChunk) {
        console.log('[API Router] 📥 收到 sendRequest 调用');
        
        const { messages, config, abortController } = params;  // ✅ 直接使用完整的 messages
        
        console.log('[API Router] 📊 消息数量:', messages?.length);
        console.log('[API Router] ⚙️ 配置模型:', config?.model);
        
        let modelsToTry = getAvailableModels(config.model);
        
        console.log('[API Router] 📋 可用模型数量:', modelsToTry.length);
        console.log('[API Router] 🎯 当前配置模型:', config.model);
        
        if (modelsToTry.length === 0) {
            console.error('[API Router] ❌ 没有可用模型！');
            // 如果没有可用模型，返回错误
            ErrorTracker.report(
                '没有可用的模型，请检查提供商配置',
                {},
                ErrorTracker.ErrorCategory.CONFIG,
                ErrorTracker.ErrorLevel.ERROR
            );
            return { 
                success: false, 
                error: '没有可用的模型。请检查提供商配置（API Key、启用状态）。',
                attempts: 0 
            };
        }

        let lastError = null;
        let attempts = 0;
        const MAX_ATTEMPTS_PER_MODEL = 3; // ✅ 每个模型最多测试 3 次

        for (const model of modelsToTry) {
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
                    // ✅ v4.1.0: 使用新的 API 客户端架构
                    const provider = ProviderManager.getProviderByModel(model.id);
                    if (!provider) {
                        throw new Error(`未找到模型 ${model.id} 的提供商配置`);
                    }
                    
                    const client = APIClientFactory.createClient(provider, model.id);
                    
                    // ✅ 直接使用 AIAgent 构建的完整消息数组（包含 System Prompt）
                    const result = await client.sendStreamingRequest(
                        messages,
                        onChunk,
                        {
                            temperature: currentConfig.temperature || 0.7,
                            maxTokens: currentConfig.maxTokens || 4096
                        },
                        abortController
                    );

                    // ✅ v4.1.0: 新客户端返回 { success, content, complete }
                    if (result.success) {
                        // 标记模型可用
                        ModelManager.markModelTest(model.id, true);
                        return {
                            success: true,
                            content: result.content,
                            model: model.id,
                            attempts
                        };
                    }
                    
                    // 如果请求失败
                    throw new Error(result.error || '请求失败');
                    
                } catch (error) {
                    lastError = error;
                    ModelManager.markModelTest(model.id, false);
                    
                    ErrorTracker.report(error, {
                        model: model.id,
                        attempt: i + 1,
                        category: 'API_REQUEST'
                    }, ErrorTracker.ErrorCategory.API, ErrorTracker.ErrorLevel.ERROR);
                    
                    // ✅ 检查是否已达到最大失败次数，如果是则跳出内层循环
                    const status = ModelManager.getModelStatus(model.id);
                    if (status && !status.available) {
                        ErrorTracker.report(
                            `模型 ${model.id} 已标记为不可用，停止重试`,
                            { modelId: model.id, failures: status.consecutiveFailures },
                            ErrorTracker.ErrorCategory.API,
                            ErrorTracker.ErrorLevel.WARN
                        );
                        break; // 跳出内层循环，尝试下一个模型
                    }
                    
                    // 处理中止错误
                    if (error.name === 'AbortError' || error.message.includes('取消')) {
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
// 模块: services/api/index.js
// =====================================================

// ==================== API 客户端工厂 ====================
// v4.1.0: 根据提供商类型创建对应的客户端

const APIClientFactory = (function() {
    'use strict';

    /**
     * 创建 API 客户端
     * @param {Object} providerConfig - 提供商配置
     * @param {string} modelId - 模型 ID
     * @returns {BaseAPIClient} API 客户端实例
     */
    function createClient(providerConfig, modelId) {
        const config = {
            baseUrl: providerConfig.baseUrl,
            apiKey: providerConfig.apiKey,
            model: modelId,
            timeout: providerConfig.timeout
        };

        // 根据提供商类型或 baseUrl 判断使用哪个客户端
        const providerType = detectProviderType(providerConfig);

        switch (providerType) {
            case 'openrouter':
                return new OpenRouterClient(config);
            
            case 'lmstudio':
                return new LMStudioClient(config);
            
            case 'ollama':
                return new OllamaClient(config);
            
            default:
                // 默认使用 OpenRouter 兼容的客户端
                console.log(`[APIClientFactory] 使用 OpenRouter 兼容客户端 for ${providerType}`);
                return new OpenRouterClient(config);
        }
    }

    /**
     * 检测提供商类型
     * @param {Object} providerConfig - 提供商配置
     * @returns {string} 提供商类型
     */
    function detectProviderType(providerConfig) {
        const baseUrl = providerConfig.baseUrl || '';
        const name = (providerConfig.name || '').toLowerCase();

        // 检查是否为 LM Studio
        if (baseUrl.includes('localhost:1234') || 
            baseUrl.includes('127.0.0.1:1234') ||
            name.includes('lm studio') ||
            name.includes('lmstudio')) {
            return 'lmstudio';
        }

        // 检查是否为 Ollama
        if (baseUrl.includes('localhost:11434') ||
            baseUrl.includes('127.0.0.1:11434') ||
            name.includes('ollama')) {
            return 'ollama';
        }

        // 默认为 OpenRouter
        return 'openrouter';
    }

    return {
        createClient,
        detectProviderType
    };
})();


// =====================================================
// 模块: infrastructure/AIAgent/CodeExecutor.js
// =====================================================

// ==================== 代码执行器 ====================
// v4.5.0: 从 chat.js 提取，专门负责代码执行
// 职责：安全执行 AI 生成的 JavaScript 代码

const CodeExecutor = (function() {
    'use strict';

    // 执行队列
    let executionQueue = [];
    let isExecuting = false;

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
            /document\.cookie\s*=/,
            
            // 页面修改（谨慎）
            /document\.write\s*\(/,
            /document\.innerHTML\s*=/,
            /document\.outerHTML\s*=/,
            
            // 无限循环风险
            /while\s*\(\s*true\s*\)/,
            /for\s*\(\s*;\s*;\s*\)/,
            
            // 递归调用
            /function\s+\w+\s*\([^)]*\)\s*\{[^}]*\w+\s*\(/,
            
            // eval（双重 eval 风险）
            /eval\s*\(\s*eval\s*\(/,
            
            // 定时器滥用
            /setInterval\s*\([^,]+,\s*0\s*\)/,
            /setTimeout\s*\([^,]+,\s*0\s*\)/g
        ];

        return highRiskPatterns.some(pattern => pattern.test(code));
    }

    /**
     * 获取高危类型描述
     */
    function getHighRiskType(code) {
        if (/window\.location|location\.href|location\.replace|window\.open/.test(code)) {
            return '页面导航/跳转';
        }
        if (/localStorage\.clear|sessionStorage\.clear|indexedDB\.deleteDatabase/.test(code)) {
            return '数据删除';
        }
        if (/document\.cookie\s*=/.test(code)) {
            return 'Cookie 修改';
        }
        if (/document\.write|document\.innerHTML/.test(code)) {
            return '页面修改';
        }
        if (/while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/.test(code)) {
            return '无限循环';
        }
        return '未知高危操作';
    }

    /**
     * 安全地执行代码
     */
    function executeCode(code, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                // 1. 安全检查
                const isHighRisk = isHighRiskCode(code);
                const riskType = isHighRisk ? getHighRiskType(code) : null;
                
                // 如果启用严格模式且是高危代码，直接拒绝
                if (options.strictMode && isHighRisk) {
                    reject(new Error(`⚠️ 检测到高危操作：${riskType}\n\n为保护您的数据安全，已阻止执行。`));
                    return;
                }

                // 2. 在沙箱环境中执行
                const result = unsafeWindow.eval(code);
                
                // 3. 格式化结果
                const formattedResult = formatResult(result);
                
                resolve({
                    success: true,
                    result: formattedResult,
                    rawResult: result,
                    isHighRisk,
                    riskType
                });

            } catch (error) {
                reject({
                    success: false,
                    error: error.message,
                    stack: error.stack
                });
            }
        });
    }

    /**
     * 格式化执行结果（P2: 支持压缩）
     */
    function formatResult(result, options = {}) {
        const maxLength = options.maxLength || 5000;  // 默认最大 5000 字符
        
        // null 或 undefined
        if (result === null) return 'null';
        if (result === undefined) return 'undefined';

        // 基本类型
        if (typeof result === 'string') {
            // P2: 字符串截断
            if (result.length > maxLength) {
                return `"${result.substring(0, maxLength)}..." (已截断，总长度: ${result.length} 字符)`;
            }
            return `"${result}"`;
        }
        if (typeof result === 'number' || typeof result === 'boolean') return String(result);
        if (typeof result === 'function') return `[Function: ${result.name || 'anonymous'}]`;

        // 对象类型
        if (typeof result === 'object') {
            try {
                // 尝试 JSON 序列化
                const jsonStr = JSON.stringify(result, null, 2);
                
                // P2: JSON 结果截断
                if (jsonStr.length > maxLength) {
                    return jsonStr.substring(0, maxLength) + '\n... (已截断，总长度: ${jsonStr.length} 字符)';
                }
                
                return jsonStr;
            } catch (e) {
                // 处理循环引用
                return `[${result.constructor?.name || 'Object'}] (无法序列化)`;
            }
        }

        return String(result);
    }

    /**
     * 批量执行代码（队列模式）
     */
    async function executeBatch(codeBlocks, options = {}) {
        const results = [];
        
        for (let i = 0; i < codeBlocks.length; i++) {
            const block = codeBlocks[i];
            
            try {
                const result = await executeCode(block.code, {
                    ...options,
                    blockIndex: i
                });
                
                results.push({
                    index: i,
                    lang: block.lang,
                    ...result
                });
                
            } catch (error) {
                results.push({
                    index: i,
                    lang: block.lang,
                    success: false,
                    error: error.message || error.error
                });
                
                // 如果某个块失败，是否继续？
                if (options.stopOnError) {
                    break;
                }
            }
        }
        
        return results;
    }

    /**
     * 从文本中提取代码块
     */
    function extractCodeBlocks(text) {
        const codeBlocks = [];
        const regex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            codeBlocks.push({
                lang: match[1] || 'runjs',
                code: match[2].trim()
            });
        }
        
        return codeBlocks;
    }

    /**
     * 清空执行队列
     */
    function clearQueue() {
        executionQueue = [];
        isExecuting = false;
    }

    /**
     * 获取执行器状态
     */
    function getState() {
        return {
            isExecuting,
            queueLength: executionQueue.length
        };
    }

    return {
        executeCode,
        executeBatch,
        extractCodeBlocks,
        isHighRiskCode,
        getHighRiskType,
        clearQueue,
        getState
    };
})();


// =====================================================
// 模块: infrastructure/AIAgent/index.js
// =====================================================

// ==================== AI Agent 核心 ====================
// v4.4.0: Agent 作为组合器，整合所有底层模块
// Agent = ModelManager + APIClient + PageAnalyzer + HistoryManager + ...

const AIAgent = (function() {
    'use strict';

    // ==================== 依赖注入 ====================
    // Agent 组合以下模块形成完整能力
    const dependencies = {
        ModelManager,      // 模型选择和可用性管理
        APIRouter,         // API 路由和故障转移
        PageAnalyzer,      // 页面理解和分析
        ErrorTracker,      // 错误追踪
        Utils,             // 工具函数
        CodeExecutor       // v4.5.0: 代码执行器
    };

    // ==================== Agent 状态 ====================
    let agentState = {
        isInitialized: false,
        isProcessing: false,
        currentConversation: [],  // 当前对话历史
        pageContext: null,        // 缓存的页面上下文
        lastError: null,
        abortController: null,
        config: {},                // Agent 配置
        estimatedTokens: 0,        // 估算的 token 数量
        contextStats: {            // 上下文统计信息
            totalTokens: 0,
            systemTokens: 0,
            pageContextTokens: 0,
            historyTokens: 0,
            userMessageTokens: 0,
            reservedTokens: 2000,  // 预留给响应的 token
            utilizationRate: 0     // 窗口使用率
        }
    };

    /**
     * 初始化 Agent
     */
    function init(config = {}) {
        if (agentState.isInitialized) {
            console.warn('[AIAgent] 已经初始化，跳过');
            return;
        }

        // 合并配置
        agentState.config = {
            autoAttachPageContext: config.autoAttachPageContext !== false,  // 默认启用
            maxHistoryLength: config.maxHistoryLength || 20,
            maxContextTokens: config.maxContextTokens || 8000,  // 最大上下文 token 数
            defaultModel: config.defaultModel || 'auto',
            defaultTemperature: config.defaultTemperature || 0.7,
            defaultMaxTokens: config.defaultMaxTokens || 4096,
            enableModelRouter: config.enableModelRouter !== false,  // 启用智能路由
            contextStrategy: config.contextStrategy || 'auto',  // 'auto' | 'strict' | 'relaxed'
            enableSummary: config.enableSummary !== false,  // 启用历史摘要
            ...config
        };

        // 根据策略调整 token 限制
        if (agentState.config.contextStrategy === 'strict') {
            agentState.config.maxContextTokens = Math.min(agentState.config.maxContextTokens, 4000);
        } else if (agentState.config.contextStrategy === 'relaxed') {
            agentState.config.maxContextTokens = Math.max(agentState.config.maxContextTokens, 12000);
        }

        agentState.isInitialized = true;
        console.log('[AIAgent] ✅ 初始化完成', {
            maxContextTokens: agentState.config.maxContextTokens,
            contextStrategy: agentState.config.contextStrategy,
            enableSummary: agentState.config.enableSummary
        });
    }

    /**
     * 发送消息到 AI（Agent 的核心能力）
     * @param {string} userMessage - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 响应结果
     */
    async function sendMessage(userMessage, options = {}) {
        console.log('[AIAgent] 📤 收到 sendMessage 调用');
        console.log('[AIAgent] 📋 消息:', userMessage.substring(0, 100));
        
        // 1. 验证状态
        if (!agentState.isInitialized) {
            console.error('[AIAgent] ❌ Agent 未初始化');
            throw new Error('Agent 未初始化，请先调用 init()');
        }
        
        if (agentState.isProcessing) {
            console.error('[AIAgent] ❌ Agent 正在处理中');
            throw new Error('Agent 正在处理中，请稍后');
        }

        agentState.isProcessing = true;
        agentState.lastError = null;
        
        console.log('[AIAgent] ✅ 状态检查通过，开始构建上下文...');
        
        // 创建中止控制器
        const abortController = options.abortController || new AbortController();
        agentState.abortController = abortController;

        try {
            // 2. 构建完整的消息上下文（Agent 的核心逻辑）
            const messages = await buildMessageContext(userMessage, options);

            // 3. 获取配置（优先使用传入的，其次使用默认配置）
            const config = {
                model: options.model || agentState.config.defaultModel,
                temperature: options.temperature || agentState.config.defaultTemperature,
                maxTokens: options.maxTokens || agentState.config.defaultMaxTokens
            };

            // 4. 智能模型选择（如果启用 Model Router）
            let selectedModel = config.model;
            if (agentState.config.enableModelRouter && config.model === 'auto') {
                selectedModel = await selectOptimalModel(messages);
                Utils.debugLog(`[AIAgent] 🤖 智能选择模型: ${selectedModel}`);
            }

            Utils.debugLog(`[AIAgent] 发送消息，模型: ${selectedModel}`);

            // 5. 通过 API Router 发送请求（委托给底层模块）
            console.log('[AIAgent] 🚀 调用 APIRouter.sendRequest...');
            console.log('[AIAgent] 📊 消息数量:', messages.length);
            console.log('[AIAgent] 🎯 模型:', selectedModel);
            
            const result = await dependencies.APIRouter.sendRequest(
                {
                    messages,  // ✅ 传递完整的消息数组（包含 System Prompt）
                    config: { ...config, model: selectedModel },
                    abortController
                },
                options.onChunk // 流式回调
            );
            
            console.log('[AIAgent] 📨 APIRouter 返回结果:', result);

            // 6. 处理响应
            if (result.success) {
                // 添加到对话历史
                addToHistory('user', userMessage);
                addToHistory('assistant', result.content);

                // 更新 token 估算
                updateTokenEstimate();

                Utils.debugLog(`[AIAgent] ✅ 成功，模型: ${result.model}, 尝试次数: ${result.attempts}`);

                return {
                    success: true,
                    content: result.content,
                    model: result.model,
                    attempts: result.attempts,
                    estimatedTokens: agentState.estimatedTokens
                };
            } else {
                agentState.lastError = result.error;
                throw new Error(result.error);
            }

        } catch (error) {
            agentState.lastError = error.message;
            
            // 记录错误并标记模型不可用
            if (dependencies.ModelManager && config?.model) {
                dependencies.ModelManager.markModelTest(config.model, false, error.message);
            }
            
            // 记录错误
            dependencies.ErrorTracker.report(error, {
                category: 'AGENT_SEND_MESSAGE',
                message: userMessage.substring(0, 50),
                model: config?.model
            }, dependencies.ErrorTracker.ErrorCategory.EXECUTION, dependencies.ErrorTracker.ErrorLevel.ERROR);
            
            Utils.debugLog(`[AIAgent] ❌ 失败: ${error.message}`);
            throw error;
            
        } finally {
            agentState.isProcessing = false;
            agentState.abortController = null;
        }
    }

    /**
     * 构建消息上下文（Agent 的智能之处）
     * @param {string} userMessage - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 消息数组
     */
    async function buildMessageContext(userMessage, options = {}) {
        const messages = [];
        const stats = {
            systemTokens: 0,
            pageContextTokens: 0,
            historyTokens: 0,
            userMessageTokens: 0
        };

        // 1. 系统提示词（每次对话都添加，确保 AI 了解自己的能力）
        const systemPrompt = options.systemPrompt || buildDefaultSystemPrompt(options);
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
            stats.systemTokens = estimateTextTokens(systemPrompt) + 4;
            Utils.debugLog(`[AIAgent] 📝 System Prompt 已添加 (~${stats.systemTokens} tokens)`);
        }

        // 2. 页面上下文（Agent 的核心能力：自动理解页面）
        if (options.includePageContext !== false && agentState.config.autoAttachPageContext) {
            const pageContext = await getPageContext(options.pageContextOptions);
            if (pageContext) {
                const pageContent = `## 当前页面上下文\n\n${pageContext}\n\n请基于以上页面内容回答用户问题。`;
                messages.push({
                    role: 'system',
                    content: pageContent
                });
                stats.pageContextTokens = estimateTextTokens(pageContent) + 4;
                Utils.debugLog(`[AIAgent] 📄 页面上下文已添加 (~${stats.pageContextTokens} tokens)`);
            }
        }

        // 3. 对话历史（保持上下文连贯性）
        if (agentState.currentConversation.length > 0) {
            // 智能截断：基于 token 数量而非固定条数
            const contextMessages = smartTruncateHistory(agentState.currentConversation, userMessage);
            messages.push(...contextMessages);
            stats.historyTokens = estimateMessagesTokens(contextMessages);
            Utils.debugLog(`[AIAgent] 💬 添加了 ${contextMessages.length} 条历史消息 (~${stats.historyTokens} tokens)`);
        }

        // 4. 当前用户消息
        messages.push({ role: 'user', content: userMessage });
        stats.userMessageTokens = estimateTextTokens(userMessage) + 4;

        // 5. 计算总体统计
        const totalTokens = stats.systemTokens + stats.pageContextTokens + stats.historyTokens + stats.userMessageTokens;
        const maxTokens = agentState.config.maxContextTokens;
        const utilizationRate = Math.round((totalTokens / maxTokens) * 100);
        
        // 更新状态
        agentState.contextStats = {
            totalTokens,
            ...stats,
            reservedTokens: 2000,
            utilizationRate,
            maxTokens
        };
        
        Utils.debugLog(`[AIAgent] 📨 消息上下文构建完成: ${messages.length} 条消息, ${totalTokens}/${maxTokens} tokens (${utilizationRate}%)`);
        
        // 警告：如果使用率过高
        if (utilizationRate > 90) {
            console.warn(`[AIAgent] ⚠️ 上下文窗口使用率过高: ${utilizationRate}%`);
        }
        
        return messages;
    }

    /**
     * 构建默认系统提示词
     */
    function buildDefaultSystemPrompt(options = {}) {
        const prompt = `# AI Browser Agent - 智能网页交互助手

## 你的定位
你是一个运行在浏览器中的 AI 助手，帮助用户提升在网页中的交互能力。你可以理解页面内容、生成 JavaScript 代码并自动执行，完成各种网页操作任务。

## 核心能力
1. **页面理解** - 你能看到当前页面的内容和结构
2. **代码生成** - 你可以生成 JavaScript 代码来操作页面
3. **自动执行** - 你生成的代码会被自动执行，无需用户确认
4. **对话交互** - 你可以与用户进行自然语言对话

## 代码执行规范
当你需要操作页面时，请生成 JavaScript 代码块，格式如下：

\`\`\`runjs
// 你的代码
\`\`\`

**重要规则**:
- ✅ 代码必须是有效的 JavaScript
- ✅ 优先使用原生 DOM API（document.querySelector, document.getElementById 等）
- ✅ 如果元素可能不存在，使用可选链 (?.) 或条件判断
- ✅ 对于异步操作，使用 async/await 或 Promise
- ❌ 不要使用 alert()、confirm()、prompt() 等阻塞对话框
- ❌ 不要使用 window.open() 打开新窗口
- ❌ 不要生成无限循环或资源密集型代码

## 特殊命令
用户可以通过以下命令与你交互：
- **/runjs <代码>** - 直接执行指定的 JavaScript 代码
  示例：/runjs document.title
  
当用户输入 /runjs 命令时，直接执行后面的代码，不需要生成代码块。

## 交互风格
- **简洁明了** - 直接给出解决方案，不需要过多解释
- **主动执行** - 如果需要操作页面，直接生成代码，不要询问用户是否执行
- **错误处理** - 如果操作可能失败，添加适当的错误处理
- **分步执行** - 复杂任务分解为多个代码块，按顺序执行

## 示例

**用户**: "帮我点击登录按钮"
**你**: 
\`\`\`runjs
document.querySelector('.login-btn')?.click();
\`\`\`
已点击登录按钮。

**用户**: "获取页面所有链接的 URL"
**你**:
\`\`\`runjs
Array.from(document.querySelectorAll('a')).map(a => a.href)
\`\`\`
找到 ${typeof document !== 'undefined' ? document.querySelectorAll('a').length : 'N'} 个链接。

**用户**: "/runjs document.title"
**你**: （直接执行代码，返回结果）

---

现在，请帮助用户完成任务。`;

        return prompt;
    }

    /**
     * 获取页面上下文（委托给 PageAnalyzer）
     */
    async function getPageContext(options = {}) {
        try {
            // 检查 PageAnalyzer 是否可用
            if (typeof dependencies.PageAnalyzer === 'undefined') {
                console.warn('[AIAgent] PageAnalyzer 不可用');
                return null;
            }

            const summary = dependencies.PageAnalyzer.generateSummary({
                maxContentLength: options.maxContentLength || 5000,
                includeLinks: options.includeLinks || false,
                detectForms: options.detectForms || false
            });
            
            agentState.pageContext = summary;
            return summary;
            
        } catch (error) {
            console.warn('[AIAgent] 获取页面上下文失败:', error);
            return null;
        }
    }

    /**
     * 智能选择最优模型
     * @param {Array} messages - 消息数组
     * @returns {Promise<string>} 选中的模型 ID
     */
    async function selectOptimalModel(messages) {
        try {
            // 1. 估算 token 数量
            const estimatedTokens = estimateMessagesTokens(messages);
            
            // 2. 获取可用模型列表
            if (!dependencies.ModelManager) {
                console.warn('[AIAgent] ModelManager 不可用，使用默认模型');
                return agentState.config.defaultModel;
            }

            const availableModels = await dependencies.ModelManager.getAvailableModels();
            
            if (!availableModels || availableModels.length === 0) {
                console.warn('[AIAgent] 没有可用模型，使用默认模型');
                return agentState.config.defaultModel;
            }

            // 3. 过滤出支持当前 token 数量的模型
            const suitableModels = availableModels.filter(model => {
                const maxTokens = model.max_tokens || 8192;
                return maxTokens >= estimatedTokens + 1000; // 预留 1000 tokens 给响应
            });

            // 4. 按可用性排序（优先使用成功率高的模型）
            const sortedModels = dependencies.ModelManager.sortModelsByAvailability(suitableModels);
            
            if (sortedModels.length > 0) {
                Utils.debugLog(`[AIAgent] 🤖 从 ${suitableModels.length} 个合适模型中选择: ${sortedModels[0].id}`);
                return sortedModels[0].id;
            }

            // 5. 如果没有合适的，返回第一个可用模型
            return availableModels[0].id;

        } catch (error) {
            console.error('[AIAgent] 智能模型选择失败:', error);
            return agentState.config.defaultModel;
        }
    }

    /**
     * 估算消息的 token 数量
     * @param {Array} messages - 消息数组
     * @returns {number} 估算的 token 数
     */
    function estimateMessagesTokens(messages) {
        let totalTokens = 0;
        for (const msg of messages) {
            totalTokens += estimateTextTokens(msg.content || '');
            totalTokens += 4; // 每条消息的固定开销（role + 格式）
        }
        return totalTokens;
    }

    /**
     * 估算文本的 token 数量（增强版）
     * @param {string} text - 文本内容
     * @returns {number} 估算的 token 数
     */
    function estimateTextTokens(text) {
        if (!text) return 0;
        
        // 更精确的 token 估算策略
        let tokens = 0;
        
        // 1. 代码块：通常 token 密度更高
        const codeBlockRegex = /```[\s\S]*?```/g;
        const codeBlocks = text.match(codeBlockRegex) || [];
        let codeLength = 0;
        codeBlocks.forEach(block => codeLength += block.length);
        const textLength = text.length - codeLength;
        
        // 2. 代码部分：约 2.5 字符/token
        tokens += Math.ceil(codeLength / 2.5);
        
        // 3. 普通文本：根据语言特征估算
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = textLength - chineseChars;
        
        // 中文约 1.5 字符/token，英文约 3.5 字符/token
        tokens += Math.ceil(chineseChars / 1.5);
        tokens += Math.ceil(englishWords / 3.5);
        
        return tokens;
    }

    /**
     * 智能截断历史记录（多级策略）
     * @param {Array} history - 完整历史
     * @param {string} newUserMessage - 新的用户消息
     * @returns {Array} 截断后的历史
     */
    function smartTruncateHistory(history, newUserMessage) {
        const maxTokens = agentState.config.maxContextTokens;
        const strategy = agentState.config.contextStrategy || 'auto';
        
        // 计算预留空间
        const newUserTokens = estimateTextTokens(newUserMessage);
        const reservedTokens = newUserTokens + (strategy === 'strict' ? 1000 : 2000);
        const availableTokens = maxTokens - reservedTokens;
        
        // 计算完整历史需要的 token
        const fullHistoryTokens = estimateMessagesTokens(history);
        
        Utils.debugLog(`[AIAgent] 📊 上下文分析: 最大${maxTokens}, 预留${reservedTokens}, 可用${availableTokens}, 历史${fullHistoryTokens}`);
        
        // 策略 1: 如果完整历史可以容纳，直接返回
        if (fullHistoryTokens <= availableTokens) {
            Utils.debugLog(`[AIAgent] ✅ 完整历史可容纳，无需截断`);
            return [...history];
        }
        
        // 策略 2: 渐进式截断
        let truncated = [];
        
        if (strategy === 'strict' || fullHistoryTokens > availableTokens * 1.5) {
            // 严格模式：快速截断，只保留最近的消息
            truncated = truncateByTokenLimit(history, availableTokens * 0.8);
        } else {
            // 智能模式：分级截断
            truncated = smartTruncate(history, availableTokens);
        }
        
        // 确保至少保留第一条消息（如果历史不为空）
        if (truncated.length === 0 && history.length > 0) {
            truncated = [history[0]];
            Utils.debugLog(`[AIAgent] ⚠️ 历史被大量截断，保留首条消息`);
        }
        
        // 如果截断了消息，添加摘要提示
        if (truncated.length < history.length && agentState.config.enableSummary) {
            const skippedCount = history.length - truncated.length;
            const firstMsg = history[0];
            const lastSkippedMsg = history[history.length - truncated.length - 1];
            
            // 生成简要摘要
            const summary = generateContextSummary(skippedCount, firstMsg, lastSkippedMsg);
            truncated.unshift({
                role: 'system',
                content: summary
            });
        }
        
        const finalTokens = estimateMessagesTokens(truncated);
        Utils.debugLog(`[AIAgent] 📊 历史截断: ${truncated.length}/${history.length} 条消息, ~${finalTokens} tokens`);
        
        return truncated;
    }
    
    /**
     * 基于 token 限制截断历史
     */
    function truncateByTokenLimit(history, maxTokens) {
        let selectedMessages = [];
        let currentTokens = 0;
        
        // 从后往前遍历，保留最近的消息
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            const msgTokens = estimateTextTokens(msg.content || '') + 4;
            
            if (currentTokens + msgTokens <= maxTokens) {
                selectedMessages.unshift(msg);
                currentTokens += msgTokens;
            } else {
                break;
            }
        }
        
        return selectedMessages;
    }
    
    /**
     * 智能分级截断
     */
    function smartTruncate(history, availableTokens) {
        const minMessages = Math.min(3, history.length);
        let currentTokens = 0;
        let selectedMessages = [];
        
        // 1. 优先保留最后 minMessages 条消息（最近的上下文）
        const recentMessages = history.slice(-minMessages);
        recentMessages.forEach(msg => {
            const msgTokens = estimateTextTokens(msg.content || '') + 4;
            selectedMessages.push(msg);
            currentTokens += msgTokens;
        });
        
        // 2. 剩余空间用于保留早期消息
        const remainingTokens = availableTokens - currentTokens;
        if (remainingTokens > 0 && history.length > minMessages) {
            const earlyHistory = history.slice(0, -minMessages);
            
            // 尝试保留第一条（通常是重要上下文）
            if (earlyHistory.length > 0) {
                const firstMsg = earlyHistory[0];
                const firstTokens = estimateTextTokens(firstMsg.content || '') + 4;
                if (firstTokens <= remainingTokens * 0.3) {
                    selectedMessages.unshift(firstMsg);
                    currentTokens += firstTokens;
                }
            }
            
            // 尝试保留中间的关键消息（包含代码块的）
            const middleMessages = earlyHistory.slice(1);
            for (const msg of middleMessages) {
                const msgTokens = estimateTextTokens(msg.content || '') + 4;
                const hasCode = msg.content && msg.content.includes('```');
                
                // 包含代码的消息优先级更高
                const threshold = hasCode ? remainingTokens * 0.5 : remainingTokens * 0.3;
                
                if (currentTokens + msgTokens <= availableTokens) {
                    // 插入到正确位置（保持时间顺序）
                    const insertIndex = selectedMessages.findIndex(m => 
                        history.indexOf(m) > history.indexOf(msg)
                    );
                    
                    if (insertIndex === -1) {
                        selectedMessages.push(msg);
                    } else {
                        selectedMessages.splice(insertIndex, 0, msg);
                    }
                    currentTokens += msgTokens;
                }
            }
        }
        
        // 按原始顺序排序
        selectedMessages.sort((a, b) => history.indexOf(a) - history.indexOf(b));
        
        return selectedMessages;
    }
    
    /**
     * 生成上下文摘要
     */
    function generateContextSummary(skippedCount, firstMsg, lastSkippedMsg) {
        let summary = `[上下文摘要：已省略 ${skippedCount} 条历史对话]`;
        
        // 如果有首尾消息，提供简要提示
        if (firstMsg && firstMsg.content) {
            const preview = firstMsg.content.substring(0, 50).replace(/\n/g, ' ');
            summary += `\n最早话题: "${preview}..."`;
        }
        
        if (lastSkippedMsg && lastSkippedMsg.content) {
            const preview = lastSkippedMsg.content.substring(0, 50).replace(/\n/g, ' ');
            summary += `\n最近省略: "${preview}..."`;
        }
        
        summary += '\n\n如有需要，请告知我回顾特定内容。';
        
        return summary;
    }

    /**
     * 更新 token 估算
     */
    function updateTokenEstimate() {
        agentState.estimatedTokens = estimateMessagesTokens(agentState.currentConversation);
    }

    /**
     * 添加消息到历史记录
     */
    function addToHistory(role, content) {
        agentState.currentConversation.push({ role, content });

        // 限制历史长度（避免 token 过多）
        const maxLength = agentState.config.maxHistoryLength;
        if (agentState.currentConversation.length > maxLength) {
            agentState.currentConversation = agentState.currentConversation.slice(-maxLength);
        }

        // 更新 token 估算
        updateTokenEstimate();
    }

    /**
     * 清空对话历史
     */
    function clearHistory() {
        agentState.currentConversation = [];
        agentState.pageContext = null;
        agentState.estimatedTokens = 0;
        agentState.contextStats = {
            totalTokens: 0,
            systemTokens: 0,
            pageContextTokens: 0,
            historyTokens: 0,
            userMessageTokens: 0,
            reservedTokens: 2000,
            utilizationRate: 0
        };
        Utils.debugLog('[AIAgent] 🗑️ 历史已清空');
    }

    /**
     * 获取 Agent 状态
     */
    function getState() {
        return {
            isInitialized: agentState.isInitialized,
            isProcessing: agentState.isProcessing,
            historyLength: agentState.currentConversation.length,
            history: [...agentState.currentConversation],  // 返回对话历史副本
            hasPageContext: !!agentState.pageContext,
            lastError: agentState.lastError,
            config: { ...agentState.config },
            estimatedTokens: agentState.estimatedTokens,
            contextStats: { ...agentState.contextStats }  // 上下文统计信息
        };
    }

    /**
     * 取消当前请求
     */
    function cancelRequest() {
        if (agentState.abortController) {
            agentState.abortController.abort();
            agentState.abortController = null;
            Utils.debugLog('[AIAgent] ⛔ 请求已取消');
        }
    }

    /**
     * 更新 Agent 配置
     */
    function updateConfig(newConfig) {
        agentState.config = { ...agentState.config, ...newConfig };
        Utils.debugLog('[AIAgent] ⚙️ 配置已更新', agentState.config);
    }

    /**
     * 获取依赖模块（用于调试或扩展）
     */
    function getDependencies() {
        return { ...dependencies };
    }

    /**
     * 执行代码（委托给 CodeExecutor）
     * @param {string} code - JavaScript 代码
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    async function executeCode(code, options = {}) {
        if (!dependencies.CodeExecutor) {
            throw new Error('CodeExecutor 不可用');
        }

        Utils.debugLog('[AIAgent] 🛠️ 执行代码', code.substring(0, 50) + '...');

        try {
            const result = await dependencies.CodeExecutor.executeCode(code, {
                strictMode: options.strictMode !== false  // 默认启用严格模式
            });

            Utils.debugLog('[AIAgent] ✅ 代码执行成功');
            return result;

        } catch (error) {
            Utils.debugLog('[AIAgent] ❌ 代码执行失败:', error.message || error.error);
            throw error;
        }
    }

    /**
     * 从消息中提取并执行代码块
     * @param {string} messageText - AI 回复的文本
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 执行结果数组
     */
    async function executeCodeFromMessage(messageText, options = {}) {
        if (!dependencies.CodeExecutor) {
            throw new Error('CodeExecutor 不可用');
        }

        // 1. 提取代码块
        const codeBlocks = dependencies.CodeExecutor.extractCodeBlocks(messageText);

        if (codeBlocks.length === 0) {
            Utils.debugLog('[AIAgent] ⚠️ 未找到代码块');
            return [];
        }

        Utils.debugLog(`[AIAgent] 🛠️ 找到 ${codeBlocks.length} 个代码块，开始执行`);

        // 2. 批量执行
        const results = await dependencies.CodeExecutor.executeBatch(codeBlocks, {
            strictMode: options.strictMode,
            stopOnError: options.stopOnError !== false
        });

        Utils.debugLog(`[AIAgent] ✅ 完成 ${results.length} 个代码块的执行`);
        return results;
    }

    return {
        // 核心方法
        init,
        sendMessage,
        
        // 上下文管理
        buildMessageContext,
        getPageContext,
        clearHistory,
        addToHistory,
        
        // 智能功能
        selectOptimalModel,
        estimateMessagesTokens,
        smartTruncateHistory,
        
        // 代码执行 (v4.5.0)
        executeCode,
        executeCodeFromMessage,
        
        // 状态管理
        getState,
        updateConfig,
        cancelRequest,
        
        // 调试和扩展
        getDependencies
    };
})();


// =====================================================
// 模块: business/WebAgentClient.js
// =====================================================

// ==================== Web Agent 客户端 ====================
// v4.7.0: 业务逻辑层，协调 AIAgent 和 UI
// 职责：业务流程编排、状态管理、错误处理、生命周期管理

const WebAgentClient = (function() {
    'use strict';

    // ==================== 工具函数 ====================
    
    /**
     * HTML转义，防止XSS攻击
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== 客户端状态 ====================
    const clientState = {
        isInitialized: false,
        isProcessing: false,
        settings: {},
        uiState: {
            visible: false,
            position: { x: null, y: null },
            size: { width: 450, height: 500 }
        },
        currentSession: {
            id: null,
            startTime: null,
            messageCount: 0
        },
        lastError: null,
        
        // 消息队列
        messageQueue: [],
        maxQueueSize: 10,  // 最大队列长度
        
        // 代码执行队列
        executionQueue: [],
        isExecuting: false,
        maxExecutionQueueSize: 20,  // 最大执行队列长度
        autoExecuteCode: true,  // 是否自动执行代码（默认启用）
        
        // P0: 代码执行任务管理
        codeExecutionTasks: new Map(),  // messageId -> { tasks[], abortController }
        currentAbortController: null  // 当前消息的取消控制器
    };

    // ==================== 初始化 ====================

    /**
     * 初始化 WebAgentClient
     */
    async function init(options = {}) {
        if (clientState.isInitialized) {
            console.warn('[WebAgentClient] 已经初始化，跳过');
            return;
        }

        try {
            console.log('[WebAgentClient] 🚀 正在初始化...');

            // 1. 加载配置（优先使用 StorageManager）
            clientState.settings = await loadSettings(options);

            // 2. 初始化 AIAgent（基础设施）
            await AIAgent.init({
                autoAttachPageContext: clientState.settings.autoAttachPageContext !== false,
                maxHistoryLength: clientState.settings.maxHistoryLength || 30,
                maxContextTokens: clientState.settings.maxContextTokens || 8000,
                defaultModel: clientState.settings.defaultModel || 'auto',
                defaultTemperature: clientState.settings.temperature || 0.7,
                defaultMaxTokens: clientState.settings.maxTokens || 4096,
                enableModelRouter: true  // 启用智能路由
            });

            // 3. 恢复会话
            await restoreSession();

            // 4. 注册事件监听
            setupEventListeners();

            clientState.isInitialized = true;
            
            // 如果恢复了会话，使用恢复的；否则创建新会话
            if (!clientState.currentSession.id) {
                clientState.currentSession = {
                    id: generateSessionId(),
                    startTime: Date.now(),
                    messageCount: 0
                };
            }

            console.log('[WebAgentClient] ✅ 初始化完成', {
                sessionId: clientState.currentSession.id,
                settings: clientState.settings
            });

        } catch (error) {
            console.error('[WebAgentClient] ❌ 初始化失败:', error);
            throw error;
        }
    }

    // ==================== 核心业务方法 ====================

    /**
     * 处理用户消息（主要入口）
     * @param {string} message - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 响应结果
     */
    async function handleUserMessage(message, options = {}) {
        console.log('[WebAgentClient] 📥 handleUserMessage 被调用');
        console.log('[WebAgentClient] 📋 消息:', message.substring(0, 100));
        console.log('[WebAgentClient] 🔧 isInitialized:', clientState.isInitialized);
        console.log('[WebAgentClient] 🔧 isProcessing:', clientState.isProcessing);
        
        if (!clientState.isInitialized) {
            console.error('[WebAgentClient] ❌ 未初始化');
            throw new Error('WebAgentClient 未初始化');
        }

        // 如果正在处理，将消息加入队列
        if (clientState.isProcessing) {
            if (clientState.messageQueue.length >= clientState.maxQueueSize) {
                throw new Error(`消息队列已满（最大 ${clientState.maxQueueSize} 条）`);
            }
            
            clientState.messageQueue.push({ message, options });
            console.log(`[WebAgentClient] ⏳ 消息已加入队列 (${clientState.messageQueue.length}/${clientState.maxQueueSize})`);
            
            // 返回一个占位符，表示消息已排队
            return {
                success: true,
                queued: true,
                queuePosition: clientState.messageQueue.length,
                message: '消息已加入队列，将在当前消息完成后处理'
            };
        }

        clientState.isProcessing = true;
        clientState.lastError = null;
        
        // P0: 取消当前所有代码执行任务（仅当不是系统反馈消息时）
        const isSystemFeedback = message.includes('[SYSTEM: Code Execution Results]');
        if (!isSystemFeedback) {
            cancelAllCodeExecutions();
        } else {
            console.log('[WebAgentClient] ⚠️ 系统反馈消息，保留当前任务状态用于保存');
        }

        try {
            // 1. 验证消息
            validateMessage(message);

            // 2. 检查是否为 /runjs 命令
            if (message.startsWith('/runjs ')) {
                const code = message.substring(7).trim();
                console.log('[WebAgentClient] 🚀 检测到 /runjs 命令，直接执行代码');
                
                // 添加用户消息到历史
                AIAgent.addToHistory('user', message);
                
                // 创建 AI 消息占位符（流式输出）
                EventManager.emit(EventManager.EventTypes.MESSAGE_STREAMING, {
                    chunk: '',
                    sessionId: clientState.currentSession.id
                });
                
                try {
                    // 执行代码
                    const result = await handleCodeExecution(code, { strictMode: true });
                    
                    // 构建响应内容
                    let responseContent = '';
                    if (result.success) {
                        responseContent = '```result\n' + JSON.stringify(result.result) + '\n```';
                    } else {
                        responseContent = '```result\n执行失败: ' + (result.error || '未知错误') + '\n```';
                    }
                    
                    // 添加到历史
                    AIAgent.addToHistory('assistant', responseContent);
                    
                    // 触发完成事件
                    EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
                        result: { content: responseContent },
                        sessionId: clientState.currentSession.id
                    });
                    
                    // 更新会话统计
                    clientState.currentSession.messageCount += 2;
                    debouncedSaveSession();
                    
                    return { success: true, content: responseContent };
                    
                } catch (error) {
                    const errorMsg = '```result\n执行异常: ' + error.message + '\n```';
                    AIAgent.addToHistory('assistant', errorMsg);
                    
                    EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
                        result: { content: errorMsg },
                        sessionId: clientState.currentSession.id
                    });
                    
                    clientState.currentSession.messageCount += 2;
                    debouncedSaveSession();
                    
                    throw error;
                }
            }

            // 3. 发送消息到 AIAgent
            console.log('[WebAgentClient] 📤 准备发送消息到 AIAgent...');
            console.log('[WebAgentClient] 📋 消息内容:', message.substring(0, 100));
            console.log('[WebAgentClient] ⚙️ 配置:', { model: options.model, temperature: options.temperature });
            
            const result = await AIAgent.sendMessage(message, {
                model: options.model,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                includePageContext: options.includePageContext,
                onChunk: (chunk) => {
                    console.log('[WebAgentClient] 📨 收到流式 chunk:', chunk.substring(0, 50));
                    // 触发流式更新事件
                    EventManager.emit(EventManager.EventTypes.MESSAGE_STREAMING, {
                        chunk,
                        sessionId: clientState.currentSession.id
                    });
                }
            });
            
            console.log('[WebAgentClient] ✅ AIAgent 返回结果:', result);

            // 3. 更新会话统计
            clientState.currentSession.messageCount += 2; // user + assistant

            // P0: 流式完成后，检测并执行代码块
            console.log('[WebAgentClient] 🔍 检查响应内容是否包含代码块...');
            console.log('[WebAgentClient] 📄 响应长度:', result.content?.length || 0);
            
            let hasCodeBlocks = false;
            
            if (result.content && result.content.includes('```runjs')) {
                console.log('[WebAgentClient] ✅ 检测到 runjs 代码块，开始执行');
                hasCodeBlocks = true;
                
                // ✅ 先触发 MESSAGE_COMPLETE，让 UI 正常显示代码块
                EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
                    result,
                    sessionId: clientState.currentSession.id
                });
                console.log('[WebAgentClient] ✅ MESSAGE_COMPLETE 已触发');
                
                // 等待 React 完成渲染后再执行代码
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            setTimeout(resolve, 0);
                        });
                    });
                });
                console.log('[WebAgentClient] ⏳ React 渲染完成，开始执行代码');
                
                await executeCodeBlocksAfterStreaming(result.content, clientState.currentSession.id);
                
                console.log('[WebAgentClient] ⏳ 等待执行结果反馈消息处理...');
            } else {
                console.log('[WebAgentClient] ℹ️ 未检测到 runjs 代码块');
                
                // 没有代码块，正常触发 MESSAGE_COMPLETE
                EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
                    result,
                    sessionId: clientState.currentSession.id
                });
            }

            // 6. 自动保存会话状态（防抖）
            debouncedSaveSession();

            return result;

        } catch (error) {
            clientState.lastError = error;
            
            // 错误处理策略
            await handleError(error, message, options);
            
            throw error;

        } finally {
            clientState.isProcessing = false;
            
            // 处理队列中的下一条消息
            processNextMessage();
        }
    }

    /**
     * P0: 取消所有代码执行任务
     */
    function cancelAllCodeExecutions() {
        // 清空执行队列
        clientState.executionQueue = [];
        clientState.isExecuting = false;
        
        // P0: 清空当前消息任务跟踪
        clientState.currentMessageTasks = [];
        
        console.log('[WebAgentClient] ⛔ 已取消所有代码执行任务');
    }

    /**
     * P0: 生成稳定的代码块 ID（基于代码内容）
     * @param {string} code - 代码内容
     * @returns {string} 稳定的 ID
     */
    function generateCodeId(code) {
        // 使用简单的 hash 算法，基于代码内容生成稳定 ID
        let hash = 0;
        for (let i = 0; i < code.length; i++) {
            const char = code.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 'code_' + Math.abs(hash).toString(36);
    }

    /**
     * P0: 流式完成后检测并执行代码块
     * @param {string} content - AI 回复内容
     * @param {string} sessionId - 会话 ID
     */
    async function executeCodeBlocksAfterStreaming(content, sessionId) {
        // P2: 检查是否启用自动执行
        if (!clientState.autoExecuteCode) {
            console.log('[WebAgentClient] ⚠️ 自动执行代码已禁用，跳过');
            return;
        }
        
        // 提取所有代码块
        const codeBlockRegex = /```runjs\n([\s\S]*?)```/g;
        let match;
        const tasks = [];
        
        while ((match = codeBlockRegex.exec(content)) !== null) {
            const code = match[1].trim();
            // P0: 使用基于代码内容的稳定 ID，与 UI 端保持一致
            const blockId = generateCodeId(code);
            
            // 检查是否高危
            const CodeExecutor = AIAgent.getDependencies()?.CodeExecutor;
            const isHighRisk = CodeExecutor ? CodeExecutor.isHighRiskCode(code) : false;
            const riskType = isHighRisk && CodeExecutor ? CodeExecutor.getHighRiskType(code) : null;
            
            tasks.push({
                code,
                blockId,
                isHighRisk,
                riskType,
                status: 'pending',
                result: null
            });
        }
        
        if (tasks.length === 0) return;
        
        console.log(`[WebAgentClient] 📦 检测到 ${tasks.length} 个代码块`);
        
        // 初始化任务跟踪
        clientState.currentMessageTasks = tasks;
        
        // 触发UI事件，显示代码块和执行按钮
        tasks.forEach(task => {
            EventManager.emit(EventManager.EventTypes.CODE_BLOCK_DETECTED, {
                code: task.code,
                isHighRisk: task.isHighRisk,
                riskType: task.riskType,
                blockId: task.blockId,
                sessionId
            });
        });
        
        // 执行普通代码（非高危）
        for (const task of tasks) {
            if (task.isHighRisk) {
                task.status = 'pending_high_risk';
                console.log('[WebAgentClient] ⚠️ 高危代码，等待用户确认');
                continue;
            }
            
            task.status = 'executing';
            console.log('[WebAgentClient] ▶️ 执行代码块', { blockId: task.blockId, code: task.code.substring(0, 50) });
            
            try {
                const result = await handleCodeExecution(task.code, {
                    strictMode: false,
                    autoGenerated: true,
                    blockId: task.blockId,
                    sessionId
                });
                
                console.log('[WebAgentClient] ✅ 代码块执行成功', { blockId: task.blockId, result });
                task.status = 'completed';
                task.result = result;
            } catch (error) {
                console.log('[WebAgentClient] ❌ 代码块执行失败', { blockId: task.blockId, error: error.message });
                task.status = 'failed';
                task.result = { success: false, error: error.message };
                console.error('[WebAgentClient] ❌ 代码块执行失败:', error);
            }
        }
        
        // 检查是否所有任务都完成了
        await checkAllTasksCompleted();
    }

    /**
     * P0: 检查所有任务是否完成，如果完成则通知大模型
     */
    async function checkAllTasksCompleted() {
        if (!clientState.currentMessageTasks || clientState.currentMessageTasks.length === 0) {
            return;
        }
        
        // 检查是否所有任务都已完成（仅 completed 或 failed，pending_high_risk 不算完成）
        const allDone = clientState.currentMessageTasks.every(task => 
            task.status === 'completed' || 
            task.status === 'failed'
        );
        
        // 检查是否有高危代码等待执行
        const hasPendingHighRisk = clientState.currentMessageTasks.some(task => 
            task.status === 'pending_high_risk'
        );
        
        if (hasPendingHighRisk) {
            console.log('[WebAgentClient] ⚠️ 有高危代码等待用户确认，阻塞等待');
            return;
        }
        
        if (allDone) {
            console.log('[WebAgentClient] ✅ 所有代码任务已完成，准备通知大模型');
            
            // 构建执行结果摘要
            const results = clientState.currentMessageTasks.map(task => ({
                blockId: task.blockId,
                status: task.status,
                result: task.result
            }));
            
            // P2: 触发事件，让 UI 知道代码执行完成
            EventManager.emit(EventManager.EventTypes.CODE_BATCH_EXECUTED, {
                results,
                sessionId: clientState.currentSession.id
            });
            
            // ✅ 将执行结果作为系统反馈消息加入队列
            try {
                const summary = results.map(r => {
                    const statusText = r.status === 'completed' ? '✅ 成功' : 
                                      r.status === 'failed' ? '❌ 失败' : 
                                      '⏸️ 待执行';
                    return `代码块 ${r.blockId} : ${statusText}\n${r.result?.result || r.result?.error || ''}`;
                }).join('\n\n');
                
                const systemMessage = `[SYSTEM: Code Execution Results]\n\n${summary}\n\n请根据以上执行结果继续对话。如果需要进一步操作，请用自然语言描述，不要生成代码。`;
                
                console.log('[WebAgentClient] 📤 将执行结果作为系统消息加入队列');
                
                // 调用 handleUserMessage，此时 isProcessing=true，会自动加入队列
                await handleUserMessage(systemMessage, {
                    includePageContext: false
                });
                
                console.log('[WebAgentClient] ✅ 执行结果反馈消息已加入队列');
            } catch (error) {
                console.error('[WebAgentClient] ❌ 加入执行结果反馈失败:', error);
            }
            
            // P0: 在清理任务列表之前保存执行状态
            await saveSession();
            
            // 清理任务列表
            clientState.currentMessageTasks = [];
        }
    }

    /**
     * 执行代码
     * @param {string} code - JavaScript 代码
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    async function handleCodeExecution(code, options = {}) {
        if (!clientState.isInitialized) {
            throw new Error('WebAgentClient 未初始化');
        }

        // 如果正在执行，将代码加入队列
        if (clientState.isExecuting) {
            if (clientState.executionQueue.length >= clientState.maxExecutionQueueSize) {
                throw new Error(`执行队列已满（最大 ${clientState.maxExecutionQueueSize} 条）`);
            }
            
            clientState.executionQueue.push({ code, options });
            console.log(`[WebAgentClient] ⏳ 代码已加入执行队列 (${clientState.executionQueue.length}/${clientState.maxExecutionQueueSize})`);
            
            return {
                success: true,
                queued: true,
                queuePosition: clientState.executionQueue.length,
                message: '代码已加入执行队列'
            };
        }

        try {
            console.log('[WebAgentClient] 🛠️ 执行代码');
            clientState.isExecuting = true;

            const result = await AIAgent.executeCode(code, {
                strictMode: options.strictMode !== false,
                requireConfirmation: options.requireConfirmation === true  // P0: 高危代码确认
            });

            EventManager.emit(EventManager.EventTypes.CODE_EXECUTED, {
                code,
                blockId: options.blockId,  // P0: 传递 blockId
                result,
                sessionId: clientState.currentSession.id
            });
            
            console.log('[WebAgentClient] 📡 CODE_EXECUTED 事件已发送', { blockId: options.blockId, success: result.success });

            return result;

        } catch (error) {
            console.error('[WebAgentClient] ❌ 代码执行失败:', error);
            
            EventManager.emit(EventManager.EventTypes.CODE_EXECUTION_ERROR, {
                code,
                error,
                sessionId: clientState.currentSession.id
            });

            // 将错误对象包装为 Error 实例，以便正确传播
            const errorMessage = error.error || error.message || '未知错误';
            throw new Error(errorMessage);
        } finally {
            clientState.isExecuting = false;
            
            // 处理队列中的下一个代码
            processNextExecution();
        }
    }

    /**
     * 从消息中提取并执行代码
     * @param {string} messageText - AI 回复的文本
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 执行结果数组
     */
    async function handleCodeFromMessage(messageText, options = {}) {
        if (!clientState.isInitialized) {
            throw new Error('WebAgentClient 未初始化');
        }

        try {
            console.log('[WebAgentClient] 🛠️ 从消息中提取并执行代码');

            const results = await AIAgent.executeCodeFromMessage(messageText, {
                strictMode: options.strictMode,
                stopOnError: options.stopOnError
            });

            EventManager.emit(EventManager.EventTypes.CODE_BATCH_EXECUTED, {
                results,
                sessionId: clientState.currentSession.id
            });

            return results;

        } catch (error) {
            console.error('[WebAgentClient] ❌ 批量代码执行失败:', error);
            throw error;
        }
    }

    /**
     * 提取并执行代码（自动模式）
     * @param {string} messageText - AI 回复的文本
     * @returns {Promise<string|null>} 返回包含执行结果的完整内容，如果没有代码块则返回 null
     */
    async function extractAndExecuteCode(messageText) {
        try {
            // 提取所有代码块
            const codeBlocks = AIAgent.getDependencies()?.CodeExecutor?.extractCodeBlocks(messageText);
            
            if (!codeBlocks || codeBlocks.length === 0) {
                return null;  // 没有代码块，不需要修改
            }

            console.log(`[WebAgentClient] 🤖 检测到 ${codeBlocks.length} 个代码块，准备自动执行`);

            // 收集所有执行结果
            const executionResults = [];

            // 逐个执行代码
            for (const block of codeBlocks) {
                const lang = block.lang || block.language || 'runjs';  // 兼容两种字段名
                console.log(`[WebAgentClient] 🔍 检查代码块语言: ${lang}`);
                console.log(`[WebAgentClient] 🔍 代码内容:`, block.code.substring(0, 50) + '...');
                
                if (lang === 'runjs' || lang === 'javascript' || lang === 'js') {
                    console.log(`[WebAgentClient] ▶️ 准备执行 JavaScript 代码`);
                    try {
                        const result = await handleCodeExecution(block.code, {
                            strictMode: true,
                            autoGenerated: true
                        });
                        
                        executionResults.push({
                            code: block.code,
                            success: result.success,
                            output: result.result,
                            error: result.error
                        });
                        
                        console.log(`[WebAgentClient] ✅ 代码执行${result.success ? '成功' : '失败'}:`, result.result || result.error);
                    } catch (error) {
                        console.error('[WebAgentClient] ❌ 代码执行异常:', error);
                        console.error('[WebAgentClient] 🔍 错误对象详情:', JSON.stringify({
                            type: typeof error,
                            isError: error instanceof Error,
                            message: error.message,
                            errorField: error.error,
                            stack: error.stack?.substring(0, 100)
                        }, null, 2));
                        
                        executionResults.push({
                            code: block.code,
                            success: false,
                            error: error.error || error.message || '未知错误'
                        });
                        
                        console.log('[WebAgentClient] 📦 executionResult:', executionResults[executionResults.length - 1]);
                    }
                } else {
                    console.log(`[WebAgentClient] ⚠️ 跳过非 JavaScript 代码块: ${lang}`);
                }
            }

            // 如果有执行结果，构建包含执行结果的完整内容
            if (executionResults.length > 0) {
                const feedbackSection = buildExecutionFeedback(executionResults);
                console.log('[WebAgentClient] 📝 已将执行结果附加到 AI 回复');
                console.log('[WebAgentClient] 📊 执行结果详情:', JSON.stringify(executionResults, null, 2));
                
                // 移除 AI 回复中所有 "执行结果" 相关的文本（AI 会自己预测执行结果）
                let cleanMessage = messageText;
                
                // 匹配各种格式的执行结果行（更激进的正则）
                const patterns = [
                    /^\s*[*#]*\s*执行结果[*#]*\s*[:：]\s*.+$/gim,           // **执行结果**: xxx
                    /^\s*执行结果.*$/gim,                                      // 执行结果: xxx（任意格式）
                    /\*\*执行结果\*\*[:：]\s*.+/gi,                           // **执行结果**: xxx
                ];
                
                patterns.forEach((pattern, idx) => {
                    const beforeMatch = cleanMessage;
                    cleanMessage = cleanMessage.replace(pattern, '').trim();
                    if (beforeMatch !== cleanMessage) {
                        console.log(`[WebAgentClient] 🧹 模式${idx + 1} 匹配并清理成功`);
                    }
                });
                
                // 调试日志
                if (messageText !== cleanMessage) {
                    console.log('[WebAgentClient]  AI 原始回复:');
                    console.log(messageText.substring(0, 200) + '...');
                    console.log('[WebAgentClient] 📝 清理后回复:');
                    console.log(cleanMessage.substring(0, 200) + '...');
                }
                
                // 构建最终内容
                const finalContent = cleanMessage + '\n\n---\n\n' + feedbackSection;
                console.log('[WebAgentClient] 📦 最终返回内容长度:', finalContent.length);
                console.log('[WebAgentClient] 📦 最终内容预览:', finalContent.substring(finalContent.length - 200));
                
                return finalContent;
            }

            return null;  // 没有 JavaScript 代码块

        } catch (error) {
            console.error('[WebAgentClient] ❌ 自动代码提取执行失败:', error);
            return null;
        }
    }

    /**
     * 构建执行结果反馈消息
     * @param {Array} results - 执行结果数组
     * @returns {string} 反馈消息
     */
    function buildExecutionFeedback(results) {
        let feedback = '```result\n';
        
        results.forEach((result, index) => {
            const status = result.success ? '成功' : '失败';
            const detail = result.success 
                ? (result.output !== undefined ? ': ' + JSON.stringify(result.output) : '')
                : ': ' + result.error;
            
            feedback += `代码块${index + 1} ${status}${detail}\n`;
        });
        
        feedback += '```\n';
        return feedback;
    }

    /**
     * P0: 手动执行高危代码（用户点击按钮）
     * @param {string} code - 代码内容
     * @param {string} blockId - 代码块ID
     */
    async function executeHighRiskCode(code, blockId) {
        console.log('[WebAgentClient] 🔴 用户确认执行高危代码');
        
        // 更新任务状态为执行中
        if (clientState.currentMessageTasks) {
            const task = clientState.currentMessageTasks.find(t => t.blockId === blockId);
            if (task) {
                task.status = 'executing';
            }
        }
        
        try {
            const result = await handleCodeExecution(code, {
                strictMode: false,
                autoGenerated: true,
                blockId
            });
            
            // 更新任务状态
            if (clientState.currentMessageTasks) {
                const task = clientState.currentMessageTasks.find(t => t.blockId === blockId);
                if (task) {
                    task.status = 'completed';
                    task.result = result;
                }
            }
            
            // 触发执行完成事件
            EventManager.emit(EventManager.EventTypes.CODE_EXECUTED, {
                code,
                blockId,
                result,
                sessionId: clientState.currentSession.id
            });
            
            // 检查是否所有任务都完成了
            await checkAllTasksCompleted();
            
            return result;
        } catch (error) {
            console.error('[WebAgentClient] ❌ 高危代码执行失败:', error);
            
            // 更新任务状态
            if (clientState.currentMessageTasks) {
                const task = clientState.currentMessageTasks.find(t => t.blockId === blockId);
                if (task) {
                    task.status = 'failed';
                    task.result = { success: false, error: error.message };
                }
            }
            
            // 检查是否所有任务都完成了
            await checkAllTasksCompleted();
            
            throw error;
        }
    }

    /**
     * 清空对话
     */
    function handleClearChat() {
        if (!clientState.isInitialized) {
            throw new Error('WebAgentClient 未初始化');
        }

        AIAgent.clearHistory();
        
        // 开始新会话
        clientState.currentSession = {
            id: generateSessionId(),
            startTime: Date.now(),
            messageCount: 0
        };

        // 清空消息队列
        clientState.messageQueue = [];

        EventManager.emit(EventManager.EventTypes.CHAT_CLEARED, {
            sessionId: clientState.currentSession.id
        });

        // 清除保存的会话
        if (window.StorageManager) {
            window.StorageManager.setState('session.current', null);
            window.StorageManager.setState('session.messages', []);
        }

        console.log('[WebAgentClient] 🗑️ 对话已清空，新会话:', clientState.currentSession.id);
    }

    /**
     * 取消当前请求
     */
    function handleCancelRequest() {
        if (!clientState.isInitialized) {
            return;
        }

        AIAgent.cancelRequest();
        
        // P0: 取消所有代码执行
        cancelAllCodeExecutions();
        
        // 清空消息队列
        clientState.messageQueue = [];
        
        EventManager.emit(EventManager.EventTypes.REQUEST_CANCELLED, {
            sessionId: clientState.currentSession.id
        });

        console.log('[WebAgentClient] ⛔ 请求已取消，队列已清空');
    }

    // ==================== 状态管理 ====================

    /**
     * 获取客户端状态
     */
    function getState() {
        return {
            isInitialized: clientState.isInitialized,
            isProcessing: clientState.isProcessing,
            settings: { ...clientState.settings },
            uiState: { ...clientState.uiState },
            currentSession: { ...clientState.currentSession },
            lastError: clientState.lastError,
            agentState: AIAgent.getState()
        };
    }

    /**
     * 更新设置
     */
    async function updateSettings(newSettings) {
        clientState.settings = { ...clientState.settings, ...newSettings };
        
        // 持久化（优先使用 StorageManager）
        await saveSettings(clientState.settings);

        // 如果修改了模型相关配置，重新初始化 AIAgent
        if (newSettings.defaultModel || newSettings.temperature || newSettings.maxTokens || newSettings.maxContextTokens) {
            AIAgent.updateConfig({
                defaultModel: newSettings.defaultModel,
                defaultTemperature: newSettings.temperature,
                defaultMaxTokens: newSettings.maxTokens,
                maxContextTokens: newSettings.maxContextTokens
            });
        }
        
        // 更新自动执行设置
        if (newSettings.autoExecuteCode !== undefined) {
            clientState.autoExecuteCode = newSettings.autoExecuteCode;
            console.log(`[WebAgentClient] ⚙️ 自动执行代码: ${clientState.autoExecuteCode ? '✅ 启用' : '❌ 禁用'}`);
        }

        EventManager.emit(EventManager.EventTypes.SETTINGS_UPDATED, {
            settings: clientState.settings
        });

        console.log('[WebAgentClient] ⚙️ 设置已更新');
    }

    /**
     * 更新 UI 状态
     */
    function updateUIState(newState) {
        clientState.uiState = { ...clientState.uiState, ...newState };
        
        EventManager.emit(EventManager.EventTypes.UI_STATE_CHANGED, {
            uiState: clientState.uiState
        });
    }

    // ==================== 私有方法 ====================

    /**
     * 加载设置
     */
    async function loadSettings(options = {}) {
        const defaults = {
            autoAttachPageContext: true,
            maxHistoryLength: 30,
            maxContextTokens: 8000,
            defaultModel: 'auto',
            temperature: 0.7,
            maxTokens: 4096,
            theme: 'light',
            language: 'zh-CN'
        };

        let saved = {};

        // 从 StorageManager 加载
        if (window.StorageManager) {
            saved = {
                defaultModel: window.StorageManager.getState('config.model'),
                temperature: window.StorageManager.getState('config.temperature'),
                maxTokens: window.StorageManager.getState('config.maxTokens'),
                maxContextTokens: window.StorageManager.getState('config.maxContextTokens')
            };
            console.log('[WebAgentClient] 📦 从 StorageManager 加载设置');
        }

        return { ...defaults, ...saved, ...options };
    }

    /**
     * 保存设置
     */
    async function saveSettings(settings) {
        // 使用 StorageManager
        if (window.StorageManager) {
            window.StorageManager.setState('config.model', settings.defaultModel);
            window.StorageManager.setState('config.temperature', settings.temperature);
            window.StorageManager.setState('config.maxTokens', settings.maxTokens);
            window.StorageManager.setState('config.maxContextTokens', settings.maxContextTokens);
            console.log('[WebAgentClient] 💾 设置已保存到 StorageManager');
        }
    }

    /**
     * 恢复会话
     */
    async function restoreSession() {
        try {
            // 从 StorageManager 恢复上次的会话状态
            if (window.StorageManager) {
                const savedSession = window.StorageManager.getState('session.current');
                const savedMessages = window.StorageManager.getState('session.messages');
                
                if (savedSession && savedMessages) {
                    clientState.currentSession = savedSession;
                    
                    // 恢复 AIAgent 的对话历史
                    if (AIAgent) {
                        // 清空当前历史
                        AIAgent.clearHistory();
                        
                        // 逐条添加恢复的消息
                        for (const msg of savedMessages) {
                            AIAgent.addToHistory(msg.role, msg.content);
                        }
                        
                        console.log(`[WebAgentClient] 📂 恢复了 ${savedMessages.length} 条消息`);
                    }
                    
                    console.log('[WebAgentClient] 📂 会话已恢复:', savedSession.id);
                    
                    // P2: 触发事件通知 UI 更新
                    EventManager.emit(EventManager.EventTypes.SESSION_RESTORED, {
                        session: savedSession,
                        messageCount: savedMessages.length
                    });
                    
                    // P0: 恢复代码块执行状态（延迟执行，等待DOM渲染完成）
                    const codeExecutionStates = window.StorageManager.getState('session.codeExecutionStates');
                    if (codeExecutionStates && Array.isArray(codeExecutionStates) && codeExecutionStates.length > 0) {
                        console.log('[WebAgentClient] 🔄 准备恢复', codeExecutionStates.length, '个代码块执行状态');
                        
                        // 等待 DOM 渲染完成后更新状态
                        setTimeout(() => {
                            codeExecutionStates.forEach(state => {
                                const statusEl = document.querySelector(`.code-execution-status[data-code-id="${state.blockId}"]`);
                                const resultEl = document.querySelector(`.code-execution-result[data-code-id="${state.blockId}"]`);
                                
                                if (statusEl && resultEl) {
                                    if (state.status === 'completed') {
                                        statusEl.className = 'code-execution-status completed';
                                        statusEl.textContent = '✅ 执行成功';
                                        resultEl.style.display = 'block';
                                        resultEl.innerHTML = `<pre style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(state.result?.result || '')}</pre>`;
                                        console.log(`[WebAgentClient] ✅ 恢复代码块 ${state.blockId} 为已完成`);
                                    } else if (state.status === 'failed') {
                                        statusEl.className = 'code-execution-status failed';
                                        statusEl.textContent = '❌ 执行失败';
                                        resultEl.style.display = 'block';
                                        resultEl.innerHTML = `<pre style="color: red; white-space: pre-wrap; word-break: break-word;">${escapeHtml(state.result?.error || '')}</pre>`;
                                        console.log(`[WebAgentClient] ❌ 恢复代码块 ${state.blockId} 为失败`);
                                    }
                                } else {
                                    console.warn(`[WebAgentClient] ⚠️ 未找到代码块 ${state.blockId} 的DOM元素`);
                                }
                            });
                        }, 500); // 等待500ms让React完成渲染
                    }
                    
                    return;
                }
            }
            
            console.log('[WebAgentClient] 📂 没有找到可恢复的会话');
            
        } catch (error) {
            console.error('[WebAgentClient] ❌ 会话恢复失败:', error);
        }
    }

    /**
     * 保存会话状态
     */
    async function saveSession() {
        try {
            if (window.StorageManager && clientState.currentSession.id) {
                // 直接从 AIAgent 获取对话历史
                const agentState = AIAgent.getState();
                const messages = agentState.history || [];
                
                // 保存会话信息
                window.StorageManager.setState('session.current', clientState.currentSession);
                window.StorageManager.setState('session.messages', messages);
                
                // P0: 保存代码块执行状态（用于刷新后恢复UI）
                // 只有在有任务时才保存，避免覆盖已保存的状态
                if (clientState.currentMessageTasks && clientState.currentMessageTasks.length > 0) {
                    const codeExecutionStates = clientState.currentMessageTasks
                        .filter(task => task.status === 'completed' || task.status === 'failed')
                        .map(task => ({
                            blockId: task.blockId,
                            status: task.status,
                            result: task.result
                        }));
                    
                    if (codeExecutionStates.length > 0) {
                        window.StorageManager.setState('session.codeExecutionStates', codeExecutionStates);
                        console.log('[WebAgentClient] 💾 保存了', codeExecutionStates.length, '个代码块执行状态');
                    }
                } else {
                    console.log('[WebAgentClient] 💾 无当前任务，保留已有的代码执行状态');
                }
                
                console.log('[WebAgentClient] 💾 会话已保存:', messages.length, '条消息');
            }
        } catch (error) {
            console.error('[WebAgentClient] ❌ 会话保存失败:', error);
        }
    }

    /**
     * 设置事件监听
     */
    function setupEventListeners() {
        // 监听 AIAgent 事件
        // 可以在这里添加更多的全局事件处理
    }

    /**
     * 验证消息
     */
    function validateMessage(message) {
        if (!message || typeof message !== 'string') {
            throw new Error('消息不能为空');
        }

        if (message.trim().length === 0) {
            throw new Error('消息不能为空白');
        }

        if (message.length > 10000) {
            throw new Error('消息过长（最大 10000 字符）');
        }
    }

    /**
     * 错误处理策略
     */
    async function handleError(error, originalMessage, options) {
        console.error('[WebAgentClient] 错误处理:', error);

        // P2: 触发 MESSAGE_ERROR 事件，通知 UI
        EventManager.emit(EventManager.EventTypes.MESSAGE_ERROR, {
            error: error.message || String(error),
            sessionId: clientState.currentSession.id
        });

        // 记录错误
        if (ErrorTracker) {
            ErrorTracker.report(error, {
                category: 'WEB_AGENT_CLIENT',
                message: originalMessage?.substring(0, 50),
                sessionId: clientState.currentSession.id
            }, ErrorTracker.ErrorCategory.EXECUTION, ErrorTracker.ErrorLevel.ERROR);
        }

        // 根据错误类型采取不同策略
        if (error.message.includes('网络') || error.message.includes('timeout')) {
            // 网络错误：建议重试
            EventManager.emit(EventManager.EventTypes.NETWORK_ERROR, {
                error,
                canRetry: true
            });
        } else if (error.message.includes('模型不可用')) {
            // 模型错误：尝试切换模型
            EventManager.emit(EventManager.EventTypes.MODEL_ERROR, {
                error,
                canSwitch: true
            });
        } else {
            // 其他错误：直接抛出
            EventManager.emit(EventManager.EventTypes.GENERAL_ERROR, {
                error
            });
        }
    }

    /**
     * 生成会话 ID
     */
    function generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 防抖保存会话（300ms 延迟）
     */
    let saveSessionTimer = null;
    function debouncedSaveSession() {
        if (saveSessionTimer) {
            clearTimeout(saveSessionTimer);
        }
        saveSessionTimer = setTimeout(() => {
            saveSession();
        }, 300);
    }

    /**
     * 处理队列中的下一条消息
     */
    async function processNextMessage() {
        if (clientState.messageQueue.length > 0 && !clientState.isProcessing) {
            const next = clientState.messageQueue.shift();
            console.log(`[WebAgentClient] 📤 从队列取出消息处理 (剩余: ${clientState.messageQueue.length})`);
            
            try {
                await handleUserMessage(next.message, next.options);
            } catch (error) {
                console.error('[WebAgentClient] 队列消息处理失败:', error);
            }
        }
    }

    /**
     * 处理执行队列中的下一个代码
     */
    async function processNextExecution() {
        if (clientState.executionQueue.length > 0 && !clientState.isExecuting) {
            const next = clientState.executionQueue.shift();
            console.log(`[WebAgentClient] 📤 从执行队列取出代码处理 (剩余: ${clientState.executionQueue.length})`);
            
            try {
                await handleCodeExecution(next.code, next.options);
            } catch (error) {
                console.error('[WebAgentClient] 队列代码执行失败:', error);
            }
        }
    }

    /**
     * 获取队列状态
     */
    function getQueueStatus() {
        return {
            isProcessing: clientState.isProcessing,
            queueLength: clientState.messageQueue.length,
            maxQueueSize: clientState.maxQueueSize,
            canAcceptMore: clientState.messageQueue.length < clientState.maxQueueSize,
            
            isExecuting: clientState.isExecuting,
            executionQueueLength: clientState.executionQueue.length,
            maxExecutionQueueSize: clientState.maxExecutionQueueSize,
            canAcceptMoreExecutions: clientState.executionQueue.length < clientState.maxExecutionQueueSize,
            
            autoExecuteCode: clientState.autoExecuteCode
        };
    }

    // ==================== 导出接口 ====================

    return {
        // 初始化
        init,
        
        // 核心业务方法
        handleUserMessage,
        handleCodeExecution,
        handleCodeFromMessage,
        extractAndExecuteCode,  // 自动提取并执行代码
        executeHighRiskCode,    // P0: 手动执行高危代码
        handleClearChat,
        handleCancelRequest,
        
        // 状态管理
        getState,
        updateSettings,
        updateUIState,
        saveSession,  // 手动保存会话
        getQueueStatus  // 获取队列状态
    };
})();


// =====================================================
// 模块: vendor/react.production.min.js
// =====================================================

/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
(function(){'use strict';(function(c,x){"object"===typeof exports&&"undefined"!==typeof module?x(exports):"function"===typeof define&&define.amd?define(["exports"],x):(c=c||self,x(c.React={}))})(this,function(c){function x(a){if(null===a||"object"!==typeof a)return null;a=V&&a[V]||a["@@iterator"];return"function"===typeof a?a:null}function w(a,b,e){this.props=a;this.context=b;this.refs=W;this.updater=e||X}function Y(){}function K(a,b,e){this.props=a;this.context=b;this.refs=W;this.updater=e||X}function Z(a,b,
e){var m,d={},c=null,h=null;if(null!=b)for(m in void 0!==b.ref&&(h=b.ref),void 0!==b.key&&(c=""+b.key),b)aa.call(b,m)&&!ba.hasOwnProperty(m)&&(d[m]=b[m]);var l=arguments.length-2;if(1===l)d.children=e;else if(1<l){for(var f=Array(l),k=0;k<l;k++)f[k]=arguments[k+2];d.children=f}if(a&&a.defaultProps)for(m in l=a.defaultProps,l)void 0===d[m]&&(d[m]=l[m]);return{$$typeof:y,type:a,key:c,ref:h,props:d,_owner:L.current}}function oa(a,b){return{$$typeof:y,type:a.type,key:b,ref:a.ref,props:a.props,_owner:a._owner}}
function M(a){return"object"===typeof a&&null!==a&&a.$$typeof===y}function pa(a){var b={"=":"=0",":":"=2"};return"$"+a.replace(/[=:]/g,function(a){return b[a]})}function N(a,b){return"object"===typeof a&&null!==a&&null!=a.key?pa(""+a.key):b.toString(36)}function B(a,b,e,m,d){var c=typeof a;if("undefined"===c||"boolean"===c)a=null;var h=!1;if(null===a)h=!0;else switch(c){case "string":case "number":h=!0;break;case "object":switch(a.$$typeof){case y:case qa:h=!0}}if(h)return h=a,d=d(h),a=""===m?"."+
N(h,0):m,ca(d)?(e="",null!=a&&(e=a.replace(da,"$&/")+"/"),B(d,b,e,"",function(a){return a})):null!=d&&(M(d)&&(d=oa(d,e+(!d.key||h&&h.key===d.key?"":(""+d.key).replace(da,"$&/")+"/")+a)),b.push(d)),1;h=0;m=""===m?".":m+":";if(ca(a))for(var l=0;l<a.length;l++){c=a[l];var f=m+N(c,l);h+=B(c,b,e,f,d)}else if(f=x(a),"function"===typeof f)for(a=f.call(a),l=0;!(c=a.next()).done;)c=c.value,f=m+N(c,l++),h+=B(c,b,e,f,d);else if("object"===c)throw b=String(a),Error("Objects are not valid as a React child (found: "+
("[object Object]"===b?"object with keys {"+Object.keys(a).join(", ")+"}":b)+"). If you meant to render a collection of children, use an array instead.");return h}function C(a,b,e){if(null==a)return a;var c=[],d=0;B(a,c,"","",function(a){return b.call(e,a,d++)});return c}function ra(a){if(-1===a._status){var b=a._result;b=b();b.then(function(b){if(0===a._status||-1===a._status)a._status=1,a._result=b},function(b){if(0===a._status||-1===a._status)a._status=2,a._result=b});-1===a._status&&(a._status=
0,a._result=b)}if(1===a._status)return a._result.default;throw a._result;}function O(a,b){var e=a.length;a.push(b);a:for(;0<e;){var c=e-1>>>1,d=a[c];if(0<D(d,b))a[c]=b,a[e]=d,e=c;else break a}}function p(a){return 0===a.length?null:a[0]}function E(a){if(0===a.length)return null;var b=a[0],e=a.pop();if(e!==b){a[0]=e;a:for(var c=0,d=a.length,k=d>>>1;c<k;){var h=2*(c+1)-1,l=a[h],f=h+1,g=a[f];if(0>D(l,e))f<d&&0>D(g,l)?(a[c]=g,a[f]=e,c=f):(a[c]=l,a[h]=e,c=h);else if(f<d&&0>D(g,e))a[c]=g,a[f]=e,c=f;else break a}}return b}
function D(a,b){var c=a.sortIndex-b.sortIndex;return 0!==c?c:a.id-b.id}function P(a){for(var b=p(r);null!==b;){if(null===b.callback)E(r);else if(b.startTime<=a)E(r),b.sortIndex=b.expirationTime,O(q,b);else break;b=p(r)}}function Q(a){z=!1;P(a);if(!u)if(null!==p(q))u=!0,R(S);else{var b=p(r);null!==b&&T(Q,b.startTime-a)}}function S(a,b){u=!1;z&&(z=!1,ea(A),A=-1);F=!0;var c=k;try{P(b);for(n=p(q);null!==n&&(!(n.expirationTime>b)||a&&!fa());){var m=n.callback;if("function"===typeof m){n.callback=null;
k=n.priorityLevel;var d=m(n.expirationTime<=b);b=v();"function"===typeof d?n.callback=d:n===p(q)&&E(q);P(b)}else E(q);n=p(q)}if(null!==n)var g=!0;else{var h=p(r);null!==h&&T(Q,h.startTime-b);g=!1}return g}finally{n=null,k=c,F=!1}}function fa(){return v()-ha<ia?!1:!0}function R(a){G=a;H||(H=!0,I())}function T(a,b){A=ja(function(){a(v())},b)}function ka(a){throw Error("act(...) is not supported in production builds of React.");}var y=Symbol.for("react.element"),qa=Symbol.for("react.portal"),sa=Symbol.for("react.fragment"),
ta=Symbol.for("react.strict_mode"),ua=Symbol.for("react.profiler"),va=Symbol.for("react.provider"),wa=Symbol.for("react.context"),xa=Symbol.for("react.forward_ref"),ya=Symbol.for("react.suspense"),za=Symbol.for("react.memo"),Aa=Symbol.for("react.lazy"),V=Symbol.iterator,X={isMounted:function(a){return!1},enqueueForceUpdate:function(a,b,c){},enqueueReplaceState:function(a,b,c,m){},enqueueSetState:function(a,b,c,m){}},la=Object.assign,W={};w.prototype.isReactComponent={};w.prototype.setState=function(a,
b){if("object"!==typeof a&&"function"!==typeof a&&null!=a)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,a,b,"setState")};w.prototype.forceUpdate=function(a){this.updater.enqueueForceUpdate(this,a,"forceUpdate")};Y.prototype=w.prototype;var t=K.prototype=new Y;t.constructor=K;la(t,w.prototype);t.isPureReactComponent=!0;var ca=Array.isArray,aa=Object.prototype.hasOwnProperty,L={current:null},
ba={key:!0,ref:!0,__self:!0,__source:!0},da=/\/+/g,g={current:null},J={transition:null};if("object"===typeof performance&&"function"===typeof performance.now){var Ba=performance;var v=function(){return Ba.now()}}else{var ma=Date,Ca=ma.now();v=function(){return ma.now()-Ca}}var q=[],r=[],Da=1,n=null,k=3,F=!1,u=!1,z=!1,ja="function"===typeof setTimeout?setTimeout:null,ea="function"===typeof clearTimeout?clearTimeout:null,na="undefined"!==typeof setImmediate?setImmediate:null;"undefined"!==typeof navigator&&
void 0!==navigator.scheduling&&void 0!==navigator.scheduling.isInputPending&&navigator.scheduling.isInputPending.bind(navigator.scheduling);var H=!1,G=null,A=-1,ia=5,ha=-1,U=function(){if(null!==G){var a=v();ha=a;var b=!0;try{b=G(!0,a)}finally{b?I():(H=!1,G=null)}}else H=!1};if("function"===typeof na)var I=function(){na(U)};else if("undefined"!==typeof MessageChannel){t=new MessageChannel;var Ea=t.port2;t.port1.onmessage=U;I=function(){Ea.postMessage(null)}}else I=function(){ja(U,0)};t={ReactCurrentDispatcher:g,
ReactCurrentOwner:L,ReactCurrentBatchConfig:J,Scheduler:{__proto__:null,unstable_ImmediatePriority:1,unstable_UserBlockingPriority:2,unstable_NormalPriority:3,unstable_IdlePriority:5,unstable_LowPriority:4,unstable_runWithPriority:function(a,b){switch(a){case 1:case 2:case 3:case 4:case 5:break;default:a=3}var c=k;k=a;try{return b()}finally{k=c}},unstable_next:function(a){switch(k){case 1:case 2:case 3:var b=3;break;default:b=k}var c=k;k=b;try{return a()}finally{k=c}},unstable_scheduleCallback:function(a,
b,c){var e=v();"object"===typeof c&&null!==c?(c=c.delay,c="number"===typeof c&&0<c?e+c:e):c=e;switch(a){case 1:var d=-1;break;case 2:d=250;break;case 5:d=1073741823;break;case 4:d=1E4;break;default:d=5E3}d=c+d;a={id:Da++,callback:b,priorityLevel:a,startTime:c,expirationTime:d,sortIndex:-1};c>e?(a.sortIndex=c,O(r,a),null===p(q)&&a===p(r)&&(z?(ea(A),A=-1):z=!0,T(Q,c-e))):(a.sortIndex=d,O(q,a),u||F||(u=!0,R(S)));return a},unstable_cancelCallback:function(a){a.callback=null},unstable_wrapCallback:function(a){var b=
k;return function(){var c=k;k=b;try{return a.apply(this,arguments)}finally{k=c}}},unstable_getCurrentPriorityLevel:function(){return k},unstable_shouldYield:fa,unstable_requestPaint:function(){},unstable_continueExecution:function(){u||F||(u=!0,R(S))},unstable_pauseExecution:function(){},unstable_getFirstCallbackNode:function(){return p(q)},get unstable_now(){return v},unstable_forceFrameRate:function(a){0>a||125<a?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):
ia=0<a?Math.floor(1E3/a):5},unstable_Profiling:null}};c.Children={map:C,forEach:function(a,b,c){C(a,function(){b.apply(this,arguments)},c)},count:function(a){var b=0;C(a,function(){b++});return b},toArray:function(a){return C(a,function(a){return a})||[]},only:function(a){if(!M(a))throw Error("React.Children.only expected to receive a single React element child.");return a}};c.Component=w;c.Fragment=sa;c.Profiler=ua;c.PureComponent=K;c.StrictMode=ta;c.Suspense=ya;c.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=
t;c.act=ka;c.cloneElement=function(a,b,c){if(null===a||void 0===a)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+a+".");var e=la({},a.props),d=a.key,k=a.ref,h=a._owner;if(null!=b){void 0!==b.ref&&(k=b.ref,h=L.current);void 0!==b.key&&(d=""+b.key);if(a.type&&a.type.defaultProps)var l=a.type.defaultProps;for(f in b)aa.call(b,f)&&!ba.hasOwnProperty(f)&&(e[f]=void 0===b[f]&&void 0!==l?l[f]:b[f])}var f=arguments.length-2;if(1===f)e.children=c;else if(1<f){l=
Array(f);for(var g=0;g<f;g++)l[g]=arguments[g+2];e.children=l}return{$$typeof:y,type:a.type,key:d,ref:k,props:e,_owner:h}};c.createContext=function(a){a={$$typeof:wa,_currentValue:a,_currentValue2:a,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null};a.Provider={$$typeof:va,_context:a};return a.Consumer=a};c.createElement=Z;c.createFactory=function(a){var b=Z.bind(null,a);b.type=a;return b};c.createRef=function(){return{current:null}};c.forwardRef=function(a){return{$$typeof:xa,
render:a}};c.isValidElement=M;c.lazy=function(a){return{$$typeof:Aa,_payload:{_status:-1,_result:a},_init:ra}};c.memo=function(a,b){return{$$typeof:za,type:a,compare:void 0===b?null:b}};c.startTransition=function(a,b){b=J.transition;J.transition={};try{a()}finally{J.transition=b}};c.unstable_act=ka;c.useCallback=function(a,b){return g.current.useCallback(a,b)};c.useContext=function(a){return g.current.useContext(a)};c.useDebugValue=function(a,b){};c.useDeferredValue=function(a){return g.current.useDeferredValue(a)};
c.useEffect=function(a,b){return g.current.useEffect(a,b)};c.useId=function(){return g.current.useId()};c.useImperativeHandle=function(a,b,c){return g.current.useImperativeHandle(a,b,c)};c.useInsertionEffect=function(a,b){return g.current.useInsertionEffect(a,b)};c.useLayoutEffect=function(a,b){return g.current.useLayoutEffect(a,b)};c.useMemo=function(a,b){return g.current.useMemo(a,b)};c.useReducer=function(a,b,c){return g.current.useReducer(a,b,c)};c.useRef=function(a){return g.current.useRef(a)};
c.useState=function(a){return g.current.useState(a)};c.useSyncExternalStore=function(a,b,c){return g.current.useSyncExternalStore(a,b,c)};c.useTransition=function(){return g.current.useTransition()};c.version="18.3.1"});
})();


// =====================================================
// 模块: vendor/react-dom.production.min.js
// =====================================================

/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
(function(){/*
 Modernizr 3.0.0pre (Custom Build) | MIT
*/
'use strict';(function(Q,zb){"object"===typeof exports&&"undefined"!==typeof module?zb(exports,require("react")):"function"===typeof define&&define.amd?define(["exports","react"],zb):(Q=Q||self,zb(Q.ReactDOM={},Q.React))})(this,function(Q,zb){function m(a){for(var b="https://reactjs.org/docs/error-decoder.html?invariant="+a,c=1;c<arguments.length;c++)b+="&args[]="+encodeURIComponent(arguments[c]);return"Minified React error #"+a+"; visit "+b+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}
function mb(a,b){Ab(a,b);Ab(a+"Capture",b)}function Ab(a,b){$b[a]=b;for(a=0;a<b.length;a++)cg.add(b[a])}function bj(a){if(Zd.call(dg,a))return!0;if(Zd.call(eg,a))return!1;if(cj.test(a))return dg[a]=!0;eg[a]=!0;return!1}function dj(a,b,c,d){if(null!==c&&0===c.type)return!1;switch(typeof b){case "function":case "symbol":return!0;case "boolean":if(d)return!1;if(null!==c)return!c.acceptsBooleans;a=a.toLowerCase().slice(0,5);return"data-"!==a&&"aria-"!==a;default:return!1}}function ej(a,b,c,d){if(null===
b||"undefined"===typeof b||dj(a,b,c,d))return!0;if(d)return!1;if(null!==c)switch(c.type){case 3:return!b;case 4:return!1===b;case 5:return isNaN(b);case 6:return isNaN(b)||1>b}return!1}function Y(a,b,c,d,e,f,g){this.acceptsBooleans=2===b||3===b||4===b;this.attributeName=d;this.attributeNamespace=e;this.mustUseProperty=c;this.propertyName=a;this.type=b;this.sanitizeURL=f;this.removeEmptyString=g}function $d(a,b,c,d){var e=R.hasOwnProperty(b)?R[b]:null;if(null!==e?0!==e.type:d||!(2<b.length)||"o"!==
b[0]&&"O"!==b[0]||"n"!==b[1]&&"N"!==b[1])ej(b,c,e,d)&&(c=null),d||null===e?bj(b)&&(null===c?a.removeAttribute(b):a.setAttribute(b,""+c)):e.mustUseProperty?a[e.propertyName]=null===c?3===e.type?!1:"":c:(b=e.attributeName,d=e.attributeNamespace,null===c?a.removeAttribute(b):(e=e.type,c=3===e||4===e&&!0===c?"":""+c,d?a.setAttributeNS(d,b,c):a.setAttribute(b,c)))}function ac(a){if(null===a||"object"!==typeof a)return null;a=fg&&a[fg]||a["@@iterator"];return"function"===typeof a?a:null}function bc(a,b,
c){if(void 0===ae)try{throw Error();}catch(d){ae=(b=d.stack.trim().match(/\n( *(at )?)/))&&b[1]||""}return"\n"+ae+a}function be(a,b){if(!a||ce)return"";ce=!0;var c=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(b)if(b=function(){throw Error();},Object.defineProperty(b.prototype,"props",{set:function(){throw Error();}}),"object"===typeof Reflect&&Reflect.construct){try{Reflect.construct(b,[])}catch(n){var d=n}Reflect.construct(a,[],b)}else{try{b.call()}catch(n){d=n}a.call(b.prototype)}else{try{throw Error();
}catch(n){d=n}a()}}catch(n){if(n&&d&&"string"===typeof n.stack){for(var e=n.stack.split("\n"),f=d.stack.split("\n"),g=e.length-1,h=f.length-1;1<=g&&0<=h&&e[g]!==f[h];)h--;for(;1<=g&&0<=h;g--,h--)if(e[g]!==f[h]){if(1!==g||1!==h){do if(g--,h--,0>h||e[g]!==f[h]){var k="\n"+e[g].replace(" at new "," at ");a.displayName&&k.includes("<anonymous>")&&(k=k.replace("<anonymous>",a.displayName));return k}while(1<=g&&0<=h)}break}}}finally{ce=!1,Error.prepareStackTrace=c}return(a=a?a.displayName||a.name:"")?bc(a):
""}function fj(a){switch(a.tag){case 5:return bc(a.type);case 16:return bc("Lazy");case 13:return bc("Suspense");case 19:return bc("SuspenseList");case 0:case 2:case 15:return a=be(a.type,!1),a;case 11:return a=be(a.type.render,!1),a;case 1:return a=be(a.type,!0),a;default:return""}}function de(a){if(null==a)return null;if("function"===typeof a)return a.displayName||a.name||null;if("string"===typeof a)return a;switch(a){case Bb:return"Fragment";case Cb:return"Portal";case ee:return"Profiler";case fe:return"StrictMode";
case ge:return"Suspense";case he:return"SuspenseList"}if("object"===typeof a)switch(a.$$typeof){case gg:return(a.displayName||"Context")+".Consumer";case hg:return(a._context.displayName||"Context")+".Provider";case ie:var b=a.render;a=a.displayName;a||(a=b.displayName||b.name||"",a=""!==a?"ForwardRef("+a+")":"ForwardRef");return a;case je:return b=a.displayName||null,null!==b?b:de(a.type)||"Memo";case Ta:b=a._payload;a=a._init;try{return de(a(b))}catch(c){}}return null}function gj(a){var b=a.type;
switch(a.tag){case 24:return"Cache";case 9:return(b.displayName||"Context")+".Consumer";case 10:return(b._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return a=b.render,a=a.displayName||a.name||"",b.displayName||(""!==a?"ForwardRef("+a+")":"ForwardRef");case 7:return"Fragment";case 5:return b;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return de(b);case 8:return b===fe?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";
case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if("function"===typeof b)return b.displayName||b.name||null;if("string"===typeof b)return b}return null}function Ua(a){switch(typeof a){case "boolean":case "number":case "string":case "undefined":return a;case "object":return a;default:return""}}function ig(a){var b=a.type;return(a=a.nodeName)&&"input"===a.toLowerCase()&&("checkbox"===b||"radio"===
b)}function hj(a){var b=ig(a)?"checked":"value",c=Object.getOwnPropertyDescriptor(a.constructor.prototype,b),d=""+a[b];if(!a.hasOwnProperty(b)&&"undefined"!==typeof c&&"function"===typeof c.get&&"function"===typeof c.set){var e=c.get,f=c.set;Object.defineProperty(a,b,{configurable:!0,get:function(){return e.call(this)},set:function(a){d=""+a;f.call(this,a)}});Object.defineProperty(a,b,{enumerable:c.enumerable});return{getValue:function(){return d},setValue:function(a){d=""+a},stopTracking:function(){a._valueTracker=
null;delete a[b]}}}}function Pc(a){a._valueTracker||(a._valueTracker=hj(a))}function jg(a){if(!a)return!1;var b=a._valueTracker;if(!b)return!0;var c=b.getValue();var d="";a&&(d=ig(a)?a.checked?"true":"false":a.value);a=d;return a!==c?(b.setValue(a),!0):!1}function Qc(a){a=a||("undefined"!==typeof document?document:void 0);if("undefined"===typeof a)return null;try{return a.activeElement||a.body}catch(b){return a.body}}function ke(a,b){var c=b.checked;return E({},b,{defaultChecked:void 0,defaultValue:void 0,
value:void 0,checked:null!=c?c:a._wrapperState.initialChecked})}function kg(a,b){var c=null==b.defaultValue?"":b.defaultValue,d=null!=b.checked?b.checked:b.defaultChecked;c=Ua(null!=b.value?b.value:c);a._wrapperState={initialChecked:d,initialValue:c,controlled:"checkbox"===b.type||"radio"===b.type?null!=b.checked:null!=b.value}}function lg(a,b){b=b.checked;null!=b&&$d(a,"checked",b,!1)}function le(a,b){lg(a,b);var c=Ua(b.value),d=b.type;if(null!=c)if("number"===d){if(0===c&&""===a.value||a.value!=
c)a.value=""+c}else a.value!==""+c&&(a.value=""+c);else if("submit"===d||"reset"===d){a.removeAttribute("value");return}b.hasOwnProperty("value")?me(a,b.type,c):b.hasOwnProperty("defaultValue")&&me(a,b.type,Ua(b.defaultValue));null==b.checked&&null!=b.defaultChecked&&(a.defaultChecked=!!b.defaultChecked)}function mg(a,b,c){if(b.hasOwnProperty("value")||b.hasOwnProperty("defaultValue")){var d=b.type;if(!("submit"!==d&&"reset"!==d||void 0!==b.value&&null!==b.value))return;b=""+a._wrapperState.initialValue;
c||b===a.value||(a.value=b);a.defaultValue=b}c=a.name;""!==c&&(a.name="");a.defaultChecked=!!a._wrapperState.initialChecked;""!==c&&(a.name=c)}function me(a,b,c){if("number"!==b||Qc(a.ownerDocument)!==a)null==c?a.defaultValue=""+a._wrapperState.initialValue:a.defaultValue!==""+c&&(a.defaultValue=""+c)}function Db(a,b,c,d){a=a.options;if(b){b={};for(var e=0;e<c.length;e++)b["$"+c[e]]=!0;for(c=0;c<a.length;c++)e=b.hasOwnProperty("$"+a[c].value),a[c].selected!==e&&(a[c].selected=e),e&&d&&(a[c].defaultSelected=
!0)}else{c=""+Ua(c);b=null;for(e=0;e<a.length;e++){if(a[e].value===c){a[e].selected=!0;d&&(a[e].defaultSelected=!0);return}null!==b||a[e].disabled||(b=a[e])}null!==b&&(b.selected=!0)}}function ne(a,b){if(null!=b.dangerouslySetInnerHTML)throw Error(m(91));return E({},b,{value:void 0,defaultValue:void 0,children:""+a._wrapperState.initialValue})}function ng(a,b){var c=b.value;if(null==c){c=b.children;b=b.defaultValue;if(null!=c){if(null!=b)throw Error(m(92));if(cc(c)){if(1<c.length)throw Error(m(93));
c=c[0]}b=c}null==b&&(b="");c=b}a._wrapperState={initialValue:Ua(c)}}function og(a,b){var c=Ua(b.value),d=Ua(b.defaultValue);null!=c&&(c=""+c,c!==a.value&&(a.value=c),null==b.defaultValue&&a.defaultValue!==c&&(a.defaultValue=c));null!=d&&(a.defaultValue=""+d)}function pg(a,b){b=a.textContent;b===a._wrapperState.initialValue&&""!==b&&null!==b&&(a.value=b)}function qg(a){switch(a){case "svg":return"http://www.w3.org/2000/svg";case "math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}
function oe(a,b){return null==a||"http://www.w3.org/1999/xhtml"===a?qg(b):"http://www.w3.org/2000/svg"===a&&"foreignObject"===b?"http://www.w3.org/1999/xhtml":a}function rg(a,b,c){return null==b||"boolean"===typeof b||""===b?"":c||"number"!==typeof b||0===b||dc.hasOwnProperty(a)&&dc[a]?(""+b).trim():b+"px"}function sg(a,b){a=a.style;for(var c in b)if(b.hasOwnProperty(c)){var d=0===c.indexOf("--"),e=rg(c,b[c],d);"float"===c&&(c="cssFloat");d?a.setProperty(c,e):a[c]=e}}function pe(a,b){if(b){if(ij[a]&&
(null!=b.children||null!=b.dangerouslySetInnerHTML))throw Error(m(137,a));if(null!=b.dangerouslySetInnerHTML){if(null!=b.children)throw Error(m(60));if("object"!==typeof b.dangerouslySetInnerHTML||!("__html"in b.dangerouslySetInnerHTML))throw Error(m(61));}if(null!=b.style&&"object"!==typeof b.style)throw Error(m(62));}}function qe(a,b){if(-1===a.indexOf("-"))return"string"===typeof b.is;switch(a){case "annotation-xml":case "color-profile":case "font-face":case "font-face-src":case "font-face-uri":case "font-face-format":case "font-face-name":case "missing-glyph":return!1;
default:return!0}}function re(a){a=a.target||a.srcElement||window;a.correspondingUseElement&&(a=a.correspondingUseElement);return 3===a.nodeType?a.parentNode:a}function tg(a){if(a=ec(a)){if("function"!==typeof se)throw Error(m(280));var b=a.stateNode;b&&(b=Rc(b),se(a.stateNode,a.type,b))}}function ug(a){Eb?Fb?Fb.push(a):Fb=[a]:Eb=a}function vg(){if(Eb){var a=Eb,b=Fb;Fb=Eb=null;tg(a);if(b)for(a=0;a<b.length;a++)tg(b[a])}}function wg(a,b,c){if(te)return a(b,c);te=!0;try{return xg(a,b,c)}finally{if(te=
!1,null!==Eb||null!==Fb)yg(),vg()}}function fc(a,b){var c=a.stateNode;if(null===c)return null;var d=Rc(c);if(null===d)return null;c=d[b];a:switch(b){case "onClick":case "onClickCapture":case "onDoubleClick":case "onDoubleClickCapture":case "onMouseDown":case "onMouseDownCapture":case "onMouseMove":case "onMouseMoveCapture":case "onMouseUp":case "onMouseUpCapture":case "onMouseEnter":(d=!d.disabled)||(a=a.type,d=!("button"===a||"input"===a||"select"===a||"textarea"===a));a=!d;break a;default:a=!1}if(a)return null;
if(c&&"function"!==typeof c)throw Error(m(231,b,typeof c));return c}function jj(a,b,c,d,e,f,g,h,k){gc=!1;Sc=null;kj.apply(lj,arguments)}function mj(a,b,c,d,e,f,g,h,k){jj.apply(this,arguments);if(gc){if(gc){var n=Sc;gc=!1;Sc=null}else throw Error(m(198));Tc||(Tc=!0,ue=n)}}function nb(a){var b=a,c=a;if(a.alternate)for(;b.return;)b=b.return;else{a=b;do b=a,0!==(b.flags&4098)&&(c=b.return),a=b.return;while(a)}return 3===b.tag?c:null}function zg(a){if(13===a.tag){var b=a.memoizedState;null===b&&(a=a.alternate,
null!==a&&(b=a.memoizedState));if(null!==b)return b.dehydrated}return null}function Ag(a){if(nb(a)!==a)throw Error(m(188));}function nj(a){var b=a.alternate;if(!b){b=nb(a);if(null===b)throw Error(m(188));return b!==a?null:a}for(var c=a,d=b;;){var e=c.return;if(null===e)break;var f=e.alternate;if(null===f){d=e.return;if(null!==d){c=d;continue}break}if(e.child===f.child){for(f=e.child;f;){if(f===c)return Ag(e),a;if(f===d)return Ag(e),b;f=f.sibling}throw Error(m(188));}if(c.return!==d.return)c=e,d=f;
else{for(var g=!1,h=e.child;h;){if(h===c){g=!0;c=e;d=f;break}if(h===d){g=!0;d=e;c=f;break}h=h.sibling}if(!g){for(h=f.child;h;){if(h===c){g=!0;c=f;d=e;break}if(h===d){g=!0;d=f;c=e;break}h=h.sibling}if(!g)throw Error(m(189));}}if(c.alternate!==d)throw Error(m(190));}if(3!==c.tag)throw Error(m(188));return c.stateNode.current===c?a:b}function Bg(a){a=nj(a);return null!==a?Cg(a):null}function Cg(a){if(5===a.tag||6===a.tag)return a;for(a=a.child;null!==a;){var b=Cg(a);if(null!==b)return b;a=a.sibling}return null}
function oj(a,b){if(Ca&&"function"===typeof Ca.onCommitFiberRoot)try{Ca.onCommitFiberRoot(Uc,a,void 0,128===(a.current.flags&128))}catch(c){}}function pj(a){a>>>=0;return 0===a?32:31-(qj(a)/rj|0)|0}function hc(a){switch(a&-a){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return a&
4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return a&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return a}}function Vc(a,b){var c=a.pendingLanes;if(0===c)return 0;var d=0,e=a.suspendedLanes,f=a.pingedLanes,g=c&268435455;if(0!==g){var h=g&~e;0!==h?d=hc(h):(f&=g,0!==f&&(d=hc(f)))}else g=c&~e,0!==g?d=hc(g):0!==f&&(d=hc(f));if(0===d)return 0;if(0!==b&&b!==d&&0===(b&e)&&
(e=d&-d,f=b&-b,e>=f||16===e&&0!==(f&4194240)))return b;0!==(d&4)&&(d|=c&16);b=a.entangledLanes;if(0!==b)for(a=a.entanglements,b&=d;0<b;)c=31-ta(b),e=1<<c,d|=a[c],b&=~e;return d}function sj(a,b){switch(a){case 1:case 2:case 4:return b+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return b+5E3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;
case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function tj(a,b){for(var c=a.suspendedLanes,d=a.pingedLanes,e=a.expirationTimes,f=a.pendingLanes;0<f;){var g=31-ta(f),h=1<<g,k=e[g];if(-1===k){if(0===(h&c)||0!==(h&d))e[g]=sj(h,b)}else k<=b&&(a.expiredLanes|=h);f&=~h}}function ve(a){a=a.pendingLanes&-1073741825;return 0!==a?a:a&1073741824?1073741824:0}function Dg(){var a=Wc;Wc<<=1;0===(Wc&4194240)&&(Wc=64);return a}function we(a){for(var b=[],c=0;31>c;c++)b.push(a);
return b}function ic(a,b,c){a.pendingLanes|=b;536870912!==b&&(a.suspendedLanes=0,a.pingedLanes=0);a=a.eventTimes;b=31-ta(b);a[b]=c}function uj(a,b){var c=a.pendingLanes&~b;a.pendingLanes=b;a.suspendedLanes=0;a.pingedLanes=0;a.expiredLanes&=b;a.mutableReadLanes&=b;a.entangledLanes&=b;b=a.entanglements;var d=a.eventTimes;for(a=a.expirationTimes;0<c;){var e=31-ta(c),f=1<<e;b[e]=0;d[e]=-1;a[e]=-1;c&=~f}}function xe(a,b){var c=a.entangledLanes|=b;for(a=a.entanglements;c;){var d=31-ta(c),e=1<<d;e&b|a[d]&
b&&(a[d]|=b);c&=~e}}function Eg(a){a&=-a;return 1<a?4<a?0!==(a&268435455)?16:536870912:4:1}function Fg(a,b){switch(a){case "focusin":case "focusout":Va=null;break;case "dragenter":case "dragleave":Wa=null;break;case "mouseover":case "mouseout":Xa=null;break;case "pointerover":case "pointerout":jc.delete(b.pointerId);break;case "gotpointercapture":case "lostpointercapture":kc.delete(b.pointerId)}}function lc(a,b,c,d,e,f){if(null===a||a.nativeEvent!==f)return a={blockedOn:b,domEventName:c,eventSystemFlags:d,
nativeEvent:f,targetContainers:[e]},null!==b&&(b=ec(b),null!==b&&Gg(b)),a;a.eventSystemFlags|=d;b=a.targetContainers;null!==e&&-1===b.indexOf(e)&&b.push(e);return a}function vj(a,b,c,d,e){switch(b){case "focusin":return Va=lc(Va,a,b,c,d,e),!0;case "dragenter":return Wa=lc(Wa,a,b,c,d,e),!0;case "mouseover":return Xa=lc(Xa,a,b,c,d,e),!0;case "pointerover":var f=e.pointerId;jc.set(f,lc(jc.get(f)||null,a,b,c,d,e));return!0;case "gotpointercapture":return f=e.pointerId,kc.set(f,lc(kc.get(f)||null,a,b,
c,d,e)),!0}return!1}function Hg(a){var b=ob(a.target);if(null!==b){var c=nb(b);if(null!==c)if(b=c.tag,13===b){if(b=zg(c),null!==b){a.blockedOn=b;wj(a.priority,function(){xj(c)});return}}else if(3===b&&c.stateNode.current.memoizedState.isDehydrated){a.blockedOn=3===c.tag?c.stateNode.containerInfo:null;return}}a.blockedOn=null}function Xc(a){if(null!==a.blockedOn)return!1;for(var b=a.targetContainers;0<b.length;){var c=ye(a.domEventName,a.eventSystemFlags,b[0],a.nativeEvent);if(null===c){c=a.nativeEvent;
var d=new c.constructor(c.type,c);ze=d;c.target.dispatchEvent(d);ze=null}else return b=ec(c),null!==b&&Gg(b),a.blockedOn=c,!1;b.shift()}return!0}function Ig(a,b,c){Xc(a)&&c.delete(b)}function yj(){Ae=!1;null!==Va&&Xc(Va)&&(Va=null);null!==Wa&&Xc(Wa)&&(Wa=null);null!==Xa&&Xc(Xa)&&(Xa=null);jc.forEach(Ig);kc.forEach(Ig)}function mc(a,b){a.blockedOn===b&&(a.blockedOn=null,Ae||(Ae=!0,Jg(Kg,yj)))}function nc(a){if(0<Yc.length){mc(Yc[0],a);for(var b=1;b<Yc.length;b++){var c=Yc[b];c.blockedOn===a&&(c.blockedOn=
null)}}null!==Va&&mc(Va,a);null!==Wa&&mc(Wa,a);null!==Xa&&mc(Xa,a);b=function(b){return mc(b,a)};jc.forEach(b);kc.forEach(b);for(b=0;b<Ya.length;b++)c=Ya[b],c.blockedOn===a&&(c.blockedOn=null);for(;0<Ya.length&&(b=Ya[0],null===b.blockedOn);)Hg(b),null===b.blockedOn&&Ya.shift()}function zj(a,b,c,d){var e=z,f=Gb.transition;Gb.transition=null;try{z=1,Be(a,b,c,d)}finally{z=e,Gb.transition=f}}function Aj(a,b,c,d){var e=z,f=Gb.transition;Gb.transition=null;try{z=4,Be(a,b,c,d)}finally{z=e,Gb.transition=
f}}function Be(a,b,c,d){if(Zc){var e=ye(a,b,c,d);if(null===e)Ce(a,b,d,$c,c),Fg(a,d);else if(vj(e,a,b,c,d))d.stopPropagation();else if(Fg(a,d),b&4&&-1<Bj.indexOf(a)){for(;null!==e;){var f=ec(e);null!==f&&Cj(f);f=ye(a,b,c,d);null===f&&Ce(a,b,d,$c,c);if(f===e)break;e=f}null!==e&&d.stopPropagation()}else Ce(a,b,d,null,c)}}function ye(a,b,c,d){$c=null;a=re(d);a=ob(a);if(null!==a)if(b=nb(a),null===b)a=null;else if(c=b.tag,13===c){a=zg(b);if(null!==a)return a;a=null}else if(3===c){if(b.stateNode.current.memoizedState.isDehydrated)return 3===
b.tag?b.stateNode.containerInfo:null;a=null}else b!==a&&(a=null);$c=a;return null}function Lg(a){switch(a){case "cancel":case "click":case "close":case "contextmenu":case "copy":case "cut":case "auxclick":case "dblclick":case "dragend":case "dragstart":case "drop":case "focusin":case "focusout":case "input":case "invalid":case "keydown":case "keypress":case "keyup":case "mousedown":case "mouseup":case "paste":case "pause":case "play":case "pointercancel":case "pointerdown":case "pointerup":case "ratechange":case "reset":case "resize":case "seeked":case "submit":case "touchcancel":case "touchend":case "touchstart":case "volumechange":case "change":case "selectionchange":case "textInput":case "compositionstart":case "compositionend":case "compositionupdate":case "beforeblur":case "afterblur":case "beforeinput":case "blur":case "fullscreenchange":case "focus":case "hashchange":case "popstate":case "select":case "selectstart":return 1;
case "drag":case "dragenter":case "dragexit":case "dragleave":case "dragover":case "mousemove":case "mouseout":case "mouseover":case "pointermove":case "pointerout":case "pointerover":case "scroll":case "toggle":case "touchmove":case "wheel":case "mouseenter":case "mouseleave":case "pointerenter":case "pointerleave":return 4;case "message":switch(Dj()){case De:return 1;case Mg:return 4;case ad:case Ej:return 16;case Ng:return 536870912;default:return 16}default:return 16}}function Og(){if(bd)return bd;
var a,b=Ee,c=b.length,d,e="value"in Za?Za.value:Za.textContent,f=e.length;for(a=0;a<c&&b[a]===e[a];a++);var g=c-a;for(d=1;d<=g&&b[c-d]===e[f-d];d++);return bd=e.slice(a,1<d?1-d:void 0)}function cd(a){var b=a.keyCode;"charCode"in a?(a=a.charCode,0===a&&13===b&&(a=13)):a=b;10===a&&(a=13);return 32<=a||13===a?a:0}function dd(){return!0}function Pg(){return!1}function ka(a){function b(b,d,e,f,g){this._reactName=b;this._targetInst=e;this.type=d;this.nativeEvent=f;this.target=g;this.currentTarget=null;
for(var c in a)a.hasOwnProperty(c)&&(b=a[c],this[c]=b?b(f):f[c]);this.isDefaultPrevented=(null!=f.defaultPrevented?f.defaultPrevented:!1===f.returnValue)?dd:Pg;this.isPropagationStopped=Pg;return this}E(b.prototype,{preventDefault:function(){this.defaultPrevented=!0;var a=this.nativeEvent;a&&(a.preventDefault?a.preventDefault():"unknown"!==typeof a.returnValue&&(a.returnValue=!1),this.isDefaultPrevented=dd)},stopPropagation:function(){var a=this.nativeEvent;a&&(a.stopPropagation?a.stopPropagation():
"unknown"!==typeof a.cancelBubble&&(a.cancelBubble=!0),this.isPropagationStopped=dd)},persist:function(){},isPersistent:dd});return b}function Fj(a){var b=this.nativeEvent;return b.getModifierState?b.getModifierState(a):(a=Gj[a])?!!b[a]:!1}function Fe(a){return Fj}function Qg(a,b){switch(a){case "keyup":return-1!==Hj.indexOf(b.keyCode);case "keydown":return 229!==b.keyCode;case "keypress":case "mousedown":case "focusout":return!0;default:return!1}}function Rg(a){a=a.detail;return"object"===typeof a&&
"data"in a?a.data:null}function Ij(a,b){switch(a){case "compositionend":return Rg(b);case "keypress":if(32!==b.which)return null;Sg=!0;return Tg;case "textInput":return a=b.data,a===Tg&&Sg?null:a;default:return null}}function Jj(a,b){if(Hb)return"compositionend"===a||!Ge&&Qg(a,b)?(a=Og(),bd=Ee=Za=null,Hb=!1,a):null;switch(a){case "paste":return null;case "keypress":if(!(b.ctrlKey||b.altKey||b.metaKey)||b.ctrlKey&&b.altKey){if(b.char&&1<b.char.length)return b.char;if(b.which)return String.fromCharCode(b.which)}return null;
case "compositionend":return Ug&&"ko"!==b.locale?null:b.data;default:return null}}function Vg(a){var b=a&&a.nodeName&&a.nodeName.toLowerCase();return"input"===b?!!Kj[a.type]:"textarea"===b?!0:!1}function Lj(a){if(!Ia)return!1;a="on"+a;var b=a in document;b||(b=document.createElement("div"),b.setAttribute(a,"return;"),b="function"===typeof b[a]);return b}function Wg(a,b,c,d){ug(d);b=ed(b,"onChange");0<b.length&&(c=new He("onChange","change",null,c,d),a.push({event:c,listeners:b}))}function Mj(a){Xg(a,
0)}function fd(a){var b=Ib(a);if(jg(b))return a}function Nj(a,b){if("change"===a)return b}function Yg(){oc&&(oc.detachEvent("onpropertychange",Zg),pc=oc=null)}function Zg(a){if("value"===a.propertyName&&fd(pc)){var b=[];Wg(b,pc,a,re(a));wg(Mj,b)}}function Oj(a,b,c){"focusin"===a?(Yg(),oc=b,pc=c,oc.attachEvent("onpropertychange",Zg)):"focusout"===a&&Yg()}function Pj(a,b){if("selectionchange"===a||"keyup"===a||"keydown"===a)return fd(pc)}function Qj(a,b){if("click"===a)return fd(b)}function Rj(a,b){if("input"===
a||"change"===a)return fd(b)}function Sj(a,b){return a===b&&(0!==a||1/a===1/b)||a!==a&&b!==b}function qc(a,b){if(ua(a,b))return!0;if("object"!==typeof a||null===a||"object"!==typeof b||null===b)return!1;var c=Object.keys(a),d=Object.keys(b);if(c.length!==d.length)return!1;for(d=0;d<c.length;d++){var e=c[d];if(!Zd.call(b,e)||!ua(a[e],b[e]))return!1}return!0}function $g(a){for(;a&&a.firstChild;)a=a.firstChild;return a}function ah(a,b){var c=$g(a);a=0;for(var d;c;){if(3===c.nodeType){d=a+c.textContent.length;
if(a<=b&&d>=b)return{node:c,offset:b-a};a=d}a:{for(;c;){if(c.nextSibling){c=c.nextSibling;break a}c=c.parentNode}c=void 0}c=$g(c)}}function bh(a,b){return a&&b?a===b?!0:a&&3===a.nodeType?!1:b&&3===b.nodeType?bh(a,b.parentNode):"contains"in a?a.contains(b):a.compareDocumentPosition?!!(a.compareDocumentPosition(b)&16):!1:!1}function ch(){for(var a=window,b=Qc();b instanceof a.HTMLIFrameElement;){try{var c="string"===typeof b.contentWindow.location.href}catch(d){c=!1}if(c)a=b.contentWindow;else break;
b=Qc(a.document)}return b}function Ie(a){var b=a&&a.nodeName&&a.nodeName.toLowerCase();return b&&("input"===b&&("text"===a.type||"search"===a.type||"tel"===a.type||"url"===a.type||"password"===a.type)||"textarea"===b||"true"===a.contentEditable)}function Tj(a){var b=ch(),c=a.focusedElem,d=a.selectionRange;if(b!==c&&c&&c.ownerDocument&&bh(c.ownerDocument.documentElement,c)){if(null!==d&&Ie(c))if(b=d.start,a=d.end,void 0===a&&(a=b),"selectionStart"in c)c.selectionStart=b,c.selectionEnd=Math.min(a,c.value.length);
else if(a=(b=c.ownerDocument||document)&&b.defaultView||window,a.getSelection){a=a.getSelection();var e=c.textContent.length,f=Math.min(d.start,e);d=void 0===d.end?f:Math.min(d.end,e);!a.extend&&f>d&&(e=d,d=f,f=e);e=ah(c,f);var g=ah(c,d);e&&g&&(1!==a.rangeCount||a.anchorNode!==e.node||a.anchorOffset!==e.offset||a.focusNode!==g.node||a.focusOffset!==g.offset)&&(b=b.createRange(),b.setStart(e.node,e.offset),a.removeAllRanges(),f>d?(a.addRange(b),a.extend(g.node,g.offset)):(b.setEnd(g.node,g.offset),
a.addRange(b)))}b=[];for(a=c;a=a.parentNode;)1===a.nodeType&&b.push({element:a,left:a.scrollLeft,top:a.scrollTop});"function"===typeof c.focus&&c.focus();for(c=0;c<b.length;c++)a=b[c],a.element.scrollLeft=a.left,a.element.scrollTop=a.top}}function dh(a,b,c){var d=c.window===c?c.document:9===c.nodeType?c:c.ownerDocument;Je||null==Jb||Jb!==Qc(d)||(d=Jb,"selectionStart"in d&&Ie(d)?d={start:d.selectionStart,end:d.selectionEnd}:(d=(d.ownerDocument&&d.ownerDocument.defaultView||window).getSelection(),d=
{anchorNode:d.anchorNode,anchorOffset:d.anchorOffset,focusNode:d.focusNode,focusOffset:d.focusOffset}),rc&&qc(rc,d)||(rc=d,d=ed(Ke,"onSelect"),0<d.length&&(b=new He("onSelect","select",null,b,c),a.push({event:b,listeners:d}),b.target=Jb)))}function gd(a,b){var c={};c[a.toLowerCase()]=b.toLowerCase();c["Webkit"+a]="webkit"+b;c["Moz"+a]="moz"+b;return c}function hd(a){if(Le[a])return Le[a];if(!Kb[a])return a;var b=Kb[a],c;for(c in b)if(b.hasOwnProperty(c)&&c in eh)return Le[a]=b[c];return a}function $a(a,
b){fh.set(a,b);mb(b,[a])}function gh(a,b,c){var d=a.type||"unknown-event";a.currentTarget=c;mj(d,b,void 0,a);a.currentTarget=null}function Xg(a,b){b=0!==(b&4);for(var c=0;c<a.length;c++){var d=a[c],e=d.event;d=d.listeners;a:{var f=void 0;if(b)for(var g=d.length-1;0<=g;g--){var h=d[g],k=h.instance,n=h.currentTarget;h=h.listener;if(k!==f&&e.isPropagationStopped())break a;gh(e,h,n);f=k}else for(g=0;g<d.length;g++){h=d[g];k=h.instance;n=h.currentTarget;h=h.listener;if(k!==f&&e.isPropagationStopped())break a;
gh(e,h,n);f=k}}}if(Tc)throw a=ue,Tc=!1,ue=null,a;}function B(a,b){var c=b[Me];void 0===c&&(c=b[Me]=new Set);var d=a+"__bubble";c.has(d)||(hh(b,a,2,!1),c.add(d))}function Ne(a,b,c){var d=0;b&&(d|=4);hh(c,a,d,b)}function sc(a){if(!a[id]){a[id]=!0;cg.forEach(function(b){"selectionchange"!==b&&(Uj.has(b)||Ne(b,!1,a),Ne(b,!0,a))});var b=9===a.nodeType?a:a.ownerDocument;null===b||b[id]||(b[id]=!0,Ne("selectionchange",!1,b))}}function hh(a,b,c,d,e){switch(Lg(b)){case 1:e=zj;break;case 4:e=Aj;break;default:e=
Be}c=e.bind(null,b,c,a);e=void 0;!Oe||"touchstart"!==b&&"touchmove"!==b&&"wheel"!==b||(e=!0);d?void 0!==e?a.addEventListener(b,c,{capture:!0,passive:e}):a.addEventListener(b,c,!0):void 0!==e?a.addEventListener(b,c,{passive:e}):a.addEventListener(b,c,!1)}function Ce(a,b,c,d,e){var f=d;if(0===(b&1)&&0===(b&2)&&null!==d)a:for(;;){if(null===d)return;var g=d.tag;if(3===g||4===g){var h=d.stateNode.containerInfo;if(h===e||8===h.nodeType&&h.parentNode===e)break;if(4===g)for(g=d.return;null!==g;){var k=g.tag;
if(3===k||4===k)if(k=g.stateNode.containerInfo,k===e||8===k.nodeType&&k.parentNode===e)return;g=g.return}for(;null!==h;){g=ob(h);if(null===g)return;k=g.tag;if(5===k||6===k){d=f=g;continue a}h=h.parentNode}}d=d.return}wg(function(){var d=f,e=re(c),g=[];a:{var h=fh.get(a);if(void 0!==h){var k=He,m=a;switch(a){case "keypress":if(0===cd(c))break a;case "keydown":case "keyup":k=Vj;break;case "focusin":m="focus";k=Pe;break;case "focusout":m="blur";k=Pe;break;case "beforeblur":case "afterblur":k=Pe;break;
case "click":if(2===c.button)break a;case "auxclick":case "dblclick":case "mousedown":case "mousemove":case "mouseup":case "mouseout":case "mouseover":case "contextmenu":k=ih;break;case "drag":case "dragend":case "dragenter":case "dragexit":case "dragleave":case "dragover":case "dragstart":case "drop":k=Wj;break;case "touchcancel":case "touchend":case "touchmove":case "touchstart":k=Xj;break;case jh:case kh:case lh:k=Yj;break;case mh:k=Zj;break;case "scroll":k=ak;break;case "wheel":k=bk;break;case "copy":case "cut":case "paste":k=
ck;break;case "gotpointercapture":case "lostpointercapture":case "pointercancel":case "pointerdown":case "pointermove":case "pointerout":case "pointerover":case "pointerup":k=nh}var l=0!==(b&4),p=!l&&"scroll"===a,w=l?null!==h?h+"Capture":null:h;l=[];for(var A=d,t;null!==A;){t=A;var M=t.stateNode;5===t.tag&&null!==M&&(t=M,null!==w&&(M=fc(A,w),null!=M&&l.push(tc(A,M,t))));if(p)break;A=A.return}0<l.length&&(h=new k(h,m,null,c,e),g.push({event:h,listeners:l}))}}if(0===(b&7)){a:{h="mouseover"===a||"pointerover"===
a;k="mouseout"===a||"pointerout"===a;if(h&&c!==ze&&(m=c.relatedTarget||c.fromElement)&&(ob(m)||m[Ja]))break a;if(k||h){h=e.window===e?e:(h=e.ownerDocument)?h.defaultView||h.parentWindow:window;if(k){if(m=c.relatedTarget||c.toElement,k=d,m=m?ob(m):null,null!==m&&(p=nb(m),m!==p||5!==m.tag&&6!==m.tag))m=null}else k=null,m=d;if(k!==m){l=ih;M="onMouseLeave";w="onMouseEnter";A="mouse";if("pointerout"===a||"pointerover"===a)l=nh,M="onPointerLeave",w="onPointerEnter",A="pointer";p=null==k?h:Ib(k);t=null==
m?h:Ib(m);h=new l(M,A+"leave",k,c,e);h.target=p;h.relatedTarget=t;M=null;ob(e)===d&&(l=new l(w,A+"enter",m,c,e),l.target=t,l.relatedTarget=p,M=l);p=M;if(k&&m)b:{l=k;w=m;A=0;for(t=l;t;t=Lb(t))A++;t=0;for(M=w;M;M=Lb(M))t++;for(;0<A-t;)l=Lb(l),A--;for(;0<t-A;)w=Lb(w),t--;for(;A--;){if(l===w||null!==w&&l===w.alternate)break b;l=Lb(l);w=Lb(w)}l=null}else l=null;null!==k&&oh(g,h,k,l,!1);null!==m&&null!==p&&oh(g,p,m,l,!0)}}}a:{h=d?Ib(d):window;k=h.nodeName&&h.nodeName.toLowerCase();if("select"===k||"input"===
k&&"file"===h.type)var ma=Nj;else if(Vg(h))if(ph)ma=Rj;else{ma=Pj;var va=Oj}else(k=h.nodeName)&&"input"===k.toLowerCase()&&("checkbox"===h.type||"radio"===h.type)&&(ma=Qj);if(ma&&(ma=ma(a,d))){Wg(g,ma,c,e);break a}va&&va(a,h,d);"focusout"===a&&(va=h._wrapperState)&&va.controlled&&"number"===h.type&&me(h,"number",h.value)}va=d?Ib(d):window;switch(a){case "focusin":if(Vg(va)||"true"===va.contentEditable)Jb=va,Ke=d,rc=null;break;case "focusout":rc=Ke=Jb=null;break;case "mousedown":Je=!0;break;case "contextmenu":case "mouseup":case "dragend":Je=
!1;dh(g,c,e);break;case "selectionchange":if(dk)break;case "keydown":case "keyup":dh(g,c,e)}var ab;if(Ge)b:{switch(a){case "compositionstart":var da="onCompositionStart";break b;case "compositionend":da="onCompositionEnd";break b;case "compositionupdate":da="onCompositionUpdate";break b}da=void 0}else Hb?Qg(a,c)&&(da="onCompositionEnd"):"keydown"===a&&229===c.keyCode&&(da="onCompositionStart");da&&(Ug&&"ko"!==c.locale&&(Hb||"onCompositionStart"!==da?"onCompositionEnd"===da&&Hb&&(ab=Og()):(Za=e,Ee=
"value"in Za?Za.value:Za.textContent,Hb=!0)),va=ed(d,da),0<va.length&&(da=new qh(da,a,null,c,e),g.push({event:da,listeners:va}),ab?da.data=ab:(ab=Rg(c),null!==ab&&(da.data=ab))));if(ab=ek?Ij(a,c):Jj(a,c))d=ed(d,"onBeforeInput"),0<d.length&&(e=new fk("onBeforeInput","beforeinput",null,c,e),g.push({event:e,listeners:d}),e.data=ab)}Xg(g,b)})}function tc(a,b,c){return{instance:a,listener:b,currentTarget:c}}function ed(a,b){for(var c=b+"Capture",d=[];null!==a;){var e=a,f=e.stateNode;5===e.tag&&null!==
f&&(e=f,f=fc(a,c),null!=f&&d.unshift(tc(a,f,e)),f=fc(a,b),null!=f&&d.push(tc(a,f,e)));a=a.return}return d}function Lb(a){if(null===a)return null;do a=a.return;while(a&&5!==a.tag);return a?a:null}function oh(a,b,c,d,e){for(var f=b._reactName,g=[];null!==c&&c!==d;){var h=c,k=h.alternate,n=h.stateNode;if(null!==k&&k===d)break;5===h.tag&&null!==n&&(h=n,e?(k=fc(c,f),null!=k&&g.unshift(tc(c,k,h))):e||(k=fc(c,f),null!=k&&g.push(tc(c,k,h))));c=c.return}0!==g.length&&a.push({event:b,listeners:g})}function rh(a){return("string"===
typeof a?a:""+a).replace(gk,"\n").replace(hk,"")}function jd(a,b,c,d){b=rh(b);if(rh(a)!==b&&c)throw Error(m(425));}function kd(){}function Qe(a,b){return"textarea"===a||"noscript"===a||"string"===typeof b.children||"number"===typeof b.children||"object"===typeof b.dangerouslySetInnerHTML&&null!==b.dangerouslySetInnerHTML&&null!=b.dangerouslySetInnerHTML.__html}function ik(a){setTimeout(function(){throw a;})}function Re(a,b){var c=b,d=0;do{var e=c.nextSibling;a.removeChild(c);if(e&&8===e.nodeType)if(c=
e.data,"/$"===c){if(0===d){a.removeChild(e);nc(b);return}d--}else"$"!==c&&"$?"!==c&&"$!"!==c||d++;c=e}while(c);nc(b)}function Ka(a){for(;null!=a;a=a.nextSibling){var b=a.nodeType;if(1===b||3===b)break;if(8===b){b=a.data;if("$"===b||"$!"===b||"$?"===b)break;if("/$"===b)return null}}return a}function sh(a){a=a.previousSibling;for(var b=0;a;){if(8===a.nodeType){var c=a.data;if("$"===c||"$!"===c||"$?"===c){if(0===b)return a;b--}else"/$"===c&&b++}a=a.previousSibling}return null}function ob(a){var b=a[Da];
if(b)return b;for(var c=a.parentNode;c;){if(b=c[Ja]||c[Da]){c=b.alternate;if(null!==b.child||null!==c&&null!==c.child)for(a=sh(a);null!==a;){if(c=a[Da])return c;a=sh(a)}return b}a=c;c=a.parentNode}return null}function ec(a){a=a[Da]||a[Ja];return!a||5!==a.tag&&6!==a.tag&&13!==a.tag&&3!==a.tag?null:a}function Ib(a){if(5===a.tag||6===a.tag)return a.stateNode;throw Error(m(33));}function Rc(a){return a[uc]||null}function bb(a){return{current:a}}function v(a,b){0>Mb||(a.current=Se[Mb],Se[Mb]=null,Mb--)}
function y(a,b,c){Mb++;Se[Mb]=a.current;a.current=b}function Nb(a,b){var c=a.type.contextTypes;if(!c)return cb;var d=a.stateNode;if(d&&d.__reactInternalMemoizedUnmaskedChildContext===b)return d.__reactInternalMemoizedMaskedChildContext;var e={},f;for(f in c)e[f]=b[f];d&&(a=a.stateNode,a.__reactInternalMemoizedUnmaskedChildContext=b,a.__reactInternalMemoizedMaskedChildContext=e);return e}function ea(a){a=a.childContextTypes;return null!==a&&void 0!==a}function th(a,b,c){if(J.current!==cb)throw Error(m(168));
y(J,b);y(S,c)}function uh(a,b,c){var d=a.stateNode;b=b.childContextTypes;if("function"!==typeof d.getChildContext)return c;d=d.getChildContext();for(var e in d)if(!(e in b))throw Error(m(108,gj(a)||"Unknown",e));return E({},c,d)}function ld(a){a=(a=a.stateNode)&&a.__reactInternalMemoizedMergedChildContext||cb;pb=J.current;y(J,a);y(S,S.current);return!0}function vh(a,b,c){var d=a.stateNode;if(!d)throw Error(m(169));c?(a=uh(a,b,pb),d.__reactInternalMemoizedMergedChildContext=a,v(S),v(J),y(J,a)):v(S);
y(S,c)}function wh(a){null===La?La=[a]:La.push(a)}function jk(a){md=!0;wh(a)}function db(){if(!Te&&null!==La){Te=!0;var a=0,b=z;try{var c=La;for(z=1;a<c.length;a++){var d=c[a];do d=d(!0);while(null!==d)}La=null;md=!1}catch(e){throw null!==La&&(La=La.slice(a+1)),xh(De,db),e;}finally{z=b,Te=!1}}return null}function qb(a,b){Ob[Pb++]=nd;Ob[Pb++]=od;od=a;nd=b}function yh(a,b,c){na[oa++]=Ma;na[oa++]=Na;na[oa++]=rb;rb=a;var d=Ma;a=Na;var e=32-ta(d)-1;d&=~(1<<e);c+=1;var f=32-ta(b)+e;if(30<f){var g=e-e%5;
f=(d&(1<<g)-1).toString(32);d>>=g;e-=g;Ma=1<<32-ta(b)+e|c<<e|d;Na=f+a}else Ma=1<<f|c<<e|d,Na=a}function Ue(a){null!==a.return&&(qb(a,1),yh(a,1,0))}function Ve(a){for(;a===od;)od=Ob[--Pb],Ob[Pb]=null,nd=Ob[--Pb],Ob[Pb]=null;for(;a===rb;)rb=na[--oa],na[oa]=null,Na=na[--oa],na[oa]=null,Ma=na[--oa],na[oa]=null}function zh(a,b){var c=pa(5,null,null,0);c.elementType="DELETED";c.stateNode=b;c.return=a;b=a.deletions;null===b?(a.deletions=[c],a.flags|=16):b.push(c)}function Ah(a,b){switch(a.tag){case 5:var c=
a.type;b=1!==b.nodeType||c.toLowerCase()!==b.nodeName.toLowerCase()?null:b;return null!==b?(a.stateNode=b,la=a,fa=Ka(b.firstChild),!0):!1;case 6:return b=""===a.pendingProps||3!==b.nodeType?null:b,null!==b?(a.stateNode=b,la=a,fa=null,!0):!1;case 13:return b=8!==b.nodeType?null:b,null!==b?(c=null!==rb?{id:Ma,overflow:Na}:null,a.memoizedState={dehydrated:b,treeContext:c,retryLane:1073741824},c=pa(18,null,null,0),c.stateNode=b,c.return=a,a.child=c,la=a,fa=null,!0):!1;default:return!1}}function We(a){return 0!==
(a.mode&1)&&0===(a.flags&128)}function Xe(a){if(D){var b=fa;if(b){var c=b;if(!Ah(a,b)){if(We(a))throw Error(m(418));b=Ka(c.nextSibling);var d=la;b&&Ah(a,b)?zh(d,c):(a.flags=a.flags&-4097|2,D=!1,la=a)}}else{if(We(a))throw Error(m(418));a.flags=a.flags&-4097|2;D=!1;la=a}}}function Bh(a){for(a=a.return;null!==a&&5!==a.tag&&3!==a.tag&&13!==a.tag;)a=a.return;la=a}function pd(a){if(a!==la)return!1;if(!D)return Bh(a),D=!0,!1;var b;(b=3!==a.tag)&&!(b=5!==a.tag)&&(b=a.type,b="head"!==b&&"body"!==b&&!Qe(a.type,
a.memoizedProps));if(b&&(b=fa)){if(We(a)){for(a=fa;a;)a=Ka(a.nextSibling);throw Error(m(418));}for(;b;)zh(a,b),b=Ka(b.nextSibling)}Bh(a);if(13===a.tag){a=a.memoizedState;a=null!==a?a.dehydrated:null;if(!a)throw Error(m(317));a:{a=a.nextSibling;for(b=0;a;){if(8===a.nodeType){var c=a.data;if("/$"===c){if(0===b){fa=Ka(a.nextSibling);break a}b--}else"$"!==c&&"$!"!==c&&"$?"!==c||b++}a=a.nextSibling}fa=null}}else fa=la?Ka(a.stateNode.nextSibling):null;return!0}function Qb(){fa=la=null;D=!1}function Ye(a){null===
wa?wa=[a]:wa.push(a)}function vc(a,b,c){a=c.ref;if(null!==a&&"function"!==typeof a&&"object"!==typeof a){if(c._owner){c=c._owner;if(c){if(1!==c.tag)throw Error(m(309));var d=c.stateNode}if(!d)throw Error(m(147,a));var e=d,f=""+a;if(null!==b&&null!==b.ref&&"function"===typeof b.ref&&b.ref._stringRef===f)return b.ref;b=function(a){var b=e.refs;null===a?delete b[f]:b[f]=a};b._stringRef=f;return b}if("string"!==typeof a)throw Error(m(284));if(!c._owner)throw Error(m(290,a));}return a}function qd(a,b){a=
Object.prototype.toString.call(b);throw Error(m(31,"[object Object]"===a?"object with keys {"+Object.keys(b).join(", ")+"}":a));}function Ch(a){var b=a._init;return b(a._payload)}function Dh(a){function b(b,c){if(a){var d=b.deletions;null===d?(b.deletions=[c],b.flags|=16):d.push(c)}}function c(c,d){if(!a)return null;for(;null!==d;)b(c,d),d=d.sibling;return null}function d(a,b){for(a=new Map;null!==b;)null!==b.key?a.set(b.key,b):a.set(b.index,b),b=b.sibling;return a}function e(a,b){a=eb(a,b);a.index=
0;a.sibling=null;return a}function f(b,c,d){b.index=d;if(!a)return b.flags|=1048576,c;d=b.alternate;if(null!==d)return d=d.index,d<c?(b.flags|=2,c):d;b.flags|=2;return c}function g(b){a&&null===b.alternate&&(b.flags|=2);return b}function h(a,b,c,d){if(null===b||6!==b.tag)return b=Ze(c,a.mode,d),b.return=a,b;b=e(b,c);b.return=a;return b}function k(a,b,c,d){var f=c.type;if(f===Bb)return l(a,b,c.props.children,d,c.key);if(null!==b&&(b.elementType===f||"object"===typeof f&&null!==f&&f.$$typeof===Ta&&
Ch(f)===b.type))return d=e(b,c.props),d.ref=vc(a,b,c),d.return=a,d;d=rd(c.type,c.key,c.props,null,a.mode,d);d.ref=vc(a,b,c);d.return=a;return d}function n(a,b,c,d){if(null===b||4!==b.tag||b.stateNode.containerInfo!==c.containerInfo||b.stateNode.implementation!==c.implementation)return b=$e(c,a.mode,d),b.return=a,b;b=e(b,c.children||[]);b.return=a;return b}function l(a,b,c,d,f){if(null===b||7!==b.tag)return b=sb(c,a.mode,d,f),b.return=a,b;b=e(b,c);b.return=a;return b}function u(a,b,c){if("string"===
typeof b&&""!==b||"number"===typeof b)return b=Ze(""+b,a.mode,c),b.return=a,b;if("object"===typeof b&&null!==b){switch(b.$$typeof){case sd:return c=rd(b.type,b.key,b.props,null,a.mode,c),c.ref=vc(a,null,b),c.return=a,c;case Cb:return b=$e(b,a.mode,c),b.return=a,b;case Ta:var d=b._init;return u(a,d(b._payload),c)}if(cc(b)||ac(b))return b=sb(b,a.mode,c,null),b.return=a,b;qd(a,b)}return null}function r(a,b,c,d){var e=null!==b?b.key:null;if("string"===typeof c&&""!==c||"number"===typeof c)return null!==
e?null:h(a,b,""+c,d);if("object"===typeof c&&null!==c){switch(c.$$typeof){case sd:return c.key===e?k(a,b,c,d):null;case Cb:return c.key===e?n(a,b,c,d):null;case Ta:return e=c._init,r(a,b,e(c._payload),d)}if(cc(c)||ac(c))return null!==e?null:l(a,b,c,d,null);qd(a,c)}return null}function p(a,b,c,d,e){if("string"===typeof d&&""!==d||"number"===typeof d)return a=a.get(c)||null,h(b,a,""+d,e);if("object"===typeof d&&null!==d){switch(d.$$typeof){case sd:return a=a.get(null===d.key?c:d.key)||null,k(b,a,d,
e);case Cb:return a=a.get(null===d.key?c:d.key)||null,n(b,a,d,e);case Ta:var f=d._init;return p(a,b,c,f(d._payload),e)}if(cc(d)||ac(d))return a=a.get(c)||null,l(b,a,d,e,null);qd(b,d)}return null}function x(e,g,h,k){for(var n=null,m=null,l=g,t=g=0,q=null;null!==l&&t<h.length;t++){l.index>t?(q=l,l=null):q=l.sibling;var A=r(e,l,h[t],k);if(null===A){null===l&&(l=q);break}a&&l&&null===A.alternate&&b(e,l);g=f(A,g,t);null===m?n=A:m.sibling=A;m=A;l=q}if(t===h.length)return c(e,l),D&&qb(e,t),n;if(null===l){for(;t<
h.length;t++)l=u(e,h[t],k),null!==l&&(g=f(l,g,t),null===m?n=l:m.sibling=l,m=l);D&&qb(e,t);return n}for(l=d(e,l);t<h.length;t++)q=p(l,e,t,h[t],k),null!==q&&(a&&null!==q.alternate&&l.delete(null===q.key?t:q.key),g=f(q,g,t),null===m?n=q:m.sibling=q,m=q);a&&l.forEach(function(a){return b(e,a)});D&&qb(e,t);return n}function I(e,g,h,k){var n=ac(h);if("function"!==typeof n)throw Error(m(150));h=n.call(h);if(null==h)throw Error(m(151));for(var l=n=null,q=g,t=g=0,A=null,w=h.next();null!==q&&!w.done;t++,w=
h.next()){q.index>t?(A=q,q=null):A=q.sibling;var x=r(e,q,w.value,k);if(null===x){null===q&&(q=A);break}a&&q&&null===x.alternate&&b(e,q);g=f(x,g,t);null===l?n=x:l.sibling=x;l=x;q=A}if(w.done)return c(e,q),D&&qb(e,t),n;if(null===q){for(;!w.done;t++,w=h.next())w=u(e,w.value,k),null!==w&&(g=f(w,g,t),null===l?n=w:l.sibling=w,l=w);D&&qb(e,t);return n}for(q=d(e,q);!w.done;t++,w=h.next())w=p(q,e,t,w.value,k),null!==w&&(a&&null!==w.alternate&&q.delete(null===w.key?t:w.key),g=f(w,g,t),null===l?n=w:l.sibling=
w,l=w);a&&q.forEach(function(a){return b(e,a)});D&&qb(e,t);return n}function v(a,d,f,h){"object"===typeof f&&null!==f&&f.type===Bb&&null===f.key&&(f=f.props.children);if("object"===typeof f&&null!==f){switch(f.$$typeof){case sd:a:{for(var k=f.key,n=d;null!==n;){if(n.key===k){k=f.type;if(k===Bb){if(7===n.tag){c(a,n.sibling);d=e(n,f.props.children);d.return=a;a=d;break a}}else if(n.elementType===k||"object"===typeof k&&null!==k&&k.$$typeof===Ta&&Ch(k)===n.type){c(a,n.sibling);d=e(n,f.props);d.ref=vc(a,
n,f);d.return=a;a=d;break a}c(a,n);break}else b(a,n);n=n.sibling}f.type===Bb?(d=sb(f.props.children,a.mode,h,f.key),d.return=a,a=d):(h=rd(f.type,f.key,f.props,null,a.mode,h),h.ref=vc(a,d,f),h.return=a,a=h)}return g(a);case Cb:a:{for(n=f.key;null!==d;){if(d.key===n)if(4===d.tag&&d.stateNode.containerInfo===f.containerInfo&&d.stateNode.implementation===f.implementation){c(a,d.sibling);d=e(d,f.children||[]);d.return=a;a=d;break a}else{c(a,d);break}else b(a,d);d=d.sibling}d=$e(f,a.mode,h);d.return=a;
a=d}return g(a);case Ta:return n=f._init,v(a,d,n(f._payload),h)}if(cc(f))return x(a,d,f,h);if(ac(f))return I(a,d,f,h);qd(a,f)}return"string"===typeof f&&""!==f||"number"===typeof f?(f=""+f,null!==d&&6===d.tag?(c(a,d.sibling),d=e(d,f),d.return=a,a=d):(c(a,d),d=Ze(f,a.mode,h),d.return=a,a=d),g(a)):c(a,d)}return v}function af(){bf=Rb=td=null}function cf(a,b){b=ud.current;v(ud);a._currentValue=b}function df(a,b,c){for(;null!==a;){var d=a.alternate;(a.childLanes&b)!==b?(a.childLanes|=b,null!==d&&(d.childLanes|=
b)):null!==d&&(d.childLanes&b)!==b&&(d.childLanes|=b);if(a===c)break;a=a.return}}function Sb(a,b){td=a;bf=Rb=null;a=a.dependencies;null!==a&&null!==a.firstContext&&(0!==(a.lanes&b)&&(ha=!0),a.firstContext=null)}function qa(a){var b=a._currentValue;if(bf!==a)if(a={context:a,memoizedValue:b,next:null},null===Rb){if(null===td)throw Error(m(308));Rb=a;td.dependencies={lanes:0,firstContext:a}}else Rb=Rb.next=a;return b}function ef(a){null===tb?tb=[a]:tb.push(a)}function Eh(a,b,c,d){var e=b.interleaved;
null===e?(c.next=c,ef(b)):(c.next=e.next,e.next=c);b.interleaved=c;return Oa(a,d)}function Oa(a,b){a.lanes|=b;var c=a.alternate;null!==c&&(c.lanes|=b);c=a;for(a=a.return;null!==a;)a.childLanes|=b,c=a.alternate,null!==c&&(c.childLanes|=b),c=a,a=a.return;return 3===c.tag?c.stateNode:null}function ff(a){a.updateQueue={baseState:a.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function Fh(a,b){a=a.updateQueue;b.updateQueue===a&&(b.updateQueue=
{baseState:a.baseState,firstBaseUpdate:a.firstBaseUpdate,lastBaseUpdate:a.lastBaseUpdate,shared:a.shared,effects:a.effects})}function Pa(a,b){return{eventTime:a,lane:b,tag:0,payload:null,callback:null,next:null}}function fb(a,b,c){var d=a.updateQueue;if(null===d)return null;d=d.shared;if(0!==(p&2)){var e=d.pending;null===e?b.next=b:(b.next=e.next,e.next=b);d.pending=b;return kk(a,c)}e=d.interleaved;null===e?(b.next=b,ef(d)):(b.next=e.next,e.next=b);d.interleaved=b;return Oa(a,c)}function vd(a,b,c){b=
b.updateQueue;if(null!==b&&(b=b.shared,0!==(c&4194240))){var d=b.lanes;d&=a.pendingLanes;c|=d;b.lanes=c;xe(a,c)}}function Gh(a,b){var c=a.updateQueue,d=a.alternate;if(null!==d&&(d=d.updateQueue,c===d)){var e=null,f=null;c=c.firstBaseUpdate;if(null!==c){do{var g={eventTime:c.eventTime,lane:c.lane,tag:c.tag,payload:c.payload,callback:c.callback,next:null};null===f?e=f=g:f=f.next=g;c=c.next}while(null!==c);null===f?e=f=b:f=f.next=b}else e=f=b;c={baseState:d.baseState,firstBaseUpdate:e,lastBaseUpdate:f,
shared:d.shared,effects:d.effects};a.updateQueue=c;return}a=c.lastBaseUpdate;null===a?c.firstBaseUpdate=b:a.next=b;c.lastBaseUpdate=b}function wd(a,b,c,d){var e=a.updateQueue;gb=!1;var f=e.firstBaseUpdate,g=e.lastBaseUpdate,h=e.shared.pending;if(null!==h){e.shared.pending=null;var k=h,n=k.next;k.next=null;null===g?f=n:g.next=n;g=k;var l=a.alternate;null!==l&&(l=l.updateQueue,h=l.lastBaseUpdate,h!==g&&(null===h?l.firstBaseUpdate=n:h.next=n,l.lastBaseUpdate=k))}if(null!==f){var m=e.baseState;g=0;l=
n=k=null;h=f;do{var r=h.lane,p=h.eventTime;if((d&r)===r){null!==l&&(l=l.next={eventTime:p,lane:0,tag:h.tag,payload:h.payload,callback:h.callback,next:null});a:{var x=a,v=h;r=b;p=c;switch(v.tag){case 1:x=v.payload;if("function"===typeof x){m=x.call(p,m,r);break a}m=x;break a;case 3:x.flags=x.flags&-65537|128;case 0:x=v.payload;r="function"===typeof x?x.call(p,m,r):x;if(null===r||void 0===r)break a;m=E({},m,r);break a;case 2:gb=!0}}null!==h.callback&&0!==h.lane&&(a.flags|=64,r=e.effects,null===r?e.effects=
[h]:r.push(h))}else p={eventTime:p,lane:r,tag:h.tag,payload:h.payload,callback:h.callback,next:null},null===l?(n=l=p,k=m):l=l.next=p,g|=r;h=h.next;if(null===h)if(h=e.shared.pending,null===h)break;else r=h,h=r.next,r.next=null,e.lastBaseUpdate=r,e.shared.pending=null}while(1);null===l&&(k=m);e.baseState=k;e.firstBaseUpdate=n;e.lastBaseUpdate=l;b=e.shared.interleaved;if(null!==b){e=b;do g|=e.lane,e=e.next;while(e!==b)}else null===f&&(e.shared.lanes=0);ra|=g;a.lanes=g;a.memoizedState=m}}function Hh(a,
b,c){a=b.effects;b.effects=null;if(null!==a)for(b=0;b<a.length;b++){var d=a[b],e=d.callback;if(null!==e){d.callback=null;d=c;if("function"!==typeof e)throw Error(m(191,e));e.call(d)}}}function ub(a){if(a===wc)throw Error(m(174));return a}function gf(a,b){y(xc,b);y(yc,a);y(Ea,wc);a=b.nodeType;switch(a){case 9:case 11:b=(b=b.documentElement)?b.namespaceURI:oe(null,"");break;default:a=8===a?b.parentNode:b,b=a.namespaceURI||null,a=a.tagName,b=oe(b,a)}v(Ea);y(Ea,b)}function Tb(a){v(Ea);v(yc);v(xc)}function Ih(a){ub(xc.current);
var b=ub(Ea.current);var c=oe(b,a.type);b!==c&&(y(yc,a),y(Ea,c))}function hf(a){yc.current===a&&(v(Ea),v(yc))}function xd(a){for(var b=a;null!==b;){if(13===b.tag){var c=b.memoizedState;if(null!==c&&(c=c.dehydrated,null===c||"$?"===c.data||"$!"===c.data))return b}else if(19===b.tag&&void 0!==b.memoizedProps.revealOrder){if(0!==(b.flags&128))return b}else if(null!==b.child){b.child.return=b;b=b.child;continue}if(b===a)break;for(;null===b.sibling;){if(null===b.return||b.return===a)return null;b=b.return}b.sibling.return=
b.return;b=b.sibling}return null}function jf(){for(var a=0;a<kf.length;a++)kf[a]._workInProgressVersionPrimary=null;kf.length=0}function V(){throw Error(m(321));}function lf(a,b){if(null===b)return!1;for(var c=0;c<b.length&&c<a.length;c++)if(!ua(a[c],b[c]))return!1;return!0}function mf(a,b,c,d,e,f){vb=f;C=b;b.memoizedState=null;b.updateQueue=null;b.lanes=0;yd.current=null===a||null===a.memoizedState?lk:mk;a=c(d,e);if(zc){f=0;do{zc=!1;Ac=0;if(25<=f)throw Error(m(301));f+=1;N=K=null;b.updateQueue=null;
yd.current=nk;a=c(d,e)}while(zc)}yd.current=zd;b=null!==K&&null!==K.next;vb=0;N=K=C=null;Ad=!1;if(b)throw Error(m(300));return a}function nf(){var a=0!==Ac;Ac=0;return a}function Fa(){var a={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};null===N?C.memoizedState=N=a:N=N.next=a;return N}function sa(){if(null===K){var a=C.alternate;a=null!==a?a.memoizedState:null}else a=K.next;var b=null===N?C.memoizedState:N.next;if(null!==b)N=b,K=a;else{if(null===a)throw Error(m(310));K=a;
a={memoizedState:K.memoizedState,baseState:K.baseState,baseQueue:K.baseQueue,queue:K.queue,next:null};null===N?C.memoizedState=N=a:N=N.next=a}return N}function Bc(a,b){return"function"===typeof b?b(a):b}function of(a,b,c){b=sa();c=b.queue;if(null===c)throw Error(m(311));c.lastRenderedReducer=a;var d=K,e=d.baseQueue,f=c.pending;if(null!==f){if(null!==e){var g=e.next;e.next=f.next;f.next=g}d.baseQueue=e=f;c.pending=null}if(null!==e){f=e.next;d=d.baseState;var h=g=null,k=null,n=f;do{var l=n.lane;if((vb&
l)===l)null!==k&&(k=k.next={lane:0,action:n.action,hasEagerState:n.hasEagerState,eagerState:n.eagerState,next:null}),d=n.hasEagerState?n.eagerState:a(d,n.action);else{var u={lane:l,action:n.action,hasEagerState:n.hasEagerState,eagerState:n.eagerState,next:null};null===k?(h=k=u,g=d):k=k.next=u;C.lanes|=l;ra|=l}n=n.next}while(null!==n&&n!==f);null===k?g=d:k.next=h;ua(d,b.memoizedState)||(ha=!0);b.memoizedState=d;b.baseState=g;b.baseQueue=k;c.lastRenderedState=d}a=c.interleaved;if(null!==a){e=a;do f=
e.lane,C.lanes|=f,ra|=f,e=e.next;while(e!==a)}else null===e&&(c.lanes=0);return[b.memoizedState,c.dispatch]}function pf(a,b,c){b=sa();c=b.queue;if(null===c)throw Error(m(311));c.lastRenderedReducer=a;var d=c.dispatch,e=c.pending,f=b.memoizedState;if(null!==e){c.pending=null;var g=e=e.next;do f=a(f,g.action),g=g.next;while(g!==e);ua(f,b.memoizedState)||(ha=!0);b.memoizedState=f;null===b.baseQueue&&(b.baseState=f);c.lastRenderedState=f}return[f,d]}function Jh(a,b,c){}function Kh(a,b,c){c=C;var d=sa(),
e=b(),f=!ua(d.memoizedState,e);f&&(d.memoizedState=e,ha=!0);d=d.queue;qf(Lh.bind(null,c,d,a),[a]);if(d.getSnapshot!==b||f||null!==N&&N.memoizedState.tag&1){c.flags|=2048;Cc(9,Mh.bind(null,c,d,e,b),void 0,null);if(null===O)throw Error(m(349));0!==(vb&30)||Nh(c,b,e)}return e}function Nh(a,b,c){a.flags|=16384;a={getSnapshot:b,value:c};b=C.updateQueue;null===b?(b={lastEffect:null,stores:null},C.updateQueue=b,b.stores=[a]):(c=b.stores,null===c?b.stores=[a]:c.push(a))}function Mh(a,b,c,d){b.value=c;b.getSnapshot=
d;Oh(b)&&Ph(a)}function Lh(a,b,c){return c(function(){Oh(b)&&Ph(a)})}function Oh(a){var b=a.getSnapshot;a=a.value;try{var c=b();return!ua(a,c)}catch(d){return!0}}function Ph(a){var b=Oa(a,1);null!==b&&xa(b,a,1,-1)}function Qh(a){var b=Fa();"function"===typeof a&&(a=a());b.memoizedState=b.baseState=a;a={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:Bc,lastRenderedState:a};b.queue=a;a=a.dispatch=ok.bind(null,C,a);return[b.memoizedState,a]}function Cc(a,b,c,d){a={tag:a,create:b,
destroy:c,deps:d,next:null};b=C.updateQueue;null===b?(b={lastEffect:null,stores:null},C.updateQueue=b,b.lastEffect=a.next=a):(c=b.lastEffect,null===c?b.lastEffect=a.next=a:(d=c.next,c.next=a,a.next=d,b.lastEffect=a));return a}function Rh(a){return sa().memoizedState}function Bd(a,b,c,d){var e=Fa();C.flags|=a;e.memoizedState=Cc(1|b,c,void 0,void 0===d?null:d)}function Cd(a,b,c,d){var e=sa();d=void 0===d?null:d;var f=void 0;if(null!==K){var g=K.memoizedState;f=g.destroy;if(null!==d&&lf(d,g.deps)){e.memoizedState=
Cc(b,c,f,d);return}}C.flags|=a;e.memoizedState=Cc(1|b,c,f,d)}function Sh(a,b){return Bd(8390656,8,a,b)}function qf(a,b){return Cd(2048,8,a,b)}function Th(a,b){return Cd(4,2,a,b)}function Uh(a,b){return Cd(4,4,a,b)}function Vh(a,b){if("function"===typeof b)return a=a(),b(a),function(){b(null)};if(null!==b&&void 0!==b)return a=a(),b.current=a,function(){b.current=null}}function Wh(a,b,c){c=null!==c&&void 0!==c?c.concat([a]):null;return Cd(4,4,Vh.bind(null,b,a),c)}function rf(a,b){}function Xh(a,b){var c=
sa();b=void 0===b?null:b;var d=c.memoizedState;if(null!==d&&null!==b&&lf(b,d[1]))return d[0];c.memoizedState=[a,b];return a}function Yh(a,b){var c=sa();b=void 0===b?null:b;var d=c.memoizedState;if(null!==d&&null!==b&&lf(b,d[1]))return d[0];a=a();c.memoizedState=[a,b];return a}function Zh(a,b,c){if(0===(vb&21))return a.baseState&&(a.baseState=!1,ha=!0),a.memoizedState=c;ua(c,b)||(c=Dg(),C.lanes|=c,ra|=c,a.baseState=!0);return b}function pk(a,b,c){c=z;z=0!==c&&4>c?c:4;a(!0);var d=sf.transition;sf.transition=
{};try{a(!1),b()}finally{z=c,sf.transition=d}}function $h(){return sa().memoizedState}function qk(a,b,c){var d=hb(a);c={lane:d,action:c,hasEagerState:!1,eagerState:null,next:null};if(ai(a))bi(b,c);else if(c=Eh(a,b,c,d),null!==c){var e=Z();xa(c,a,d,e);ci(c,b,d)}}function ok(a,b,c){var d=hb(a),e={lane:d,action:c,hasEagerState:!1,eagerState:null,next:null};if(ai(a))bi(b,e);else{var f=a.alternate;if(0===a.lanes&&(null===f||0===f.lanes)&&(f=b.lastRenderedReducer,null!==f))try{var g=b.lastRenderedState,
h=f(g,c);e.hasEagerState=!0;e.eagerState=h;if(ua(h,g)){var k=b.interleaved;null===k?(e.next=e,ef(b)):(e.next=k.next,k.next=e);b.interleaved=e;return}}catch(n){}finally{}c=Eh(a,b,e,d);null!==c&&(e=Z(),xa(c,a,d,e),ci(c,b,d))}}function ai(a){var b=a.alternate;return a===C||null!==b&&b===C}function bi(a,b){zc=Ad=!0;var c=a.pending;null===c?b.next=b:(b.next=c.next,c.next=b);a.pending=b}function ci(a,b,c){if(0!==(c&4194240)){var d=b.lanes;d&=a.pendingLanes;c|=d;b.lanes=c;xe(a,c)}}function ya(a,b){if(a&&
a.defaultProps){b=E({},b);a=a.defaultProps;for(var c in a)void 0===b[c]&&(b[c]=a[c]);return b}return b}function tf(a,b,c,d){b=a.memoizedState;c=c(d,b);c=null===c||void 0===c?b:E({},b,c);a.memoizedState=c;0===a.lanes&&(a.updateQueue.baseState=c)}function di(a,b,c,d,e,f,g){a=a.stateNode;return"function"===typeof a.shouldComponentUpdate?a.shouldComponentUpdate(d,f,g):b.prototype&&b.prototype.isPureReactComponent?!qc(c,d)||!qc(e,f):!0}function ei(a,b,c){var d=!1,e=cb;var f=b.contextType;"object"===typeof f&&
null!==f?f=qa(f):(e=ea(b)?pb:J.current,d=b.contextTypes,f=(d=null!==d&&void 0!==d)?Nb(a,e):cb);b=new b(c,f);a.memoizedState=null!==b.state&&void 0!==b.state?b.state:null;b.updater=Dd;a.stateNode=b;b._reactInternals=a;d&&(a=a.stateNode,a.__reactInternalMemoizedUnmaskedChildContext=e,a.__reactInternalMemoizedMaskedChildContext=f);return b}function fi(a,b,c,d){a=b.state;"function"===typeof b.componentWillReceiveProps&&b.componentWillReceiveProps(c,d);"function"===typeof b.UNSAFE_componentWillReceiveProps&&
b.UNSAFE_componentWillReceiveProps(c,d);b.state!==a&&Dd.enqueueReplaceState(b,b.state,null)}function uf(a,b,c,d){var e=a.stateNode;e.props=c;e.state=a.memoizedState;e.refs={};ff(a);var f=b.contextType;"object"===typeof f&&null!==f?e.context=qa(f):(f=ea(b)?pb:J.current,e.context=Nb(a,f));e.state=a.memoizedState;f=b.getDerivedStateFromProps;"function"===typeof f&&(tf(a,b,f,c),e.state=a.memoizedState);"function"===typeof b.getDerivedStateFromProps||"function"===typeof e.getSnapshotBeforeUpdate||"function"!==
typeof e.UNSAFE_componentWillMount&&"function"!==typeof e.componentWillMount||(b=e.state,"function"===typeof e.componentWillMount&&e.componentWillMount(),"function"===typeof e.UNSAFE_componentWillMount&&e.UNSAFE_componentWillMount(),b!==e.state&&Dd.enqueueReplaceState(e,e.state,null),wd(a,c,e,d),e.state=a.memoizedState);"function"===typeof e.componentDidMount&&(a.flags|=4194308)}function Ub(a,b){try{var c="",d=b;do c+=fj(d),d=d.return;while(d);var e=c}catch(f){e="\nError generating stack: "+f.message+
"\n"+f.stack}return{value:a,source:b,stack:e,digest:null}}function vf(a,b,c){return{value:a,source:null,stack:null!=c?c:null,digest:null!=b?b:null}}function wf(a,b){try{console.error(b.value)}catch(c){setTimeout(function(){throw c;})}}function gi(a,b,c){c=Pa(-1,c);c.tag=3;c.payload={element:null};var d=b.value;c.callback=function(){Ed||(Ed=!0,xf=d);wf(a,b)};return c}function hi(a,b,c){c=Pa(-1,c);c.tag=3;var d=a.type.getDerivedStateFromError;if("function"===typeof d){var e=b.value;c.payload=function(){return d(e)};
c.callback=function(){wf(a,b)}}var f=a.stateNode;null!==f&&"function"===typeof f.componentDidCatch&&(c.callback=function(){wf(a,b);"function"!==typeof d&&(null===ib?ib=new Set([this]):ib.add(this));var c=b.stack;this.componentDidCatch(b.value,{componentStack:null!==c?c:""})});return c}function ii(a,b,c){var d=a.pingCache;if(null===d){d=a.pingCache=new rk;var e=new Set;d.set(b,e)}else e=d.get(b),void 0===e&&(e=new Set,d.set(b,e));e.has(c)||(e.add(c),a=sk.bind(null,a,b,c),b.then(a,a))}function ji(a){do{var b;
if(b=13===a.tag)b=a.memoizedState,b=null!==b?null!==b.dehydrated?!0:!1:!0;if(b)return a;a=a.return}while(null!==a);return null}function ki(a,b,c,d,e){if(0===(a.mode&1))return a===b?a.flags|=65536:(a.flags|=128,c.flags|=131072,c.flags&=-52805,1===c.tag&&(null===c.alternate?c.tag=17:(b=Pa(-1,1),b.tag=2,fb(c,b,1))),c.lanes|=1),a;a.flags|=65536;a.lanes=e;return a}function aa(a,b,c,d){b.child=null===a?li(b,null,c,d):Vb(b,a.child,c,d)}function mi(a,b,c,d,e){c=c.render;var f=b.ref;Sb(b,e);d=mf(a,b,c,d,f,
e);c=nf();if(null!==a&&!ha)return b.updateQueue=a.updateQueue,b.flags&=-2053,a.lanes&=~e,Qa(a,b,e);D&&c&&Ue(b);b.flags|=1;aa(a,b,d,e);return b.child}function ni(a,b,c,d,e){if(null===a){var f=c.type;if("function"===typeof f&&!yf(f)&&void 0===f.defaultProps&&null===c.compare&&void 0===c.defaultProps)return b.tag=15,b.type=f,oi(a,b,f,d,e);a=rd(c.type,null,d,b,b.mode,e);a.ref=b.ref;a.return=b;return b.child=a}f=a.child;if(0===(a.lanes&e)){var g=f.memoizedProps;c=c.compare;c=null!==c?c:qc;if(c(g,d)&&a.ref===
b.ref)return Qa(a,b,e)}b.flags|=1;a=eb(f,d);a.ref=b.ref;a.return=b;return b.child=a}function oi(a,b,c,d,e){if(null!==a){var f=a.memoizedProps;if(qc(f,d)&&a.ref===b.ref)if(ha=!1,b.pendingProps=d=f,0!==(a.lanes&e))0!==(a.flags&131072)&&(ha=!0);else return b.lanes=a.lanes,Qa(a,b,e)}return zf(a,b,c,d,e)}function pi(a,b,c){var d=b.pendingProps,e=d.children,f=null!==a?a.memoizedState:null;if("hidden"===d.mode)if(0===(b.mode&1))b.memoizedState={baseLanes:0,cachePool:null,transitions:null},y(Ga,ba),ba|=c;
else{if(0===(c&1073741824))return a=null!==f?f.baseLanes|c:c,b.lanes=b.childLanes=1073741824,b.memoizedState={baseLanes:a,cachePool:null,transitions:null},b.updateQueue=null,y(Ga,ba),ba|=a,null;b.memoizedState={baseLanes:0,cachePool:null,transitions:null};d=null!==f?f.baseLanes:c;y(Ga,ba);ba|=d}else null!==f?(d=f.baseLanes|c,b.memoizedState=null):d=c,y(Ga,ba),ba|=d;aa(a,b,e,c);return b.child}function qi(a,b){var c=b.ref;if(null===a&&null!==c||null!==a&&a.ref!==c)b.flags|=512,b.flags|=2097152}function zf(a,
b,c,d,e){var f=ea(c)?pb:J.current;f=Nb(b,f);Sb(b,e);c=mf(a,b,c,d,f,e);d=nf();if(null!==a&&!ha)return b.updateQueue=a.updateQueue,b.flags&=-2053,a.lanes&=~e,Qa(a,b,e);D&&d&&Ue(b);b.flags|=1;aa(a,b,c,e);return b.child}function ri(a,b,c,d,e){if(ea(c)){var f=!0;ld(b)}else f=!1;Sb(b,e);if(null===b.stateNode)Fd(a,b),ei(b,c,d),uf(b,c,d,e),d=!0;else if(null===a){var g=b.stateNode,h=b.memoizedProps;g.props=h;var k=g.context,n=c.contextType;"object"===typeof n&&null!==n?n=qa(n):(n=ea(c)?pb:J.current,n=Nb(b,
n));var l=c.getDerivedStateFromProps,m="function"===typeof l||"function"===typeof g.getSnapshotBeforeUpdate;m||"function"!==typeof g.UNSAFE_componentWillReceiveProps&&"function"!==typeof g.componentWillReceiveProps||(h!==d||k!==n)&&fi(b,g,d,n);gb=!1;var r=b.memoizedState;g.state=r;wd(b,d,g,e);k=b.memoizedState;h!==d||r!==k||S.current||gb?("function"===typeof l&&(tf(b,c,l,d),k=b.memoizedState),(h=gb||di(b,c,h,d,r,k,n))?(m||"function"!==typeof g.UNSAFE_componentWillMount&&"function"!==typeof g.componentWillMount||
("function"===typeof g.componentWillMount&&g.componentWillMount(),"function"===typeof g.UNSAFE_componentWillMount&&g.UNSAFE_componentWillMount()),"function"===typeof g.componentDidMount&&(b.flags|=4194308)):("function"===typeof g.componentDidMount&&(b.flags|=4194308),b.memoizedProps=d,b.memoizedState=k),g.props=d,g.state=k,g.context=n,d=h):("function"===typeof g.componentDidMount&&(b.flags|=4194308),d=!1)}else{g=b.stateNode;Fh(a,b);h=b.memoizedProps;n=b.type===b.elementType?h:ya(b.type,h);g.props=
n;m=b.pendingProps;r=g.context;k=c.contextType;"object"===typeof k&&null!==k?k=qa(k):(k=ea(c)?pb:J.current,k=Nb(b,k));var p=c.getDerivedStateFromProps;(l="function"===typeof p||"function"===typeof g.getSnapshotBeforeUpdate)||"function"!==typeof g.UNSAFE_componentWillReceiveProps&&"function"!==typeof g.componentWillReceiveProps||(h!==m||r!==k)&&fi(b,g,d,k);gb=!1;r=b.memoizedState;g.state=r;wd(b,d,g,e);var x=b.memoizedState;h!==m||r!==x||S.current||gb?("function"===typeof p&&(tf(b,c,p,d),x=b.memoizedState),
(n=gb||di(b,c,n,d,r,x,k)||!1)?(l||"function"!==typeof g.UNSAFE_componentWillUpdate&&"function"!==typeof g.componentWillUpdate||("function"===typeof g.componentWillUpdate&&g.componentWillUpdate(d,x,k),"function"===typeof g.UNSAFE_componentWillUpdate&&g.UNSAFE_componentWillUpdate(d,x,k)),"function"===typeof g.componentDidUpdate&&(b.flags|=4),"function"===typeof g.getSnapshotBeforeUpdate&&(b.flags|=1024)):("function"!==typeof g.componentDidUpdate||h===a.memoizedProps&&r===a.memoizedState||(b.flags|=
4),"function"!==typeof g.getSnapshotBeforeUpdate||h===a.memoizedProps&&r===a.memoizedState||(b.flags|=1024),b.memoizedProps=d,b.memoizedState=x),g.props=d,g.state=x,g.context=k,d=n):("function"!==typeof g.componentDidUpdate||h===a.memoizedProps&&r===a.memoizedState||(b.flags|=4),"function"!==typeof g.getSnapshotBeforeUpdate||h===a.memoizedProps&&r===a.memoizedState||(b.flags|=1024),d=!1)}return Af(a,b,c,d,f,e)}function Af(a,b,c,d,e,f){qi(a,b);var g=0!==(b.flags&128);if(!d&&!g)return e&&vh(b,c,!1),
Qa(a,b,f);d=b.stateNode;tk.current=b;var h=g&&"function"!==typeof c.getDerivedStateFromError?null:d.render();b.flags|=1;null!==a&&g?(b.child=Vb(b,a.child,null,f),b.child=Vb(b,null,h,f)):aa(a,b,h,f);b.memoizedState=d.state;e&&vh(b,c,!0);return b.child}function si(a){var b=a.stateNode;b.pendingContext?th(a,b.pendingContext,b.pendingContext!==b.context):b.context&&th(a,b.context,!1);gf(a,b.containerInfo)}function ti(a,b,c,d,e){Qb();Ye(e);b.flags|=256;aa(a,b,c,d);return b.child}function Bf(a){return{baseLanes:a,
cachePool:null,transitions:null}}function ui(a,b,c){var d=b.pendingProps,e=F.current,f=!1,g=0!==(b.flags&128),h;(h=g)||(h=null!==a&&null===a.memoizedState?!1:0!==(e&2));if(h)f=!0,b.flags&=-129;else if(null===a||null!==a.memoizedState)e|=1;y(F,e&1);if(null===a){Xe(b);a=b.memoizedState;if(null!==a&&(a=a.dehydrated,null!==a))return 0===(b.mode&1)?b.lanes=1:"$!"===a.data?b.lanes=8:b.lanes=1073741824,null;g=d.children;a=d.fallback;return f?(d=b.mode,f=b.child,g={mode:"hidden",children:g},0===(d&1)&&null!==
f?(f.childLanes=0,f.pendingProps=g):f=Gd(g,d,0,null),a=sb(a,d,c,null),f.return=b,a.return=b,f.sibling=a,b.child=f,b.child.memoizedState=Bf(c),b.memoizedState=Cf,a):Df(b,g)}e=a.memoizedState;if(null!==e&&(h=e.dehydrated,null!==h))return uk(a,b,g,d,h,e,c);if(f){f=d.fallback;g=b.mode;e=a.child;h=e.sibling;var k={mode:"hidden",children:d.children};0===(g&1)&&b.child!==e?(d=b.child,d.childLanes=0,d.pendingProps=k,b.deletions=null):(d=eb(e,k),d.subtreeFlags=e.subtreeFlags&14680064);null!==h?f=eb(h,f):(f=
sb(f,g,c,null),f.flags|=2);f.return=b;d.return=b;d.sibling=f;b.child=d;d=f;f=b.child;g=a.child.memoizedState;g=null===g?Bf(c):{baseLanes:g.baseLanes|c,cachePool:null,transitions:g.transitions};f.memoizedState=g;f.childLanes=a.childLanes&~c;b.memoizedState=Cf;return d}f=a.child;a=f.sibling;d=eb(f,{mode:"visible",children:d.children});0===(b.mode&1)&&(d.lanes=c);d.return=b;d.sibling=null;null!==a&&(c=b.deletions,null===c?(b.deletions=[a],b.flags|=16):c.push(a));b.child=d;b.memoizedState=null;return d}
function Df(a,b,c){b=Gd({mode:"visible",children:b},a.mode,0,null);b.return=a;return a.child=b}function Hd(a,b,c,d){null!==d&&Ye(d);Vb(b,a.child,null,c);a=Df(b,b.pendingProps.children);a.flags|=2;b.memoizedState=null;return a}function uk(a,b,c,d,e,f,g){if(c){if(b.flags&256)return b.flags&=-257,d=vf(Error(m(422))),Hd(a,b,g,d);if(null!==b.memoizedState)return b.child=a.child,b.flags|=128,null;f=d.fallback;e=b.mode;d=Gd({mode:"visible",children:d.children},e,0,null);f=sb(f,e,g,null);f.flags|=2;d.return=
b;f.return=b;d.sibling=f;b.child=d;0!==(b.mode&1)&&Vb(b,a.child,null,g);b.child.memoizedState=Bf(g);b.memoizedState=Cf;return f}if(0===(b.mode&1))return Hd(a,b,g,null);if("$!"===e.data){d=e.nextSibling&&e.nextSibling.dataset;if(d)var h=d.dgst;d=h;f=Error(m(419));d=vf(f,d,void 0);return Hd(a,b,g,d)}h=0!==(g&a.childLanes);if(ha||h){d=O;if(null!==d){switch(g&-g){case 4:e=2;break;case 16:e=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:e=
32;break;case 536870912:e=268435456;break;default:e=0}e=0!==(e&(d.suspendedLanes|g))?0:e;0!==e&&e!==f.retryLane&&(f.retryLane=e,Oa(a,e),xa(d,a,e,-1))}Ef();d=vf(Error(m(421)));return Hd(a,b,g,d)}if("$?"===e.data)return b.flags|=128,b.child=a.child,b=vk.bind(null,a),e._reactRetry=b,null;a=f.treeContext;fa=Ka(e.nextSibling);la=b;D=!0;wa=null;null!==a&&(na[oa++]=Ma,na[oa++]=Na,na[oa++]=rb,Ma=a.id,Na=a.overflow,rb=b);b=Df(b,d.children);b.flags|=4096;return b}function vi(a,b,c){a.lanes|=b;var d=a.alternate;
null!==d&&(d.lanes|=b);df(a.return,b,c)}function Ff(a,b,c,d,e){var f=a.memoizedState;null===f?a.memoizedState={isBackwards:b,rendering:null,renderingStartTime:0,last:d,tail:c,tailMode:e}:(f.isBackwards=b,f.rendering=null,f.renderingStartTime=0,f.last=d,f.tail=c,f.tailMode=e)}function wi(a,b,c){var d=b.pendingProps,e=d.revealOrder,f=d.tail;aa(a,b,d.children,c);d=F.current;if(0!==(d&2))d=d&1|2,b.flags|=128;else{if(null!==a&&0!==(a.flags&128))a:for(a=b.child;null!==a;){if(13===a.tag)null!==a.memoizedState&&
vi(a,c,b);else if(19===a.tag)vi(a,c,b);else if(null!==a.child){a.child.return=a;a=a.child;continue}if(a===b)break a;for(;null===a.sibling;){if(null===a.return||a.return===b)break a;a=a.return}a.sibling.return=a.return;a=a.sibling}d&=1}y(F,d);if(0===(b.mode&1))b.memoizedState=null;else switch(e){case "forwards":c=b.child;for(e=null;null!==c;)a=c.alternate,null!==a&&null===xd(a)&&(e=c),c=c.sibling;c=e;null===c?(e=b.child,b.child=null):(e=c.sibling,c.sibling=null);Ff(b,!1,e,c,f);break;case "backwards":c=
null;e=b.child;for(b.child=null;null!==e;){a=e.alternate;if(null!==a&&null===xd(a)){b.child=e;break}a=e.sibling;e.sibling=c;c=e;e=a}Ff(b,!0,c,null,f);break;case "together":Ff(b,!1,null,null,void 0);break;default:b.memoizedState=null}return b.child}function Fd(a,b){0===(b.mode&1)&&null!==a&&(a.alternate=null,b.alternate=null,b.flags|=2)}function Qa(a,b,c){null!==a&&(b.dependencies=a.dependencies);ra|=b.lanes;if(0===(c&b.childLanes))return null;if(null!==a&&b.child!==a.child)throw Error(m(153));if(null!==
b.child){a=b.child;c=eb(a,a.pendingProps);b.child=c;for(c.return=b;null!==a.sibling;)a=a.sibling,c=c.sibling=eb(a,a.pendingProps),c.return=b;c.sibling=null}return b.child}function wk(a,b,c){switch(b.tag){case 3:si(b);Qb();break;case 5:Ih(b);break;case 1:ea(b.type)&&ld(b);break;case 4:gf(b,b.stateNode.containerInfo);break;case 10:var d=b.type._context,e=b.memoizedProps.value;y(ud,d._currentValue);d._currentValue=e;break;case 13:d=b.memoizedState;if(null!==d){if(null!==d.dehydrated)return y(F,F.current&
1),b.flags|=128,null;if(0!==(c&b.child.childLanes))return ui(a,b,c);y(F,F.current&1);a=Qa(a,b,c);return null!==a?a.sibling:null}y(F,F.current&1);break;case 19:d=0!==(c&b.childLanes);if(0!==(a.flags&128)){if(d)return wi(a,b,c);b.flags|=128}e=b.memoizedState;null!==e&&(e.rendering=null,e.tail=null,e.lastEffect=null);y(F,F.current);if(d)break;else return null;case 22:case 23:return b.lanes=0,pi(a,b,c)}return Qa(a,b,c)}function Dc(a,b){if(!D)switch(a.tailMode){case "hidden":b=a.tail;for(var c=null;null!==
b;)null!==b.alternate&&(c=b),b=b.sibling;null===c?a.tail=null:c.sibling=null;break;case "collapsed":c=a.tail;for(var d=null;null!==c;)null!==c.alternate&&(d=c),c=c.sibling;null===d?b||null===a.tail?a.tail=null:a.tail.sibling=null:d.sibling=null}}function W(a){var b=null!==a.alternate&&a.alternate.child===a.child,c=0,d=0;if(b)for(var e=a.child;null!==e;)c|=e.lanes|e.childLanes,d|=e.subtreeFlags&14680064,d|=e.flags&14680064,e.return=a,e=e.sibling;else for(e=a.child;null!==e;)c|=e.lanes|e.childLanes,
d|=e.subtreeFlags,d|=e.flags,e.return=a,e=e.sibling;a.subtreeFlags|=d;a.childLanes=c;return b}function xk(a,b,c){var d=b.pendingProps;Ve(b);switch(b.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return W(b),null;case 1:return ea(b.type)&&(v(S),v(J)),W(b),null;case 3:d=b.stateNode;Tb();v(S);v(J);jf();d.pendingContext&&(d.context=d.pendingContext,d.pendingContext=null);if(null===a||null===a.child)pd(b)?b.flags|=4:null===a||a.memoizedState.isDehydrated&&0===(b.flags&
256)||(b.flags|=1024,null!==wa&&(Gf(wa),wa=null));xi(a,b);W(b);return null;case 5:hf(b);var e=ub(xc.current);c=b.type;if(null!==a&&null!=b.stateNode)yk(a,b,c,d,e),a.ref!==b.ref&&(b.flags|=512,b.flags|=2097152);else{if(!d){if(null===b.stateNode)throw Error(m(166));W(b);return null}a=ub(Ea.current);if(pd(b)){d=b.stateNode;c=b.type;var f=b.memoizedProps;d[Da]=b;d[uc]=f;a=0!==(b.mode&1);switch(c){case "dialog":B("cancel",d);B("close",d);break;case "iframe":case "object":case "embed":B("load",d);break;
case "video":case "audio":for(e=0;e<Ec.length;e++)B(Ec[e],d);break;case "source":B("error",d);break;case "img":case "image":case "link":B("error",d);B("load",d);break;case "details":B("toggle",d);break;case "input":kg(d,f);B("invalid",d);break;case "select":d._wrapperState={wasMultiple:!!f.multiple};B("invalid",d);break;case "textarea":ng(d,f),B("invalid",d)}pe(c,f);e=null;for(var g in f)if(f.hasOwnProperty(g)){var h=f[g];"children"===g?"string"===typeof h?d.textContent!==h&&(!0!==f.suppressHydrationWarning&&
jd(d.textContent,h,a),e=["children",h]):"number"===typeof h&&d.textContent!==""+h&&(!0!==f.suppressHydrationWarning&&jd(d.textContent,h,a),e=["children",""+h]):$b.hasOwnProperty(g)&&null!=h&&"onScroll"===g&&B("scroll",d)}switch(c){case "input":Pc(d);mg(d,f,!0);break;case "textarea":Pc(d);pg(d);break;case "select":case "option":break;default:"function"===typeof f.onClick&&(d.onclick=kd)}d=e;b.updateQueue=d;null!==d&&(b.flags|=4)}else{g=9===e.nodeType?e:e.ownerDocument;"http://www.w3.org/1999/xhtml"===
a&&(a=qg(c));"http://www.w3.org/1999/xhtml"===a?"script"===c?(a=g.createElement("div"),a.innerHTML="<script>\x3c/script>",a=a.removeChild(a.firstChild)):"string"===typeof d.is?a=g.createElement(c,{is:d.is}):(a=g.createElement(c),"select"===c&&(g=a,d.multiple?g.multiple=!0:d.size&&(g.size=d.size))):a=g.createElementNS(a,c);a[Da]=b;a[uc]=d;zk(a,b,!1,!1);b.stateNode=a;a:{g=qe(c,d);switch(c){case "dialog":B("cancel",a);B("close",a);e=d;break;case "iframe":case "object":case "embed":B("load",a);e=d;break;
case "video":case "audio":for(e=0;e<Ec.length;e++)B(Ec[e],a);e=d;break;case "source":B("error",a);e=d;break;case "img":case "image":case "link":B("error",a);B("load",a);e=d;break;case "details":B("toggle",a);e=d;break;case "input":kg(a,d);e=ke(a,d);B("invalid",a);break;case "option":e=d;break;case "select":a._wrapperState={wasMultiple:!!d.multiple};e=E({},d,{value:void 0});B("invalid",a);break;case "textarea":ng(a,d);e=ne(a,d);B("invalid",a);break;default:e=d}pe(c,e);h=e;for(f in h)if(h.hasOwnProperty(f)){var k=
h[f];"style"===f?sg(a,k):"dangerouslySetInnerHTML"===f?(k=k?k.__html:void 0,null!=k&&yi(a,k)):"children"===f?"string"===typeof k?("textarea"!==c||""!==k)&&Fc(a,k):"number"===typeof k&&Fc(a,""+k):"suppressContentEditableWarning"!==f&&"suppressHydrationWarning"!==f&&"autoFocus"!==f&&($b.hasOwnProperty(f)?null!=k&&"onScroll"===f&&B("scroll",a):null!=k&&$d(a,f,k,g))}switch(c){case "input":Pc(a);mg(a,d,!1);break;case "textarea":Pc(a);pg(a);break;case "option":null!=d.value&&a.setAttribute("value",""+Ua(d.value));
break;case "select":a.multiple=!!d.multiple;f=d.value;null!=f?Db(a,!!d.multiple,f,!1):null!=d.defaultValue&&Db(a,!!d.multiple,d.defaultValue,!0);break;default:"function"===typeof e.onClick&&(a.onclick=kd)}switch(c){case "button":case "input":case "select":case "textarea":d=!!d.autoFocus;break a;case "img":d=!0;break a;default:d=!1}}d&&(b.flags|=4)}null!==b.ref&&(b.flags|=512,b.flags|=2097152)}W(b);return null;case 6:if(a&&null!=b.stateNode)Ak(a,b,a.memoizedProps,d);else{if("string"!==typeof d&&null===
b.stateNode)throw Error(m(166));c=ub(xc.current);ub(Ea.current);if(pd(b)){d=b.stateNode;c=b.memoizedProps;d[Da]=b;if(f=d.nodeValue!==c)if(a=la,null!==a)switch(a.tag){case 3:jd(d.nodeValue,c,0!==(a.mode&1));break;case 5:!0!==a.memoizedProps.suppressHydrationWarning&&jd(d.nodeValue,c,0!==(a.mode&1))}f&&(b.flags|=4)}else d=(9===c.nodeType?c:c.ownerDocument).createTextNode(d),d[Da]=b,b.stateNode=d}W(b);return null;case 13:v(F);d=b.memoizedState;if(null===a||null!==a.memoizedState&&null!==a.memoizedState.dehydrated){if(D&&
null!==fa&&0!==(b.mode&1)&&0===(b.flags&128)){for(f=fa;f;)f=Ka(f.nextSibling);Qb();b.flags|=98560;f=!1}else if(f=pd(b),null!==d&&null!==d.dehydrated){if(null===a){if(!f)throw Error(m(318));f=b.memoizedState;f=null!==f?f.dehydrated:null;if(!f)throw Error(m(317));f[Da]=b}else Qb(),0===(b.flags&128)&&(b.memoizedState=null),b.flags|=4;W(b);f=!1}else null!==wa&&(Gf(wa),wa=null),f=!0;if(!f)return b.flags&65536?b:null}if(0!==(b.flags&128))return b.lanes=c,b;d=null!==d;d!==(null!==a&&null!==a.memoizedState)&&
d&&(b.child.flags|=8192,0!==(b.mode&1)&&(null===a||0!==(F.current&1)?0===L&&(L=3):Ef()));null!==b.updateQueue&&(b.flags|=4);W(b);return null;case 4:return Tb(),xi(a,b),null===a&&sc(b.stateNode.containerInfo),W(b),null;case 10:return cf(b.type._context),W(b),null;case 17:return ea(b.type)&&(v(S),v(J)),W(b),null;case 19:v(F);f=b.memoizedState;if(null===f)return W(b),null;d=0!==(b.flags&128);g=f.rendering;if(null===g)if(d)Dc(f,!1);else{if(0!==L||null!==a&&0!==(a.flags&128))for(a=b.child;null!==a;){g=
xd(a);if(null!==g){b.flags|=128;Dc(f,!1);d=g.updateQueue;null!==d&&(b.updateQueue=d,b.flags|=4);b.subtreeFlags=0;d=c;for(c=b.child;null!==c;)f=c,a=d,f.flags&=14680066,g=f.alternate,null===g?(f.childLanes=0,f.lanes=a,f.child=null,f.subtreeFlags=0,f.memoizedProps=null,f.memoizedState=null,f.updateQueue=null,f.dependencies=null,f.stateNode=null):(f.childLanes=g.childLanes,f.lanes=g.lanes,f.child=g.child,f.subtreeFlags=0,f.deletions=null,f.memoizedProps=g.memoizedProps,f.memoizedState=g.memoizedState,
f.updateQueue=g.updateQueue,f.type=g.type,a=g.dependencies,f.dependencies=null===a?null:{lanes:a.lanes,firstContext:a.firstContext}),c=c.sibling;y(F,F.current&1|2);return b.child}a=a.sibling}null!==f.tail&&P()>Hf&&(b.flags|=128,d=!0,Dc(f,!1),b.lanes=4194304)}else{if(!d)if(a=xd(g),null!==a){if(b.flags|=128,d=!0,c=a.updateQueue,null!==c&&(b.updateQueue=c,b.flags|=4),Dc(f,!0),null===f.tail&&"hidden"===f.tailMode&&!g.alternate&&!D)return W(b),null}else 2*P()-f.renderingStartTime>Hf&&1073741824!==c&&(b.flags|=
128,d=!0,Dc(f,!1),b.lanes=4194304);f.isBackwards?(g.sibling=b.child,b.child=g):(c=f.last,null!==c?c.sibling=g:b.child=g,f.last=g)}if(null!==f.tail)return b=f.tail,f.rendering=b,f.tail=b.sibling,f.renderingStartTime=P(),b.sibling=null,c=F.current,y(F,d?c&1|2:c&1),b;W(b);return null;case 22:case 23:return ba=Ga.current,v(Ga),d=null!==b.memoizedState,null!==a&&null!==a.memoizedState!==d&&(b.flags|=8192),d&&0!==(b.mode&1)?0!==(ba&1073741824)&&(W(b),b.subtreeFlags&6&&(b.flags|=8192)):W(b),null;case 24:return null;
case 25:return null}throw Error(m(156,b.tag));}function Bk(a,b,c){Ve(b);switch(b.tag){case 1:return ea(b.type)&&(v(S),v(J)),a=b.flags,a&65536?(b.flags=a&-65537|128,b):null;case 3:return Tb(),v(S),v(J),jf(),a=b.flags,0!==(a&65536)&&0===(a&128)?(b.flags=a&-65537|128,b):null;case 5:return hf(b),null;case 13:v(F);a=b.memoizedState;if(null!==a&&null!==a.dehydrated){if(null===b.alternate)throw Error(m(340));Qb()}a=b.flags;return a&65536?(b.flags=a&-65537|128,b):null;case 19:return v(F),null;case 4:return Tb(),
null;case 10:return cf(b.type._context),null;case 22:case 23:return ba=Ga.current,v(Ga),null;case 24:return null;default:return null}}function Wb(a,b){var c=a.ref;if(null!==c)if("function"===typeof c)try{c(null)}catch(d){G(a,b,d)}else c.current=null}function If(a,b,c){try{c()}catch(d){G(a,b,d)}}function Ck(a,b){Jf=Zc;a=ch();if(Ie(a)){if("selectionStart"in a)var c={start:a.selectionStart,end:a.selectionEnd};else a:{c=(c=a.ownerDocument)&&c.defaultView||window;var d=c.getSelection&&c.getSelection();
if(d&&0!==d.rangeCount){c=d.anchorNode;var e=d.anchorOffset,f=d.focusNode;d=d.focusOffset;try{c.nodeType,f.nodeType}catch(M){c=null;break a}var g=0,h=-1,k=-1,n=0,q=0,u=a,r=null;b:for(;;){for(var p;;){u!==c||0!==e&&3!==u.nodeType||(h=g+e);u!==f||0!==d&&3!==u.nodeType||(k=g+d);3===u.nodeType&&(g+=u.nodeValue.length);if(null===(p=u.firstChild))break;r=u;u=p}for(;;){if(u===a)break b;r===c&&++n===e&&(h=g);r===f&&++q===d&&(k=g);if(null!==(p=u.nextSibling))break;u=r;r=u.parentNode}u=p}c=-1===h||-1===k?null:
{start:h,end:k}}else c=null}c=c||{start:0,end:0}}else c=null;Kf={focusedElem:a,selectionRange:c};Zc=!1;for(l=b;null!==l;)if(b=l,a=b.child,0!==(b.subtreeFlags&1028)&&null!==a)a.return=b,l=a;else for(;null!==l;){b=l;try{var x=b.alternate;if(0!==(b.flags&1024))switch(b.tag){case 0:case 11:case 15:break;case 1:if(null!==x){var v=x.memoizedProps,z=x.memoizedState,w=b.stateNode,A=w.getSnapshotBeforeUpdate(b.elementType===b.type?v:ya(b.type,v),z);w.__reactInternalSnapshotBeforeUpdate=A}break;case 3:var t=
b.stateNode.containerInfo;1===t.nodeType?t.textContent="":9===t.nodeType&&t.documentElement&&t.removeChild(t.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(m(163));}}catch(M){G(b,b.return,M)}a=b.sibling;if(null!==a){a.return=b.return;l=a;break}l=b.return}x=zi;zi=!1;return x}function Gc(a,b,c){var d=b.updateQueue;d=null!==d?d.lastEffect:null;if(null!==d){var e=d=d.next;do{if((e.tag&a)===a){var f=e.destroy;e.destroy=void 0;void 0!==f&&If(b,c,f)}e=e.next}while(e!==d)}}
function Id(a,b){b=b.updateQueue;b=null!==b?b.lastEffect:null;if(null!==b){var c=b=b.next;do{if((c.tag&a)===a){var d=c.create;c.destroy=d()}c=c.next}while(c!==b)}}function Lf(a){var b=a.ref;if(null!==b){var c=a.stateNode;switch(a.tag){case 5:a=c;break;default:a=c}"function"===typeof b?b(a):b.current=a}}function Ai(a){var b=a.alternate;null!==b&&(a.alternate=null,Ai(b));a.child=null;a.deletions=null;a.sibling=null;5===a.tag&&(b=a.stateNode,null!==b&&(delete b[Da],delete b[uc],delete b[Me],delete b[Dk],
delete b[Ek]));a.stateNode=null;a.return=null;a.dependencies=null;a.memoizedProps=null;a.memoizedState=null;a.pendingProps=null;a.stateNode=null;a.updateQueue=null}function Bi(a){return 5===a.tag||3===a.tag||4===a.tag}function Ci(a){a:for(;;){for(;null===a.sibling;){if(null===a.return||Bi(a.return))return null;a=a.return}a.sibling.return=a.return;for(a=a.sibling;5!==a.tag&&6!==a.tag&&18!==a.tag;){if(a.flags&2)continue a;if(null===a.child||4===a.tag)continue a;else a.child.return=a,a=a.child}if(!(a.flags&
2))return a.stateNode}}function Mf(a,b,c){var d=a.tag;if(5===d||6===d)a=a.stateNode,b?8===c.nodeType?c.parentNode.insertBefore(a,b):c.insertBefore(a,b):(8===c.nodeType?(b=c.parentNode,b.insertBefore(a,c)):(b=c,b.appendChild(a)),c=c._reactRootContainer,null!==c&&void 0!==c||null!==b.onclick||(b.onclick=kd));else if(4!==d&&(a=a.child,null!==a))for(Mf(a,b,c),a=a.sibling;null!==a;)Mf(a,b,c),a=a.sibling}function Nf(a,b,c){var d=a.tag;if(5===d||6===d)a=a.stateNode,b?c.insertBefore(a,b):c.appendChild(a);
else if(4!==d&&(a=a.child,null!==a))for(Nf(a,b,c),a=a.sibling;null!==a;)Nf(a,b,c),a=a.sibling}function jb(a,b,c){for(c=c.child;null!==c;)Di(a,b,c),c=c.sibling}function Di(a,b,c){if(Ca&&"function"===typeof Ca.onCommitFiberUnmount)try{Ca.onCommitFiberUnmount(Uc,c)}catch(h){}switch(c.tag){case 5:X||Wb(c,b);case 6:var d=T,e=za;T=null;jb(a,b,c);T=d;za=e;null!==T&&(za?(a=T,c=c.stateNode,8===a.nodeType?a.parentNode.removeChild(c):a.removeChild(c)):T.removeChild(c.stateNode));break;case 18:null!==T&&(za?
(a=T,c=c.stateNode,8===a.nodeType?Re(a.parentNode,c):1===a.nodeType&&Re(a,c),nc(a)):Re(T,c.stateNode));break;case 4:d=T;e=za;T=c.stateNode.containerInfo;za=!0;jb(a,b,c);T=d;za=e;break;case 0:case 11:case 14:case 15:if(!X&&(d=c.updateQueue,null!==d&&(d=d.lastEffect,null!==d))){e=d=d.next;do{var f=e,g=f.destroy;f=f.tag;void 0!==g&&(0!==(f&2)?If(c,b,g):0!==(f&4)&&If(c,b,g));e=e.next}while(e!==d)}jb(a,b,c);break;case 1:if(!X&&(Wb(c,b),d=c.stateNode,"function"===typeof d.componentWillUnmount))try{d.props=
c.memoizedProps,d.state=c.memoizedState,d.componentWillUnmount()}catch(h){G(c,b,h)}jb(a,b,c);break;case 21:jb(a,b,c);break;case 22:c.mode&1?(X=(d=X)||null!==c.memoizedState,jb(a,b,c),X=d):jb(a,b,c);break;default:jb(a,b,c)}}function Ei(a){var b=a.updateQueue;if(null!==b){a.updateQueue=null;var c=a.stateNode;null===c&&(c=a.stateNode=new Fk);b.forEach(function(b){var d=Gk.bind(null,a,b);c.has(b)||(c.add(b),b.then(d,d))})}}function Aa(a,b,c){c=b.deletions;if(null!==c)for(var d=0;d<c.length;d++){var e=
c[d];try{var f=a,g=b,h=g;a:for(;null!==h;){switch(h.tag){case 5:T=h.stateNode;za=!1;break a;case 3:T=h.stateNode.containerInfo;za=!0;break a;case 4:T=h.stateNode.containerInfo;za=!0;break a}h=h.return}if(null===T)throw Error(m(160));Di(f,g,e);T=null;za=!1;var k=e.alternate;null!==k&&(k.return=null);e.return=null}catch(n){G(e,b,n)}}if(b.subtreeFlags&12854)for(b=b.child;null!==b;)Fi(b,a),b=b.sibling}function Fi(a,b,c){var d=a.alternate;c=a.flags;switch(a.tag){case 0:case 11:case 14:case 15:Aa(b,a);
Ha(a);if(c&4){try{Gc(3,a,a.return),Id(3,a)}catch(I){G(a,a.return,I)}try{Gc(5,a,a.return)}catch(I){G(a,a.return,I)}}break;case 1:Aa(b,a);Ha(a);c&512&&null!==d&&Wb(d,d.return);break;case 5:Aa(b,a);Ha(a);c&512&&null!==d&&Wb(d,d.return);if(a.flags&32){var e=a.stateNode;try{Fc(e,"")}catch(I){G(a,a.return,I)}}if(c&4&&(e=a.stateNode,null!=e)){var f=a.memoizedProps,g=null!==d?d.memoizedProps:f,h=a.type,k=a.updateQueue;a.updateQueue=null;if(null!==k)try{"input"===h&&"radio"===f.type&&null!=f.name&&lg(e,f);
qe(h,g);var n=qe(h,f);for(g=0;g<k.length;g+=2){var q=k[g],u=k[g+1];"style"===q?sg(e,u):"dangerouslySetInnerHTML"===q?yi(e,u):"children"===q?Fc(e,u):$d(e,q,u,n)}switch(h){case "input":le(e,f);break;case "textarea":og(e,f);break;case "select":var r=e._wrapperState.wasMultiple;e._wrapperState.wasMultiple=!!f.multiple;var p=f.value;null!=p?Db(e,!!f.multiple,p,!1):r!==!!f.multiple&&(null!=f.defaultValue?Db(e,!!f.multiple,f.defaultValue,!0):Db(e,!!f.multiple,f.multiple?[]:"",!1))}e[uc]=f}catch(I){G(a,a.return,
I)}}break;case 6:Aa(b,a);Ha(a);if(c&4){if(null===a.stateNode)throw Error(m(162));e=a.stateNode;f=a.memoizedProps;try{e.nodeValue=f}catch(I){G(a,a.return,I)}}break;case 3:Aa(b,a);Ha(a);if(c&4&&null!==d&&d.memoizedState.isDehydrated)try{nc(b.containerInfo)}catch(I){G(a,a.return,I)}break;case 4:Aa(b,a);Ha(a);break;case 13:Aa(b,a);Ha(a);e=a.child;e.flags&8192&&(f=null!==e.memoizedState,e.stateNode.isHidden=f,!f||null!==e.alternate&&null!==e.alternate.memoizedState||(Of=P()));c&4&&Ei(a);break;case 22:q=
null!==d&&null!==d.memoizedState;a.mode&1?(X=(n=X)||q,Aa(b,a),X=n):Aa(b,a);Ha(a);if(c&8192){n=null!==a.memoizedState;if((a.stateNode.isHidden=n)&&!q&&0!==(a.mode&1))for(l=a,q=a.child;null!==q;){for(u=l=q;null!==l;){r=l;p=r.child;switch(r.tag){case 0:case 11:case 14:case 15:Gc(4,r,r.return);break;case 1:Wb(r,r.return);var x=r.stateNode;if("function"===typeof x.componentWillUnmount){c=r;b=r.return;try{d=c,x.props=d.memoizedProps,x.state=d.memoizedState,x.componentWillUnmount()}catch(I){G(c,b,I)}}break;
case 5:Wb(r,r.return);break;case 22:if(null!==r.memoizedState){Gi(u);continue}}null!==p?(p.return=r,l=p):Gi(u)}q=q.sibling}a:for(q=null,u=a;;){if(5===u.tag){if(null===q){q=u;try{e=u.stateNode,n?(f=e.style,"function"===typeof f.setProperty?f.setProperty("display","none","important"):f.display="none"):(h=u.stateNode,k=u.memoizedProps.style,g=void 0!==k&&null!==k&&k.hasOwnProperty("display")?k.display:null,h.style.display=rg("display",g))}catch(I){G(a,a.return,I)}}}else if(6===u.tag){if(null===q)try{u.stateNode.nodeValue=
n?"":u.memoizedProps}catch(I){G(a,a.return,I)}}else if((22!==u.tag&&23!==u.tag||null===u.memoizedState||u===a)&&null!==u.child){u.child.return=u;u=u.child;continue}if(u===a)break a;for(;null===u.sibling;){if(null===u.return||u.return===a)break a;q===u&&(q=null);u=u.return}q===u&&(q=null);u.sibling.return=u.return;u=u.sibling}}break;case 19:Aa(b,a);Ha(a);c&4&&Ei(a);break;case 21:break;default:Aa(b,a),Ha(a)}}function Ha(a){var b=a.flags;if(b&2){try{a:{for(var c=a.return;null!==c;){if(Bi(c)){var d=c;
break a}c=c.return}throw Error(m(160));}switch(d.tag){case 5:var e=d.stateNode;d.flags&32&&(Fc(e,""),d.flags&=-33);var f=Ci(a);Nf(a,f,e);break;case 3:case 4:var g=d.stateNode.containerInfo,h=Ci(a);Mf(a,h,g);break;default:throw Error(m(161));}}catch(k){G(a,a.return,k)}a.flags&=-3}b&4096&&(a.flags&=-4097)}function Hk(a,b,c){l=a;Hi(a,b,c)}function Hi(a,b,c){for(var d=0!==(a.mode&1);null!==l;){var e=l,f=e.child;if(22===e.tag&&d){var g=null!==e.memoizedState||Jd;if(!g){var h=e.alternate,k=null!==h&&null!==
h.memoizedState||X;h=Jd;var n=X;Jd=g;if((X=k)&&!n)for(l=e;null!==l;)g=l,k=g.child,22===g.tag&&null!==g.memoizedState?Ii(e):null!==k?(k.return=g,l=k):Ii(e);for(;null!==f;)l=f,Hi(f,b,c),f=f.sibling;l=e;Jd=h;X=n}Ji(a,b,c)}else 0!==(e.subtreeFlags&8772)&&null!==f?(f.return=e,l=f):Ji(a,b,c)}}function Ji(a,b,c){for(;null!==l;){b=l;if(0!==(b.flags&8772)){c=b.alternate;try{if(0!==(b.flags&8772))switch(b.tag){case 0:case 11:case 15:X||Id(5,b);break;case 1:var d=b.stateNode;if(b.flags&4&&!X)if(null===c)d.componentDidMount();
else{var e=b.elementType===b.type?c.memoizedProps:ya(b.type,c.memoizedProps);d.componentDidUpdate(e,c.memoizedState,d.__reactInternalSnapshotBeforeUpdate)}var f=b.updateQueue;null!==f&&Hh(b,f,d);break;case 3:var g=b.updateQueue;if(null!==g){c=null;if(null!==b.child)switch(b.child.tag){case 5:c=b.child.stateNode;break;case 1:c=b.child.stateNode}Hh(b,g,c)}break;case 5:var h=b.stateNode;if(null===c&&b.flags&4){c=h;var k=b.memoizedProps;switch(b.type){case "button":case "input":case "select":case "textarea":k.autoFocus&&
c.focus();break;case "img":k.src&&(c.src=k.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(null===b.memoizedState){var n=b.alternate;if(null!==n){var q=n.memoizedState;if(null!==q){var p=q.dehydrated;null!==p&&nc(p)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(m(163));}X||b.flags&512&&Lf(b)}catch(r){G(b,b.return,r)}}if(b===a){l=null;break}c=b.sibling;if(null!==c){c.return=b.return;l=c;break}l=b.return}}function Gi(a){for(;null!==l;){var b=l;if(b===
a){l=null;break}var c=b.sibling;if(null!==c){c.return=b.return;l=c;break}l=b.return}}function Ii(a){for(;null!==l;){var b=l;try{switch(b.tag){case 0:case 11:case 15:var c=b.return;try{Id(4,b)}catch(k){G(b,c,k)}break;case 1:var d=b.stateNode;if("function"===typeof d.componentDidMount){var e=b.return;try{d.componentDidMount()}catch(k){G(b,e,k)}}var f=b.return;try{Lf(b)}catch(k){G(b,f,k)}break;case 5:var g=b.return;try{Lf(b)}catch(k){G(b,g,k)}}}catch(k){G(b,b.return,k)}if(b===a){l=null;break}var h=b.sibling;
if(null!==h){h.return=b.return;l=h;break}l=b.return}}function Hc(){Hf=P()+500}function Z(){return 0!==(p&6)?P():-1!==Kd?Kd:Kd=P()}function hb(a){if(0===(a.mode&1))return 1;if(0!==(p&2)&&0!==U)return U&-U;if(null!==Ik.transition)return 0===Ld&&(Ld=Dg()),Ld;a=z;if(0!==a)return a;a=window.event;a=void 0===a?16:Lg(a.type);return a}function xa(a,b,c,d){if(50<Ic)throw Ic=0,Pf=null,Error(m(185));ic(a,c,d);if(0===(p&2)||a!==O)a===O&&(0===(p&2)&&(Md|=c),4===L&&kb(a,U)),ia(a,d),1===c&&0===p&&0===(b.mode&1)&&
(Hc(),md&&db())}function ia(a,b){var c=a.callbackNode;tj(a,b);var d=Vc(a,a===O?U:0);if(0===d)null!==c&&Ki(c),a.callbackNode=null,a.callbackPriority=0;else if(b=d&-d,a.callbackPriority!==b){null!=c&&Ki(c);if(1===b)0===a.tag?jk(Li.bind(null,a)):wh(Li.bind(null,a)),Jk(function(){0===(p&6)&&db()}),c=null;else{switch(Eg(d)){case 1:c=De;break;case 4:c=Mg;break;case 16:c=ad;break;case 536870912:c=Ng;break;default:c=ad}c=Mi(c,Ni.bind(null,a))}a.callbackPriority=b;a.callbackNode=c}}function Ni(a,b){Kd=-1;
Ld=0;if(0!==(p&6))throw Error(m(327));var c=a.callbackNode;if(Xb()&&a.callbackNode!==c)return null;var d=Vc(a,a===O?U:0);if(0===d)return null;if(0!==(d&30)||0!==(d&a.expiredLanes)||b)b=Nd(a,d);else{b=d;var e=p;p|=2;var f=Oi();if(O!==a||U!==b)Ra=null,Hc(),wb(a,b);do try{Kk();break}catch(h){Pi(a,h)}while(1);af();Od.current=f;p=e;null!==H?b=0:(O=null,U=0,b=L)}if(0!==b){2===b&&(e=ve(a),0!==e&&(d=e,b=Qf(a,e)));if(1===b)throw c=Jc,wb(a,0),kb(a,d),ia(a,P()),c;if(6===b)kb(a,d);else{e=a.current.alternate;
if(0===(d&30)&&!Lk(e)&&(b=Nd(a,d),2===b&&(f=ve(a),0!==f&&(d=f,b=Qf(a,f))),1===b))throw c=Jc,wb(a,0),kb(a,d),ia(a,P()),c;a.finishedWork=e;a.finishedLanes=d;switch(b){case 0:case 1:throw Error(m(345));case 2:xb(a,ja,Ra);break;case 3:kb(a,d);if((d&130023424)===d&&(b=Of+500-P(),10<b)){if(0!==Vc(a,0))break;e=a.suspendedLanes;if((e&d)!==d){Z();a.pingedLanes|=a.suspendedLanes&e;break}a.timeoutHandle=Rf(xb.bind(null,a,ja,Ra),b);break}xb(a,ja,Ra);break;case 4:kb(a,d);if((d&4194240)===d)break;b=a.eventTimes;
for(e=-1;0<d;){var g=31-ta(d);f=1<<g;g=b[g];g>e&&(e=g);d&=~f}d=e;d=P()-d;d=(120>d?120:480>d?480:1080>d?1080:1920>d?1920:3E3>d?3E3:4320>d?4320:1960*Mk(d/1960))-d;if(10<d){a.timeoutHandle=Rf(xb.bind(null,a,ja,Ra),d);break}xb(a,ja,Ra);break;case 5:xb(a,ja,Ra);break;default:throw Error(m(329));}}}ia(a,P());return a.callbackNode===c?Ni.bind(null,a):null}function Qf(a,b){var c=Kc;a.current.memoizedState.isDehydrated&&(wb(a,b).flags|=256);a=Nd(a,b);2!==a&&(b=ja,ja=c,null!==b&&Gf(b));return a}function Gf(a){null===
ja?ja=a:ja.push.apply(ja,a)}function Lk(a){for(var b=a;;){if(b.flags&16384){var c=b.updateQueue;if(null!==c&&(c=c.stores,null!==c))for(var d=0;d<c.length;d++){var e=c[d],f=e.getSnapshot;e=e.value;try{if(!ua(f(),e))return!1}catch(g){return!1}}}c=b.child;if(b.subtreeFlags&16384&&null!==c)c.return=b,b=c;else{if(b===a)break;for(;null===b.sibling;){if(null===b.return||b.return===a)return!0;b=b.return}b.sibling.return=b.return;b=b.sibling}}return!0}function kb(a,b){b&=~Sf;b&=~Md;a.suspendedLanes|=b;a.pingedLanes&=
~b;for(a=a.expirationTimes;0<b;){var c=31-ta(b),d=1<<c;a[c]=-1;b&=~d}}function Li(a){if(0!==(p&6))throw Error(m(327));Xb();var b=Vc(a,0);if(0===(b&1))return ia(a,P()),null;var c=Nd(a,b);if(0!==a.tag&&2===c){var d=ve(a);0!==d&&(b=d,c=Qf(a,d))}if(1===c)throw c=Jc,wb(a,0),kb(a,b),ia(a,P()),c;if(6===c)throw Error(m(345));a.finishedWork=a.current.alternate;a.finishedLanes=b;xb(a,ja,Ra);ia(a,P());return null}function Tf(a,b){var c=p;p|=1;try{return a(b)}finally{p=c,0===p&&(Hc(),md&&db())}}function yb(a){null!==
lb&&0===lb.tag&&0===(p&6)&&Xb();var b=p;p|=1;var c=ca.transition,d=z;try{if(ca.transition=null,z=1,a)return a()}finally{z=d,ca.transition=c,p=b,0===(p&6)&&db()}}function wb(a,b){a.finishedWork=null;a.finishedLanes=0;var c=a.timeoutHandle;-1!==c&&(a.timeoutHandle=-1,Nk(c));if(null!==H)for(c=H.return;null!==c;){var d=c;Ve(d);switch(d.tag){case 1:d=d.type.childContextTypes;null!==d&&void 0!==d&&(v(S),v(J));break;case 3:Tb();v(S);v(J);jf();break;case 5:hf(d);break;case 4:Tb();break;case 13:v(F);break;
case 19:v(F);break;case 10:cf(d.type._context);break;case 22:case 23:ba=Ga.current,v(Ga)}c=c.return}O=a;H=a=eb(a.current,null);U=ba=b;L=0;Jc=null;Sf=Md=ra=0;ja=Kc=null;if(null!==tb){for(b=0;b<tb.length;b++)if(c=tb[b],d=c.interleaved,null!==d){c.interleaved=null;var e=d.next,f=c.pending;if(null!==f){var g=f.next;f.next=e;d.next=g}c.pending=d}tb=null}return a}function Pi(a,b){do{var c=H;try{af();yd.current=zd;if(Ad){for(var d=C.memoizedState;null!==d;){var e=d.queue;null!==e&&(e.pending=null);d=d.next}Ad=
!1}vb=0;N=K=C=null;zc=!1;Ac=0;Uf.current=null;if(null===c||null===c.return){L=1;Jc=b;H=null;break}a:{var f=a,g=c.return,h=c,k=b;b=U;h.flags|=32768;if(null!==k&&"object"===typeof k&&"function"===typeof k.then){var n=k,l=h,p=l.tag;if(0===(l.mode&1)&&(0===p||11===p||15===p)){var r=l.alternate;r?(l.updateQueue=r.updateQueue,l.memoizedState=r.memoizedState,l.lanes=r.lanes):(l.updateQueue=null,l.memoizedState=null)}var v=ji(g);if(null!==v){v.flags&=-257;ki(v,g,h,f,b);v.mode&1&&ii(f,n,b);b=v;k=n;var x=b.updateQueue;
if(null===x){var z=new Set;z.add(k);b.updateQueue=z}else x.add(k);break a}else{if(0===(b&1)){ii(f,n,b);Ef();break a}k=Error(m(426))}}else if(D&&h.mode&1){var y=ji(g);if(null!==y){0===(y.flags&65536)&&(y.flags|=256);ki(y,g,h,f,b);Ye(Ub(k,h));break a}}f=k=Ub(k,h);4!==L&&(L=2);null===Kc?Kc=[f]:Kc.push(f);f=g;do{switch(f.tag){case 3:f.flags|=65536;b&=-b;f.lanes|=b;var w=gi(f,k,b);Gh(f,w);break a;case 1:h=k;var A=f.type,t=f.stateNode;if(0===(f.flags&128)&&("function"===typeof A.getDerivedStateFromError||
null!==t&&"function"===typeof t.componentDidCatch&&(null===ib||!ib.has(t)))){f.flags|=65536;b&=-b;f.lanes|=b;var B=hi(f,h,b);Gh(f,B);break a}}f=f.return}while(null!==f)}Qi(c)}catch(ma){b=ma;H===c&&null!==c&&(H=c=c.return);continue}break}while(1)}function Oi(){var a=Od.current;Od.current=zd;return null===a?zd:a}function Ef(){if(0===L||3===L||2===L)L=4;null===O||0===(ra&268435455)&&0===(Md&268435455)||kb(O,U)}function Nd(a,b){var c=p;p|=2;var d=Oi();if(O!==a||U!==b)Ra=null,wb(a,b);do try{Ok();break}catch(e){Pi(a,
e)}while(1);af();p=c;Od.current=d;if(null!==H)throw Error(m(261));O=null;U=0;return L}function Ok(){for(;null!==H;)Ri(H)}function Kk(){for(;null!==H&&!Pk();)Ri(H)}function Ri(a){var b=Qk(a.alternate,a,ba);a.memoizedProps=a.pendingProps;null===b?Qi(a):H=b;Uf.current=null}function Qi(a){var b=a;do{var c=b.alternate;a=b.return;if(0===(b.flags&32768)){if(c=xk(c,b,ba),null!==c){H=c;return}}else{c=Bk(c,b);if(null!==c){c.flags&=32767;H=c;return}if(null!==a)a.flags|=32768,a.subtreeFlags=0,a.deletions=null;
else{L=6;H=null;return}}b=b.sibling;if(null!==b){H=b;return}H=b=a}while(null!==b);0===L&&(L=5)}function xb(a,b,c){var d=z,e=ca.transition;try{ca.transition=null,z=1,Rk(a,b,c,d)}finally{ca.transition=e,z=d}return null}function Rk(a,b,c,d){do Xb();while(null!==lb);if(0!==(p&6))throw Error(m(327));c=a.finishedWork;var e=a.finishedLanes;if(null===c)return null;a.finishedWork=null;a.finishedLanes=0;if(c===a.current)throw Error(m(177));a.callbackNode=null;a.callbackPriority=0;var f=c.lanes|c.childLanes;
uj(a,f);a===O&&(H=O=null,U=0);0===(c.subtreeFlags&2064)&&0===(c.flags&2064)||Pd||(Pd=!0,Mi(ad,function(){Xb();return null}));f=0!==(c.flags&15990);if(0!==(c.subtreeFlags&15990)||f){f=ca.transition;ca.transition=null;var g=z;z=1;var h=p;p|=4;Uf.current=null;Ck(a,c);Fi(c,a);Tj(Kf);Zc=!!Jf;Kf=Jf=null;a.current=c;Hk(c,a,e);Sk();p=h;z=g;ca.transition=f}else a.current=c;Pd&&(Pd=!1,lb=a,Qd=e);f=a.pendingLanes;0===f&&(ib=null);oj(c.stateNode,d);ia(a,P());if(null!==b)for(d=a.onRecoverableError,c=0;c<b.length;c++)e=
b[c],d(e.value,{componentStack:e.stack,digest:e.digest});if(Ed)throw Ed=!1,a=xf,xf=null,a;0!==(Qd&1)&&0!==a.tag&&Xb();f=a.pendingLanes;0!==(f&1)?a===Pf?Ic++:(Ic=0,Pf=a):Ic=0;db();return null}function Xb(){if(null!==lb){var a=Eg(Qd),b=ca.transition,c=z;try{ca.transition=null;z=16>a?16:a;if(null===lb)var d=!1;else{a=lb;lb=null;Qd=0;if(0!==(p&6))throw Error(m(331));var e=p;p|=4;for(l=a.current;null!==l;){var f=l,g=f.child;if(0!==(l.flags&16)){var h=f.deletions;if(null!==h){for(var k=0;k<h.length;k++){var n=
h[k];for(l=n;null!==l;){var q=l;switch(q.tag){case 0:case 11:case 15:Gc(8,q,f)}var u=q.child;if(null!==u)u.return=q,l=u;else for(;null!==l;){q=l;var r=q.sibling,v=q.return;Ai(q);if(q===n){l=null;break}if(null!==r){r.return=v;l=r;break}l=v}}}var x=f.alternate;if(null!==x){var y=x.child;if(null!==y){x.child=null;do{var C=y.sibling;y.sibling=null;y=C}while(null!==y)}}l=f}}if(0!==(f.subtreeFlags&2064)&&null!==g)g.return=f,l=g;else b:for(;null!==l;){f=l;if(0!==(f.flags&2048))switch(f.tag){case 0:case 11:case 15:Gc(9,
f,f.return)}var w=f.sibling;if(null!==w){w.return=f.return;l=w;break b}l=f.return}}var A=a.current;for(l=A;null!==l;){g=l;var t=g.child;if(0!==(g.subtreeFlags&2064)&&null!==t)t.return=g,l=t;else b:for(g=A;null!==l;){h=l;if(0!==(h.flags&2048))try{switch(h.tag){case 0:case 11:case 15:Id(9,h)}}catch(ma){G(h,h.return,ma)}if(h===g){l=null;break b}var B=h.sibling;if(null!==B){B.return=h.return;l=B;break b}l=h.return}}p=e;db();if(Ca&&"function"===typeof Ca.onPostCommitFiberRoot)try{Ca.onPostCommitFiberRoot(Uc,
a)}catch(ma){}d=!0}return d}finally{z=c,ca.transition=b}}return!1}function Si(a,b,c){b=Ub(c,b);b=gi(a,b,1);a=fb(a,b,1);b=Z();null!==a&&(ic(a,1,b),ia(a,b))}function G(a,b,c){if(3===a.tag)Si(a,a,c);else for(;null!==b;){if(3===b.tag){Si(b,a,c);break}else if(1===b.tag){var d=b.stateNode;if("function"===typeof b.type.getDerivedStateFromError||"function"===typeof d.componentDidCatch&&(null===ib||!ib.has(d))){a=Ub(c,a);a=hi(b,a,1);b=fb(b,a,1);a=Z();null!==b&&(ic(b,1,a),ia(b,a));break}}b=b.return}}function sk(a,
b,c){var d=a.pingCache;null!==d&&d.delete(b);b=Z();a.pingedLanes|=a.suspendedLanes&c;O===a&&(U&c)===c&&(4===L||3===L&&(U&130023424)===U&&500>P()-Of?wb(a,0):Sf|=c);ia(a,b)}function Ti(a,b){0===b&&(0===(a.mode&1)?b=1:(b=Rd,Rd<<=1,0===(Rd&130023424)&&(Rd=4194304)));var c=Z();a=Oa(a,b);null!==a&&(ic(a,b,c),ia(a,c))}function vk(a){var b=a.memoizedState,c=0;null!==b&&(c=b.retryLane);Ti(a,c)}function Gk(a,b){var c=0;switch(a.tag){case 13:var d=a.stateNode;var e=a.memoizedState;null!==e&&(c=e.retryLane);
break;case 19:d=a.stateNode;break;default:throw Error(m(314));}null!==d&&d.delete(b);Ti(a,c)}function Mi(a,b){return xh(a,b)}function Tk(a,b,c,d){this.tag=a;this.key=c;this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null;this.index=0;this.ref=null;this.pendingProps=b;this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null;this.mode=d;this.subtreeFlags=this.flags=0;this.deletions=null;this.childLanes=this.lanes=0;this.alternate=null}function yf(a){a=
a.prototype;return!(!a||!a.isReactComponent)}function Uk(a){if("function"===typeof a)return yf(a)?1:0;if(void 0!==a&&null!==a){a=a.$$typeof;if(a===ie)return 11;if(a===je)return 14}return 2}function eb(a,b){var c=a.alternate;null===c?(c=pa(a.tag,b,a.key,a.mode),c.elementType=a.elementType,c.type=a.type,c.stateNode=a.stateNode,c.alternate=a,a.alternate=c):(c.pendingProps=b,c.type=a.type,c.flags=0,c.subtreeFlags=0,c.deletions=null);c.flags=a.flags&14680064;c.childLanes=a.childLanes;c.lanes=a.lanes;c.child=
a.child;c.memoizedProps=a.memoizedProps;c.memoizedState=a.memoizedState;c.updateQueue=a.updateQueue;b=a.dependencies;c.dependencies=null===b?null:{lanes:b.lanes,firstContext:b.firstContext};c.sibling=a.sibling;c.index=a.index;c.ref=a.ref;return c}function rd(a,b,c,d,e,f){var g=2;d=a;if("function"===typeof a)yf(a)&&(g=1);else if("string"===typeof a)g=5;else a:switch(a){case Bb:return sb(c.children,e,f,b);case fe:g=8;e|=8;break;case ee:return a=pa(12,c,b,e|2),a.elementType=ee,a.lanes=f,a;case ge:return a=
pa(13,c,b,e),a.elementType=ge,a.lanes=f,a;case he:return a=pa(19,c,b,e),a.elementType=he,a.lanes=f,a;case Ui:return Gd(c,e,f,b);default:if("object"===typeof a&&null!==a)switch(a.$$typeof){case hg:g=10;break a;case gg:g=9;break a;case ie:g=11;break a;case je:g=14;break a;case Ta:g=16;d=null;break a}throw Error(m(130,null==a?a:typeof a,""));}b=pa(g,c,b,e);b.elementType=a;b.type=d;b.lanes=f;return b}function sb(a,b,c,d){a=pa(7,a,d,b);a.lanes=c;return a}function Gd(a,b,c,d){a=pa(22,a,d,b);a.elementType=
Ui;a.lanes=c;a.stateNode={isHidden:!1};return a}function Ze(a,b,c){a=pa(6,a,null,b);a.lanes=c;return a}function $e(a,b,c){b=pa(4,null!==a.children?a.children:[],a.key,b);b.lanes=c;b.stateNode={containerInfo:a.containerInfo,pendingChildren:null,implementation:a.implementation};return b}function Vk(a,b,c,d,e){this.tag=b;this.containerInfo=a;this.finishedWork=this.pingCache=this.current=this.pendingChildren=null;this.timeoutHandle=-1;this.callbackNode=this.pendingContext=this.context=null;this.callbackPriority=
0;this.eventTimes=we(0);this.expirationTimes=we(-1);this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0;this.entanglements=we(0);this.identifierPrefix=d;this.onRecoverableError=e;this.mutableSourceEagerHydrationData=null}function Vf(a,b,c,d,e,f,g,h,k,l){a=new Vk(a,b,c,h,k);1===b?(b=1,!0===f&&(b|=8)):b=0;f=pa(3,null,null,b);a.current=f;f.stateNode=a;f.memoizedState={element:d,isDehydrated:c,cache:null,transitions:null,
pendingSuspenseBoundaries:null};ff(f);return a}function Wk(a,b,c){var d=3<arguments.length&&void 0!==arguments[3]?arguments[3]:null;return{$$typeof:Cb,key:null==d?null:""+d,children:a,containerInfo:b,implementation:c}}function Vi(a){if(!a)return cb;a=a._reactInternals;a:{if(nb(a)!==a||1!==a.tag)throw Error(m(170));var b=a;do{switch(b.tag){case 3:b=b.stateNode.context;break a;case 1:if(ea(b.type)){b=b.stateNode.__reactInternalMemoizedMergedChildContext;break a}}b=b.return}while(null!==b);throw Error(m(171));
}if(1===a.tag){var c=a.type;if(ea(c))return uh(a,c,b)}return b}function Wi(a,b,c,d,e,f,g,h,k,l){a=Vf(c,d,!0,a,e,f,g,h,k);a.context=Vi(null);c=a.current;d=Z();e=hb(c);f=Pa(d,e);f.callback=void 0!==b&&null!==b?b:null;fb(c,f,e);a.current.lanes=e;ic(a,e,d);ia(a,d);return a}function Sd(a,b,c,d){var e=b.current,f=Z(),g=hb(e);c=Vi(c);null===b.context?b.context=c:b.pendingContext=c;b=Pa(f,g);b.payload={element:a};d=void 0===d?null:d;null!==d&&(b.callback=d);a=fb(e,b,g);null!==a&&(xa(a,e,g,f),vd(a,e,g));return g}
function Td(a){a=a.current;if(!a.child)return null;switch(a.child.tag){case 5:return a.child.stateNode;default:return a.child.stateNode}}function Xi(a,b){a=a.memoizedState;if(null!==a&&null!==a.dehydrated){var c=a.retryLane;a.retryLane=0!==c&&c<b?c:b}}function Wf(a,b){Xi(a,b);(a=a.alternate)&&Xi(a,b)}function Xk(a){a=Bg(a);return null===a?null:a.stateNode}function Yk(a){return null}function Xf(a){this._internalRoot=a}function Ud(a){this._internalRoot=a}function Yf(a){return!(!a||1!==a.nodeType&&9!==
a.nodeType&&11!==a.nodeType)}function Vd(a){return!(!a||1!==a.nodeType&&9!==a.nodeType&&11!==a.nodeType&&(8!==a.nodeType||" react-mount-point-unstable "!==a.nodeValue))}function Yi(){}function Zk(a,b,c,d,e){if(e){if("function"===typeof d){var f=d;d=function(){var a=Td(g);f.call(a)}}var g=Wi(b,d,a,0,null,!1,!1,"",Yi);a._reactRootContainer=g;a[Ja]=g.current;sc(8===a.nodeType?a.parentNode:a);yb();return g}for(;e=a.lastChild;)a.removeChild(e);if("function"===typeof d){var h=d;d=function(){var a=Td(k);
h.call(a)}}var k=Vf(a,0,!1,null,null,!1,!1,"",Yi);a._reactRootContainer=k;a[Ja]=k.current;sc(8===a.nodeType?a.parentNode:a);yb(function(){Sd(b,k,c,d)});return k}function Wd(a,b,c,d,e){var f=c._reactRootContainer;if(f){var g=f;if("function"===typeof e){var h=e;e=function(){var a=Td(g);h.call(a)}}Sd(b,g,a,e)}else g=Zk(c,b,a,e,d);return Td(g)}var cg=new Set,$b={},Ia=!("undefined"===typeof window||"undefined"===typeof window.document||"undefined"===typeof window.document.createElement),Zd=Object.prototype.hasOwnProperty,
cj=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,eg={},dg={},R={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a){R[a]=
new Y(a,0,!1,a,null,!1,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(a){var b=a[0];R[b]=new Y(b,1,!1,a[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(a){R[a]=new Y(a,2,!1,a.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(a){R[a]=new Y(a,2,!1,a,null,!1,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a){R[a]=
new Y(a,3,!1,a.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(a){R[a]=new Y(a,3,!0,a,null,!1,!1)});["capture","download"].forEach(function(a){R[a]=new Y(a,4,!1,a,null,!1,!1)});["cols","rows","size","span"].forEach(function(a){R[a]=new Y(a,6,!1,a,null,!1,!1)});["rowSpan","start"].forEach(function(a){R[a]=new Y(a,5,!1,a.toLowerCase(),null,!1,!1)});var Zf=/[\-:]([a-z])/g,$f=function(a){return a[1].toUpperCase()};"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a){var b=
a.replace(Zf,$f);R[b]=new Y(b,1,!1,a,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a){var b=a.replace(Zf,$f);R[b]=new Y(b,1,!1,a,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(a){var b=a.replace(Zf,$f);R[b]=new Y(b,1,!1,a,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(a){R[a]=new Y(a,1,!1,a.toLowerCase(),null,!1,!1)});R.xlinkHref=new Y("xlinkHref",
1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(a){R[a]=new Y(a,1,!1,a.toLowerCase(),null,!0,!0)});var Sa=zb.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,sd=Symbol.for("react.element"),Cb=Symbol.for("react.portal"),Bb=Symbol.for("react.fragment"),fe=Symbol.for("react.strict_mode"),ee=Symbol.for("react.profiler"),hg=Symbol.for("react.provider"),gg=Symbol.for("react.context"),ie=Symbol.for("react.forward_ref"),ge=Symbol.for("react.suspense"),
he=Symbol.for("react.suspense_list"),je=Symbol.for("react.memo"),Ta=Symbol.for("react.lazy");Symbol.for("react.scope");Symbol.for("react.debug_trace_mode");var Ui=Symbol.for("react.offscreen");Symbol.for("react.legacy_hidden");Symbol.for("react.cache");Symbol.for("react.tracing_marker");var fg=Symbol.iterator,E=Object.assign,ae,ce=!1,cc=Array.isArray,Xd,yi=function(a){return"undefined"!==typeof MSApp&&MSApp.execUnsafeLocalFunction?function(b,c,d,e){MSApp.execUnsafeLocalFunction(function(){return a(b,
c,d,e)})}:a}(function(a,b){if("http://www.w3.org/2000/svg"!==a.namespaceURI||"innerHTML"in a)a.innerHTML=b;else{Xd=Xd||document.createElement("div");Xd.innerHTML="<svg>"+b.valueOf().toString()+"</svg>";for(b=Xd.firstChild;a.firstChild;)a.removeChild(a.firstChild);for(;b.firstChild;)a.appendChild(b.firstChild)}}),Fc=function(a,b){if(b){var c=a.firstChild;if(c&&c===a.lastChild&&3===c.nodeType){c.nodeValue=b;return}}a.textContent=b},dc={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,
borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,
strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},$k=["Webkit","ms","Moz","O"];Object.keys(dc).forEach(function(a){$k.forEach(function(b){b=b+a.charAt(0).toUpperCase()+a.substring(1);dc[b]=dc[a]})});var ij=E({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0}),ze=null,se=null,Eb=null,Fb=null,xg=function(a,b){return a(b)},yg=function(){},te=!1,Oe=!1;if(Ia)try{var Lc={};Object.defineProperty(Lc,
"passive",{get:function(){Oe=!0}});window.addEventListener("test",Lc,Lc);window.removeEventListener("test",Lc,Lc)}catch(a){Oe=!1}var kj=function(a,b,c,d,e,f,g,h,k){var l=Array.prototype.slice.call(arguments,3);try{b.apply(c,l)}catch(q){this.onError(q)}},gc=!1,Sc=null,Tc=!1,ue=null,lj={onError:function(a){gc=!0;Sc=a}},Ba=zb.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.Scheduler,Jg=Ba.unstable_scheduleCallback,Kg=Ba.unstable_NormalPriority,xh=Jg,Ki=Ba.unstable_cancelCallback,Pk=Ba.unstable_shouldYield,
Sk=Ba.unstable_requestPaint,P=Ba.unstable_now,Dj=Ba.unstable_getCurrentPriorityLevel,De=Ba.unstable_ImmediatePriority,Mg=Ba.unstable_UserBlockingPriority,ad=Kg,Ej=Ba.unstable_LowPriority,Ng=Ba.unstable_IdlePriority,Uc=null,Ca=null,ta=Math.clz32?Math.clz32:pj,qj=Math.log,rj=Math.LN2,Wc=64,Rd=4194304,z=0,Ae=!1,Yc=[],Va=null,Wa=null,Xa=null,jc=new Map,kc=new Map,Ya=[],Bj="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" "),
Gb=Sa.ReactCurrentBatchConfig,Zc=!0,$c=null,Za=null,Ee=null,bd=null,Yb={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(a){return a.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},He=ka(Yb),Mc=E({},Yb,{view:0,detail:0}),ak=ka(Mc),ag,bg,Nc,Yd=E({},Mc,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Fe,button:0,buttons:0,relatedTarget:function(a){return void 0===a.relatedTarget?a.fromElement===a.srcElement?a.toElement:a.fromElement:
a.relatedTarget},movementX:function(a){if("movementX"in a)return a.movementX;a!==Nc&&(Nc&&"mousemove"===a.type?(ag=a.screenX-Nc.screenX,bg=a.screenY-Nc.screenY):bg=ag=0,Nc=a);return ag},movementY:function(a){return"movementY"in a?a.movementY:bg}}),ih=ka(Yd),al=E({},Yd,{dataTransfer:0}),Wj=ka(al),bl=E({},Mc,{relatedTarget:0}),Pe=ka(bl),cl=E({},Yb,{animationName:0,elapsedTime:0,pseudoElement:0}),Yj=ka(cl),dl=E({},Yb,{clipboardData:function(a){return"clipboardData"in a?a.clipboardData:window.clipboardData}}),
ck=ka(dl),el=E({},Yb,{data:0}),qh=ka(el),fk=qh,fl={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},gl={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",
112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Gj={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"},hl=E({},Mc,{key:function(a){if(a.key){var b=fl[a.key]||a.key;if("Unidentified"!==b)return b}return"keypress"===a.type?(a=cd(a),13===a?"Enter":String.fromCharCode(a)):"keydown"===a.type||"keyup"===a.type?gl[a.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,
metaKey:0,repeat:0,locale:0,getModifierState:Fe,charCode:function(a){return"keypress"===a.type?cd(a):0},keyCode:function(a){return"keydown"===a.type||"keyup"===a.type?a.keyCode:0},which:function(a){return"keypress"===a.type?cd(a):"keydown"===a.type||"keyup"===a.type?a.keyCode:0}}),Vj=ka(hl),il=E({},Yd,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),nh=ka(il),jl=E({},Mc,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,
ctrlKey:0,shiftKey:0,getModifierState:Fe}),Xj=ka(jl),kl=E({},Yb,{propertyName:0,elapsedTime:0,pseudoElement:0}),Zj=ka(kl),ll=E({},Yd,{deltaX:function(a){return"deltaX"in a?a.deltaX:"wheelDeltaX"in a?-a.wheelDeltaX:0},deltaY:function(a){return"deltaY"in a?a.deltaY:"wheelDeltaY"in a?-a.wheelDeltaY:"wheelDelta"in a?-a.wheelDelta:0},deltaZ:0,deltaMode:0}),bk=ka(ll),Hj=[9,13,27,32],Ge=Ia&&"CompositionEvent"in window,Oc=null;Ia&&"documentMode"in document&&(Oc=document.documentMode);var ek=Ia&&"TextEvent"in
window&&!Oc,Ug=Ia&&(!Ge||Oc&&8<Oc&&11>=Oc),Tg=String.fromCharCode(32),Sg=!1,Hb=!1,Kj={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0},oc=null,pc=null,ph=!1;Ia&&(ph=Lj("input")&&(!document.documentMode||9<document.documentMode));var ua="function"===typeof Object.is?Object.is:Sj,dk=Ia&&"documentMode"in document&&11>=document.documentMode,Jb=null,Ke=null,rc=null,Je=!1,Kb={animationend:gd("Animation","AnimationEnd"),
animationiteration:gd("Animation","AnimationIteration"),animationstart:gd("Animation","AnimationStart"),transitionend:gd("Transition","TransitionEnd")},Le={},eh={};Ia&&(eh=document.createElement("div").style,"AnimationEvent"in window||(delete Kb.animationend.animation,delete Kb.animationiteration.animation,delete Kb.animationstart.animation),"TransitionEvent"in window||delete Kb.transitionend.transition);var jh=hd("animationend"),kh=hd("animationiteration"),lh=hd("animationstart"),mh=hd("transitionend"),
fh=new Map,Zi="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
(function(){for(var a=0;a<Zi.length;a++){var b=Zi[a],c=b.toLowerCase();b=b[0].toUpperCase()+b.slice(1);$a(c,"on"+b)}$a(jh,"onAnimationEnd");$a(kh,"onAnimationIteration");$a(lh,"onAnimationStart");$a("dblclick","onDoubleClick");$a("focusin","onFocus");$a("focusout","onBlur");$a(mh,"onTransitionEnd")})();Ab("onMouseEnter",["mouseout","mouseover"]);Ab("onMouseLeave",["mouseout","mouseover"]);Ab("onPointerEnter",["pointerout","pointerover"]);Ab("onPointerLeave",["pointerout","pointerover"]);mb("onChange",
"change click focusin focusout input keydown keyup selectionchange".split(" "));mb("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));mb("onBeforeInput",["compositionend","keypress","textInput","paste"]);mb("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));mb("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));mb("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));
var Ec="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),Uj=new Set("cancel close invalid load scroll toggle".split(" ").concat(Ec)),id="_reactListening"+Math.random().toString(36).slice(2),gk=/\r\n?/g,hk=/\u0000|\uFFFD/g,Jf=null,Kf=null,Rf="function"===typeof setTimeout?setTimeout:void 0,Nk="function"===typeof clearTimeout?
clearTimeout:void 0,$i="function"===typeof Promise?Promise:void 0,Jk="function"===typeof queueMicrotask?queueMicrotask:"undefined"!==typeof $i?function(a){return $i.resolve(null).then(a).catch(ik)}:Rf,Zb=Math.random().toString(36).slice(2),Da="__reactFiber$"+Zb,uc="__reactProps$"+Zb,Ja="__reactContainer$"+Zb,Me="__reactEvents$"+Zb,Dk="__reactListeners$"+Zb,Ek="__reactHandles$"+Zb,Se=[],Mb=-1,cb={},J=bb(cb),S=bb(!1),pb=cb,La=null,md=!1,Te=!1,Ob=[],Pb=0,od=null,nd=0,na=[],oa=0,rb=null,Ma=1,Na="",la=
null,fa=null,D=!1,wa=null,Ik=Sa.ReactCurrentBatchConfig,Vb=Dh(!0),li=Dh(!1),ud=bb(null),td=null,Rb=null,bf=null,tb=null,kk=Oa,gb=!1,wc={},Ea=bb(wc),yc=bb(wc),xc=bb(wc),F=bb(0),kf=[],yd=Sa.ReactCurrentDispatcher,sf=Sa.ReactCurrentBatchConfig,vb=0,C=null,K=null,N=null,Ad=!1,zc=!1,Ac=0,ml=0,zd={readContext:qa,useCallback:V,useContext:V,useEffect:V,useImperativeHandle:V,useInsertionEffect:V,useLayoutEffect:V,useMemo:V,useReducer:V,useRef:V,useState:V,useDebugValue:V,useDeferredValue:V,useTransition:V,
useMutableSource:V,useSyncExternalStore:V,useId:V,unstable_isNewReconciler:!1},lk={readContext:qa,useCallback:function(a,b){Fa().memoizedState=[a,void 0===b?null:b];return a},useContext:qa,useEffect:Sh,useImperativeHandle:function(a,b,c){c=null!==c&&void 0!==c?c.concat([a]):null;return Bd(4194308,4,Vh.bind(null,b,a),c)},useLayoutEffect:function(a,b){return Bd(4194308,4,a,b)},useInsertionEffect:function(a,b){return Bd(4,2,a,b)},useMemo:function(a,b){var c=Fa();b=void 0===b?null:b;a=a();c.memoizedState=
[a,b];return a},useReducer:function(a,b,c){var d=Fa();b=void 0!==c?c(b):b;d.memoizedState=d.baseState=b;a={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:a,lastRenderedState:b};d.queue=a;a=a.dispatch=qk.bind(null,C,a);return[d.memoizedState,a]},useRef:function(a){var b=Fa();a={current:a};return b.memoizedState=a},useState:Qh,useDebugValue:rf,useDeferredValue:function(a){return Fa().memoizedState=a},useTransition:function(){var a=Qh(!1),b=a[0];a=pk.bind(null,a[1]);Fa().memoizedState=
a;return[b,a]},useMutableSource:function(a,b,c){},useSyncExternalStore:function(a,b,c){var d=C,e=Fa();if(D){if(void 0===c)throw Error(m(407));c=c()}else{c=b();if(null===O)throw Error(m(349));0!==(vb&30)||Nh(d,b,c)}e.memoizedState=c;var f={value:c,getSnapshot:b};e.queue=f;Sh(Lh.bind(null,d,f,a),[a]);d.flags|=2048;Cc(9,Mh.bind(null,d,f,c,b),void 0,null);return c},useId:function(){var a=Fa(),b=O.identifierPrefix;if(D){var c=Na;var d=Ma;c=(d&~(1<<32-ta(d)-1)).toString(32)+c;b=":"+b+"R"+c;c=Ac++;0<c&&
(b+="H"+c.toString(32));b+=":"}else c=ml++,b=":"+b+"r"+c.toString(32)+":";return a.memoizedState=b},unstable_isNewReconciler:!1},mk={readContext:qa,useCallback:Xh,useContext:qa,useEffect:qf,useImperativeHandle:Wh,useInsertionEffect:Th,useLayoutEffect:Uh,useMemo:Yh,useReducer:of,useRef:Rh,useState:function(a){return of(Bc)},useDebugValue:rf,useDeferredValue:function(a){var b=sa();return Zh(b,K.memoizedState,a)},useTransition:function(){var a=of(Bc)[0],b=sa().memoizedState;return[a,b]},useMutableSource:Jh,
useSyncExternalStore:Kh,useId:$h,unstable_isNewReconciler:!1},nk={readContext:qa,useCallback:Xh,useContext:qa,useEffect:qf,useImperativeHandle:Wh,useInsertionEffect:Th,useLayoutEffect:Uh,useMemo:Yh,useReducer:pf,useRef:Rh,useState:function(a){return pf(Bc)},useDebugValue:rf,useDeferredValue:function(a){var b=sa();return null===K?b.memoizedState=a:Zh(b,K.memoizedState,a)},useTransition:function(){var a=pf(Bc)[0],b=sa().memoizedState;return[a,b]},useMutableSource:Jh,useSyncExternalStore:Kh,useId:$h,
unstable_isNewReconciler:!1},Dd={isMounted:function(a){return(a=a._reactInternals)?nb(a)===a:!1},enqueueSetState:function(a,b,c){a=a._reactInternals;var d=Z(),e=hb(a),f=Pa(d,e);f.payload=b;void 0!==c&&null!==c&&(f.callback=c);b=fb(a,f,e);null!==b&&(xa(b,a,e,d),vd(b,a,e))},enqueueReplaceState:function(a,b,c){a=a._reactInternals;var d=Z(),e=hb(a),f=Pa(d,e);f.tag=1;f.payload=b;void 0!==c&&null!==c&&(f.callback=c);b=fb(a,f,e);null!==b&&(xa(b,a,e,d),vd(b,a,e))},enqueueForceUpdate:function(a,b){a=a._reactInternals;
var c=Z(),d=hb(a),e=Pa(c,d);e.tag=2;void 0!==b&&null!==b&&(e.callback=b);b=fb(a,e,d);null!==b&&(xa(b,a,d,c),vd(b,a,d))}},rk="function"===typeof WeakMap?WeakMap:Map,tk=Sa.ReactCurrentOwner,ha=!1,Cf={dehydrated:null,treeContext:null,retryLane:0};var zk=function(a,b,c,d){for(c=b.child;null!==c;){if(5===c.tag||6===c.tag)a.appendChild(c.stateNode);else if(4!==c.tag&&null!==c.child){c.child.return=c;c=c.child;continue}if(c===b)break;for(;null===c.sibling;){if(null===c.return||c.return===b)return;c=c.return}c.sibling.return=
c.return;c=c.sibling}};var xi=function(a,b){};var yk=function(a,b,c,d,e){var f=a.memoizedProps;if(f!==d){a=b.stateNode;ub(Ea.current);e=null;switch(c){case "input":f=ke(a,f);d=ke(a,d);e=[];break;case "select":f=E({},f,{value:void 0});d=E({},d,{value:void 0});e=[];break;case "textarea":f=ne(a,f);d=ne(a,d);e=[];break;default:"function"!==typeof f.onClick&&"function"===typeof d.onClick&&(a.onclick=kd)}pe(c,d);var g;c=null;for(l in f)if(!d.hasOwnProperty(l)&&f.hasOwnProperty(l)&&null!=f[l])if("style"===
l){var h=f[l];for(g in h)h.hasOwnProperty(g)&&(c||(c={}),c[g]="")}else"dangerouslySetInnerHTML"!==l&&"children"!==l&&"suppressContentEditableWarning"!==l&&"suppressHydrationWarning"!==l&&"autoFocus"!==l&&($b.hasOwnProperty(l)?e||(e=[]):(e=e||[]).push(l,null));for(l in d){var k=d[l];h=null!=f?f[l]:void 0;if(d.hasOwnProperty(l)&&k!==h&&(null!=k||null!=h))if("style"===l)if(h){for(g in h)!h.hasOwnProperty(g)||k&&k.hasOwnProperty(g)||(c||(c={}),c[g]="");for(g in k)k.hasOwnProperty(g)&&h[g]!==k[g]&&(c||
(c={}),c[g]=k[g])}else c||(e||(e=[]),e.push(l,c)),c=k;else"dangerouslySetInnerHTML"===l?(k=k?k.__html:void 0,h=h?h.__html:void 0,null!=k&&h!==k&&(e=e||[]).push(l,k)):"children"===l?"string"!==typeof k&&"number"!==typeof k||(e=e||[]).push(l,""+k):"suppressContentEditableWarning"!==l&&"suppressHydrationWarning"!==l&&($b.hasOwnProperty(l)?(null!=k&&"onScroll"===l&&B("scroll",a),e||h===k||(e=[])):(e=e||[]).push(l,k))}c&&(e=e||[]).push("style",c);var l=e;if(b.updateQueue=l)b.flags|=4}};var Ak=function(a,
b,c,d){c!==d&&(b.flags|=4)};var Jd=!1,X=!1,Fk="function"===typeof WeakSet?WeakSet:Set,l=null,zi=!1,T=null,za=!1,Mk=Math.ceil,Od=Sa.ReactCurrentDispatcher,Uf=Sa.ReactCurrentOwner,ca=Sa.ReactCurrentBatchConfig,p=0,O=null,H=null,U=0,ba=0,Ga=bb(0),L=0,Jc=null,ra=0,Md=0,Sf=0,Kc=null,ja=null,Of=0,Hf=Infinity,Ra=null,Ed=!1,xf=null,ib=null,Pd=!1,lb=null,Qd=0,Ic=0,Pf=null,Kd=-1,Ld=0;var Qk=function(a,b,c){if(null!==a)if(a.memoizedProps!==b.pendingProps||S.current)ha=!0;else{if(0===(a.lanes&c)&&0===(b.flags&
128))return ha=!1,wk(a,b,c);ha=0!==(a.flags&131072)?!0:!1}else ha=!1,D&&0!==(b.flags&1048576)&&yh(b,nd,b.index);b.lanes=0;switch(b.tag){case 2:var d=b.type;Fd(a,b);a=b.pendingProps;var e=Nb(b,J.current);Sb(b,c);e=mf(null,b,d,a,e,c);var f=nf();b.flags|=1;"object"===typeof e&&null!==e&&"function"===typeof e.render&&void 0===e.$$typeof?(b.tag=1,b.memoizedState=null,b.updateQueue=null,ea(d)?(f=!0,ld(b)):f=!1,b.memoizedState=null!==e.state&&void 0!==e.state?e.state:null,ff(b),e.updater=Dd,b.stateNode=
e,e._reactInternals=b,uf(b,d,a,c),b=Af(null,b,d,!0,f,c)):(b.tag=0,D&&f&&Ue(b),aa(null,b,e,c),b=b.child);return b;case 16:d=b.elementType;a:{Fd(a,b);a=b.pendingProps;e=d._init;d=e(d._payload);b.type=d;e=b.tag=Uk(d);a=ya(d,a);switch(e){case 0:b=zf(null,b,d,a,c);break a;case 1:b=ri(null,b,d,a,c);break a;case 11:b=mi(null,b,d,a,c);break a;case 14:b=ni(null,b,d,ya(d.type,a),c);break a}throw Error(m(306,d,""));}return b;case 0:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ya(d,e),zf(a,b,d,e,c);
case 1:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ya(d,e),ri(a,b,d,e,c);case 3:a:{si(b);if(null===a)throw Error(m(387));d=b.pendingProps;f=b.memoizedState;e=f.element;Fh(a,b);wd(b,d,null,c);var g=b.memoizedState;d=g.element;if(f.isDehydrated)if(f={element:d,isDehydrated:!1,cache:g.cache,pendingSuspenseBoundaries:g.pendingSuspenseBoundaries,transitions:g.transitions},b.updateQueue.baseState=f,b.memoizedState=f,b.flags&256){e=Ub(Error(m(423)),b);b=ti(a,b,d,c,e);break a}else if(d!==e){e=
Ub(Error(m(424)),b);b=ti(a,b,d,c,e);break a}else for(fa=Ka(b.stateNode.containerInfo.firstChild),la=b,D=!0,wa=null,c=li(b,null,d,c),b.child=c;c;)c.flags=c.flags&-3|4096,c=c.sibling;else{Qb();if(d===e){b=Qa(a,b,c);break a}aa(a,b,d,c)}b=b.child}return b;case 5:return Ih(b),null===a&&Xe(b),d=b.type,e=b.pendingProps,f=null!==a?a.memoizedProps:null,g=e.children,Qe(d,e)?g=null:null!==f&&Qe(d,f)&&(b.flags|=32),qi(a,b),aa(a,b,g,c),b.child;case 6:return null===a&&Xe(b),null;case 13:return ui(a,b,c);case 4:return gf(b,
b.stateNode.containerInfo),d=b.pendingProps,null===a?b.child=Vb(b,null,d,c):aa(a,b,d,c),b.child;case 11:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ya(d,e),mi(a,b,d,e,c);case 7:return aa(a,b,b.pendingProps,c),b.child;case 8:return aa(a,b,b.pendingProps.children,c),b.child;case 12:return aa(a,b,b.pendingProps.children,c),b.child;case 10:a:{d=b.type._context;e=b.pendingProps;f=b.memoizedProps;g=e.value;y(ud,d._currentValue);d._currentValue=g;if(null!==f)if(ua(f.value,g)){if(f.children===
e.children&&!S.current){b=Qa(a,b,c);break a}}else for(f=b.child,null!==f&&(f.return=b);null!==f;){var h=f.dependencies;if(null!==h){g=f.child;for(var k=h.firstContext;null!==k;){if(k.context===d){if(1===f.tag){k=Pa(-1,c&-c);k.tag=2;var l=f.updateQueue;if(null!==l){l=l.shared;var p=l.pending;null===p?k.next=k:(k.next=p.next,p.next=k);l.pending=k}}f.lanes|=c;k=f.alternate;null!==k&&(k.lanes|=c);df(f.return,c,b);h.lanes|=c;break}k=k.next}}else if(10===f.tag)g=f.type===b.type?null:f.child;else if(18===
f.tag){g=f.return;if(null===g)throw Error(m(341));g.lanes|=c;h=g.alternate;null!==h&&(h.lanes|=c);df(g,c,b);g=f.sibling}else g=f.child;if(null!==g)g.return=f;else for(g=f;null!==g;){if(g===b){g=null;break}f=g.sibling;if(null!==f){f.return=g.return;g=f;break}g=g.return}f=g}aa(a,b,e.children,c);b=b.child}return b;case 9:return e=b.type,d=b.pendingProps.children,Sb(b,c),e=qa(e),d=d(e),b.flags|=1,aa(a,b,d,c),b.child;case 14:return d=b.type,e=ya(d,b.pendingProps),e=ya(d.type,e),ni(a,b,d,e,c);case 15:return oi(a,
b,b.type,b.pendingProps,c);case 17:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ya(d,e),Fd(a,b),b.tag=1,ea(d)?(a=!0,ld(b)):a=!1,Sb(b,c),ei(b,d,e),uf(b,d,e,c),Af(null,b,d,!0,a,c);case 19:return wi(a,b,c);case 22:return pi(a,b,c)}throw Error(m(156,b.tag));};var pa=function(a,b,c,d){return new Tk(a,b,c,d)},aj="function"===typeof reportError?reportError:function(a){console.error(a)};Ud.prototype.render=Xf.prototype.render=function(a){var b=this._internalRoot;if(null===b)throw Error(m(409));
Sd(a,b,null,null)};Ud.prototype.unmount=Xf.prototype.unmount=function(){var a=this._internalRoot;if(null!==a){this._internalRoot=null;var b=a.containerInfo;yb(function(){Sd(null,a,null,null)});b[Ja]=null}};Ud.prototype.unstable_scheduleHydration=function(a){if(a){var b=nl();a={blockedOn:null,target:a,priority:b};for(var c=0;c<Ya.length&&0!==b&&b<Ya[c].priority;c++);Ya.splice(c,0,a);0===c&&Hg(a)}};var Cj=function(a){switch(a.tag){case 3:var b=a.stateNode;if(b.current.memoizedState.isDehydrated){var c=
hc(b.pendingLanes);0!==c&&(xe(b,c|1),ia(b,P()),0===(p&6)&&(Hc(),db()))}break;case 13:yb(function(){var b=Oa(a,1);if(null!==b){var c=Z();xa(b,a,1,c)}}),Wf(a,1)}};var Gg=function(a){if(13===a.tag){var b=Oa(a,134217728);if(null!==b){var c=Z();xa(b,a,134217728,c)}Wf(a,134217728)}};var xj=function(a){if(13===a.tag){var b=hb(a),c=Oa(a,b);if(null!==c){var d=Z();xa(c,a,b,d)}Wf(a,b)}};var nl=function(){return z};var wj=function(a,b){var c=z;try{return z=a,b()}finally{z=c}};se=function(a,b,c){switch(b){case "input":le(a,
c);b=c.name;if("radio"===c.type&&null!=b){for(c=a;c.parentNode;)c=c.parentNode;c=c.querySelectorAll("input[name="+JSON.stringify(""+b)+'][type="radio"]');for(b=0;b<c.length;b++){var d=c[b];if(d!==a&&d.form===a.form){var e=Rc(d);if(!e)throw Error(m(90));jg(d);le(d,e)}}}break;case "textarea":og(a,c);break;case "select":b=c.value,null!=b&&Db(a,!!c.multiple,b,!1)}};(function(a,b,c){xg=a;yg=c})(Tf,function(a,b,c,d,e){var f=z,g=ca.transition;try{return ca.transition=null,z=1,a(b,c,d,e)}finally{z=f,ca.transition=
g,0===p&&Hc()}},yb);var ol={usingClientEntryPoint:!1,Events:[ec,Ib,Rc,ug,vg,Tf]};(function(a){a={bundleType:a.bundleType,version:a.version,rendererPackageName:a.rendererPackageName,rendererConfig:a.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:Sa.ReactCurrentDispatcher,findHostInstanceByFiber:Xk,
findFiberByHostInstance:a.findFiberByHostInstance||Yk,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1"};if("undefined"===typeof __REACT_DEVTOOLS_GLOBAL_HOOK__)a=!1;else{var b=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(b.isDisabled||!b.supportsFiber)a=!0;else{try{Uc=b.inject(a),Ca=b}catch(c){}a=b.checkDCE?!0:!1}}return a})({findFiberByHostInstance:ob,bundleType:0,version:"18.3.1-next-f1338f8080-20240426",
rendererPackageName:"react-dom"});Q.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=ol;Q.createPortal=function(a,b){var c=2<arguments.length&&void 0!==arguments[2]?arguments[2]:null;if(!Yf(b))throw Error(m(200));return Wk(a,b,null,c)};Q.createRoot=function(a,b){if(!Yf(a))throw Error(m(299));var c=!1,d="",e=aj;null!==b&&void 0!==b&&(!0===b.unstable_strictMode&&(c=!0),void 0!==b.identifierPrefix&&(d=b.identifierPrefix),void 0!==b.onRecoverableError&&(e=b.onRecoverableError));b=Vf(a,1,!1,null,null,
c,!1,d,e);a[Ja]=b.current;sc(8===a.nodeType?a.parentNode:a);return new Xf(b)};Q.findDOMNode=function(a){if(null==a)return null;if(1===a.nodeType)return a;var b=a._reactInternals;if(void 0===b){if("function"===typeof a.render)throw Error(m(188));a=Object.keys(a).join(",");throw Error(m(268,a));}a=Bg(b);a=null===a?null:a.stateNode;return a};Q.flushSync=function(a){return yb(a)};Q.hydrate=function(a,b,c){if(!Vd(b))throw Error(m(200));return Wd(null,a,b,!0,c)};Q.hydrateRoot=function(a,b,c){if(!Yf(a))throw Error(m(405));
var d=null!=c&&c.hydratedSources||null,e=!1,f="",g=aj;null!==c&&void 0!==c&&(!0===c.unstable_strictMode&&(e=!0),void 0!==c.identifierPrefix&&(f=c.identifierPrefix),void 0!==c.onRecoverableError&&(g=c.onRecoverableError));b=Wi(b,null,a,1,null!=c?c:null,e,!1,f,g);a[Ja]=b.current;sc(a);if(d)for(a=0;a<d.length;a++)c=d[a],e=c._getVersion,e=e(c._source),null==b.mutableSourceEagerHydrationData?b.mutableSourceEagerHydrationData=[c,e]:b.mutableSourceEagerHydrationData.push(c,e);return new Ud(b)};Q.render=
function(a,b,c){if(!Vd(b))throw Error(m(200));return Wd(null,a,b,!1,c)};Q.unmountComponentAtNode=function(a){if(!Vd(a))throw Error(m(40));return a._reactRootContainer?(yb(function(){Wd(null,null,a,!1,function(){a._reactRootContainer=null;a[Ja]=null})}),!0):!1};Q.unstable_batchedUpdates=Tf;Q.unstable_renderSubtreeIntoContainer=function(a,b,c,d){if(!Vd(c))throw Error(m(200));if(null==a||void 0===a._reactInternals)throw Error(m(38));return Wd(a,b,c,!1,d)};Q.version="18.3.1-next-f1338f8080-20240426"});
})();


// =====================================================
// 模块: app/ui/hooks/useSettings.js
// =====================================================

// ==================== Settings Hook ====================
// 管理设置状态的 React Hook

(function() {
    'use strict';
    
    /**
     * Settings Hook
     * @returns {Object} 设置状态和方法
     */
    function useSettings() {
        const [settings, setSettings] = React.useState({
            model: 'auto',
            temperature: 0.7,
            maxTokens: 4096,
            providers: []
        });
        
        const [isLoading, setIsLoading] = React.useState(true);
        
        // 加载设置
        React.useEffect(() => {
            loadSettings();
        }, []);
        
        async function loadSettings() {
            try {
                setIsLoading(true);
                
                // 从 StorageManager 加载设置
                let settings = {};
                if (window.StorageManager) {
                    settings = {
                        model: window.StorageManager.getState('config.model') || 'auto',
                        temperature: window.StorageManager.getState('config.temperature') || 0.7,
                        maxTokens: window.StorageManager.getState('config.maxTokens') || 4096
                    };
                    console.log('[useSettings] 📦 从 StorageManager 加载设置');
                }
                
                const providers = ProviderManager.getAllProviders();
                
                setSettings({
                    ...settings,
                    providers: providers || []
                });
                
                // 触发配置更新事件，通知其他组件
                if (window.EventManager && settings.model) {
                    window.EventManager.emit('SETTINGS_UPDATED', {
                        defaultModel: settings.model,
                        temperature: settings.temperature,
                        maxTokens: settings.maxTokens
                    });
                    console.log('[useSettings] 📢 初始化时触发 SETTINGS_UPDATED 事件');
                }
                
            } catch (error) {
                console.error('[useSettings] 加载设置失败:', error);
            } finally {
                setIsLoading(false);
            }
        }
        
        // 保存设置
        async function saveSettings(newSettings) {
            try {
                setIsLoading(true);
                
                // 保存到 StorageManager
                if (window.StorageManager) {
                    if (newSettings.model !== undefined) {
                        window.StorageManager.setState('config.model', newSettings.model);
                    }
                    if (newSettings.temperature !== undefined) {
                        window.StorageManager.setState('config.temperature', newSettings.temperature);
                    }
                    if (newSettings.maxTokens !== undefined) {
                        window.StorageManager.setState('config.maxTokens', newSettings.maxTokens);
                    }
                    console.log('[useSettings] 💾 设置已保存到 StorageManager');
                }
                
                // 更新状态
                setSettings(prev => ({ ...prev, ...newSettings }));
                
                // 触发配置更新事件，通知其他组件
                if (window.EventManager) {
                    window.EventManager.emit('SETTINGS_UPDATED', {
                        defaultModel: newSettings.model,
                        temperature: newSettings.temperature,
                        maxTokens: newSettings.maxTokens
                    });
                    console.log('[useSettings] 📢 已触发 SETTINGS_UPDATED 事件');
                }
                
                console.log('[useSettings] ✅ 设置已保存');
                
            } catch (error) {
                console.error('[useSettings] 保存设置失败:', error);
                throw error;
            } finally {
                setIsLoading(false);
            }
        }
        
        // 添加供应商
        async function addProvider(providerData) {
            try {
                await ProviderManager.addProvider(providerData);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 供应商已添加');
                
            } catch (error) {
                console.error('[useSettings] 添加供应商失败:', error);
                throw error;
            }
        }
        
        // 删除供应商
        async function deleteProvider(providerId) {
            try {
                await ProviderManager.deleteProvider(providerId);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 供应商已删除');
                
            } catch (error) {
                console.error('[useSettings] 删除供应商失败:', error);
                throw error;
            }
        }
        
        // 添加模型到供应商
        async function addModelToProvider(providerId, modelData) {
            try {
                await ProviderManager.addModelsToProvider(providerId, [modelData]);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 模型已添加');
                
            } catch (error) {
                console.error('[useSettings] 添加模型失败:', error);
                throw error;
            }
        }
        
        // P2: 更新供应商（包括 API Key）
        async function updateProvider(providerId, updates) {
            try {
                await ProviderManager.updateProvider(providerId, updates);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 供应商已更新');
                
            } catch (error) {
                console.error('[useSettings] 更新供应商失败:', error);
                throw error;
            }
        }
        
        // P2: 刷新供应商模型
        async function refreshProviderModels(providerId) {
            try {
                const result = await ProviderManager.refreshProviderModels(providerId);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 模型已刷新', result);
                return result;
                
            } catch (error) {
                console.error('[useSettings] 刷新模型失败:', error);
                throw error;
            }
        }
        
        // P2: 切换模型启用状态
        async function toggleModelEnabled(providerId, modelId, currentEnabled) {
            try {
                const provider = ProviderManager.getProviderById(providerId);
                if (!provider) throw new Error('供应商不存在');
                
                const models = provider.models.map(m => 
                    m.id === modelId ? { ...m, enabled: !currentEnabled } : m
                );
                
                await ProviderManager.updateProvider(providerId, { models });
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 模型状态已更新');
                
            } catch (error) {
                console.error('[useSettings] 更新模型状态失败:', error);
                throw error;
            }
        }
        
        // P2: 切换供应商启用状态
        async function toggleProviderEnabled(providerId, enabled) {
            try {
                await ProviderManager.toggleProviderEnabled(providerId, enabled);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 供应商状态已更新');
                
            } catch (error) {
                console.error('[useSettings] 更新供应商状态失败:', error);
                throw error;
            }
        }
        
        return {
            settings,
            isLoading,
            saveSettings,
            addProvider,
            updateProvider,  // P2: 更新供应商
            deleteProvider,
            toggleProviderEnabled,  // P2: 切换供应商启用状态
            addModelToProvider,
            refreshProviderModels,  // P2: 刷新模型
            toggleModelEnabled,  // P2: 切换模型状态
            reloadSettings: loadSettings
        };
    }
    
    // 暴露到全局
    window.useSettings = useSettings;
    
})();


// =====================================================
// 模块: app/ui/hooks/useAgent.js
// =====================================================

// ==================== Agent Hook ====================
// 连接 WebAgentClient，处理消息发送和流式更新

(function() {
    'use strict';
    
    /**
     * Agent Hook
     * @returns {Object} Agent 状态和方法
     */
    function useAgent() {
        const [messages, setMessages] = React.useState([]);
        const [isProcessing, setIsProcessing] = React.useState(false);
        const [streamingMessageId, setStreamingMessageId] = React.useState(null);
        const [currentModel, setCurrentModel] = React.useState('auto');
        const [availableModels, setAvailableModels] = React.useState([]);
        
        // P0: 动态获取 WebAgentClient 和 EventManager（每次调用时获取最新引用）
        const getWebAgentClient = () => window.WebAgentClient;
        const getEventManager = () => window.EventManager;
        
        // 监听配置更新事件，同步模型选择
        React.useEffect(() => {
            console.log('[useAgent] 🔔 注册配置更新监听器');
            
            const EventManager = getEventManager();
            if (!EventManager) {
                console.warn('[useAgent] ⚠️ EventManager 未加载，无法监听配置更新');
                return;
            }
            
            // 监听 SETTINGS_UPDATED 事件
            const settingsUpdatedId = EventManager.on('SETTINGS_UPDATED', (data) => {
                console.log('[useAgent] 📨 收到 SETTINGS_UPDATED 事件:', data);
                
                // 如果配置中包含 defaultModel，更新 currentModel
                if (data && data.defaultModel) {
                    setCurrentModel(data.defaultModel);
                    console.log('[useAgent] ✅ 模型已同步:', data.defaultModel);
                }
            });
            
            // 初始化时从 StorageManager 加载一次
            if (window.StorageManager) {
                const savedModel = window.StorageManager.getState('config.model');
                if (savedModel) {
                    setCurrentModel(savedModel);
                    console.log('[useAgent] 📂 初始化加载模型:', savedModel);
                }
            }
            
            return () => {
                EventManager.off('SETTINGS_UPDATED', settingsUpdatedId);
                console.log('[useAgent] 🗑️ 注销配置更新监听器');
            };
        }, []);
        
        // 加载历史消息 + 监听会话恢复事件（P2: 由 WebAgentClient 统一管理，这里只监听事件）
        React.useEffect(() => {
            console.log('[useAgent] 🔄 组件挂载，开始加载历史');
            
            // P2: 从 AIAgent 获取当前历史（如果已初始化）
            const loadHistoryFromAIAgent = () => {
                const AIAgent = window.AIAgent;
                if (AIAgent && AIAgent.getState) {
                    try {
                        const agentState = AIAgent.getState();
                        console.log('[useAgent] 🔍 检查 AIAgent 状态:', {
                            isInitialized: agentState.isInitialized,
                            historyLength: agentState.history?.length || 0
                        });
                        
                        if (agentState.history && agentState.history.length > 0) {
                            // 将 AIAgent 历史转换为 UI 消息格式
                            const uiMessages = agentState.history.map((msg, index) => ({
                                id: msg.id || `msg_${index}_${Date.now()}`,
                                role: msg.role,
                                content: msg.content,
                                timestamp: msg.timestamp || new Date().toISOString(),
                                isStreaming: false
                            }));
                            setMessages(uiMessages);
                            console.log('[useAgent] 📂 从 AIAgent 恢复', uiMessages.length, '条历史消息');
                            return true; // 成功加载
                        } else {
                            console.log('[useAgent] ℹ️ AIAgent 没有历史消息');
                            return false;
                        }
                    } catch (error) {
                        console.warn('[useAgent] ⚠️ 从 AIAgent 加载历史失败:', error);
                        return false;
                    }
                } else {
                    console.warn('[useAgent] ⚠️ AIAgent 未就绪');
                    return false;
                }
            };
            
            // P2: 监听会话恢复事件
            let sessionRestoredHandler = null;
            if (window.EventManager) {
                sessionRestoredHandler = (data) => {
                    console.log('[useAgent] 📂 会话已恢复，重新加载历史');
                    setTimeout(() => {
                        loadHistoryFromAIAgent();
                    }, 50);
                };
                
                window.EventManager.on(EventManager.EventTypes.SESSION_RESTORED, sessionRestoredHandler);
            }
            
            // 尝试立即加载历史（此时应该已经初始化完成）
            loadHistoryFromAIAgent();
            
            // 加载模型列表
            loadModels();
            
            // 清理函数：组件卸载时移除事件监听器
            return () => {
                if (sessionRestoredHandler) {
                    window.EventManager.off(EventManager.EventTypes.SESSION_RESTORED, sessionRestoredHandler);
                }
            };
        }, []);
        
        async function loadModels() {
            try {
                // 从 StorageManager 获取当前模型
                let model = 'auto';
                if (window.StorageManager) {
                    const savedModel = window.StorageManager.getState('settings.defaultModel');
                    if (savedModel) {
                        model = savedModel;
                        console.log('[useAgent] 📦 从 StorageManager 加载模型:', model);
                    }
                }
                setCurrentModel(model);
                
                // 从 ProviderManager 获取可用模型列表
                if (!ProviderManager) {
                    console.warn('[useAgent] ProviderManager 未加载');
                    return;
                }
                
                // 等待 ProviderManager 初始化完成
                let retryCount = 0;
                const maxRetries = 10;
                while (retryCount < maxRetries) {
                    const providers = ProviderManager.getAllProviders();
                    if (providers && providers.length > 0) {
                        break;
                    }
                    
                    console.log(`[useAgent] ⏳ 等待 ProviderManager 初始化... (${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    retryCount++;
                }
                
                const providers = ProviderManager.getAllProviders();
                if (!providers || providers.length === 0) {
                    console.warn('[useAgent] ProviderManager 没有可用的提供商');
                    return;
                }
                
                const models = [];
                
                // 添加 auto 选项
                models.push({ id: 'auto', name: '🚀 Auto (自动选择)', provider: 'System', invalid: false });
                
                // 收集所有供应商的模型
                providers.forEach(provider => {
                    if (provider.models && provider.models.length > 0) {
                        provider.models.forEach(model => {
                            if (model.enabled) {
                                models.push({
                                    id: model.id,
                                    name: `${model.name || model.id} (${provider.name})`,
                                    provider: provider.name,
                                    invalid: model.invalid || false  // P2: 标记无效模型
                                });
                            }
                        });
                    }
                });
                
                // P2: 排序 - 有效模型在前，无效模型在后
                models.sort((a, b) => {
                    if (a.invalid === b.invalid) return 0;
                    return a.invalid ? 1 : -1;
                });
                
                setAvailableModels(models);
                console.log('[useAgent] ✅ 加载了', models.length, '个模型');
            } catch (error) {
                console.error('[useAgent] 加载模型列表失败:', error);
            }
        }
        
        async function loadHistory() {
            try {
                // 从 StorageManager 加载保存的会话消息
                if (window.StorageManager) {
                    const savedMessages = window.StorageManager.getState('session.messages');
                    if (savedMessages && Array.isArray(savedMessages)) {
                        setMessages(savedMessages);
                        console.log('[useAgent] 📂 已恢复', savedMessages.length, '条历史消息');
                    }
                }
            } catch (error) {
                console.error('[useAgent] 加载历史失败:', error);
            }
        }
        
        // 发送消息
        async function sendMessage(userMessage) {
            console.log('[useAgent] 📤 sendMessage 被调用');
            console.log('[useAgent] 📋 消息:', userMessage.substring(0, 100));
            console.log('[useAgent] 🔧 WebAgentClient 存在:', !!WebAgentClient);
            console.log('[useAgent] 🔧 isProcessing:', isProcessing);
            
            if (!userMessage.trim() || isProcessing) return;
            
            try {
                setIsProcessing(true);
                
                // 添加用户消息到列表
                const userMsg = {
                    id: 'user_' + Date.now(),
                    role: 'user',
                    content: userMessage,
                    timestamp: new Date().toISOString()
                };
                
                setMessages(prev => [...prev, userMsg]);
                
                // 创建 AI 消息占位符
                const aiMessageId = 'ai_' + Date.now();
                setStreamingMessageId(aiMessageId);
                
                const aiMsg = {
                    id: aiMessageId,
                    role: 'assistant',
                    content: '',
                    isStreaming: true,
                    timestamp: new Date().toISOString()
                };
                
                setMessages(prev => [...prev, aiMsg]);
                
                // 通过 WebAgentClient 发送消息
                const WebAgentClient = getWebAgentClient();
                console.log('[useAgent] 🚀 调用 WebAgentClient.handleUserMessage...');
                if (WebAgentClient && WebAgentClient.handleUserMessage) {
                    try {
                        await WebAgentClient.handleUserMessage(userMessage);
                        console.log('[useAgent] ✅ WebAgentClient.handleUserMessage 返回');
                        // 注意：isProcessing 和 streamingMessageId 由 MESSAGE_COMPLETE 事件处理
                    } catch (error) {
                        console.error('[useAgent] ❌ WebAgentClient 处理失败:', error);
                        setIsProcessing(false);
                        setStreamingMessageId(null);
                        throw error;
                    }
                } else {
                    console.error('[useAgent] ❌ WebAgentClient 或 handleUserMessage 不存在');
                    setIsProcessing(false);
                    setStreamingMessageId(null);
                }
                
            } catch (error) {
                console.error('[useAgent] 发送消息失败:', error);
                setIsProcessing(false);
                setStreamingMessageId(null);
            }
        }
        
        // 更新流式消息内容（追加模式）
        function updateStreamingMessage(messageId, chunk) {
            setMessages(prev => prev.map(msg => 
                msg.id === messageId 
                    ? { ...msg, content: msg.content + chunk, isStreaming: true }
                    : msg
            ));
        }
        
        // 完成流式消息
        function finalizeMessage(messageId) {
            setMessages(prev => prev.map(msg => 
                msg.id === messageId 
                    ? { ...msg, isStreaming: false }
                    : msg
            ));
            setIsProcessing(false);
            setStreamingMessageId(null);
        }
        
        // 清空聊天
        function clearChat() {
            const WebAgentClient = getWebAgentClient();
            if (WebAgentClient && WebAgentClient.handleClearChat) {
                WebAgentClient.handleClearChat();
            }
            setMessages([]);
        }
        
        // 停止生成
        function stopGeneration() {
            const WebAgentClient = getWebAgentClient();
            if (WebAgentClient && WebAgentClient.stopGeneration) {
                WebAgentClient.stopGeneration();
            }
            setIsProcessing(false);
            setStreamingMessageId(null);
        }
        
        // 切换模型
        async function switchModel(modelId) {
            try {
                setCurrentModel(modelId);
                
                // 保存到 StorageManager
                if (window.StorageManager) {
                    window.StorageManager.setState('config.model', modelId);
                    console.log('[useAgent] 💾 模型已保存到 StorageManager:', modelId);
                }
                
                // 通知 WebAgentClient 更新配置（持久化到 AIAgent）
                const WebAgentClient = getWebAgentClient();
                if (WebAgentClient && WebAgentClient.updateSettings) {
                    WebAgentClient.updateSettings({
                        defaultModel: modelId
                    });
                    console.log('[useAgent] 🔄 已通知 WebAgentClient 更新模型:', modelId);
                }
                
            } catch (error) {
                console.error('[useAgent] 切换模型失败:', error);
            }
        }
        
        // 监听消息更新事件
        React.useEffect(() => {
            const EventManager = getEventManager();
            if (!EventManager) {
                console.warn('[useAgent] ⚠️ EventManager 未加载');
                return;
            }
            
            // 监听流式消息更新
            const onStreamingId = EventManager.on(EventManager.EventTypes.MESSAGE_STREAMING, (data) => {
                if (streamingMessageId && data.chunk) {
                    // 使用函数式更新，确保获取最新的 messages 状态
                    setMessages(prev => prev.map(msg => 
                        msg.id === streamingMessageId 
                            ? { ...msg, content: msg.content + data.chunk, isStreaming: true }
                            : msg
                    ));
                }
            });
            
            // 监听消息完成
            const onCompleteId = EventManager.on(EventManager.EventTypes.MESSAGE_COMPLETE, (data) => {
                console.log('[useAgent] 📨 收到 MESSAGE_COMPLETE 事件');
                console.log('[useAgent] 🔍 streamingMessageId:', streamingMessageId);
                console.log('[useAgent] 🔍 data.result:', data.result ? '存在' : '不存在');
                console.log('[useAgent] 🔍 data.result.content 长度:', data.result?.content?.length || 0);
                
                if (streamingMessageId && data.result) {
                    console.log('[useAgent] ✅ 开始更新消息', streamingMessageId);
                    setMessages(prev => {
                        console.log('[useAgent] 📋 当前 messages 数量:', prev.length);
                        const updated = prev.map(msg => {
                            if (msg.id === streamingMessageId) {
                                console.log('[useAgent] ✏️ 找到匹配的消息，更新内容');
                                console.log('[useAgent] 📄 新内容长度:', data.result.content.length);
                                return { 
                                    ...msg, 
                                    isStreaming: false,
                                    content: data.result.content || msg.content
                                };
                            }
                            return msg;
                        });
                        console.log('[useAgent] ✅ 消息更新完成');
                        return updated;
                    });
                    console.log('[useAgent] ✅ 消息完成，内容长度:', (data.result.content || '').length);
                    setIsProcessing(false);
                    setStreamingMessageId(null);
                    console.log('[useAgent] 🧹 streamingMessageId 已清空');
                } else {
                    console.warn('[useAgent] ⚠️ MESSAGE_COMPLETE 被忽略:', {
                        hasStreamingId: !!streamingMessageId,
                        hasResult: !!data.result
                    });
                }
            });
            
            // 监听消息错误
            const onErrorId = EventManager.on(EventManager.EventTypes.MESSAGE_ERROR, (data) => {
                console.error('[useAgent] 消息错误:', data.error);
                setIsProcessing(false);
                setStreamingMessageId(null);
            });
            
            // P2: 监听单个代码执行完成，更新 UI
            const onCodeExecutedId = EventManager.on(EventManager.EventTypes.CODE_EXECUTED, (data) => {
                console.log('[useAgent] ✅ 代码执行完成:', data.blockId);
                // 注意：代码执行结果由 WebAgentClient 自动反馈给大模型
                // 这里只需要记录日志，不需要更新 UI（UI 由 MESSAGE_COMPLETE 更新）
            });
            
            // 注意：SESSION_RESTORED 监听器已在第一个 useEffect 中注册，无需重复注册
            
            // P0: 监听代码批量执行完成
            const onCodeBatchId = EventManager.on(EventManager.EventTypes.CODE_BATCH_EXECUTED, (data) => {
                console.log('[useAgent] 📊 代码批量执行完成', data.results.length, '个结果');
                console.log('[useAgent] 🔄 准备接收最终回复，创建新的消息占位符');
                
                // 创建新的 AI 消息占位符（用于接收最终回复）
                const aiMessageId = 'ai_' + Date.now();
                setStreamingMessageId(aiMessageId);
                
                const aiMsg = {
                    id: aiMessageId,
                    role: 'assistant',
                    content: '',
                    isStreaming: true,
                    timestamp: new Date().toISOString()
                };
                
                setMessages(prev => [...prev, aiMsg]);
                console.log('[useAgent] ✅ 新消息占位符已创建:', aiMessageId);
            });
            
            return () => {
                EventManager.off(EventManager.EventTypes.MESSAGE_STREAMING, onStreamingId);
                EventManager.off(EventManager.EventTypes.MESSAGE_COMPLETE, onCompleteId);
                EventManager.off(EventManager.EventTypes.MESSAGE_ERROR, onErrorId);
                EventManager.off(EventManager.EventTypes.CODE_EXECUTED, onCodeExecutedId);
                EventManager.off(EventManager.EventTypes.CODE_BATCH_EXECUTED, onCodeBatchId);
            };
        }, [streamingMessageId]);
        
        return {
            messages,
            isProcessing,
            streamingMessageId,
            currentModel,
            availableModels,
            sendMessage,
            clearChat,
            stopGeneration,
            switchModel,
            reloadHistory: loadHistory,
            reloadModels: loadModels  // P2: 暴露重新加载模型的方法
        };
    }
    
    // 暴露到全局
    window.useAgent = useAgent;
    
})();


// =====================================================
// 模块: app/ui/components/MessageItem.jsx
// =====================================================

// ==================== Message Item Component ====================
// 单条消息组件（用户/AI）

(function() {
    'use strict';
    
    /**
     * P0: 生成稳定的代码块 ID（基于代码内容）
     * @param {string} code - 代码内容
     * @returns {string} 稳定的 ID
     */
    function generateCodeId(code) {
        // 使用简单的 hash 算法，基于代码内容生成稳定 ID
        let hash = 0;
        for (let i = 0; i < code.length; i++) {
            const char = code.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 'code_' + Math.abs(hash).toString(36);
    }
    
    /**
     * 渲染代码块
     */
    function renderCodeBlock(code, language, messageId) {
        // P0: 必须 trim()，与 WebAgentClient 保持一致
        const trimmedCode = code.trim();
        const codeId = generateCodeId(trimmedCode); // 使用稳定的 ID
        const isRunjs = language === 'runjs';
        
        // P0: 检查是否高危（需要 WebAgentClient）
        let isHighRisk = false;
        let riskType = null;
        if (isRunjs && window.WebAgentClient) {
            const CodeExecutor = window.AIAgent?.getDependencies?.()?.CodeExecutor;
            if (CodeExecutor) {
                isHighRisk = CodeExecutor.isHighRiskCode(code);
                riskType = isHighRisk ? CodeExecutor.getHighRiskType(code) : null;
            }
        }
        
        return React.createElement('div', { 
            key: codeId,
            className: 'code-block',
            'data-code-id': codeId,
            style: {
                background: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
                margin: '10px 0',
                overflow: 'hidden'
            }
        }, [
            React.createElement('div', {
                key: 'header',
                style: {
                    background: '#e0e0e0',
                    padding: '5px 10px',
                    fontSize: '12px',
                    color: '#666',
                    borderBottom: '1px solid #ddd',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }
            }, [
                React.createElement('span', { key: 'lang' }, language || 'text'),
                
                // P0: 高危代码执行按钮
                isHighRisk ? React.createElement('button', {
                    key: 'execute-btn',
                    className: 'btn-execute-high-risk',
                    onClick: () => executeHighRiskCode(code, codeId),
                    style: {
                        padding: '3px 8px',
                        fontSize: '11px',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                    }
                }, '⚠️ 执行高危代码') : null,
                
                // P0: 执行状态
                React.createElement('span', {
                    key: 'status',
                    className: 'code-execution-status',
                    'data-code-id': codeId,
                    style: {
                        fontSize: '11px',
                        color: '#6c757d'
                    }
                }, isRunjs ? '等待执行...' : '')
            ]),
            React.createElement('pre', {
                key: 'code',
                style: {
                    padding: '10px',
                    overflow: 'auto',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    margin: 0
                }
            }, code),
            
            // P0: 执行结果区域
            React.createElement('div', {
                key: 'result',
                className: 'code-execution-result',
                'data-code-id': codeId,
                style: {
                    padding: '8px 10px',
                    background: '#fff',
                    borderTop: '1px solid #ddd',
                    fontSize: '12px',
                    display: 'none'  // 默认隐藏，有结果时显示
                }
            }, '')
        ]);
    }
    
    /**
     * P0: 执行高危代码
     */
    function executeHighRiskCode(code, codeId) {
        if (!window.WebAgentClient || !window.WebAgentClient.executeHighRiskCode) {
            console.error('[MessageItem] WebAgentClient 未就绪');
            return;
        }
        
        // 更新状态为执行中
        updateCodeStatus(codeId, 'executing');
        
        window.WebAgentClient.executeHighRiskCode(code, codeId)
            .then(result => {
                updateCodeStatus(codeId, 'completed', result.result);
            })
            .catch(error => {
                updateCodeStatus(codeId, 'failed', error.message);
            });
    }
    
    /**
     * P0: 更新代码执行状态
     */
    function updateCodeStatus(codeId, status, result = null) {
        const statusEl = document.querySelector(`.code-execution-status[data-code-id="${codeId}"]`);
        const resultEl = document.querySelector(`.code-execution-result[data-code-id="${codeId}"]`);
        
        if (!statusEl || !resultEl) return;
        
        switch (status) {
            case 'executing':
                statusEl.textContent = '⏳ 执行中...';
                statusEl.style.color = '#004085';
                break;
            case 'completed':
                statusEl.textContent = '✅ 执行成功';
                statusEl.style.color = '#155724';
                resultEl.style.display = 'block';
                resultEl.textContent = String(result);
                break;
            case 'failed':
                statusEl.textContent = '❌ 执行失败';
                statusEl.style.color = '#721c24';
                resultEl.style.display = 'block';
                resultEl.textContent = String(result);
                break;
        }
    }
    
    /**
     * 解析消息内容（提取代码块）
     */
    function parseMessageContent(content, messageId) {
        if (!content) return [];
        
        const elements = [];
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;
        
        while ((match = codeBlockRegex.exec(content)) !== null) {
            // 添加代码块前的文本
            if (match.index > lastIndex) {
                const text = content.substring(lastIndex, match.index);
                if (text.trim()) {
                    elements.push(React.createElement('p', { key: 'text_' + lastIndex }, text));
                }
            }
            
            // 添加代码块
            // P0: 必须 trim()，与 WebAgentClient 保持一致
            elements.push(renderCodeBlock(match[2].trim(), match[1], messageId));
            
            lastIndex = codeBlockRegex.lastIndex;
        }
        
        // 添加剩余文本
        if (lastIndex < content.length) {
            const text = content.substring(lastIndex);
            if (text.trim()) {
                elements.push(React.createElement('p', { key: 'text_end' }, text));
            }
        }
        
        return elements.length > 0 ? elements : [React.createElement('p', { key: 'default' }, content)];
    }
    
    /**
     * MessageItem 组件
     */
    function MessageItem({ message, innerRef }) {
        const isUser = message.role === 'user';
        const contentElements = parseMessageContent(message.content, message.id);
        
        // P0: 使用 ref 保存监听器 ID
        const listenerRefs = React.useRef({ executedId: null, errorId: null });
        
        // P0: 组件挂载时立即注册监听器（不依赖 useEffect）
        React.useLayoutEffect(() => {
            console.log('[MessageItem] 🔍 useLayoutEffect 执行', { messageId: message.id, isUser, role: message.role });
            
            if (!window.EventManager || isUser) {
                console.log('[MessageItem] ⚠️ 跳过监听（非 assistant 消息或 EventManager 未就绪）');
                return;
            }
            
            // 清理旧的监听器
            if (listenerRefs.current.executedId) {
                window.EventManager.off(window.EventManager.EventTypes.CODE_EXECUTED, listenerRefs.current.executedId);
            }
            if (listenerRefs.current.errorId) {
                window.EventManager.off(window.EventManager.EventTypes.CODE_EXECUTION_ERROR, listenerRefs.current.errorId);
            }
            
            const onCodeExecuted = (data) => {
                console.log('[MessageItem] 📨 收到 CODE_EXECUTED 事件:', data.blockId);
                console.log('[MessageItem] 🔍 尝试更新状态:', data.blockId);
                
                // 检查是否是当前消息的代码块
                if (data.blockId) {
                    // 检查 DOM 元素是否存在
                    const statusEl = document.querySelector(`.code-execution-status[data-code-id="${data.blockId}"]`);
                    const resultEl = document.querySelector(`.code-execution-result[data-code-id="${data.blockId}"]`);
                    
                    console.log('[MessageItem] 🔍 DOM 元素检查:', {
                        blockId: data.blockId,
                        statusElExists: !!statusEl,
                        resultElExists: !!resultEl
                    });
                    
                    if (!statusEl || !resultEl) {
                        console.warn('[MessageItem] ⚠️ DOM 元素不存在，无法更新');
                        return;
                    }
                    
                    updateCodeStatus(data.blockId, 'completed', data.result?.result);
                    console.log('[MessageItem] ✅ 状态更新完成');
                }
            };
            
            const onCodeError = (data) => {
                console.log('[MessageItem] 📨 收到 CODE_EXECUTION_ERROR 事件:', data.blockId);
                if (data.blockId) {
                    updateCodeStatus(data.blockId, 'failed', data.error?.message || data.error);
                }
            };
            
            const executedId = window.EventManager.on(window.EventManager.EventTypes.CODE_EXECUTED, onCodeExecuted);
            const errorId = window.EventManager.on(window.EventManager.EventTypes.CODE_EXECUTION_ERROR, onCodeError);
            
            listenerRefs.current = { executedId, errorId };
            
            console.log('[MessageItem] ✅ 事件监听器已注册', { executedId, errorId });
            
            return () => {
                console.log('[MessageItem] 🧹 清理事件监听器');
                if (listenerRefs.current.executedId) {
                    window.EventManager.off(window.EventManager.EventTypes.CODE_EXECUTED, listenerRefs.current.executedId);
                }
                if (listenerRefs.current.errorId) {
                    window.EventManager.off(window.EventManager.EventTypes.CODE_EXECUTION_ERROR, listenerRefs.current.errorId);
                }
            };
        }, [isUser, message.id]);
        
        return React.createElement('div', {
            ref: innerRef, // 绑定外部传入的 ref
            className: `message-item ${isUser ? 'user-message' : 'assistant-message'}`,
            style: {
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: '15px',
                padding: '0 10px'
            }
        }, [
            React.createElement('div', {
                key: 'bubble',
                className: 'message-bubble',
                style: {
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isUser ? '#007bff' : '#f0f0f0',
                    color: isUser ? 'white' : '#333',
                    wordWrap: 'break-word'
                }
            }, [
                ...contentElements,
                message.isStreaming && React.createElement('span', {
                    key: 'cursor',
                    className: 'streaming-cursor',
                    style: {
                        display: 'inline-block',
                        width: '2px',
                        height: '1em',
                        background: '#333',
                        marginLeft: '2px',
                        animation: 'blink 1s infinite'
                    }
                }, '')
            ])
        ]);
    }
    
    // 暴露到全局
    window.MessageItem = MessageItem;
    
})();


// =====================================================
// 模块: app/ui/components/ChatWindow.jsx
// =====================================================

// ==================== Chat Window Component ====================
// 聊天窗口主组件

(function() {
    'use strict';
    
    /**
     * ChatWindow 组件
     */
    function ChatWindow({ isOpen, onClose, onOpenSettings }) {
        const { 
            messages, 
            isProcessing, 
            sendMessage, 
            clearChat, 
            stopGeneration,
            currentModel,
            availableModels,
            switchModel
        } = window.useAgent();
        
        const [inputValue, setInputValue] = React.useState('');
        const messagesEndRef = React.useRef(null);
        const messagesContainerRef = React.useRef(null); // 消息容器引用
        const messageRefs = React.useRef([]); // 每条消息的 ref 数组
        const [currentMessageIndex, setCurrentMessageIndex] = React.useState(-1); // 当前聚焦的消息索引
        
        // P2: 监听模型列表更新事件，自动重新加载
        React.useEffect(() => {
            if (!window.EventManager) return;
            
            const EventManager = window.EventManager;
            
            // 监听模型更新事件
            const handleModelsUpdated = () => {
                console.log('[ChatWindow] 🔄 检测到模型列表更新，重新加载...');
                // 触发 useAgent 重新加载模型
                if (window.useAgent && window.useAgent.reloadModels) {
                    window.useAgent.reloadModels();
                }
            };
            
            // 监听供应商更新事件
            const handleProviderUpdated = () => {
                console.log('[ChatWindow] 🔄 检测到供应商更新，重新加载模型...');
                if (window.useAgent && window.useAgent.reloadModels) {
                    window.useAgent.reloadModels();
                }
            };
            
            const modelsUpdatedId = EventManager.on('agent:models:updated', handleModelsUpdated);
            const providerUpdatedId = EventManager.on('agent:provider:updated', handleProviderUpdated);
            
            return () => {
                EventManager.off('agent:models:updated', modelsUpdatedId);
                EventManager.off('agent:provider:updated', providerUpdatedId);
            };
        }, []);
        
        // 当消息列表变化时，清理无效的 ref
        React.useEffect(() => {
            // 移除超出当前消息数量的 ref
            if (messageRefs.current.length > messages.length) {
                messageRefs.current = messageRefs.current.slice(0, messages.length);
            }
            // 重置当前索引，如果超出范围
            if (currentMessageIndex >= messages.length) {
                setCurrentMessageIndex(messages.length - 1);
            }
        }, [messages]);
        
        /**
         * 聊天窗口键盘事件处理（仅在窗口打开时）
         */
        React.useEffect(() => {
            if (!isOpen) return;
            
            // 如果设置对话框打开，不处理聊天窗口快捷键（避免冲突）
            const isSettingsOpen = window.StorageManager && window.StorageManager.getState('ui.settingsVisible') === true;
            if (isSettingsOpen) {
                return;
            }
            
            function handleKeyDown(e) {
                // Escape: 停止生成或关闭窗口
                if (e.key === 'Escape') {
                    if (isProcessing) {
                        stopGeneration();
                    } else {
                        onClose();
                    }
                    e.preventDefault();
                    return;
                }
                
                // Ctrl+Enter: 发送消息
                if (e.ctrlKey && e.key === 'Enter') {
                    if (inputValue.trim() && !isProcessing) {
                        handleSend();
                    }
                    e.preventDefault();
                    return;
                }
                
                // Ctrl+ArrowUp: 导航到上一条用户消息
                if (e.ctrlKey && e.key === 'ArrowUp') {
                    // 获取所有用户消息的索引
                    const userMessageIndices = messages
                        .map((msg, idx) => msg.role === 'user' ? idx : -1)
                        .filter(idx => idx !== -1);
                    
                    if (userMessageIndices.length === 0) return;
                    
                    // 找到当前索引在用户消息列表中的位置
                    let currentUserPos = -1;
                    for (let i = 0; i < userMessageIndices.length; i++) {
                        if (userMessageIndices[i] >= currentMessageIndex) {
                            currentUserPos = i;
                            break;
                        }
                    }
                    
                    // 计算上一条用户消息的索引（循环）
                    let nextUserPos;
                    if (currentUserPos <= 0) {
                        nextUserPos = userMessageIndices.length - 1; // 循环到最后一条
                    } else {
                        nextUserPos = currentUserPos - 1;
                    }
                    
                    const targetIndex = userMessageIndices[nextUserPos];
                    const targetMessage = messageRefs.current[targetIndex];
                    if (targetMessage && typeof targetMessage.scrollIntoView === 'function') {
                        try {
                            targetMessage.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'  // 对齐到顶部
                            });
                            setCurrentMessageIndex(targetIndex);
                            console.log(`[ChatWindow] ⬆️ 导航到第 ${nextUserPos + 1}/${userMessageIndices.length} 条用户消息`);
                        } catch (err) {
                            console.warn('[ChatWindow] ⚠️ 滚动失败:', err.message);
                        }
                    } else {
                        console.warn(`[ChatWindow] ⚠️ 目标消息元素不存在 (index=${targetIndex})`);
                    }
                    
                    e.preventDefault();
                    return;
                }
                
                // Ctrl+ArrowDown: 导航到下一条用户消息
                if (e.ctrlKey && e.key === 'ArrowDown') {
                    // 获取所有用户消息的索引
                    const userMessageIndices = messages
                        .map((msg, idx) => msg.role === 'user' ? idx : -1)
                        .filter(idx => idx !== -1);
                    
                    if (userMessageIndices.length === 0) return;
                    
                    // 找到当前索引在用户消息列表中的位置
                    let currentUserPos = -1;
                    for (let i = userMessageIndices.length - 1; i >= 0; i--) {
                        if (userMessageIndices[i] <= currentMessageIndex) {
                            currentUserPos = i;
                            break;
                        }
                    }
                    
                    // 计算下一条用户消息的索引（循环）
                    let nextUserPos;
                    if (currentMessageIndex === -1 || currentUserPos === -1) {
                        // 首次按下，定位到最后一条用户消息
                        nextUserPos = userMessageIndices.length - 1;
                    } else if (currentUserPos >= userMessageIndices.length - 1) {
                        nextUserPos = 0; // 循环到第一条
                    } else {
                        nextUserPos = currentUserPos + 1;
                    }
                    
                    const targetIndex = userMessageIndices[nextUserPos];
                    const targetMessage = messageRefs.current[targetIndex];
                    if (targetMessage && typeof targetMessage.scrollIntoView === 'function') {
                        try {
                            targetMessage.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'  // 对齐到顶部
                            });
                            setCurrentMessageIndex(targetIndex);
                            console.log(`[ChatWindow] ⬇️ 导航到第 ${nextUserPos + 1}/${userMessageIndices.length} 条用户消息`);
                        } catch (err) {
                            console.warn('[ChatWindow] ⚠️ 滚动失败:', err.message);
                        }
                    } else {
                        console.warn(`[ChatWindow] ⚠️ 目标消息元素不存在 (index=${targetIndex})`);
                    }
                    
                    e.preventDefault();
                    return;
                }
            }
            
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
            };
        }, [isOpen, inputValue, isProcessing, messages, currentMessageIndex]);
        
        // 从 StorageManager 加载窗口位置和大小（如果可用）
        const loadWindowState = () => {
            if (window.StorageManager) {
                const savedPosition = window.StorageManager.getState('ui.position');
                const savedSize = window.StorageManager.getState('ui.size');
                const savedVisible = window.StorageManager.getState('ui.visible');
                
                return {
                    position: savedPosition || { x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 },
                    size: savedSize || { width: 800, height: 600 },
                    visible: savedVisible === true  // 默认隐藏，只有明确保存为 true 才显示
                };
            }
            return {
                position: { x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 },
                size: { width: 800, height: 600 },
                visible: false  // 默认隐藏
            };
        };
        
        const initialState = loadWindowState();
        const [position, setPosition] = React.useState(initialState.position);
        const [size, setSize] = React.useState(initialState.size);
        // 不再使用 isVisible 状态，直接使用 isOpen prop
        const [isDragging, setIsDragging] = React.useState(false);
        const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
        const [isResizing, setIsResizing] = React.useState(false);
        const windowRef = React.useRef(null);
        
        // 自动滚动到底部
        React.useEffect(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
        }, [messages]);
        
        // 拖拽处理
        React.useEffect(() => {
            function handleMouseMove(e) {
                if (isDragging) {
                    const newX = e.clientX - dragOffset.x;
                    const newY = e.clientY - dragOffset.y;
                    
                    // 边界检查
                    const maxX = window.innerWidth - size.width;
                    const maxY = window.innerHeight - size.height;
                    
                    const newPosition = {
                        x: Math.max(0, Math.min(newX, maxX)),
                        y: Math.max(0, Math.min(newY, maxY))
                    };
                    
                    setPosition(newPosition);
                    
                    // 保存到 StorageManager（防抖）
                    if (window.StorageManager) {
                        clearTimeout(window._savePositionTimer);
                        window._savePositionTimer = setTimeout(() => {
                            window.StorageManager.setState('ui.position', newPosition);
                        }, 300);
                    }
                }
                
                if (isResizing && windowRef.current) {
                    const newWidth = Math.max(400, e.clientX - position.x);
                    const newHeight = Math.max(300, e.clientY - position.y);
                    
                    const newSize = {
                        width: Math.min(newWidth, window.innerWidth - position.x),
                        height: Math.min(newHeight, window.innerHeight - position.y)
                    };
                    
                    setSize(newSize);
                    
                    // 保存到 StorageManager（防抖）
                    if (window.StorageManager) {
                        clearTimeout(window._saveSizeTimer);
                        window._saveSizeTimer = setTimeout(() => {
                            window.StorageManager.setState('ui.size', newSize);
                        }, 300);
                    }
                }
            }
            
            function handleMouseUp() {
                setIsDragging(false);
                setIsResizing(false);
            }
            
            if (isDragging || isResizing) {
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
            
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }, [isDragging, isResizing, dragOffset, position, size]);
        
        // 监听窗口 resize 事件，确保窗口始终在可视区域内
        React.useEffect(() => {
            function handleWindowResize() {
                // 如果正在拖拽或调整大小，跳过自动调整
                if (isDragging || isResizing) {
                    return;
                }
                
                // 确保窗口不超出边界
                const maxX = Math.max(0, window.innerWidth - size.width);
                const maxY = Math.max(0, window.innerHeight - size.height);
                
                setPosition(prev => ({
                    x: Math.min(prev.x, maxX),
                    y: Math.min(prev.y, maxY)
                }));
                
                // 如果窗口太大，缩小到合适的大小
                if (size.width > window.innerWidth - 40) {
                    setSize(prev => ({
                        ...prev,
                        width: Math.max(400, window.innerWidth - 40)
                    }));
                }
                if (size.height > window.innerHeight - 40) {
                    setSize(prev => ({
                        ...prev,
                        height: Math.max(300, window.innerHeight - 40)
                    }));
                }
            }
            
            window.addEventListener('resize', handleWindowResize);
            
            return () => {
                window.removeEventListener('resize', handleWindowResize);
            };
        }, [size]);
        
        // 开始拖拽
        function handleDragStart(e) {
            if (e.target.closest('.window-controls')) return; // 排除控制按钮区域
            setIsDragging(true);
            setDragOffset({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            });
        }
        
        // 开始调整大小
        function handleResizeStart(e) {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
        }
        
        // 处理关闭窗口
        function handleClose() {
            // 关闭窗口时删除 visible 键
            if (window.StorageManager) {
                window.StorageManager.setState('ui.visible', null);
            }
            
            if (onClose) {
                onClose();
            }
        }
        
        // 处理发送消息
        async function handleSend() {
            if (!inputValue.trim() || isProcessing) return;
            
            const message = inputValue;
            setInputValue('');
            await sendMessage(message);
        }
        
        // 处理键盘事件（仅处理 Enter 发送）
        function handleKeyDown(e) {
            // 只在输入框有焦点时处理 Enter
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation(); // 阻止事件传播到 ShortcutManager
                handleSend();
            }
            // 其他按键（包括 Ctrl+ArrowUp/Down, Escape）让 ShortcutManager 处理
        }
        
        // 渲染消息列表
        function renderMessages() {
            if (messages.length === 0) {
                return React.createElement('div', {
                    key: 'empty',
                    style: {
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: '#999'
                    }
                }, [
                    React.createElement('div', { key: 'icon', style: { fontSize: '48px', marginBottom: '10px' } }, '💬'),
                    React.createElement('p', { key: 'text' }, '开始对话吧！')
                ]);
            }
            
            return messages.map((message, index) => 
                React.createElement(window.MessageItem, {
                    key: message.id,
                    message: message,
                    // 为每条消息绑定 ref
                    innerRef: (el) => {
                        if (el) {
                            messageRefs.current[index] = el;
                        }
                    }
                })
            );
        }
        
        // 主渲染
        // 如果 isOpen 为 false，返回 null
        if (!isOpen) return null;
        
        return React.createElement('div', { 
            key: 'window',
            ref: windowRef,
            className: 'chat-window',
            style: {
                position: 'fixed',
                left: position.x + 'px',
                top: position.y + 'px',
                width: size.width + 'px',
                height: size.height + 'px',
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                zIndex: 999998
            }
        }, [
                // Header (可拖拽)
                React.createElement('div', { 
                    key: 'header',
                    onMouseDown: handleDragStart,
                    style: {
                        padding: '15px 20px',
                        borderBottom: '1px solid #eee',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'move',
                        userSelect: 'none',
                        background: '#f8f9fa'
                    }
                }, [
                    React.createElement('h2', { 
                        key: 'title',
                        style: { margin: 0, fontSize: '18px' }
                    }, '🤖 AI Agent'),
                    
                    // 模型选择框
                    React.createElement('div', {
                        key: 'model-selector',
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }
                    }, [
                        React.createElement('label', {
                            key: 'label',
                            style: {
                                fontSize: '13px',
                                color: '#666',
                                whiteSpace: 'nowrap'
                            }
                        }, '选择模型:'),
                        React.createElement('select', {
                            key: 'model-select',
                            value: currentModel,
                            onChange: (e) => switchModel(e.target.value),
                            disabled: isProcessing,
                            style: {
                                padding: '6px 12px',
                                fontSize: '13px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                background: 'white',
                                cursor: isProcessing ? 'not-allowed' : 'pointer',
                                opacity: isProcessing ? 0.6 : 1,
                                maxWidth: '200px'
                            }
                        }, [
                            availableModels.map(model => 
                                React.createElement('option', {
                                    key: model.id,
                                    value: model.id,
                                    style: {
                                        color: model.invalid ? '#999' : '#000',
                                        fontStyle: model.invalid ? 'italic' : 'normal'
                                    }
                                }, model.name + (model.invalid ? ' ⚠️' : ''))
                            )
                        ])
                    ]),
                    
                    React.createElement('div', { 
                        key: 'actions', 
                        className: 'window-controls',
                        style: { display: 'flex', gap: '10px' } 
                    }, [
                        React.createElement('button', {
                            key: 'settings',
                            onClick: onOpenSettings,
                            style: {
                                padding: '6px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                background: '#f0f0f0',
                                border: 'none',
                                borderRadius: '4px'
                            }
                        }, '⚙️ 设置'),
                        React.createElement('button', {
                            key: 'clear',
                            onClick: clearChat,
                            style: {
                                padding: '6px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                background: '#f0f0f0',
                                border: 'none',
                                borderRadius: '4px'
                            }
                        }, '🗑️ 清空'),
                        React.createElement('button', {
                            key: 'close',
                            onClick: handleClose,
                            style: {
                                padding: '6px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                background: '#f0f0f0',
                                border: 'none',
                                borderRadius: '4px'
                            }
                        }, '✕')
                    ])
                ]),
                
                // Messages Area
                React.createElement('div', {
                    key: 'messages',
                    ref: messagesContainerRef,
                    style: {
                        flex: 1,
                        overflow: 'auto',
                        padding: '20px'
                    }
                }, [
                    renderMessages(),
                    React.createElement('div', { key: 'end', ref: messagesEndRef })
                ]),
                
                // Input Area
                React.createElement('div', {
                    key: 'input',
                    style: {
                        padding: '15px 20px',
                        borderTop: '1px solid #eee',
                        display: 'flex',
                        gap: '10px'
                    }
                }, [
                    React.createElement('textarea', {
                        key: 'textarea',
                        value: inputValue,
                        onChange: (e) => setInputValue(e.target.value),
                        onKeyDown: handleKeyDown,
                        placeholder: '输入消息... (Shift+Enter 换行)',
                        disabled: isProcessing,
                        style: {
                            flex: 1,
                            padding: '10px',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            resize: 'none',
                            minHeight: '40px',
                            maxHeight: '120px',
                            fontFamily: 'inherit'
                        }
                    }),
                    React.createElement('button', {
                        key: 'send',
                        onClick: handleSend,
                        disabled: !inputValue.trim() || isProcessing,
                        style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: (!inputValue.trim() || isProcessing) ? 'not-allowed' : 'pointer',
                            background: (!inputValue.trim() || isProcessing) ? '#ccc' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            minWidth: '80px'
                        }
                    }, isProcessing ? '⏳ 生成中...' : '📤 发送'),
                    isProcessing && React.createElement('button', {
                        key: 'stop',
                        onClick: stopGeneration,
                        style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px'
                        }
                    }, '⏹ 停止')
                ]),
                
                // Resize Handle
                React.createElement('div', {
                    key: 'resize',
                    onMouseDown: handleResizeStart,
                    style: {
                        position: 'absolute',
                        right: 0,
                        bottom: 0,
                        width: '20px',
                        height: '20px',
                        cursor: 'nwse-resize',
                        background: 'linear-gradient(135deg, transparent 50%, #999 50%)'
                    }
                })
            ]);
    }
    
    // 暴露到全局
    window.ChatWindow = ChatWindow;
    
})();


// =====================================================
// 模块: app/ui/components/SettingsDialog.jsx
// =====================================================

// ==================== Settings Dialog Component ====================
// React 设置对话框组件

(function() {
    'use strict';
    
    /**
     * SettingsDialog 组件
     */
    function SettingsDialog({ isOpen, onClose }) {
        const { 
            settings, 
            isLoading, 
            saveSettings,
            addProvider,
            updateProvider,  // P2: 更新供应商
            deleteProvider,
            toggleProviderEnabled,  // P2: 切换供应商启用状态
            addModelToProvider,
            refreshProviderModels,  // P2: 刷新模型
            toggleModelEnabled  // P2: 切换模型状态
        } = window.useSettings();
        
        const [activeTab, setActiveTab] = React.useState('basic'); // basic, providers
        const [formData, setFormData] = React.useState(settings);
        const [newProvider, setNewProvider] = React.useState({
            name: '',
            baseUrl: '',
            apiKey: '',
            template: 'openai'
        });
        const [newModel, setNewModel] = React.useState({
            providerId: '',
            modelId: '',
            modelName: ''
        });
        
        // P2: 编辑供应商对话框状态
        const [editingProvider, setEditingProvider] = React.useState(null);
        const [editFormData, setEditFormData] = React.useState({
            name: '',
            baseUrl: '',
            apiKey: '',
            isLocal: false
        });
        
        // 通用样式
        const styles = {
            formGroup: { marginBottom: '15px' },
            label: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' },
            input: {
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
            },
            select: {
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
                background: 'white'
            },
            button: {
                padding: '10px 20px',
                fontSize: '14px',
                cursor: 'pointer',
                border: 'none',
                borderRadius: '4px',
                marginTop: '10px'
            },
            providerItem: {
                padding: '12px',
                marginBottom: '10px',
                background: '#f8f9fa',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }
        };
        
        // 同步 settings 到 formData
        React.useEffect(() => {
            setFormData(settings);
        }, [settings]);
        
        // 同步设置对话框状态到 StorageManager（用于快捷键冲突检测）
        React.useEffect(() => {
            if (window.StorageManager) {
                window.StorageManager.setState('ui.settingsVisible', isOpen ? true : null);
            }
        }, [isOpen]);
        
        // 设置对话框键盘事件处理（仅在对话框打开时）
        React.useEffect(() => {
            if (!isOpen) return;
            
            function handleKeyDown(e) {
                // Escape: 关闭设置对话框
                if (e.key === 'Escape') {
                    e.stopPropagation(); // 阻止事件冒泡到 ChatWindow
                    if (onClose) {
                        onClose();
                        console.log('[SettingsDialog] ⌨️ Escape 关闭设置对话框');
                    }
                    e.preventDefault();
                }
            }
            
            // 使用捕获阶段，确保优先处理
            window.addEventListener('keydown', handleKeyDown, true);
            return () => {
                window.removeEventListener('keydown', handleKeyDown, true);
            };
        }, [isOpen, onClose]);
        
        if (!isOpen) return null;
        
        // 处理基础设置保存
        async function handleSaveBasic() {
            try {
                await saveSettings(formData);
                alert('✅ 设置已保存');
                onClose();
            } catch (error) {
                alert('❌ 保存失败: ' + error.message);
            }
        }
        
        // 处理添加供应商
        async function handleAddProvider() {
            if (!newProvider.name || !newProvider.baseUrl) {
                alert('请填写供应商名称和 Base URL');
                return;
            }
            
            try {
                await addProvider({
                    name: newProvider.name,
                    baseUrl: newProvider.baseUrl,
                    apiKey: newProvider.apiKey,
                    template: newProvider.template,
                    isLocal: newProvider.baseUrl.includes('localhost') || newProvider.baseUrl.includes('127.0.0.1'),
                    models: []
                });
                
                setNewProvider({
                    name: '',
                    baseUrl: '',
                    apiKey: '',
                    template: 'openai'
                });
                
                alert('✅ 供应商已添加');
                
            } catch (error) {
                alert('❌ 添加失败: ' + error.message);
            }
        }
        
        // 处理删除供应商
        async function handleDeleteProvider(providerId) {
            if (!confirm('确定要删除这个供应商吗？')) return;
            
            try {
                await deleteProvider(providerId);
                alert('✅ 供应商已删除');
            } catch (error) {
                alert('❌ 删除失败: ' + error.message);
            }
        }
        
        // 处理添加模型
        async function handleAddModel() {
            if (!newModel.providerId || !newModel.modelId) {
                alert('请选择供应商并填写模型 ID');
                return;
            }
            
            try {
                await addModelToProvider(newModel.providerId, {
                    id: newModel.modelId,
                    name: newModel.modelName || newModel.modelId,
                    enabled: true
                });
                
                setNewModel({
                    providerId: '',
                    modelId: '',
                    modelName: ''
                });
                
                alert('✅ 模型已添加');
                
            } catch (error) {
                alert('❌ 添加失败: ' + error.message);
            }
        }
        
        // P2: 打开编辑供应商对话框
        function handleEditProvider(provider) {
            setEditingProvider(provider);
            setEditFormData({
                name: provider.name,
                baseUrl: provider.baseUrl,
                apiKey: '',  // 不显示原有 API Key
                isLocal: provider.isLocal || false
            });
        }
        
        // P2: 关闭编辑对话框
        function handleCloseEdit() {
            setEditingProvider(null);
            setEditFormData({
                name: '',
                baseUrl: '',
                apiKey: '',
                isLocal: false
            });
        }
        
        // P2: 保存编辑的供应商
        async function handleSaveEdit() {
            if (!editingProvider) return;
            
            try {
                const updates = {
                    name: editFormData.name,
                    baseUrl: editFormData.baseUrl,
                    isLocal: editFormData.isLocal
                };
                
                // 如果填写了新的 API Key，则更新
                if (editFormData.apiKey.trim()) {
                    updates.apiKey = editFormData.apiKey;
                }
                
                await updateProvider(editingProvider.id, updates);
                
                // P2: 触发事件通知模型列表更新
                if (window.EventManager) {
                    window.EventManager.emit(window.EventManager.EventTypes.PROVIDER_UPDATED, {
                        providerId: editingProvider.id
                    });
                }
                
                alert('✅ 供应商已更新');
                handleCloseEdit();
                
            } catch (error) {
                alert('❌ 更新失败: ' + error.message);
            }
        }
        
        // P2: 刷新供应商模型
        async function handleRefreshModels(providerId) {
            if (!confirm('确定要刷新模型列表吗？\n系统将对比新旧模型并自动保留已有配置。')) return;
            
            try {
                const result = await refreshProviderModels(providerId);
                
                // P2: 触发事件通知模型列表更新
                if (window.EventManager) {
                    window.EventManager.emit(window.EventManager.EventTypes.MODELS_UPDATED, {
                        providerId,
                        ...result
                    });
                }
                
                alert(`✅ 模型已刷新\n新增: ${result.added} 个\n移除: ${result.removed} 个\n总计: ${result.newCount} 个`);
            } catch (error) {
                alert('❌ 刷新失败: ' + error.message);
            }
        }
        
        // P2: 切换模型启用状态
        async function handleToggleModel(providerId, modelId, currentEnabled) {
            try {
                await toggleModelEnabled(providerId, modelId, currentEnabled);
                
                // P2: 触发事件通知模型列表更新
                if (window.EventManager) {
                    window.EventManager.emit(window.EventManager.EventTypes.MODELS_UPDATED, {
                        providerId,
                        modelId,
                        enabled: !currentEnabled
                    });
                }
            } catch (error) {
                alert('❌ 操作失败: ' + error.message);
            }
        }
        
        // P2: 切换供应商启用状态
        async function handleToggleProvider(providerId, currentEnabled) {
            try {
                await toggleProviderEnabled(providerId, !currentEnabled);
                
                // P2: 触发事件通知模型列表更新
                if (window.EventManager) {
                    window.EventManager.emit(window.EventManager.EventTypes.PROVIDER_UPDATED, {
                        providerId,
                        enabled: !currentEnabled
                    });
                }
            } catch (error) {
                alert('❌ 操作失败: ' + error.message);
            }
        }

        // 渲染基础设置标签页
        function renderBasicTab() {
            return React.createElement('div', { className: 'settings-tab-content' }, [

                // Model
                React.createElement('div', { key: 'model', className: 'form-group' }, [
                    React.createElement('label', { key: 'label' }, '默认模型:'),
                    React.createElement('input', {
                        key: 'input',
                        type: 'text',
                        value: formData.model,
                        onChange: (e) => setFormData(prev => ({ ...prev, model: e.target.value })),
                        placeholder: '例如: gpt-4, claude-3, auto',
                        className: 'form-input'
                    })
                ]),
                
                // Temperature
                React.createElement('div', { key: 'temp', className: 'form-group' }, [
                    React.createElement('label', { key: 'label' }, `温度参数: ${formData.temperature}`),
                    React.createElement('input', {
                        key: 'input',
                        type: 'range',
                        min: 0,
                        max: 2,
                        step: 0.1,
                        value: formData.temperature,
                        onChange: (e) => setFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) })),
                        className: 'form-range'
                    })
                ]),
                
                // Max Tokens
                React.createElement('div', { key: 'tokens', className: 'form-group' }, [
                    React.createElement('label', { key: 'label' }, '最大 Token:'),
                    React.createElement('input', {
                        key: 'input',
                        type: 'number',
                        value: formData.maxTokens,
                        onChange: (e) => setFormData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) })),
                        className: 'form-input'
                    })
                ]),
                
                // Save Button
                React.createElement('button', {
                    key: 'save',
                    onClick: handleSaveBasic,
                    disabled: isLoading,
                    className: 'btn btn-primary'
                }, isLoading ? '保存中...' : '💾 保存设置')
            ]);
        }
        
        // 渲染供应商管理标签页
        function renderProvidersTab() {
            const providerElements = settings.providers.map(provider => {
                return React.createElement('div', { 
                    key: provider.id, 
                    className: 'provider-item',
                    style: {
                        padding: '15px',
                        marginBottom: '15px',
                        background: '#f8f9fa',
                        borderRadius: '8px',
                        border: '1px solid #e9ecef'
                    }
                }, [
                    // 供应商头部信息
                    React.createElement('div', { 
                        key: 'header',
                        style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '10px'
                        }
                    }, [
                        React.createElement('div', { key: 'info', style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
                            // P2: 供应商启用开关
                            React.createElement('label', {
                                key: 'toggle',
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }
                            }, [
                                React.createElement('input', {
                                    type: 'checkbox',
                                    checked: provider.enabled !== false,
                                    onChange: () => handleToggleProvider(provider.id, provider.enabled),
                                    style: { marginRight: '5px' }
                                }),
                                provider.enabled !== false ? '启用' : '禁用'
                            ]),
                            
                            React.createElement('strong', { 
                                key: 'name',
                                style: { 
                                    fontSize: '16px',
                                    color: provider.enabled === false ? '#6c757d' : '#212529'
                                }
                            }, provider.name),
                            React.createElement('span', { 
                                key: 'badge',
                                style: {
                                    fontSize: '12px',
                                    padding: '2px 8px',
                                    background: provider.isLocal ? '#28a745' : '#007bff',
                                    color: 'white',
                                    borderRadius: '12px',
                                    marginRight: '10px'
                                }
                            }, provider.isLocal ? '本地' : '云端'),
                            React.createElement('span', { 
                                key: 'models',
                                style: { fontSize: '13px', color: '#6c757d' }
                            }, `${provider.models?.length || 0} 个模型`)
                        ]),
                        React.createElement('div', { key: 'actions', style: { display: 'flex', gap: '5px' } }, [
                            React.createElement('button', {
                                key: 'edit',
                                onClick: () => handleEditProvider(provider),
                                style: {
                                    padding: '5px 10px',
                                    fontSize: '12px',
                                    background: '#ffc107',
                                    color: '#212529',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }
                            }, '✏️ 编辑'),
                            React.createElement('button', {
                                key: 'refresh',
                                onClick: () => handleRefreshModels(provider.id),
                                style: {
                                    padding: '5px 10px',
                                    fontSize: '12px',
                                    background: '#17a2b8',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }
                            }, '🔄 刷新'),
                            React.createElement('button', {
                                key: 'delete',
                                onClick: () => handleDeleteProvider(provider.id),
                                style: {
                                    padding: '5px 10px',
                                    fontSize: '12px',
                                    background: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }
                            }, '🗑️')
                        ])
                    ]),
                    
                    // P2: 模型列表
                    provider.models && provider.models.length > 0 ? React.createElement('div', {
                        key: 'models',
                        style: {
                            marginTop: '10px',
                            paddingTop: '10px',
                            borderTop: '1px solid #dee2e6'
                        }
                    }, [
                        React.createElement('div', { 
                            key: 'title',
                            style: { fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#495057' }
                        }, '模型列表:'),
                        React.createElement('div', { 
                            key: 'list',
                            style: {
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '8px'
                            }
                        }, provider.models.map(model => 
                            React.createElement('div', {
                                key: model.id,
                                style: {
                                    padding: '8px 10px',
                                    background: 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #dee2e6',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '12px'
                                }
                            }, [
                                React.createElement('span', {
                                    key: 'name',
                                    style: {
                                        color: model.enabled ? '#212529' : '#6c757d',
                                        textDecoration: model.enabled ? 'none' : 'line-through'
                                    }
                                }, model.name || model.id),
                                React.createElement('label', {
                                    key: 'toggle',
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                    }
                                }, [
                                    React.createElement('input', {
                                        type: 'checkbox',
                                        checked: model.enabled,
                                        onChange: () => handleToggleModel(provider.id, model.id, model.enabled),
                                        style: { marginRight: '5px' }
                                    }),
                                    model.enabled ? '启用' : '禁用'
                                ])
                            ])
                        ))
                    ]) : null
                ]);
            });
            
            return React.createElement('div', { className: 'settings-tab-content' }, [
                // 供应商列表
                React.createElement('div', { key: 'list', className: 'provider-list' }, 
                    providerElements.length > 0 ? providerElements : React.createElement('p', null, '暂无供应商')
                ),
                
                // 添加供应商表单
                React.createElement('div', { key: 'add-form', className: 'add-provider-form' }, [
                    React.createElement('h3', { key: 'title' }, '➕ 添加供应商'),
                    React.createElement('input', {
                        key: 'name',
                        type: 'text',
                        value: newProvider.name,
                        onChange: (e) => setNewProvider(prev => ({ ...prev, name: e.target.value })),
                        placeholder: '供应商名称',
                        className: 'form-input'
                    }),
                    React.createElement('input', {
                        key: 'url',
                        type: 'text',
                        value: newProvider.baseUrl,
                        onChange: (e) => setNewProvider(prev => ({ ...prev, baseUrl: e.target.value })),
                        placeholder: 'Base URL (例如: https://api.openai.com/v1)',
                        className: 'form-input'
                    }),
                    React.createElement('input', {
                        key: 'key',
                        type: 'password',
                        value: newProvider.apiKey,
                        onChange: (e) => setNewProvider(prev => ({ ...prev, apiKey: e.target.value })),
                        placeholder: 'API Key (可选)',
                        className: 'form-input'
                    }),
                    React.createElement('select', {
                        key: 'template',
                        value: newProvider.template,
                        onChange: (e) => setNewProvider(prev => ({ ...prev, template: e.target.value })),
                        className: 'form-select'
                    }, [
                        React.createElement('option', { key: 'openai', value: 'openai' }, 'OpenAI'),
                        React.createElement('option', { key: 'anthropic', value: 'anthropic' }, 'Anthropic'),
                        React.createElement('option', { key: 'google', value: 'google' }, 'Google')
                    ]),
                    React.createElement('button', {
                        key: 'add',
                        onClick: handleAddProvider,
                        className: 'btn btn-success'
                    }, '➕ 添加供应商')
                ]),
                
                // 添加模型表单
                React.createElement('div', { key: 'add-model', className: 'add-model-form' }, [
                    React.createElement('h3', { key: 'title' }, '➕ 添加模型'),
                    React.createElement('select', {
                        key: 'provider',
                        value: newModel.providerId,
                        onChange: (e) => setNewModel(prev => ({ ...prev, providerId: e.target.value })),
                        className: 'form-select'
                    }, [
                        React.createElement('option', { key: 'default', value: '' }, '选择供应商'),
                        ...settings.providers.map(p => 
                            React.createElement('option', { key: p.id, value: p.id }, p.name)
                        )
                    ]),
                    React.createElement('input', {
                        key: 'modelid',
                        type: 'text',
                        value: newModel.modelId,
                        onChange: (e) => setNewModel(prev => ({ ...prev, modelId: e.target.value })),
                        placeholder: '模型 ID (例如: gpt-4)',
                        className: 'form-input'
                    }),
                    React.createElement('input', {
                        key: 'modelname',
                        type: 'text',
                        value: newModel.modelName,
                        onChange: (e) => setNewModel(prev => ({ ...prev, modelName: e.target.value })),
                        placeholder: '模型名称 (可选)',
                        className: 'form-input'
                    }),
                    React.createElement('button', {
                        key: 'add',
                        onClick: handleAddModel,
                        className: 'btn btn-success'
                    }, '➕ 添加模型')
                ])
            ]);
        }
        
        // 主渲染
        return React.createElement('div', { 
            className: 'modal-overlay', 
            onClick: onClose,
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                zIndex: 1000000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }
        }, [
            React.createElement('div', { 
                key: 'modal',
                className: 'modal-content settings-modal',
                onClick: (e) => e.stopPropagation(),
                style: {
                    background: 'white',
                    borderRadius: '12px',
                    width: '700px',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
                }
            }, [
                // Header
                React.createElement('div', { 
                    key: 'header', 
                    style: {
                        padding: '20px',
                        borderBottom: '1px solid #eee',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }
                }, [
                    React.createElement('h2', { 
                        key: 'title',
                        style: { margin: 0, fontSize: '20px' } 
                    }, '⚙️ 设置'),
                    React.createElement('button', {
                        key: 'close',
                        onClick: onClose,
                        style: {
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            color: '#999'
                        }
                    }, '×')
                ]),
                
                // Tabs
                React.createElement('div', { 
                    key: 'tabs',
                    style: {
                        display: 'flex',
                        borderBottom: '1px solid #eee',
                        background: '#f8f9fa'
                    }
                }, [
                    React.createElement('button', {
                        key: 'basic',
                        onClick: () => setActiveTab('basic'),
                        style: {
                            flex: 1,
                            padding: '12px',
                            border: 'none',
                            background: activeTab === 'basic' ? 'white' : 'transparent',
                            borderBottom: activeTab === 'basic' ? '2px solid #2196F3' : '2px solid transparent',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: activeTab === 'basic' ? '#2196F3' : '#666',
                            fontWeight: activeTab === 'basic' ? 'bold' : 'normal'
                        }
                    }, '🔧 基础设置'),
                    React.createElement('button', {
                        key: 'providers',
                        onClick: () => setActiveTab('providers'),
                        style: {
                            flex: 1,
                            padding: '12px',
                            border: 'none',
                            background: activeTab === 'providers' ? 'white' : 'transparent',
                            borderBottom: activeTab === 'providers' ? '2px solid #2196F3' : '2px solid transparent',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: activeTab === 'providers' ? '#2196F3' : '#666',
                            fontWeight: activeTab === 'providers' ? 'bold' : 'normal'
                        }
                    }, '🌐 供应商管理')
                ]),
                
                // Content
                React.createElement('div', { 
                    key: 'content', 
                    className: 'modal-body',
                    style: {
                        padding: '20px'
                    }
                },
                    activeTab === 'basic' ? renderBasicTab() : renderProvidersTab()
                ),
                
                // P2: 编辑供应商对话框
                editingProvider ? React.createElement('div', {
                    key: 'edit-overlay',
                    style: {
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000001
                    },
                    onClick: handleCloseEdit
                }, [
                    React.createElement('div', {
                        key: 'edit-modal',
                        onClick: (e) => e.stopPropagation(),
                        style: {
                            background: 'white',
                            borderRadius: '8px',
                            padding: '24px',
                            width: '500px',
                            maxWidth: '90%'
                        }
                    }, [
                        React.createElement('h3', {
                            key: 'title',
                            style: { margin: '0 0 20px 0', fontSize: '18px' }
                        }, `✏️ 编辑供应商: ${editingProvider.name}`),
                        
                        React.createElement('div', { key: 'form' }, [
                            React.createElement('div', { key: 'name', style: { marginBottom: '15px' } }, [
                                React.createElement('label', { 
                                    key: 'label',
                                    style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }
                                }, '供应商名称:'),
                                React.createElement('input', {
                                    key: 'input',
                                    type: 'text',
                                    value: editFormData.name,
                                    onChange: (e) => setEditFormData(prev => ({ ...prev, name: e.target.value })),
                                    style: {
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '14px',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        boxSizing: 'border-box'
                                    }
                                })
                            ]),
                            
                            React.createElement('div', { key: 'url', style: { marginBottom: '15px' } }, [
                                React.createElement('label', { 
                                    key: 'label',
                                    style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }
                                }, 'Base URL:'),
                                React.createElement('input', {
                                    key: 'input',
                                    type: 'text',
                                    value: editFormData.baseUrl,
                                    onChange: (e) => setEditFormData(prev => ({ ...prev, baseUrl: e.target.value })),
                                    style: {
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '14px',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        boxSizing: 'border-box'
                                    }
                                })
                            ]),
                            
                            React.createElement('div', { key: 'apikey', style: { marginBottom: '15px' } }, [
                                React.createElement('label', { 
                                    key: 'label',
                                    style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }
                                }, 'API Key (留空不修改):'),
                                React.createElement('input', {
                                    key: 'input',
                                    type: 'password',
                                    value: editFormData.apiKey,
                                    onChange: (e) => setEditFormData(prev => ({ ...prev, apiKey: e.target.value })),
                                    placeholder: '输入新的 API Key',
                                    style: {
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '14px',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        boxSizing: 'border-box'
                                    }
                                })
                            ]),
                            
                            React.createElement('div', { key: 'local', style: { marginBottom: '20px' } }, [
                                React.createElement('label', {
                                    key: 'label',
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }
                                }, [
                                    React.createElement('input', {
                                        key: 'checkbox',
                                        type: 'checkbox',
                                        checked: editFormData.isLocal,
                                        onChange: (e) => setEditFormData(prev => ({ ...prev, isLocal: e.target.checked })),
                                        style: { marginRight: '8px' }
                                    }),
                                    '本地服务 (如 LM Studio, Ollama)'
                                ])
                            ]),
                            
                            React.createElement('div', {
                                key: 'actions',
                                style: {
                                    display: 'flex',
                                    gap: '10px',
                                    justifyContent: 'flex-end'
                                }
                            }, [
                                React.createElement('button', {
                                    key: 'cancel',
                                    onClick: handleCloseEdit,
                                    style: {
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        background: '#6c757d',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }
                                }, '取消'),
                                React.createElement('button', {
                                    key: 'save',
                                    onClick: handleSaveEdit,
                                    style: {
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        background: '#007bff',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }
                                }, '💾 保存')
                            ])
                        ])
                    ])
                ]) : null
            ])
        ]);
    }
    
    // 暴露到全局
    window.SettingsDialog = SettingsDialog;
    
})();


// =====================================================
// 模块: app/ui/components/CodeConfirmDialog.jsx
// =====================================================

// ==================== 高危代码确认对话框 ====================
// P0: 安全确认机制

(function() {
    'use strict';
    
    /**
     * CodeConfirmDialog 组件
     * @param {Object} props
     * @param {boolean} props.isOpen - 是否显示
     * @param {string} props.code - 待执行的代码
     * @param {string} props.riskType - 风险类型描述
     * @param {Function} props.onConfirm - 确认回调
     * @param {Function} props.onCancel - 取消回调
     */
    function CodeConfirmDialog({ isOpen, code, riskType, onConfirm, onCancel }) {
        if (!isOpen) return null;
        
        return React.createElement('div', {
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999999
            }
        }, [
            React.createElement('div', {
                key: 'dialog',
                style: {
                    background: 'white',
                    borderRadius: '8px',
                    padding: '24px',
                    maxWidth: '600px',
                    width: '90%',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                }
            }, [
                // 标题
                React.createElement('h3', {
                    key: 'title',
                    style: {
                        margin: '0 0 16px 0',
                        color: '#dc3545',
                        fontSize: '18px'
                    }
                }, '⚠️ 高危代码警告'),
                
                // 风险类型
                React.createElement('div', {
                    key: 'risk',
                    style: {
                        padding: '12px',
                        background: '#fff3cd',
                        borderLeft: '4px solid #ffc107',
                        marginBottom: '16px',
                        borderRadius: '4px'
                    }
                }, [
                    React.createElement('strong', { key: 'label' }, '检测到风险：'),
                    React.createElement('span', { key: 'type' }, riskType)
                ]),
                
                // 代码预览
                React.createElement('div', {
                    key: 'code-label',
                    style: {
                        marginBottom: '8px',
                        fontSize: '14px',
                        color: '#666'
                    }
                }, '即将执行的代码：'),
                
                React.createElement('pre', {
                    key: 'code',
                    style: {
                        background: '#f5f5f5',
                        padding: '12px',
                        borderRadius: '4px',
                        overflow: 'auto',
                        maxHeight: '200px',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        border: '1px solid #ddd'
                    }
                }, code),
                
                // 警告说明
                React.createElement('p', {
                    key: 'warning',
                    style: {
                        margin: '16px 0',
                        fontSize: '14px',
                        color: '#666',
                        lineHeight: '1.6'
                    }
                }, '此代码可能修改页面、删除数据或执行危险操作。请仔细检查后确认是否继续执行。'),
                
                // 按钮组
                React.createElement('div', {
                    key: 'buttons',
                    style: {
                        display: 'flex',
                        gap: '12px',
                        justifyContent: 'flex-end',
                        marginTop: '20px'
                    }
                }, [
                    React.createElement('button', {
                        key: 'cancel',
                        onClick: onCancel,
                        style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            background: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px'
                        }
                    }, '取消'),
                    
                    React.createElement('button', {
                        key: 'confirm',
                        onClick: onConfirm,
                        style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px'
                        }
                    }, '确认执行')
                ])
            ])
        ]);
    }
    
    // 暴露到全局
    window.CodeConfirmDialog = CodeConfirmDialog;
    
})();


// =====================================================
// 模块: app/ui/index.jsx
// =====================================================

// ==================== React UI 根组件 ====================
// v5.0: React 入口点
// 注意：需要先加载 React 库文件

(function() {
    'use strict';
    
    console.log('[React UI] 🚀 React UI 模块已加载');
    
    // 检查 React 是否可用
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
        console.error('[React UI] ❌ React 或 ReactDOM 未加载');
        return;
    }
    
    console.log('[React UI] ✅ React 版本:', React.version);
    
    /**
     * App 主组件
     */
    function App() {
        const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
        
        // P0: 高危代码确认对话框状态
        const [codeConfirm, setCodeConfirm] = React.useState({
            isOpen: false,
            code: '',
            riskType: '',
            resolve: null,
            reject: null
        });
        
        // 从 StorageManager 加载窗口可见性状态（默认隐藏）
        const getInitialChatState = () => {
            if (window.StorageManager) {
                const savedVisible = window.StorageManager.getState('ui.visible');
                return savedVisible === true;  // 只有明确保存为 true 才显示
            }
            return false;  // 默认隐藏
        };
        
        const [isChatOpen, setIsChatOpen] = React.useState(getInitialChatState());
        
        // P0: 监听高危代码确认事件
        React.useEffect(() => {
            if (!EventManager || !window.CodeConfirmDialog) return;
            
            const confirmationId = EventManager.on(
                EventManager.EventTypes.CODE_CONFIRMATION_REQUIRED,
                (data) => {
                    setCodeConfirm({
                        isOpen: true,
                        code: data.code,
                        riskType: data.riskType,
                        resolve: data.resolve,
                        reject: data.reject
                    });
                }
            );
            
            return () => {
                EventManager.off(EventManager.EventTypes.CODE_CONFIRMATION_REQUIRED, confirmationId);
            };
        }, []);
        
        // 监听快捷键切换窗口事件
        React.useEffect(() => {
            if (!window.EventManager) return;
            
            const handler = () => {
                setIsChatOpen(prev => {
                    const newState = !prev;
                    // 同步到 StorageManager
                    if (window.StorageManager) {
                        if (newState) {
                            window.StorageManager.setState('ui.visible', true);
                        } else {
                            window.StorageManager.setState('ui.visible', null);
                        }
                    }
                    return newState;
                });
            };
            
            window.EventManager.on('TOGGLE_CHAT_WINDOW', handler);
            return () => window.EventManager.off('TOGGLE_CHAT_WINDOW', handler);
        }, []);

        // P0: 处理确认
        function handleCodeConfirm() {
            if (codeConfirm.resolve) {
                codeConfirm.resolve();
            }
            setCodeConfirm({ isOpen: false, code: '', riskType: '', resolve: null, reject: null });
        }
        
        // P0: 处理取消
        function handleCodeCancel() {
            if (codeConfirm.reject) {
                codeConfirm.reject(new Error('用户取消了高危代码执行'));
            }
            setCodeConfirm({ isOpen: false, code: '', riskType: '', resolve: null, reject: null });
        }
        
        return React.createElement('div', null, [
            // 机器人图标按钮（切换聊天窗口）
            !isChatOpen ? React.createElement('button', {
                key: 'robot-toggle',
                onClick: () => {
                    const newState = !isChatOpen;
                    setIsChatOpen(newState);
                    
                    // 只在打开时保存可见性状态，关闭时删除
                    if (window.StorageManager) {
                        if (newState) {
                            // 打开窗口：保存 visible = true
                            window.StorageManager.setState('ui.visible', true);
                        } else {
                            // 关闭窗口：删除 visible 键
                            window.StorageManager.setState('ui.visible', null);
                        }
                    }
                },
                style: {
                    position: 'fixed',
                    bottom: '30px',
                    right: '30px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: '#2196F3',
                    color: 'white',
                    border: 'none',
                    fontSize: '28px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 999997,
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }
            }, '') : null,
            
            // 聊天窗口
            window.ChatWindow ? React.createElement(window.ChatWindow, {
                key: 'chat',
                isOpen: isChatOpen,
                onClose: () => setIsChatOpen(false),
                onOpenSettings: () => setIsSettingsOpen(true)
            }) : null,
            
            // 设置对话框
            window.SettingsDialog ? React.createElement(window.SettingsDialog, {
                key: 'settings',
                isOpen: isSettingsOpen,
                onClose: () => setIsSettingsOpen(false)
            }) : null,
            
            // P0: 高危代码确认对话框
            window.CodeConfirmDialog ? React.createElement(window.CodeConfirmDialog, {
                key: 'code-confirm',
                isOpen: codeConfirm.isOpen,
                code: codeConfirm.code,
                riskType: codeConfirm.riskType,
                onConfirm: handleCodeConfirm,
                onCancel: handleCodeCancel
            }) : null
        ]);
    }
    
    /**
     * 挂载 React 应用
     */
    function mountApp() {
        // 检查是否已经挂载
        const existingContainer = document.getElementById('react-app-container');
        if (existingContainer) {
            console.log('[React UI] ⚠️ 应用已挂载，跳过');
            return;
        }
        
        // 创建容器（不需要定位，因为子元素都是 fixed）
        const container = document.createElement('div');
        container.id = 'react-app-container';
        document.body.appendChild(container);
        
        // 创建 React 根
        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(App));
        
        console.log('[React UI] ✅ React 应用已挂载');
    }
    
    // P0: 等待初始化完成后挂载（轮询检查，不使用事件）
    const waitForInitialization = () => {
        console.log('[React UI] 🔍 检查初始化状态...');
        
        // 检查是否已经初始化完成
        if (window.__AGENT_INITIALIZED__) {
            console.log('[React UI] ✅ 检测到初始化完成，开始挂载');
            mountApp();
            return;
        }
        
        // 未初始化，100ms 后重试
        console.log('[React UI] ⏳ 等待初始化完成...');
        setTimeout(waitForInitialization, 100);
    };
    
    // 页面加载完成后开始等待
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[React UI] 📄 DOMContentLoaded，开始等待初始化');
            waitForInitialization();
        });
    } else {
        console.log('[React UI] 📄 DOM 已就绪，开始等待初始化');
        waitForInitialization();
    }
    
})();


// =====================================================
// 模块: main.js
// =====================================================

// ==================== 主入口模块 (v5.0 重构版) ====================
// Main Layer (程序启动层) - "园区建设"
// 职责：初始化模块、设置监听、暴露接口
// 注意：不包含业务逻辑，只负责"启动"和"接线"

(function() {
    'use strict';
    
    // 记录启动时间
    const startTime = Date.now();
    
    // 标记是否已经初始化
    let isInitialized = false;
    
    /**
     * 初始化应用
     */
    async function init() {
        // 防止重复初始化
        if (isInitialized) {
            console.warn('[Main] ⚠️ 应用已初始化，跳过');
            return;
        }
        isInitialized = true;
        
        console.log('[Main] 🚀 AI Agent v5.1 正在启动...');
        console.log('[Main] 📅 时间:', new Date().toISOString());
        
        try {
            // 1. 初始化核心工具层
            console.log('[Main] 🔧 步骤 1/6: 初始化核心工具层...');
            await initCoreUtilities();
            console.log('[Main] ✅ 核心工具层已初始化');
            
            // 2. 初始化服务层
            console.log('[Main] 🔧 步骤 2/6: 初始化服务层...');
            await initServices();
            console.log('[Main] ✅ 服务层已初始化');
            
            // 3. 初始化基础设施层
            console.log('[Main] 🔧 步骤 3/6: 初始化基础设施层...');
            await initInfrastructure();
            console.log('[Main] ✅ 基础设施层已初始化');
            
            // 4. 启动业务逻辑层（园区工厂）
            console.log('[Main] 🔧 步骤 4/6: 启动业务逻辑层...');
            await initBusinessLayer();
            console.log('[Main] ✅ 业务逻辑层已启动');
            
            // 5. 初始化全局快捷键
            console.log('[Main] 🔧 步骤 5/6: 初始化全局快捷键...');
            initGlobalShortcuts();
            console.log('[Main] ✅ 全局快捷键已初始化');
            
            // 6. 暴露全局调试接口
            console.log('[Main] 🔧 步骤 6/6: 暴露全局调试接口...');
            exposeDebugInterface();
            console.log('[Main] ✅ 调试接口已暴露');
            
            console.log('[Main] 🎉 AI Agent v5.1 启动成功!');
            
            // P0: 设置全局初始化完成标志
            window.__AGENT_INITIALIZED__ = true;
            console.log('[Main] ✅ 初始化完成标志已设置');
            console.log('[Main] 📊 总耗时:', Date.now() - startTime, 'ms');
            
        } catch (error) {
            console.error('[Main] ❌ 启动失败:', error);
            console.error('[Main] 📋 错误堆栈:', error.stack);
            throw error;
        }
    }
    
    /**
     * 初始化核心工具层
     */
    async function initCoreUtilities() {
        // ErrorTracker 最先初始化
        ErrorTracker.init();
        
        // EventManager 无需初始化
    }
    
    /**
     * 初始化服务层
     */
    async function initServices() {
        // StorageManager 最先初始化（其他模块可能依赖它）
        if (window.StorageManager) {
            window.StorageManager.init();
            console.log('[Main] ✅ StorageManager 已初始化');
        }
        
        // ProviderManager
        await ProviderManager.init();
        
        // ModelManager
        await ModelManager.init();
    }
    
    /**
     * 初始化基础设施层
     * 注意: AIAgent 由 WebAgentClient 统一初始化,这里只确保依赖模块就绪
     */
    async function initInfrastructure() {
        // 基础设施层模块已在服务层初始化
        // AIAgent 将在 WebAgentClient.init() 中初始化
        console.log('[Main] ℹ️ AIAgent 将由 WebAgentClient 初始化');
    }
    
    /**
     * 初始化业务逻辑层（园区工厂）
     */
    async function initBusinessLayer() {
        // WebAgentClient - 业务编排器
        await WebAgentClient.init();
    }
    
    /**
     * 初始化全局快捷键（Alt+A / Ctrl+Shift+A）
     */
    function initGlobalShortcuts() {
        console.log('[Main] ⌨️ 注册全局快捷键...');
        
        function handleKeyDown(e) {
            // Alt+A: 打开/关闭聊天窗口
            if (e.altKey && e.key.toLowerCase() === 'a') {
                toggleChatWindow();
                e.preventDefault();
                return;
            }
            
            // Ctrl+Shift+A: 打开/关闭聊天窗口（备选）
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
                toggleChatWindow();
                e.preventDefault();
                return;
            }
        }
        
        window.addEventListener('keydown', handleKeyDown);
        console.log('[Main] ✅ 全局快捷键已注册');
    }
    
    /**
     * 切换聊天窗口显示状态
     */
    function toggleChatWindow() {
        try {
            // 通过 EventManager 发送切换事件
            if (window.EventManager) {
                window.EventManager.emit('TOGGLE_CHAT_WINDOW');
                console.log('[Main] ⌨️ 通过 EventManager 切换聊天窗口');
            } else {
                console.warn('[Main] ⚠️ EventManager 未就绪');
            }
        } catch (error) {
            console.error('[Main] ❌ 切换聊天窗口失败:', error);
        }
    }

    /**
     * 暴露全局调试接口
     */
    function exposeDebugInterface() {
        // P2: 同时暴露到 window 和 unsafeWindow
        if (typeof window !== 'undefined') {
            window.WebAgentClient = WebAgentClient;
            window.AIAgent = AIAgent;
            window.EventManager = EventManager;
            console.log('[Main] ✅ 已暴露到 window');
        }
        
        if (typeof unsafeWindow !== 'undefined') {
            unsafeWindow.WebAgentClient = WebAgentClient;
            unsafeWindow.AIAgent = AIAgent;
            unsafeWindow.EventManager = EventManager;
            console.log('[Main] ✅ 已暴露到 unsafeWindow');
        }
        
        console.log('[Main] 💡 调试接口已暴露:');
        console.log('   - window.WebAgentClient - 业务逻辑层');
        console.log('   - window.AIAgent - 基础设施层');
        console.log('   - window.EventManager - 事件总线');
        console.log('   示例: await window.WebAgentClient.handleUserMessage("你好")');
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();

