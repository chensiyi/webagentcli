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
