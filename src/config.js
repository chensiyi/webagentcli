// ==================== 配置管理模块 ====================

const ConfigManager = (function() {
    const CONFIG_KEYS = {
        API_KEY: 'api_key',
        MODEL: 'model',
        ENDPOINT: 'endpoint',
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
        userId: 'user_' + Date.now(),
        conversationHistory: []
    };

    let config = {};

    async function init() {
        // 数据迁移: 从旧 key 迁移到新 key
        const oldModelKey = 'openrouter_model';
        const oldApiKeyKey = 'openrouter_api_key';
        const oldEndpointKey = 'openrouter_endpoint';
        
        // 迁移 model
        if (GM_getValue(oldModelKey, undefined) !== undefined && GM_getValue(CONFIG_KEYS.MODEL, undefined) === undefined) {
            const oldModel = GM_getValue(oldModelKey);
            GM_setValue(CONFIG_KEYS.MODEL, oldModel);
            console.log('✅ 已迁移 model 配置');
        }
        
        // 迁移 apiKey
        if (GM_getValue(oldApiKeyKey, undefined) !== undefined && GM_getValue(CONFIG_KEYS.API_KEY, undefined) === undefined) {
            const oldApiKey = GM_getValue(oldApiKeyKey);
            GM_setValue(CONFIG_KEYS.API_KEY, oldApiKey);
            console.log('✅ 已迁移 api_key 配置');
        }
        
        // 迁移 endpoint
        if (GM_getValue(oldEndpointKey, undefined) !== undefined && GM_getValue(CONFIG_KEYS.ENDPOINT, undefined) === undefined) {
            const oldEndpoint = GM_getValue(oldEndpointKey);
            GM_setValue(CONFIG_KEYS.ENDPOINT, oldEndpoint);
            console.log('✅ 已迁移 endpoint 配置');
        }
        
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
        
        // 同时保存到当前工作空间的 settings 中
        try {
            if (StorageManager && typeof StorageManager.getCurrentWorkspace === 'function') {
                const currentWs = StorageManager.getCurrentWorkspace();
                
                console.log('🔍 调试 - 当前工作空间:', currentWs ? {
                    id: currentWs.id,
                    name: currentWs.name,
                    hasFolderHandle: !!currentWs.folderHandle,
                    folderHandleType: currentWs.folderHandle ? typeof currentWs.folderHandle : 'none',
                    hasGetFileHandle: currentWs.folderHandle && typeof currentWs.folderHandle.getFileHandle === 'function'
                } : 'null');
                
                // 更新内存中的工作空间配置（总是执行）
                if (currentWs) {
                    const settings = currentWs.data.settings || {};
                    settings[key] = value;
                    currentWs.data.settings = settings;
                    currentWs.updatedAt = Date.now();
                    
                    console.log(`💾 配置 ${key} 已更新到内存`);
                }
                
                // 同步到文件夹（只要 folderHandle 存在且是有效的 DirectoryHandle）
                if (currentWs && currentWs.folderHandle && 
                    currentWs.folderHandle.kind === 'directory') {
                    console.log('📁 检测到有效 folderHandle，开始同步到文件夹...');
                    // 保存到文件夹（saveToWorkspace 内部会执行实际的写入操作）
                    StorageManager.saveToWorkspace('settings', currentWs.data.settings).then(() => {
                        console.log(`✅ 已同步配置 ${key} 到工作空间文件夹`);
                    }).catch(err => {
                        console.warn(`❌ 同步配置 ${key} 到文件夹失败:`, err);
                    });
                } else if (currentWs) {
                    console.log(`⚠️ folderHandle 无效，配置 ${key} 仅保存到浏览器存储`);
                    console.log('🔍 调试 - currentWs.folderHandle:', currentWs.folderHandle);
                    console.log('🔍 调试 - folderHandle.kind:', currentWs.folderHandle?.kind);
                }
            }
        } catch (error) {
            console.warn('❌ 同步配置到工作空间失败:', error);
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
