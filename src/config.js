// ==================== 配置管理模块 ====================

const ConfigManager = (function() {
    const CONFIG_KEYS = {
        API_KEY: 'openrouter_api_key',
        MODEL: 'openrouter_model',
        ENDPOINT: 'openrouter_endpoint',
        TEMPERATURE: 'temperature',
        TOP_P: 'top_p',
        MAX_TOKENS: 'max_tokens',
        JS_ENABLED: 'js_execution_enabled',
        USER_ID: 'user_id',
        HISTORY: 'conversation_history',
        CACHED_MODELS: 'cached_models'
    };

    const DEFAULTS = {
        apiKey: '',
        model: 'google/gemma-3-12b-it:free',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        temperature: 0.7,
        topP: 0.95,
        maxTokens: 2048,
        jsExecutionEnabled: true,
        userId: 'openrouter_user_' + Date.now(),
        conversationHistory: []
    };

    let config = {};

    async function init() {
        config = {
            apiKey: GM_getValue(CONFIG_KEYS.API_KEY, DEFAULTS.apiKey),
            model: GM_getValue(CONFIG_KEYS.MODEL, DEFAULTS.model),
            endpoint: GM_getValue(CONFIG_KEYS.ENDPOINT, DEFAULTS.endpoint),
            temperature: GM_getValue(CONFIG_KEYS.TEMPERATURE, DEFAULTS.temperature),
            topP: GM_getValue(CONFIG_KEYS.TOP_P, DEFAULTS.topP),
            maxTokens: GM_getValue(CONFIG_KEYS.MAX_TOKENS, DEFAULTS.maxTokens),
            jsExecutionEnabled: GM_getValue(CONFIG_KEYS.JS_ENABLED, DEFAULTS.jsExecutionEnabled),
            userId: GM_getValue(CONFIG_KEYS.USER_ID, DEFAULTS.userId),
            conversationHistory: GM_getValue(CONFIG_KEYS.HISTORY, DEFAULTS.conversationHistory)
        };

        // 如果当前有文件夹工作空间,尝试从 .workspace.json 加载配置
        try {
            const currentWs = StorageManager ? StorageManager.getCurrentWorkspace() : null;
            if (currentWs && currentWs.folderHandle && currentWs.data.settings) {
                // 从工作空间加载设置
                const wsSettings = currentWs.data.settings;
                if (wsSettings.apiKey !== undefined) config.apiKey = wsSettings.apiKey;
                if (wsSettings.model !== undefined) config.model = wsSettings.model;
                if (wsSettings.temperature !== undefined) config.temperature = wsSettings.temperature;
                if (wsSettings.topP !== undefined) config.topP = wsSettings.topP;
                if (wsSettings.maxTokens !== undefined) config.maxTokens = wsSettings.maxTokens;
                if (wsSettings.jsExecutionEnabled !== undefined) config.jsExecutionEnabled = wsSettings.jsExecutionEnabled;
                
                console.log('✅ 已从工作空间加载配置');
            }
        } catch (error) {
            console.warn('加载工作空间配置失败:', error);
        }

        return config;
    }

    function get(key) {
        return config[key];
    }

    function set(key, value) {
        config[key] = value;
        // 直接映射 key 到 GM 存储的 key
        const keyMap = {
            'apiKey': CONFIG_KEYS.API_KEY,
            'model': CONFIG_KEYS.MODEL,
            'endpoint': CONFIG_KEYS.ENDPOINT,
            'temperature': CONFIG_KEYS.TEMPERATURE,
            'topP': CONFIG_KEYS.TOP_P,
            'maxTokens': CONFIG_KEYS.MAX_TOKENS,
            'jsExecutionEnabled': CONFIG_KEYS.JS_ENABLED
        };
        const gmKey = keyMap[key];
        if (gmKey) {
            GM_setValue(gmKey, value);
        }
    }

    function getAll() {
        return { ...config };
    }

    function saveConversationHistory(history) {
        // 只保留最近 50 条消息
        if (history.length > 50) {
            history = history.slice(-50);
        }
        config.conversationHistory = history;
        GM_setValue(CONFIG_KEYS.HISTORY, history);
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
        getConfigKeys
    };
})();
