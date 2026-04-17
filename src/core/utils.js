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
