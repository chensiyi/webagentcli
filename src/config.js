// ==================== 配置管理模块 ====================

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
        USER_ID: 'user_id',
        HISTORY: 'conversation_history',
        CACHED_MODELS: 'cached_models',
        CHAT_VISIBILITY: 'chat_visibility',
        CACHED_MODELS_LAST_UPDATE: 'cached_models_last_update'
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
        userId: 'user_' + Date.now(),
        conversationHistory: []
    };
    
    // 配置存储
    let configCache = {};
    
    // 事件管理器引用（通过依赖注入）
    let eventManager = null;

    async function init() {
        // 数据迁移: 从旧 key 迁移到新 key
        const oldModelKey = 'openrouter_model';
        const oldApiKeyKey = 'openrouter_api_key';
        const oldEndpointKey = 'openrouter_endpoint';
        
        // 迁移 model
        if (GM_getValue(oldModelKey, undefined) !== undefined && GM_getValue(ConfigKeys.MODEL, undefined) === undefined) {
            const oldModel = GM_getValue(oldModelKey);
            GM_setValue(ConfigKeys.MODEL, oldModel);
            console.log('✅ 已迁移 model 配置');
        }
        
        // 迁移 apiKey
        if (GM_getValue(oldApiKeyKey, undefined) !== undefined && GM_getValue(ConfigKeys.API_KEY, undefined) === undefined) {
            const oldApiKey = GM_getValue(oldApiKeyKey);
            GM_setValue(ConfigKeys.API_KEY, oldApiKey);
            console.log('✅ 已迁移 api_key 配置');
        }
        
        // 迁移 endpoint
        if (GM_getValue(oldEndpointKey, undefined) !== undefined && GM_getValue(ConfigKeys.ENDPOINT, undefined) === undefined) {
            const oldEndpoint = GM_getValue(oldEndpointKey);
            GM_setValue(ConfigKeys.ENDPOINT, oldEndpoint);
            console.log('✅ 已迁移 endpoint 配置');
        }
        
        configCache = {
            apiKey: GM_getValue(ConfigKeys.API_KEY, Defaults.apiKey),
            model: GM_getValue(ConfigKeys.MODEL, Defaults.model),
            endpoint: GM_getValue(ConfigKeys.ENDPOINT, Defaults.endpoint),
            temperature: GM_getValue(ConfigKeys.TEMPERATURE, Defaults.temperature),
            topP: GM_getValue(ConfigKeys.TOP_P, Defaults.topP),
            maxTokens: GM_getValue(ConfigKeys.MAX_TOKENS, Defaults.maxTokens),
            jsExecutionEnabled: GM_getValue(ConfigKeys.JS_ENABLED, Defaults.jsExecutionEnabled),
            userId: GM_getValue(ConfigKeys.USER_ID, Defaults.userId),
            conversationHistory: []
        };

        // 如果当前有文件夹工作空间,尝试从 .workspace.json 加载配置
        try {
            const currentWs = StorageManager ? StorageManager.getCurrentWorkspace() : null;
            if (currentWs && currentWs.folderHandle && currentWs.data.settings) {
                // 从工作空间加载设置
                const wsSettings = currentWs.data.settings;
                if (wsSettings.apiKey !== undefined) configCache.apiKey = wsSettings.apiKey;
                if (wsSettings.model !== undefined) configCache.model = wsSettings.model;
                if (wsSettings.temperature !== undefined) configCache.temperature = wsSettings.temperature;
                if (wsSettings.topP !== undefined) configCache.topP = wsSettings.topP;
                if (wsSettings.maxTokens !== undefined) configCache.maxTokens = wsSettings.maxTokens;
                if (wsSettings.jsExecutionEnabled !== undefined) configCache.jsExecutionEnabled = wsSettings.jsExecutionEnabled;
                
                console.log('✅ 已从工作空间加载配置');
            }
        } catch (error) {
            console.warn('加载工作空间配置失败:', error);
        }

        return configCache;
    }

    function get(key) {
        return configCache[key];
    }

    function set(key, value) {
        configCache[key] = value;
        // 直接映射 key 到 GM 存储的 key
        const keyMap = {
            'apiKey': ConfigKeys.API_KEY,
            'model': ConfigKeys.MODEL,
            'endpoint': ConfigKeys.ENDPOINT,
            'temperature': ConfigKeys.TEMPERATURE,
            'topP': ConfigKeys.TOP_P,
            'maxTokens': ConfigKeys.MAX_TOKENS,
            'jsExecutionEnabled': ConfigKeys.JS_ENABLED
        };
        const gmKey = keyMap[key];
        if (gmKey) {
            GM_setValue(gmKey, value);
        }
        
        // 同时保存到当前工作空间的 settings 中
        try {
            if (StorageManager && typeof StorageManager.getCurrentWorkspace === 'function') {
                const currentWs = StorageManager.getCurrentWorkspace();
                
                // 更新内存中的工作空间配置（总是执行）
                if (currentWs) {
                    const settings = currentWs.data.settings || {};
                    settings[key] = value;
                    currentWs.data.settings = settings;
                    currentWs.updatedAt = Date.now();
                }
                
                // 同步到文件夹
                if (currentWs && currentWs.folderHandle && currentWs.folderHandle.kind === 'directory') {
                    StorageManager.saveToWorkspace('settings', currentWs.data.settings).catch(err => {
                        console.warn(`❌ 同步配置 ${key} 到文件夹失败:`, err);
                    });
                }
            }
        } catch (error) {
            console.warn('❌ 同步配置到工作空间失败:', error);
        }
    }

    /**
     * 获取当前域名（用于区分不同网站的会话）
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
     */
    function getDomainKey(baseKey) {
        const domain = getCurrentDomain();
        return `${baseKey}_${domain}`;
    }

    function getAll() {
        return { ...configCache };
    }

    async function saveConversationHistory(history) {
        // 只保留最近 50 条消息
        if (history.length > 50) {
            history = history.slice(-50);
        }
        configCache.conversationHistory = history;
        
        // 1. 立即保存到浏览器缓存
        const domainKey = getDomainKey(ConfigKeys.HISTORY);
        GM_setValue(domainKey, history);
        
        // 2. 如果有关联的工作空间，立即同步到 agent_chat.json
        if (StorageManager && typeof StorageManager.saveChatToWorkspace === 'function') {
            await StorageManager.saveChatToWorkspace(history);
        }
        
        console.log(`💾 已保存 ${history.length} 条对话到域名: ${getCurrentDomain()}`);
    }

    async function loadConversationHistory() {
        let history = [];
        
        // 1. 优先从工作空间加载 (权威源)
        if (StorageManager && typeof StorageManager.loadChatFromWorkspace === 'function') {
            const wsHistory = await StorageManager.loadChatFromWorkspace();
            if (wsHistory && Array.isArray(wsHistory)) {
                history = wsHistory;
                console.log('✅ 优先使用工作空间的聊天记录');
            }
        }
        
        // 2. 如果工作空间没有，则回退到浏览器缓存
        if (history.length === 0) {
            const domainKey = getDomainKey(ConfigKeys.HISTORY);
            history = GM_getValue(domainKey, []);
            console.log(`📂 回退到浏览器缓存，加载 ${history.length} 条对话`);
        }
        
        configCache.conversationHistory = history;
        return history;
    }

    function saveChatVisibility(isVisible) {
        // 基于域名保存聊天窗口显示状态
        const domainKey = getDomainKey(CONFIG_KEYS.CHAT_VISIBILITY);
        GM_setValue(domainKey, isVisible);
        
        console.log(`👁️ 已保存聊天窗口状态 (${isVisible ? '显示' : '隐藏'}) 到域名: ${getCurrentDomain()}`);
    }

    function getChatVisibility() {
        // 基于域名加载聊天窗口显示状态，默认为 false（隐藏，需要用户主动打开）
        const domainKey = getDomainKey(CONFIG_KEYS.CHAT_VISIBILITY);
        const isVisible = GM_getValue(domainKey, false);
        
        console.log(`🔍 读取聊天窗口状态 (${isVisible ? '显示' : '隐藏'}) 从域名: ${getCurrentDomain()}`);
        return isVisible;
    }

    function getConfigKeys() {
        return CONFIG_KEYS;
    }

    return {
        init,
        get,
        set,
        getAll,
        saveConversationHistory,
        loadConversationHistory,  // 新增
        saveChatVisibility,       // 新增
        getChatVisibility,        // 新增
        getConfigKeys
    };
})();
