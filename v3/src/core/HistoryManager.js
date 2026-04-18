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
