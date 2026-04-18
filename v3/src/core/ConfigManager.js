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
