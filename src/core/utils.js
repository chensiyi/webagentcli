// ==================== 工具函数模块 ====================
// 提供通用的工具函数，避免代码重复

const Utils = (function() {
    'use strict';
    
    // 调试模式开关（生产环境设为 false）
    const DEBUG_MODE = true;
    
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
