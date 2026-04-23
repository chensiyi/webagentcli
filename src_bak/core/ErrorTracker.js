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
