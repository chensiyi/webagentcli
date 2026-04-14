// ==UserScript==
// @name         Free Web AI Agent
// @namespace    https://github.com/chensiyi1994
// @version      2.1.0
// @description  基于ai模型的Web AI 助手,支持 JS 执行
// @author       chensiyi1994
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      openrouter.ai
// @run-at       document-end
// ==/UserScript==


// ==================== config.js ====================

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
        CACHED_MODELS: 'cached_models',
        CHAT_VISIBILITY: 'chat_visibility'  // 新增：聊天窗口显示状态
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
        return { ...config };
    }

    function saveConversationHistory(history) {
        // 只保留最近 50 条消息
        if (history.length > 50) {
            history = history.slice(-50);
        }
        config.conversationHistory = history;
        
        // 基于域名保存会话历史
        const domainKey = getDomainKey(CONFIG_KEYS.HISTORY);
        GM_setValue(domainKey, history);
        
        console.log(`💾 已保存 ${history.length} 条对话到域名: ${getCurrentDomain()}`);
    }

    function loadConversationHistory() {
        // 基于域名加载会话历史
        const domainKey = getDomainKey(CONFIG_KEYS.HISTORY);
        const history = GM_getValue(domainKey, []);
        config.conversationHistory = history;
        
        console.log(`📂 已加载 ${history.length} 条对话从域名: ${getCurrentDomain()}`);
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


// ==================== models.js ====================

// ==================== 模型管理模块 ====================

const ModelManager = (function() {
    const CACHE_KEY = 'cached_models';
    const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

    // 默认模型列表
    const DEFAULT_MODELS = [
        { id: 'google/gemma-3-12b-it:free', name: '🌟 Gemma 3 12B (推荐)', provider: 'google' },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: '🦙 Llama 3.3 70B', provider: 'meta-llama' },
        { id: 'qwen/qwen-2.5-72b-instruct:free', name: '💬 Qwen 2.5 72B (中文好)', provider: 'qwen' },
        { id: 'deepseek/deepseek-r1-0528:free', name: '🧠 DeepSeek R1 (推理强)', provider: 'deepseek' },
        { id: 'mistralai/mistral-7b-instruct:free', name: '⚡ Mistral 7B (快速)', provider: 'mistralai' },
        { id: 'google/gemini-2.0-flash-exp:free', name: '✨ Gemini 2.0 Flash', provider: 'google' },
        { id: 'openai/gpt-oss-20b:free', name: '🤖 GPT-OSS 20B', provider: 'openai' },
        { id: 'zhipuai/glm-4.5-air:free', name: '🇨🇳 GLM-4.5 Air', provider: 'zhipuai' },
        { id: 'stepfun/step-3.5-flash:free', name: '🚀 Step 3.5 Flash', provider: 'stepfun' },
        { id: 'arcee/trinity-mini:free', name: '🔹 Trinity Mini 26B', provider: 'arcee' },
        { id: 'openrouter/auto', name: '🎲 Auto (智能路由 - 推荐)', provider: 'openrouter' }
    ];

    /**
     * 从 API 获取免费模型列表
     */
    function fetchFreeModels() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://openrouter.ai/api/v1/models',
                headers: {
                    'Content-Type': 'application/json'
                },
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.data) {
                            // 过滤出免费模型
                            const freeModels = data.data
                                .filter(model => model.id.includes(':free') || model.pricing?.prompt === 0)
                                .map(model => ({
                                    id: model.id,
                                    name: getModelDisplayName(model),
                                    provider: model.id.split('/')[0],
                                    context_length: model.context_length || 'N/A'
                                }))
                                .sort((a, b) => a.name.localeCompare(b.name));
                            
                            resolve(freeModels);
                        } else {
                            reject(new Error('无效的响应格式'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    /**
     * 获取模型显示名称
     */
    function getModelDisplayName(model) {
        const providerIcons = {
            'google': '✨',
            'meta-llama': '🦙',
            'llama': '🦙',
            'qwen': '💬',
            'aliyun': '💬',
            'deepseek': '🧠',
            'mistral': '⚡',
            'mistralai': '⚡',
            'openai': '🤖',
            'zhipu': '🇨🇳',
            'glm': '🇨🇳',
            'stepfun': '🚀',
            'arcee': '🔹'
        };

        const provider = model.id.split('/')[0];
        const icon = providerIcons[provider] || '🤖';
        
        return `${icon} ${model.name || model.id}`;
    }

    /**
     * 更新模型选择下拉框
     */
    function updateModelSelect(models, currentModel) {
        const select = document.getElementById('setting-model');
        if (!select) return;
        
        // 保存当前选中的值
        const currentValue = currentModel || select.value;
        
        // 清空现有选项
        select.innerHTML = '';
        
        // 添加 Auto 选项 (始终在第一位)
        const autoOption = document.createElement('option');
        autoOption.value = 'openrouter/auto';
        autoOption.textContent = '🎲 Auto (智能路由 - 推荐)';
        if (currentValue === 'openrouter/auto') autoOption.selected = true;
        select.appendChild(autoOption);
        
        // 添加分隔线
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────────';
        select.appendChild(separator);
        
        // 添加免费模型选项
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            
            // 恢复之前的选择
            if (model.id === currentValue) {
                option.selected = true;
            }
            
            select.appendChild(option);
        });
    }

    /**
     * 加载缓存的模型列表
     */
    function loadCachedModels() {
        const cached = GM_getValue(CACHE_KEY, null);
        if (cached) {
            try {
                const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
                const models = data.models;
                const timestamp = data.timestamp;
                const age = Date.now() - timestamp;
                
                // 如果缓存不超过 24 小时,使用缓存
                if (age < CACHE_EXPIRY) {
                    return { models, isExpired: false, hoursAgo: Math.floor(age / (60 * 60 * 1000)) };
                }
            } catch (error) {
                console.error('加载缓存失败:', error);
            }
        }
        return { models: DEFAULT_MODELS, isExpired: true, hoursAgo: 0 };
    }

    /**
     * 保存模型列表到缓存
     */
    function saveToCache(models) {
        GM_setValue(CACHE_KEY, JSON.stringify({
            models: models,
            timestamp: Date.now()
        }));
    }

    /**
     * 刷新模型列表
     */
    async function refreshModels() {
        try {
            const models = await fetchFreeModels();
            saveToCache(models);
            return { success: true, models, count: models.length };
        } catch (error) {
            console.error('获取模型列表失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取提供商图标
     */
    function getProviderIcon(provider) {
        const icons = {
            'google': '✨',
            'meta-llama': '🦙',
            'llama': '🦙',
            'qwen': '💬',
            'deepseek': '🧠',
            'mistral': '⚡',
            'openai': '🤖',
            'zhipu': '🇨🇳',
            'glm': '🇨🇳',
            'stepfun': '🚀',
            'arcee': '🔹',
            'openrouter': '🎲'
        };
        return icons[provider] || '🤖';
    }

    return {
        DEFAULT_MODELS,
        fetchFreeModels,
        updateModelSelect,
        loadCachedModels,
        saveToCache,
        refreshModels,
        getProviderIcon,
        getModelDisplayName
    };
})();


// ==================== ui.js ====================

// ==================== UI 界面模块 ====================

const UIManager = (function() {
    let assistant = null;
    let isDragging = false;
    let offsetX, offsetY;

    /**
     * 添加样式
     */
    function addStyles() {
        GM_addStyle(`
            #ai-agent {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 550px;  /* 增加宽度以容纳侧边栏 */
                height: 550px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                z-index: 999999;
                display: flex;
                flex-direction: row;  /* 改为横向布局 */
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 1px solid #e0e0e0;
                transition: all 0.3s ease;
                overflow: hidden;
            }

            
            /* 侧边栏样式（VSCode 风格） */
            #agent-sidebar {
                width: 40px;
                background: #2c2c2c;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 8px 0;
                gap: 4px;
                transition: width 0.3s ease;
                flex-shrink: 0;
                position: relative;
            }
            #agent-sidebar.expanded {
                width: 320px;
                align-items: stretch;
                padding: 0;
            }
            .sidebar-btn {
                width: 36px;
                height: 36px;
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                border-radius: 4px;
                transition: all 0.2s;
                position: relative;
            }
            .sidebar-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .sidebar-btn.active {
                background: rgba(255,255,255,0.15);
                color: white;
            }
            .sidebar-btn::before {
                content: attr(data-tooltip);
                position: absolute;
                left: 45px;
                background: #333;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s;
                z-index: 1000;
            }
            .sidebar-btn:hover::before {
                opacity: 1;
            }
            
            /* 收缩按钮（交界区域） */
            #sidebar-collapse {
                position: absolute;
                right: -12px;
                top: 50%;
                transform: translateY(-50%);
                width: 12px;
                height: 40px;
                background: #2c2c2c;
                border: 1px solid #3a3a3a;
                border-left: none;
                border-radius: 0 6px 6px 0;
                color: #888;
                font-size: 10px;
                cursor: pointer;
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 100;
                transition: all 0.2s;
            }
            #agent-sidebar.expanded #sidebar-collapse {
                display: flex;
            }
            #sidebar-collapse:hover {
                background: #3a3a3a;
                color: white;
                width: 14px;
            }
            
            /* 侧边栏内容区域 */
            #sidebar-content {
                display: none;
                flex: 1;
                flex-direction: column;
                background: #252526;
                overflow: hidden;
            }
            #agent-sidebar.expanded #sidebar-content {
                display: flex;
            }
            .sidebar-header {
                padding: 10px 12px;
                background: #333;
                color: white;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .sidebar-header-actions {
                display: flex;
                gap: 6px;
            }
            .sidebar-header-btn {
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                font-size: 14px;
                padding: 2px 6px;
                border-radius: 3px;
                transition: all 0.2s;
            }
            .sidebar-header-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            #workspace-tree {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            }
            .sidebar-close-btn {
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                font-size: 16px;
                padding: 2px 6px;
                border-radius: 3px;
            }
            .sidebar-close-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            #workspace-tree {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            }
            .workspace-item {
                padding: 6px 8px;
                color: #cccccc;
                cursor: pointer;
                border-radius: 4px;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 2px;
            }
            .workspace-item:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .workspace-item.active {
                background: rgba(102, 126, 234, 0.3);
                color: white;
            }
            .file-tree-item {
                padding: 4px 8px;
                padding-left: 20px;
                color: #cccccc;
                cursor: pointer;
                border-radius: 3px;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 1px;
            }
            .file-tree-item:hover {
                background: rgba(255,255,255,0.08);
                color: white;
            }
            .file-tree-item.folder {
                color: #e8e8e8;
            }
            .file-tree-item.file {
                padding-left: 32px;
            }
            .file-tree-item .file-actions {
                display: none;
                gap: 4px;
            }
            .file-tree-item:hover .file-actions {
                display: flex;
            }
            .file-action-btn {
                background: transparent;
                border: none;
                color: #888;
                cursor: pointer;
                font-size: 12px;
                padding: 2px 4px;
                border-radius: 3px;
            }
            .file-action-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            
            /* 文件编辑器 */
            #file-editor-panel {
                display: none;
                flex-direction: column;
                flex: 1;
                background: #1e1e1e;
            }
            #file-editor-panel.active {
                display: flex;
            }
            .editor-header {
                padding: 8px 12px;
                background: #2d2d2d;
                border-bottom: 1px solid #3e3e3e;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .editor-title {
                color: #cccccc;
                font-size: 12px;
                font-weight: 500;
            }
            .editor-actions {
                display: flex;
                gap: 6px;
            }
            .editor-btn {
                padding: 4px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            }
            .editor-btn.save {
                background: #0e639c;
                color: white;
            }
            .editor-btn.save:hover {
                background: #1177bb;
            }
            .editor-btn.cancel {
                background: #3c3c3c;
                color: #cccccc;
            }
            .editor-btn.cancel:hover {
                background: #505050;
            }
            #file-editor-textarea {
                flex: 1;
                padding: 12px;
                background: #1e1e1e;
                color: #d4d4d4;
                border: none;
                resize: none;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.5;
                outline: none;
            }
            
            /* 主内容区域 */
            #agent-main {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: 0;
            }
            #agent-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-radius: 12px 12px 0 0;
                cursor: move;
            }
            #agent-title { 
                font-weight: 600; 
                font-size: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            #agent-controls {
                display: flex;
                gap: 6px;
            }
            .header-btn {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                transition: background 0.2s;
            }
            .header-btn:hover { background: rgba(255,255,255,0.3); }
            #agent-chat {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                background: #f5f7fa;
                scroll-behavior: smooth;
            }
            .message { 
                margin: 10px 0;
                animation: fadeIn 0.3s ease;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .user-message {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 10px 14px;
                border-radius: 16px 16px 6px 16px;
                margin-left: auto;
                max-width: 85%;
                word-wrap: break-word;
            }
            .assistant-message {
                background: white;
                border: 1px solid #e0e0e0;
                padding: 10px 14px;
                border-radius: 16px 16px 16px 6px;
                max-width: 85%;
                word-wrap: break-word;
            }
            .message-content { 
                line-height: 1.5; 
                font-size: 14px;
                white-space: pre-wrap;
            }
            .code-block {
                background: #282c34;
                color: #abb2bf;
                padding: 12px;
                border-radius: 8px;
                margin: 8px 0;
                font-family: 'SF Mono', 'Fira Code', monospace;
                font-size: 12px;
                overflow-x: auto;
                position: relative;
            }
            .code-language {
                position: absolute;
                top: 4px;
                right: 8px;
                font-size: 10px;
                color: #5c6370;
                text-transform: uppercase;
            }
            .code-actions { 
                margin-top: 8px;
                display: flex;
                gap: 6px;
            }
            .code-btn {
                background: #667eea;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .code-btn:hover { 
                background: #5568d3;
                transform: translateY(-1px);
            }
            .code-btn.execute { background: #10b981; }
            .code-btn.execute:hover { background: #059669; }
            #agent-input-area { 
                border-top: 1px solid #e0e0e0; 
                padding: 12px;
                background: white;
                border-radius: 0 0 12px 12px;
            }
            #agent-input {
                width: 100%;
                min-height: 60px;
                max-height: 150px;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 8px;
                resize: vertical;
                font-size: 14px;
                font-family: inherit;
                transition: border-color 0.2s;
            }
            #agent-input:focus { 
                outline: none; 
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            #agent-controls-bar { 
                display: flex; 
                gap: 8px; 
                margin-top: 10px;
                align-items: center;
            }
            #agent-send {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
            }
            #agent-send:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }
            #agent-send:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            .control-btn {
                background: #f5f7fa;
                border: 1px solid #ddd;
                padding: 8px 12px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            }
            .control-btn:hover {
                background: #e8ecf1;
                border-color: #667eea;
            }
            .execution-result {
                margin-top: 10px;
                padding: 10px;
                border-radius: 8px;
                font-family: 'SF Mono', monospace;
                font-size: 12px;
                line-height: 1.5;
            }
            .execution-success { 
                background: #d1fae5; 
                border-left: 4px solid #10b981;
                color: #065f46;
            }
            .execution-error { 
                background: #fee2e2; 
                border-left: 4px solid #ef4444;
                color: #991b1b;
            }
            .typing { 
                display: flex; 
                gap: 4px; 
                padding: 12px;
                align-items: center;
            }
            .typing-dot {
                width: 8px;
                height: 8px;
                background: #667eea;
                border-radius: 50%;
                animation: typing 1.4s infinite ease-in-out;
            }
            .typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .typing-dot:nth-child(2) { animation-delay: -0.16s; }
            @keyframes typing {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
            }
            .status-badge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
                margin-left: 8px;
            }
            .status-active {
                background: #d1fae5;
                color: #065f46;
            }
            .status-inactive {
                background: #fee2e2;
                color: #991b1b;
            }
        `);
    }

    /**
     * 创建主界面
     */
    function createAssistant(config) {
        assistant = document.createElement('div');
        assistant.id = 'ai-agent';
        assistant.innerHTML = `
            <!-- 侧边栏（VSCode 风格） -->
            <div id="agent-sidebar">
                <button class="sidebar-btn" id="sidebar-workspace" data-tooltip="工作空间">📁</button>
                
                <!-- 侧边栏内容区域 -->
                <div id="sidebar-content">
                    <!-- 文件浏览器视图 -->
                    <div id="file-browser-view" style="display: none; flex-direction: column; flex: 1;">
                        <div class="sidebar-header">
                            <span>资源管理器</span>
                            <div class="sidebar-header-actions">
                                <button class="sidebar-header-btn" id="btn-refresh" title="刷新">🔄</button>
                                <button class="sidebar-header-btn" id="btn-new-file" title="新建文件">📄+</button>
                                <button class="sidebar-header-btn" id="btn-new-folder" title="新建文件夹">📁+</button>
                            </div>
                        </div>
                        <div id="workspace-tree">
                            <div style="padding: 20px; color: #888; text-align: center; font-size: 12px;">
                                点击 📁 打开文件夹
                            </div>
                        </div>
                    </div>
                    
                    <!-- 文件编辑器视图 -->
                    <div id="file-editor-panel">
                        <div class="editor-header">
                            <span class="editor-title" id="editor-file-name">未命名文件</span>
                            <div class="editor-actions">
                                <button class="editor-btn save" id="editor-save-btn">💾 保存</button>
                                <button class="editor-btn cancel" id="editor-cancel-btn">✖ 取消</button>
                            </div>
                        </div>
                        <textarea id="file-editor-textarea" placeholder="编辑文件内容..."></textarea>
                    </div>
                </div>
                
                <!-- 收缩按钮（交界区域） -->
                <div id="sidebar-collapse" title="收起侧边栏">◀</div>
            </div>
            
            <!-- 主内容区域 -->
            <div id="agent-main">
                <div id="agent-header">
                    <div id="agent-title">
                        <span>✨</span>
                        <span>AI 助手</span>
                        ${config.apiKey ? '<span class="status-badge status-active">已配置</span>' : '<span class="status-badge status-inactive">未配置</span>'}
                    </div>
                    <div id="agent-controls">
                        <button class="header-btn" id="agent-close" title="关闭">×</button>
                    </div>
                </div>
                <div id="agent-chat"></div>
                <div id="agent-input-area">
                    <textarea id="agent-input" placeholder="输入消息...&#10;使用 /js 执行代码,例如: /js alert('Hello')"></textarea>
                    <div id="agent-controls-bar">
                        <button class="control-btn" id="agent-settings">⚙️ 设置</button>
                        <button class="control-btn" id="agent-clear">🗑️ 清空</button>
                        <button id="agent-send">发送 ➤</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(assistant);
        
        setupEventListeners();
        setupChatEventDelegation(); // 调用事件委托，使代码执行按钮生效
        
        return assistant;
    }

    /**
     * 设置事件监听
     */
    function setupEventListeners() {
        const sendBtn = document.getElementById('agent-send');
        const input = document.getElementById('agent-input');
        const closeBtn = document.getElementById('agent-close');
        const settingsBtn = document.getElementById('agent-settings');
        const clearBtn = document.getElementById('agent-clear');
        
        // 侧边栏按钮
        const sidebarWorkspaceBtn = document.getElementById('sidebar-workspace');
        const sidebarCollapse = document.getElementById('sidebar-collapse');
        const sidebar = document.getElementById('agent-sidebar');
        
        // 侧边栏工具栏按钮
        const btnRefresh = document.getElementById('btn-refresh');
        const btnNewFile = document.getElementById('btn-new-file');
        const btnNewFolder = document.getElementById('btn-new-folder');
        
        // 编辑器按钮
        const editorSaveBtn = document.getElementById('editor-save-btn');
        const editorCancelBtn = document.getElementById('editor-cancel-btn');
        const fileEditorPanel = document.getElementById('file-editor-panel');

        // 发送按钮点击
        sendBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('agent-send-message'));
        });
        
        // 回车发送
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('agent-send-message'));
            }
        });

        // 打开监听自定义事件
        window.addEventListener('agent-send-message', () => {
            const message = input.value.trim();
            if (message) {
                window.dispatchEvent(new CustomEvent('agent-message-sent', { detail: message }));
                input.value = '';
            }
        });

        // 关闭按钮
        closeBtn.addEventListener('click', () => {
            assistant.style.display = 'none';
            // 触发 Agent 关闭事件，显示启动按钮
            window.dispatchEvent(new CustomEvent('agent-closed'));
            // 保存隐藏状态
            if (typeof ConfigManager !== 'undefined' && ConfigManager.saveChatVisibility) {
                ConfigManager.saveChatVisibility(false);
            }
        });

        // 侧边栏 - 工作空间按钮
        sidebarWorkspaceBtn.addEventListener('click', () => {
            toggleSidebar();
        });
        
        // 侧边栏 - 收缩按钮
        sidebarCollapse.addEventListener('click', () => {
            sidebar.classList.remove('expanded');
            sidebarWorkspaceBtn.classList.remove('active');
        });
        
        // 侧边栏 - 刷新按钮
        btnRefresh?.addEventListener('click', () => {
            loadWorkspaceList();
        });
        
        // 侧边栏 - 新建文件按钮
        btnNewFile?.addEventListener('click', async () => {
            const currentWs = StorageManager.getCurrentWorkspace();
            if (!currentWs || !currentWs.folderHandle) {
                alert('⚠️ 请先打开一个文件夹');
                return;
            }
            
            const fileName = prompt('请输入文件名:');
            if (fileName) {
                try {
                    await StorageManager.createFileInFolder(currentWs.folderHandle, fileName, '');
                    loadWorkspaceList(); // 刷新文件树
                } catch (error) {
                    alert(`❌ 创建文件失败: ${error.message}`);
                }
            }
        });
        
        // 侧边栏 - 新建文件夹按钮
        btnNewFolder?.addEventListener('click', async () => {
            const currentWs = StorageManager.getCurrentWorkspace();
            if (!currentWs || !currentWs.folderHandle) {
                alert('⚠️ 请先打开一个文件夹');
                return;
            }
            
            const folderName = prompt('请输入文件夹名:');
            if (folderName) {
                try {
                    await StorageManager.createNewFolder(currentWs.folderHandle, folderName);
                    loadWorkspaceList(); // 刷新文件树
                } catch (error) {
                    alert(`❌ 创建文件夹失败: ${error.message}`);
                }
            }
        });
        
        // 编辑器 - 保存按钮
        editorSaveBtn?.addEventListener('click', async () => {
            const fileName = fileEditorPanel.dataset.fileName;
            const content = document.getElementById('file-editor-textarea').value;
            const fileHandle = window._currentEditingFileHandle;
            
            if (!fileHandle || !fileName) {
                alert('⚠️ 无法获取文件句柄');
                return;
            }
            
            try {
                await StorageManager.writeFileContent(fileHandle, content);
                alert(`✅ 文件 ${fileName} 已保存`);
                closeFileEditor();
                loadWorkspaceList(); // 刷新文件树
            } catch (error) {
                alert(`❌ 保存文件失败: ${error.message}`);
            }
        });
        
        // 编辑器 - 取消按钮
        editorCancelBtn?.addEventListener('click', () => {
            if (confirm('确定要放弃未保存的更改吗？')) {
                closeFileEditor();
            }
        });

        // 设置按钮
        settingsBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('agent-open-settings'));
        });

        // 清空按钮
        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有对话记录吗?')) {
                window.dispatchEvent(new CustomEvent('agent-clear-chat'));
            }
        });

        // 拖拽功能
        const header = document.getElementById('agent-header');
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.header-btn')) return;
            isDragging = true;
            offsetX = e.clientX - assistant.offsetLeft;
            offsetY = e.clientY - assistant.offsetTop;
            assistant.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            assistant.style.left = (e.clientX - offsetX) + 'px';
            assistant.style.top = (e.clientY - offsetY) + 'px';
            assistant.style.right = 'auto';
            assistant.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            assistant.style.cursor = '';
        });

        // 监听打开 Agent 事件 (来自 version-loader)
        window.addEventListener('open-ai-agent', () => {
            assistant.style.display = 'flex';
            // 保存显示状态
            if (typeof ConfigManager !== 'undefined' && ConfigManager.saveChatVisibility) {
                ConfigManager.saveChatVisibility(true);
            }
            // 隐藏启动按钮
            const badge = document.getElementById('agent-launcher-btn');
            if (badge) {
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(0)';
                badge.style.opacity = '0';
                setTimeout(() => {
                    badge.style.display = 'none';
                }, 300);
            }
        });
    }
    
    /**
     * 切换侧边栏显示状态
     */
    function toggleSidebar() {
        const sidebar = document.getElementById('agent-sidebar');
        const workspaceBtn = document.getElementById('sidebar-workspace');
        const fileBrowserView = document.getElementById('file-browser-view');
        const fileEditorPanel = document.getElementById('file-editor-panel');
        
        if (sidebar.classList.contains('expanded')) {
            // 如果已经展开，则关闭
            sidebar.classList.remove('expanded');
            workspaceBtn.classList.remove('active');
        } else {
            // 展开工作空间
            sidebar.classList.add('expanded');
            workspaceBtn.classList.add('active');
            
            // 确保显示文件浏览器视图
            fileBrowserView.style.display = 'flex';
            fileEditorPanel.classList.remove('active');
            
            // 加载工作空间列表
            loadWorkspaceList();
        }
    }
    
    /**
     * 权限检查状态（避免重复检查）
     */
    let permissionChecked = false;
    
    /**
     * 加载工作空间列表到侧边栏
     */
    async function loadWorkspaceList() {
        const treeContainer = document.getElementById('workspace-tree');
        if (!treeContainer) return;
        
        try {
            const currentWs = StorageManager.getCurrentWorkspace();
            
            if (!currentWs) {
                treeContainer.innerHTML = `
                    <div style="padding: 20px; color: #888; text-align: center; font-size: 12px;">
                        未设置工作目录<br>
                        <button id="open-folder-btn" style="
                            margin-top: 10px;
                            padding: 6px 12px;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">📁 选择文件夹</button>
                    </div>
                `;
                
                document.getElementById('open-folder-btn')?.addEventListener('click', () => {
                    StorageManager.openFolder();
                });
                return;
            }
            
            // 显示文件树（移除工作空间头部信息，直接在文件树顶部显示）
            if (!currentWs.folderHandle) {
                treeContainer.innerHTML = `
                    <div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">
                        📁 未关联文件夹
                    </div>
                `;
                return;
            }
            
            // 仅在首次展开时检查权限，之后使用浏览器缓存
            if (!permissionChecked) {
                permissionChecked = true;
                treeContainer.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">检查权限中...</div>';
                
                try {
                    const permission = await currentWs.folderHandle.queryPermission({ mode: 'readwrite' });
                    if (permission !== 'granted') {
                        // 权限未授予，提示用户
                        treeContainer.innerHTML = `
                            <div style="padding: 8px; color: #f59e0b; font-size: 12px; text-align: center;">
                                ⚠️ 需要重新授权<br>
                                <button id="change-folder-btn" style="
                                    margin-top: 8px;
                                    padding: 6px 12px;
                                    background: #f59e0b;
                                    color: white;
                                    border: none;
                                    border-radius: 4px;
                                    cursor: pointer;
                                    font-size: 12px;
                                ">重新选择文件夹</button>
                            </div>
                        `;
                        document.getElementById('change-folder-btn')?.addEventListener('click', () => {
                            StorageManager.openFolder();
                        });
                        return;
                    }
                } catch (e) {
                    treeContainer.innerHTML = `
                        <div style="padding: 8px; color: #ef4444; font-size: 12px; text-align: center;">
                            ❌ 文件夹句柄无效<br>
                            <button id="change-folder-btn" style="
                                margin-top: 8px;
                                padding: 6px 12px;
                                background: #ef4444;
                                color: white;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            ">重新选择文件夹</button>
                        </div>
                    `;
                    document.getElementById('change-folder-btn')?.addEventListener('click', () => {
                        StorageManager.openFolder();
                    });
                    return;
                }
            }
            
            // 加载文件树
            treeContainer.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">加载中...</div>';
            
            try {
                const items = await getDirectoryList(currentWs.folderHandle);
                
                if (items.length === 0) {
                    treeContainer.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">📂 空文件夹</div>';
                    return;
                }
                
                treeContainer.innerHTML = '';
                renderFileTree(items, treeContainer, currentWs.folderHandle, 0);
                
            } catch (error) {
                console.error('加载文件树失败:', error);
                treeContainer.innerHTML = `
                    <div style="padding: 8px; color: #ef4444; font-size: 12px; text-align: center;">
                        ❌ ${error.message}
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('加载工作空间失败:', error);
            treeContainer.innerHTML = `
                <div style="padding: 20px; color: #ef4444; text-align: center; font-size: 12px;">
                    加载失败: ${error.message}
                </div>
            `;
        }
    }
    
    /**
     * 加载工作空间的文件树
     */
    async function loadWorkspaceFileTree(workspace, container) {
        if (!workspace) {
            container.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px;">工作空间不存在</div>';
            return;
        }
        
        if (!workspace.folderHandle) {
            container.innerHTML = `
                <div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">
                    📁 未关联文件夹
                </div>
            `;
            return;
        }
        
        // 检查权限
        try {
            const permission = await workspace.folderHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                container.innerHTML = `
                    <div style="padding: 8px; color: #f59e0b; font-size: 12px; text-align: center;">
                        ⚠️ 需要重新授权
                    </div>
                `;
                return;
            }
        } catch (e) {
            container.innerHTML = `
                <div style="padding: 8px; color: #ef4444; font-size: 12px; text-align: center;">
                    ❌ 文件夹句柄无效
                </div>
            `;
            return;
        }
        
        container.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">加载中...</div>';
        
        try {
            const items = await getDirectoryList(workspace.folderHandle);
            
            if (items.length === 0) {
                container.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">📂 空文件夹</div>';
                return;
            }
            
            container.innerHTML = '';
            renderFileTree(items, container, workspace.folderHandle, 0);
            
        } catch (error) {
            console.error('加载文件树失败:', error);
            container.innerHTML = `
                <div style="padding: 8px; color: #ef4444; font-size: 12px; text-align: center;">
                    ❌ ${error.message}
                </div>
            `;
        }
    }
    
    /**
     * 获取目录列表（从 StorageManager 导入）
     */
    async function getDirectoryList(dirHandle) {
        const asyncIterator = dirHandle.entries();
        const directories = [];
        const files = [];
        
        for await (const [key, value] of asyncIterator) {
            if (key === '.workspace.json') continue;
            
            if (value.kind === 'directory') {
                directories.push({
                    type: 'directory',
                    name: key,
                    handle: value
                });
            } else if (value.kind === 'file') {
                files.push({
                    type: 'file',
                    name: key,
                    handle: value
                });
            }
        }
        
        directories.sort((a, b) => a.name.localeCompare(b.name));
        files.sort((a, b) => a.name.localeCompare(b.name));
        
        return directories.concat(files);
    }
    
    /**
     * 渲染文件树
     */
    function renderFileTree(items, container, dirHandle, level = 0) {
        items.forEach(item => {
            const isDir = item.type === 'directory';
            const indent = level * 16;
            
            const itemDiv = document.createElement('div');
            itemDiv.className = `file-tree-item ${isDir ? 'folder' : 'file'}`;
            itemDiv.style.cssText = `
                padding-left: ${20 + indent}px;
            `;
            
            const icon = isDir ? '📁' : getFileIcon(item.name);
            
            // 文件操作按钮（仅文件显示）
            const fileActionsHtml = !isDir ? `
                <div class="file-actions">
                    <button class="file-action-btn edit-btn" title="编辑">✏️</button>
                    <button class="file-action-btn download-btn" title="下载">⬇️</button>
                    <button class="file-action-btn rename-btn" title="重命名">✍️</button>
                    <button class="file-action-btn delete-btn" title="删除">🗑️</button>
                </div>
            ` : '';
            
            itemDiv.innerHTML = `
                <span style="font-size: 14px;">${icon}</span>
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.name)}</span>
                ${fileActionsHtml}
            `;
            
            // 点击文件名：文件夹展开/折叠，文件打开编辑器
            itemDiv.addEventListener('click', async (e) => {
                // 如果点击的是操作按钮，不触发文件打开
                if (e.target.closest('.file-action-btn')) return;
                
                e.stopPropagation();
                if (isDir) {
                    // TODO: 展开/折叠子目录
                    console.log('展开子目录:', item.name);
                } else {
                    // 点击文件：在侧边栏编辑器中打开
                    openFileInEditor(item.handle, item.name);
                }
            });
            
            // 绑定文件操作按钮事件
            if (!isDir) {
                itemDiv.querySelector('.edit-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await openFileInEditor(item.handle, item.name);
                });
                
                itemDiv.querySelector('.download-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await StorageManager.downloadFile(item.handle, item.name);
                });
                
                itemDiv.querySelector('.rename-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const newName = prompt('新文件名:', item.name);
                    if (newName && newName !== item.name) {
                        await StorageManager.renameFileOrFolder(item.handle, item.name, newName);
                        loadWorkspaceList(); // 刷新文件树
                    }
                });
                
                itemDiv.querySelector('.delete-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`确定要删除 ${item.name} 吗？`)) {
                        await StorageManager.deleteFileOrFolder(item.handle, item.name, isDir);
                        loadWorkspaceList(); // 刷新文件树
                    }
                });
            }
            
            container.appendChild(itemDiv);
        });
    }
    
    /**
     * 在侧边栏编辑器中打开文件
     */
    async function openFileInEditor(fileHandle, fileName) {
        try {
            const fileBrowserView = document.getElementById('file-browser-view');
            const fileEditorPanel = document.getElementById('file-editor-panel');
            const editorFileName = document.getElementById('editor-file-name');
            const editorTextarea = document.getElementById('file-editor-textarea');
            
            // 切换到编辑器视图
            fileBrowserView.style.display = 'none';
            fileEditorPanel.classList.add('active');
            
            // 显示文件名
            editorFileName.textContent = fileName;
            editorTextarea.value = '加载中...';
            
            // 读取文件内容
            const content = await StorageManager.readFileContent(fileHandle);
            editorTextarea.value = content;
            
            // 保存文件名到编辑器（用于保存时重新获取句柄）
            fileEditorPanel.dataset.fileName = fileName;
            
            // 保存当前编辑的文件句柄（通过闭包）
            window._currentEditingFileHandle = fileHandle;
            
        } catch (error) {
            console.error('打开文件失败:', error);
            alert(`❌ 打开文件失败: ${error.message}`);
        }
    }
    
    /**
     * 关闭编辑器，返回文件浏览器
     */
    function closeFileEditor() {
        const fileBrowserView = document.getElementById('file-browser-view');
        const fileEditorPanel = document.getElementById('file-editor-panel');
        
        fileEditorPanel.classList.remove('active');
        fileBrowserView.style.display = 'flex';
        
        // 清除当前编辑的文件句柄
        window._currentEditingFileHandle = null;
    }
    
    /**
     * 获取文件图标
     */
    function getFileIcon(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const icons = {
            'js': '📜',
            'ts': '📘',
            'html': '🌐',
            'css': '🎨',
            'json': '📋',
            'md': '📝',
            'txt': '📄',
            'py': '🐍',
            'java': '☕',
            'xml': '📰'
        };
        return icons[ext] || '📄';
    }

    /**
     * 追加消息到聊天区域
     */
    function appendMessage(html) {
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.insertAdjacentHTML('beforeend', html);
            chat.scrollTop = chat.scrollHeight;
        }
    }

    /**
     * 设置聊天区域事件委托
     */
    function setupChatEventDelegation() {
        const chat = document.getElementById('agent-chat');
        if (!chat) return;

        // 使用事件委托处理代码块按钮点击
        chat.addEventListener('click', (e) => {
            const target = e.target.closest('button[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const assistantMessage = target.closest('.assistant-message');
            if (!assistantMessage) return;

            const codeBlock = assistantMessage.querySelector('.code-block');
            if (!codeBlock) return;

            // 从全局存储中获取代码（避免 HTML 转义问题）
            const blockId = codeBlock.dataset.codeId;
            const code = ChatManager.getCodeFromStore(blockId);
            
            if (!code) {
                console.error('未找到代码块:', blockId);
                return;
            }

            if (action === 'execute-code') {
                // 派发自定义事件,由 main.js 处理
                window.dispatchEvent(new CustomEvent('agent-execute-code', { detail: code }));
            } else if (action === 'copy-code') {
                // 复制代码
                navigator.clipboard.writeText(code).then(() => {
                    const originalText = target.textContent;
                    target.textContent = '✓ 已复制';
                    setTimeout(() => {
                        target.textContent = originalText;
                    }, 2000);
                });
            }
        });
    }

    /**
     * 显示/隐藏打字指示器
     */
    function showTypingIndicator() {
        const typingHTML = `
            <div class="typing" id="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        appendMessage(typingHTML);
    }

    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    /**
     * 更新发送按钮状态
     */
    function updateSendButtonState(isProcessing) {
        const sendBtn = document.getElementById('agent-send');
        if (sendBtn) {
            sendBtn.disabled = isProcessing;
            sendBtn.textContent = isProcessing ? '思考中...' : '发送 ➤';
        }
    }

    /**
     * 更新状态徽章
     */
    function updateStatusBadge(hasApiKey) {
        const badge = document.querySelector('#agent-title .status-badge');
        if (badge) {
            if (hasApiKey) {
                badge.className = 'status-badge status-active';
                badge.textContent = '已配置';
            } else {
                badge.className = 'status-badge status-inactive';
                badge.textContent = '未配置';
            }
        }
    }

    /**
     * 显示助手
     */
    function show() {
        if (assistant) {
            assistant.style.display = 'flex';
            
            // 保存显示状态到当前域名
            if (typeof ConfigManager !== 'undefined' && ConfigManager.saveChatVisibility) {
                ConfigManager.saveChatVisibility(true);
            }
        }
    }

    /**
     * 隐藏助手
     */
    function hide() {
        if (assistant) {
            assistant.style.display = 'none';
            // 触发 Agent 关闭事件，显示启动按钮
            window.dispatchEvent(new CustomEvent('agent-closed'));
            
            // 保存隐藏状态到当前域名
            if (typeof ConfigManager !== 'undefined' && ConfigManager.saveChatVisibility) {
                ConfigManager.saveChatVisibility(false);
            }
        }
    }

    /**
     * HTML 转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 初始化
    addStyles();

    return {
        createAssistant,
        appendMessage,
        showTypingIndicator,
        hideTypingIndicator,
        updateSendButtonState,
        updateStatusBadge,
        show,
        hide,
        loadWorkspaceList,  // 导出给 storage.js 调用，用于刷新侧边栏
        closeFileEditor     // 导出关闭编辑器功能
    };
})();


// ==================== api.js ====================

// ==================== API 调用模块 ====================

const APIManager = (function() {
    let isProcessing = false;

    /**
     * 调用 AI API
     */
    async function callAPI(userMessage, conversationHistory, config) {
        if (isProcessing) return null;
        
        isProcessing = true;
        
        try {
            const messages = buildMessages(userMessage, conversationHistory, config);
            
            const requestBody = {
                model: config.model,
                messages: messages,
                temperature: config.temperature,
                top_p: config.topP,
                max_tokens: config.maxTokens
            };

            const response = await makeRequest(requestBody, config.apiKey);
            
            if (response.choices && response.choices.length > 0) {
                const assistantMessage = response.choices[0].message.content;
                return { success: true, message: assistantMessage };
            } else {
                throw new Error('无效的 API 响应');
            }

        } catch (error) {
            console.error('API 调用失败:', error);
            return { success: false, error: error.message };
        } finally {
            isProcessing = false;
        }
    }

    /**
     * 构建消息数组
     */
    function buildMessages(currentMessage, history, config) {
        // 系统提示词
        const systemMessage = {
            role: 'system',
            content: `你是一个运行在浏览器中的 AI 助手。你可以:
1. 回答各种问题
2. 帮助分析和操作当前网页
3. 生成和执行 JavaScript 代码

当前页面信息:
- URL: ${window.location.href}
- 标题: ${document.title}

请用简洁、实用的方式回答问题。如果需要执行代码,请使用 \`\`\`javascript 代码块包裹。`
        };

        // 获取最近的对话历史(最多保留最近 10 轮)
        const recentHistory = history.slice(-10);
        
        // 构建完整的消息数组
        const messages = [
            systemMessage,
            ...recentHistory.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.content
            })),
            {
                role: 'user',
                content: currentMessage
            }
        ];

        return messages;
    }

    /**
     * 发起 HTTP 请求
     */
    function makeRequest(requestBody, apiKey) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'AI Browser Agent'
                },
                data: JSON.stringify(requestBody),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            resolve(data);
                        } catch (error) {
                            reject(new Error('响应解析失败'));
                        }
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    /**
     * 检查是否正在处理
     */
    function getProcessingState() {
        return isProcessing;
    }

    return {
        callAPI,
        getProcessingState
    };
})();


// ==================== chat.js ====================

// ==================== 聊天逻辑模块 ====================

const ChatManager = (function() {
    /**
     * 处理用户发送的消息
     */
    async function handleMessage(message, config) {
        // 检查快捷命令
        if (message.startsWith('/js ')) {
            const code = message.substring(4);
            executeJavaScript(code);
            return { type: 'command', command: 'js' };
        }
        
        if (message === '/clear') {
            window.dispatchEvent(new CustomEvent('agent-clear-chat'));
            return { type: 'command', command: 'clear' };
        }
        
        if (message === '/help') {
            showHelp();
            return { type: 'command', command: 'help' };
        }

        // 正常对话
        return { type: 'chat', message: message };
    }

    /**
     * 执行 JavaScript 代码
     */
    function executeJavaScript(code) {
        if (!ConfigManager.get('jsExecutionEnabled')) {
            UIManager.appendMessage(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #ef4444;">
                        ⚠️ JavaScript 执行已被禁用,请在设置中启用
                    </div>
                </div>
            `);
            return;
        }

        try {
            // 先检查代码是否有明显的语法错误
            new Function(code);
            
            // 执行代码
            const result = unsafeWindow.eval(code);
            
            const resultStr = typeof result === 'object' 
                ? JSON.stringify(result, null, 2) 
                : String(result);
            
            // 直接插入到聊天区域，不使用 addAssistantMessage（避免二次格式化）
            UIManager.appendMessage(`
                <div class="assistant-message">
                    <div class="execution-result execution-success">
                        <strong>✅ 执行成功</strong>
                        <br>
                        <pre style="margin-top: 8px; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(resultStr)}</pre>
                    </div>
                </div>
            `);
            
            // 保存执行记录
            const history = ConfigManager.get('conversationHistory');
            history.push({ 
                role: 'system', 
                content: `[代码执行] ${code}\n结果: ${resultStr}` 
            });
            ConfigManager.saveConversationHistory(history);
            
        } catch (error) {
            // 分析错误类型
            let errorType = '未知错误';
            let suggestion = '';
            
            if (error instanceof SyntaxError) {
                errorType = '语法错误';
                suggestion = '<br><br>💡 <strong>建议:</strong> 请让 AI 重新生成代码,并检查:<br>• 字符串是否使用了正确的引号<br>• 模板字符串是否使用了反引号 (`)<br>• 括号是否匹配';
            } else if (error instanceof ReferenceError) {
                errorType = '引用错误';
                suggestion = '<br><br>💡 <strong>建议:</strong> 变量或函数未定义,请检查代码中的变量名是否正确';
            } else if (error instanceof TypeError) {
                errorType = '类型错误';
                suggestion = '<br><br>💡 <strong>建议:</strong> 调用了不存在的方法或属性,请检查对象是否存在';
            }
            
            UIManager.appendMessage(`
                <div class="execution-result execution-error">
                    <strong>❌ 执行失败 (${errorType})</strong>
                    <br>
                    <pre style="margin-top: 8px;">${escapeHtml(error.toString())}</pre>
                    ${suggestion}
                </div>
            `);
            
            console.error('❌ 代码执行失败:', error);
            console.log('📝 尝试执行的代码:', code);
        }
    }

    /**
     * 显示帮助信息
     */
    function showHelp() {
        const helpText = `
<strong>💡 使用帮助</strong>

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行 JavaScript 代码
• <code>/clear</code> - 清空对话历史
• <code>/help</code> - 显示此帮助

<strong>示例:</strong>
• "帮我修改页面背景色为蓝色"
• "/js document.body.style.background = 'blue'"
• "提取页面上所有链接"
• "分析当前页面的结构"

<strong>提示:</strong>
• 按 Enter 发送消息,Shift+Enter 换行
• 可以拖拽标题栏移动窗口
• 点击 − 最小化窗口
• 代码块可以直接执行或复制
        `;
        
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content">${helpText}</div>
            </div>
        `);
    }

    /**
     * 添加用户消息到界面
     */
    function addUserMessage(text) {
        const messageHTML = `
            <div class="user-message">
                <div class="message-content">${escapeHtml(text)}</div>
            </div>
        `;
        UIManager.appendMessage(messageHTML);
        
        // 保存到历史
        const history = ConfigManager.get('conversationHistory');
        history.push({ role: 'user', content: text });
        ConfigManager.saveConversationHistory(history);
    }

    /**
     * 添加助手消息到界面
     */
    function addAssistantMessage(text) {
        const formattedText = formatMessage(text);
        UIManager.appendMessage(formattedText);
        
        // 保存到历史
        const history = ConfigManager.get('conversationHistory');
        history.push({ role: 'assistant', content: text });
        ConfigManager.saveConversationHistory(history);
    }

    /**
     * 全局代码块存储（避免 HTML 转义问题）
     */
    const codeBlockStore = {};
    let codeBlockIndex = 0;
    
    /**
     * 获取存储的代码（供 UI 模块调用）
     */
    function getCodeFromStore(blockId) {
        return codeBlockStore[blockId] || '';
    }

    /**
     * 格式化消息(支持代码块)
     */
    function formatMessage(text) {
        // 先处理代码块,避免被转义
        let formatted = text;
        
        // 处理代码块 - 先提取代码块并标记占位符
        const codeBlocks = [];
        formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const index = codeBlocks.length;
            codeBlocks.push({ lang: lang || 'text', code: code.trim() });
            return `__CODE_BLOCK_${index}__`;
        });
        
        // 转义普通文本
        formatted = escapeHtml(formatted);
        
        // 恢复代码块 - 同时存储到全局和 HTML 中
        formatted = formatted.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
            const block = codeBlocks[parseInt(index)];
            
            // 生成唯一 ID 并存储到全局（用于执行/复制）
            const blockId = 'code_' + Date.now() + '_' + (++codeBlockIndex);
            codeBlockStore[blockId] = block.code;
            
            const isJs = block.lang === 'javascript' || block.lang === 'js';
            
            // 对代码进行 HTML 转义用于显示
            const safeCode = escapeHtml(block.code);
            
            // HTML 中显示代码（用于视觉展示）
            return [
                `<div class="code-block" data-code-id="${blockId}" data-lang="${block.lang}">`,
                `<div class="code-language">${block.lang}</div>`,
                `<pre>${safeCode}</pre>`,
                `</div>`,
                `<div class="code-actions">`,
                isJs ? '<button class="code-btn execute" data-action="execute-code">▶ 执行代码</button>' : '',
                '<button class="code-btn" data-action="copy-code">📋 复制</button>',
                `</div>`
            ].join('');
        });
        
        // 处理行内代码
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>');
        
        return `
            <div class="assistant-message">
                <div class="message-content">${formatted}</div>
            </div>
        `;
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
     * 清空聊天
     */
    function clearChat() {
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.innerHTML = '';
        }
        ConfigManager.saveConversationHistory([]);
        showWelcomeMessage();
    }

    /**
     * 显示欢迎消息
     */
    function showWelcomeMessage() {
        const config = ConfigManager.getAll();
        const welcomeHTML = `
            <div class="assistant-message">
                <div class="message-content">
                    👋 你好!我是你的 <strong>浏览器 AI 助手</strong>。
                    
<strong>功能特性:</strong>
• 💬 智能对话 - 支持多种免费模型
• 💻 代码执行 - 支持 JavaScript 执行
• 🎯 页面操作 - 可以操作当前页面元素
• 💾 本地存储 - 对话历史自动保存
• 🆓 完全免费 - 无需付费即可使用

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行 JavaScript
• <code>/clear</code> - 清空对话
• <code>/help</code> - 显示帮助

${!config.apiKey ? '<strong style="color: #ef4444;">⚠️ 请先在设置中配置 API Key</strong>' : ''}
                </div>
            </div>
        `;
        UIManager.appendMessage(welcomeHTML);
    }

    return {
        handleMessage,
        addUserMessage,
        addAssistantMessage,
        clearChat,
        showWelcomeMessage,
        executeJavaScript,
        getCodeFromStore
    };
})();


// ==================== settings.js ====================

// ==================== 设置对话框模块 ====================

const SettingsManager = (function() {
    /**
     * 显示设置对话框
     */
    function showSettings() {
        const config = ConfigManager.getAll();
        
        // 添加设置对话框样式
        GM_addStyle(`
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 1000000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .modal-content {
                background: white;
                padding: 24px;
                border-radius: 12px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                max-height: 80vh;
                overflow-y: auto;
            }
            .modal-title {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 16px;
                color: #1f2937;
            }
            .form-group {
                margin-bottom: 16px;
            }
            .form-label {
                display: block;
                margin-bottom: 6px;
                font-size: 14px;
                font-weight: 500;
                color: #374151;
            }
            .form-input {
                width: 100%;
                padding: 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                transition: border-color 0.2s;
            }
            .form-input:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            .form-hint {
                font-size: 12px;
                color: #6b7280;
                margin-top: 4px;
            }
            .modal-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 20px;
            }
            .btn-primary {
                background: #667eea;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            }
            .btn-secondary {
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #d1d5db;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            }
            .toggle-switch {
                position: relative;
                display: inline-block;
                width: 48px;
                height: 24px;
            }
            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 24px;
            }
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .toggle-slider {
                background-color: #667eea;
            }
            input:checked + .toggle-slider:before {
                transform: translateX(24px);
            }
            .setting-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid #e5e7eb;
            }
        `);

        const modalHTML = `
            <div class="modal-overlay" id="settings-modal">
                <div class="modal-content">
                    <div class="modal-title">⚙️ 设置</div>
                    
                    <div class="form-group">
                        <label class="form-label">API Key *</label>
                        <input type="password" class="form-input" id="setting-api-key" 
                               value="${config.apiKey}" 
                               placeholder="输入你的 API Key">
                        <div class="form-hint">
                            从 <a href="https://openrouter.ai/keys" target="_blank">OpenRouter Keys</a> 获取免费 API Key
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">模型选择 (免费)</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <select class="form-input" id="setting-model" style="flex: 1;">
                                <!-- 模型选项将由 ModelManager 动态填充 -->
                            </select>
                            <button class="btn-secondary" id="refresh-models" title="刷新模型列表" style="padding: 8px 12px; white-space: nowrap;">🔄 刷新</button>
                        </div>
                        <div class="form-hint">
                            所有标记 :free 的模型都完全免费 | Auto 会自动选择最佳可用模型 | 点击刷新获取最新列表
                        </div>
                        <div id="models-status" style="margin-top: 8px; font-size: 12px; color: #6b7280;"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Temperature: <span id="temp-value">${config.temperature}</span></label>
                        <input type="range" class="form-input" id="setting-temperature" 
                               min="0" max="1" step="0.1" value="${config.temperature}">
                        <div class="form-hint">控制回复的随机性 (0=确定, 1=创意)</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Top P: <span id="topp-value">${config.topP}</span></label>
                        <input type="range" class="form-input" id="setting-top-p" 
                               min="0" max="1" step="0.1" value="${config.topP}">
                        <div class="form-hint">核采样参数,控制多样性 (0.95 推荐)</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">最大输出 Token</label>
                        <input type="number" class="form-input" id="setting-max-tokens" 
                               value="${config.maxTokens}" min="100" max="4096">
                    </div>

                    <div class="setting-row">
                        <div>
                            <div style="font-weight: 500;">JavaScript 执行</div>
                            <div style="font-size: 12px; color: #6b7280;">允许执行 AI 生成的代码</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-js-enabled" ${config.jsExecutionEnabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="modal-actions">
                        <button class="btn-secondary" id="cancel-settings">取消</button>
                        <button class="btn-primary" id="save-settings">保存</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 初始化模型选择
        initializeModelSelect(config.model);

        // 温度滑块实时更新
        document.getElementById('setting-temperature').addEventListener('input', (e) => {
            document.getElementById('temp-value').textContent = e.target.value;
        });

        // Top P 滑块实时更新
        document.getElementById('setting-top-p').addEventListener('input', (e) => {
            document.getElementById('topp-value').textContent = e.target.value;
        });

        // 刷新模型列表
        setupModelRefresh();

        // 保存设置
        document.getElementById('save-settings').addEventListener('click', saveSettings);

        // 取消
        document.getElementById('cancel-settings').addEventListener('click', closeModal);
    }

    /**
     * 初始化模型选择
     */
    function initializeModelSelect(currentModel) {
        const cached = ModelManager.loadCachedModels();
        ModelManager.updateModelSelect(cached.models, currentModel);
        
        const modelsStatus = document.getElementById('models-status');
        if (modelsStatus && !cached.isExpired) {
            modelsStatus.innerHTML = `<span style="color: #6b7280;">📦 已加载缓存 (${cached.hoursAgo}小时前) | 点击刷新获取最新</span>`;
        }
    }

    /**
     * 设置模型刷新功能
     */
    function setupModelRefresh() {
        const refreshBtn = document.getElementById('refresh-models');
        const modelsStatus = document.getElementById('models-status');
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 加载中...';
            modelsStatus.innerHTML = '<span style="color: #3b82f6;">⏳ 正在获取最新模型列表...</span>';
            
            try {
                const result = await ModelManager.refreshModels();
                
                if (result.success) {
                    const select = document.getElementById('setting-model');
                    const currentModel = select.value;
                    ModelManager.updateModelSelect(result.models, currentModel);
                    modelsStatus.innerHTML = `<span style="color: #10b981;">✅ 已更新!找到 ${result.count} 个免费模型 (最后更新: ${new Date().toLocaleTimeString()})</span>`;
                } else {
                    throw new Error(result.error);
                }
                
            } catch (error) {
                console.error('获取模型列表失败:', error);
                modelsStatus.innerHTML = `<span style="color: #ef4444;">❌ 获取失败: ${error.message}</span><br><span style="color: #6b7280;">提示: Auto 模式仍然可用</span>`;
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 刷新';
            }
        });
    }

    /**
     * 保存设置
     */
    function saveSettings() {
        const apiKey = document.getElementById('setting-api-key').value.trim();
        const model = document.getElementById('setting-model').value;
        const temperature = parseFloat(document.getElementById('setting-temperature').value);
        const topP = parseFloat(document.getElementById('setting-top-p').value);
        const maxTokens = parseInt(document.getElementById('setting-max-tokens').value);
        const jsEnabled = document.getElementById('setting-js-enabled').checked;

        // 保存到配置管理器 (浏览器存储)
        ConfigManager.set('apiKey', apiKey);
        ConfigManager.set('model', model);
        ConfigManager.set('temperature', temperature);
        ConfigManager.set('topP', topP);
        ConfigManager.set('maxTokens', maxTokens);
        ConfigManager.set('jsExecutionEnabled', jsEnabled);

        closeModal();
        
        // 更新 UI 状态徽章
        UIManager.updateStatusBadge(apiKey.length > 0);
        
        // 显示成功消息
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #10b981;">
                    ✅ 设置已保存 - 开始免费使用!
                </div>
            </div>
        `);
    }

    /**
     * 关闭模态框
     */
    function closeModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.remove();
    }

    return {
        showSettings,
        closeModal
    };
})();


// ==================== storage.js ====================

// ==================== 存储管理工作空间模块 ====================

const StorageManager = (function() {
    const WORKSPACE_KEY = 'agent_workspaces';
    const HANDLE_STORE_KEY = 'agent_directory_handles';
    let currentWorkspace = null;
    let workspaces = [];

    /**
     * 从 IndexedDB 恢复 directory handle
     */
    async function restoreDirectoryHandle(workspaceId) {
        try {
            const db = await openHandleDB();
            const transaction = db.transaction(HANDLE_STORE_KEY, 'readonly');
            const store = transaction.objectStore(HANDLE_STORE_KEY);
            const handle = await new Promise((resolve, reject) => {
                const request = store.get(workspaceId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (handle) {
                console.log('✅ 从 IndexedDB 恢复了 folderHandle');
                // 检查权限是否仍然有效
                try {
                    const permission = await handle.queryPermission({ mode: 'readwrite' });
                    if (permission === 'granted') {
                        console.log('✅ folderHandle 权限有效，可直接使用');
                        return handle;
                    } else {
                        console.warn('⚠️ folderHandle 权限未授予，需要用户点击授权');
                        // 不自动调用 requestPermission，因为需要用户手势
                        // 返回 null，触发 promptReopenFolder 提示
                    }
                } catch (e) {
                    console.warn('⚠️ 查询权限失败，句柄可能已损坏:', e);
                }
            }
            
            return null;
        } catch (error) {
            console.error('恢复 folderHandle 失败:', error);
            return null;
        }
    }

    /**
     * 将 directory handle 保存到 IndexedDB
     */
    async function persistDirectoryHandle(workspaceId, dirHandle) {
        try {
            const db = await openHandleDB();
            const transaction = db.transaction(HANDLE_STORE_KEY, 'readwrite');
            const store = transaction.objectStore(HANDLE_STORE_KEY);
            
            await new Promise((resolve, reject) => {
                const request = store.put(dirHandle, workspaceId);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            console.log('✅ folderHandle 已保存到 IndexedDB');
        } catch (error) {
            console.error('保存 folderHandle 失败:', error);
        }
    }

    /**
     * 打开 IndexedDB
     */
    function openHandleDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('AgentDirectoryHandles', 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(HANDLE_STORE_KEY)) {
                    db.createObjectStore(HANDLE_STORE_KEY);
                }
            };
            
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * 初始化工作空间
     */
    async function init() {
        try {
            const saved = GM_getValue(WORKSPACE_KEY, null);
            if (saved) {
                workspaces = JSON.parse(saved);
            }
            
            // 如果没有工作空间,创建默认的
            if (workspaces.length === 0) {
                createWorkspace('Default Workspace', '默认工作空间');
            }
            
            // 加载最后一个使用的工作空间
            const lastUsed = GM_getValue('last_workspace', null);
            if (lastUsed) {
                await loadWorkspace(lastUsed);
            } else {
                await loadWorkspace(workspaces[0].id);
            }
            
            // 尝试恢复 folderHandle（但不检查权限，等待用户展开侧边栏时再检查）
            if (currentWorkspace && currentWorkspace.folderPath) {
                const restoredHandle = await restoreDirectoryHandleWithoutCheck(currentWorkspace.id);
                if (restoredHandle) {
                    currentWorkspace.folderHandle = restoredHandle;
                    console.log('✅ 成功恢复 folderHandle（权限将在需要时检查）');
                } else {
                    console.log('ℹ️ folderHandle 将在首次展开侧边栏时恢复');
                    // 不在页面加载时提示，等待用户展开侧边栏时再提示
                }
            }
        } catch (error) {
            console.error('初始化工作空间失败:', error);
            workspaces = [];
            createWorkspace('Default Workspace', '默认工作空间');
        }
    }
    
    /**
     * 从 IndexedDB 恢复 directory handle（不检查权限）
     * 用于页面初始化时快速加载，避免弹出授权对话框
     */
    async function restoreDirectoryHandleWithoutCheck(workspaceId) {
        try {
            const db = await openHandleDB();
            const transaction = db.transaction(HANDLE_STORE_KEY, 'readonly');
            const store = transaction.objectStore(HANDLE_STORE_KEY);
            const handle = await new Promise((resolve, reject) => {
                const request = store.get(workspaceId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (handle) {
                console.log('✅ 从 IndexedDB 恢复了 folderHandle（未验证权限）');
                return handle;
            }
            
            return null;
        } catch (error) {
            console.error('恢复 folderHandle 失败:', error);
            return null;
        }
    }

    /**
     * 提示用户重新打开文件夹
     */
    function promptReopenFolder() {
        if (!currentWorkspace || !currentWorkspace.folderPath) return;
        
        const shouldReopen = confirm(
            `⚠️ 工作空间 "${currentWorkspace.name}" 关联了本地文件夹\n\n` +
            `文件夹路径: ${currentWorkspace.folderPath}\n\n` +
            `由于浏览器安全限制，需要重新授权访问。\n\n` +
            `是否现在重新打开该文件夹？`
        );
        
        if (shouldReopen) {
            // 调用 openFolder，但需要用户手动选择相同的文件夹
            openFolder();
        }
    }

    /**
     * 创建工作空间
     */
    function createWorkspace(name, description = '') {
        const workspace = {
            id: generateId(),
            name: name,
            description: description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            data: {
                conversations: [],
                settings: {},
                customData: {}
            }
        };
        
        workspaces.push(workspace);
        saveWorkspaces();
        
        return workspace;
    }

    /**
     * 删除工作空间
     */
    function deleteWorkspace(id) {
        const index = workspaces.findIndex(ws => ws.id === id);
        if (index > -1) {
            workspaces.splice(index, 1);
            saveWorkspaces();
            
            // 如果删除的是当前工作空间,切换到第一个
            if (currentWorkspace && currentWorkspace.id === id) {
                if (workspaces.length > 0) {
                    loadWorkspace(workspaces[0].id);
                } else {
                    currentWorkspace = null;
                }
            }
            
            return true;
        }
        return false;
    }

    /**
     * 重命名工作空间
     */
    function renameWorkspace(id, newName) {
        const workspace = workspaces.find(ws => ws.id === id);
        if (workspace) {
            workspace.name = newName;
            workspace.updatedAt = Date.now();
            saveWorkspaces();
            return true;
        }
        return false;
    }

    /**
     * 加载工作空间
     */
    async function loadWorkspace(id) {
        console.log('🔍 调试 loadWorkspace - 开始加载工作空间:', id);
        const workspace = workspaces.find(ws => ws.id === id);
        if (workspace) {
            currentWorkspace = workspace;
            GM_setValue('last_workspace', id);
            console.log('🔍 调试 loadWorkspace - 找到工作空间, folderHandle:', workspace.folderHandle);
            console.log('🔍 调试 loadWorkspace - currentWorkspace.folderHandle:', currentWorkspace.folderHandle);
            
            // 如果工作空间有关联的文件夹路径但没有 handle，尝试恢复（不检查权限）
            if (workspace.folderPath && !workspace.folderHandle) {
                console.log('⚠️ loadWorkspace - 需要恢复 folderHandle');
                const restoredHandle = await restoreDirectoryHandleWithoutCheck(workspace.id);
                if (restoredHandle) {
                    workspace.folderHandle = restoredHandle;
                    currentWorkspace.folderHandle = restoredHandle;
                    console.log('✅ loadWorkspace - 成功恢复 folderHandle（权限将在需要时检查）');
                }
            }
            
            console.log('🔍 调试 loadWorkspace - 最终 folderHandle:', currentWorkspace.folderHandle);
            return workspace;
        }
        console.warn('🔍 调试 loadWorkspace - 未找到工作空间:', id);
        return null;
    }

    /**
     * 获取当前工作空间
     */
    function getCurrentWorkspace() {
        return currentWorkspace;
    }

    /**
     * 获取所有工作空间列表
     */
    function getAllWorkspaces() {
        return workspaces.map(ws => ({
            id: ws.id,
            name: ws.name,
            description: ws.description,
            createdAt: ws.createdAt,
            updatedAt: ws.updatedAt,
            isCurrent: currentWorkspace && currentWorkspace.id === ws.id
        }));
    }

    /**
     * 保存数据到当前工作空间
     */
    async function saveToWorkspace(key, value) {
        if (!currentWorkspace) {
            console.error('没有激活的工作空间');
            return false;
        }
        
        console.log('🔍 调试 saveToWorkspace - 保存前 currentWorkspace.folderHandle:', currentWorkspace.folderHandle);
        
        currentWorkspace.data[key] = value;
        currentWorkspace.updatedAt = Date.now();
        saveWorkspaces();
        
        console.log('🔍 调试 saveToWorkspace - 保存后 currentWorkspace.folderHandle:', currentWorkspace.folderHandle);
        
        // 同步到文件夹
        if (currentWorkspace.folderHandle && currentWorkspace.folderHandle.kind === 'directory') {
            try {
                console.log('📁 saveToWorkspace - 开始同步到文件夹...');
                await saveWorkspaceConfigToFolder(currentWorkspace, currentWorkspace.folderHandle);
                console.log('✅ saveToWorkspace - 已同步到文件夹');
            } catch (error) {
                console.error('❌ saveToWorkspace - 同步到文件夹失败:', error);
                
                // handle 失效了，清除它
                currentWorkspace.folderHandle = null;
                
                // 如果有 folderPath，提示用户重新授权
                if (currentWorkspace.folderPath) {
                    console.warn('⚠️ folderHandle 已失效，需要重新授权');
                    setTimeout(() => {
                        promptReopenFolder();
                    }, 500);
                }
            }
        } else if (currentWorkspace.folderPath && !currentWorkspace.folderHandle) {
            // 有关联的文件夹路径但没有 handle，提示用户重新授权
            console.warn('⚠️ 工作空间关联了文件夹但 handle 无效，提示重新授权');
            setTimeout(() => {
                promptReopenFolder();
            }, 500);
        }
        
        return true;
    }

    /**
     * 从当前工作空间读取数据
     */
    function loadFromWorkspace(key, defaultValue = null) {
        if (!currentWorkspace) {
            return defaultValue;
        }
        return currentWorkspace.data[key] !== undefined ? currentWorkspace.data[key] : defaultValue;
    }

    /**
     * 保存对话历史到工作空间
     */
    function saveConversations(conversations) {
        return saveToWorkspace('conversations', conversations);
    }

    /**
     * 加载对话历史
     */
    function loadConversations() {
        return loadFromWorkspace('conversations', []);
    }

    /**
     * 保存自定义设置
     */
    function saveCustomSettings(settings) {
        return saveToWorkspace('settings', settings);
    }

    /**
     * 加载自定义设置
     */
    function loadCustomSettings() {
        return loadFromWorkspace('settings', {});
    }

    /**
     * 导出工作空间为 JSON
     */
    function exportWorkspace(id) {
        const workspace = workspaces.find(ws => ws.id === id);
        if (workspace) {
            const exportData = {
                version: '1.0.0',
                exportedAt: new Date().toISOString(),
                workspace: workspace
            };
            return JSON.stringify(exportData, null, 2);
        }
        return null;
    }

    /**
     * 从 JSON 导入工作空间
     */
    function importWorkspace(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.workspace) {
                const workspace = data.workspace;
                
                // 生成新 ID 避免冲突
                workspace.id = generateId();
                workspace.importedAt = Date.now();
                
                workspaces.push(workspace);
                saveWorkspaces();
                
                return workspace;
            }
        } catch (error) {
            console.error('导入失败:', error);
        }
        return null;
    }

    /**
     * 显示工作空间管理对话框
     */
    function showWorkspaceManager() {
        // 添加样式
        GM_addStyle(`
            .workspace-manager {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 24px;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                z-index: 1000001;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
            }
            .workspace-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 12px;
                border-bottom: 2px solid #e5e7eb;
            }
            .workspace-title {
                font-size: 20px;
                font-weight: 600;
                color: #1f2937;
            }
            .workspace-list {
                margin-bottom: 20px;
            }
            .workspace-item {
                padding: 12px;
                margin-bottom: 8px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .workspace-item:hover {
                border-color: #667eea;
                background: #f9fafb;
            }
            .workspace-item.active {
                border-color: #667eea;
                background: #eef2ff;
            }
            .workspace-info {
                flex: 1;
            }
            .workspace-name {
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 4px;
            }
            .workspace-meta {
                font-size: 12px;
                color: #6b7280;
            }
            .workspace-actions {
                display: flex;
                gap: 8px;
            }
            .ws-btn {
                padding: 6px 12px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            }
            .ws-btn-primary {
                background: #667eea;
                color: white;
            }
            .ws-btn-secondary {
                background: #f3f4f6;
                color: #374151;
            }
            .ws-btn-danger {
                background: #fee2e2;
                color: #dc2626;
            }
            .ws-btn:hover {
                opacity: 0.8;
            }
            .create-workspace-form {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 2px solid #e5e7eb;
            }
            .form-input {
                width: 100%;
                padding: 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                margin-bottom: 12px;
                font-size: 14px;
            }
            .badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
                margin-left: 8px;
            }
            .badge-current {
                background: #d1fae5;
                color: #065f46;
            }
            .folder-section {
                margin-top: 20px;
                padding: 16px;
                background: #f9fafb;
                border-radius: 8px;
                border: 2px dashed #d1d5db;
            }
            .folder-info {
                font-size: 13px;
                color: #6b7280;
                margin-top: 8px;
            }
        `);

        const workspacesList = getAllWorkspaces();
        
        let html = `
            <div class="workspace-manager" id="workspace-manager-modal">
                <div class="workspace-header">
                    <div class="workspace-title">📁 工作空间管理</div>
                    <button class="ws-btn ws-btn-secondary" id="btn-close-ws">关闭</button>
                </div>
                
                <div class="workspace-list">
        `;

        workspacesList.forEach(ws => {
            html += `
                <div class="workspace-item ${ws.isCurrent ? 'active' : ''}" data-id="${ws.id}">
                    <div class="workspace-info">
                        <div class="workspace-name">
                            ${escapeHtml(ws.name)}
                            ${ws.isCurrent ? '<span class="badge badge-current">当前</span>' : ''}
                        </div>
                        <div class="workspace-meta">
                            创建于: ${new Date(ws.createdAt).toLocaleDateString()} | 
                            更新于: ${new Date(ws.updatedAt).toLocaleDateString()}
                        </div>
                    </div>
                    <div class="workspace-actions">
                        ${!ws.isCurrent ? `<button class="ws-btn ws-btn-primary ws-btn-switch" data-ws-id="${ws.id}">切换</button>` : ''}
                        <button class="ws-btn ws-btn-secondary ws-btn-rename" data-ws-id="${ws.id}" data-ws-name="${escapeHtml(ws.name)}">重命名</button>
                        <button class="ws-btn ws-btn-secondary ws-btn-export" data-ws-id="${ws.id}">导出</button>
                        ${workspacesList.length > 1 ? `<button class="ws-btn ws-btn-danger ws-btn-delete" data-ws-id="${ws.id}">删除</button>` : ''}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                
                <div class="create-workspace-form">
                    <h3 style="margin-bottom: 12px; color: #1f2937;">➕ 创建工作空间</h3>
                    <input type="text" class="form-input" id="new-workspace-name" placeholder="工作空间名称">
                    <input type="text" class="form-input" id="new-workspace-desc" placeholder="描述 (可选)">
                    <button class="ws-btn ws-btn-primary" id="btn-create-ws" style="width: 100%; padding: 10px;">
                        创建工作空间
                    </button>
                </div>
                
                <div class="folder-section">
                    <h3 style="margin-bottom: 12px; color: #1f2937;">📂 打开本地文件夹</h3>
                    <p style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
                        选择一个本地文件夹作为工作空间,数据将保存在该文件夹中
                    </p>
                    <button class="ws-btn ws-btn-primary" id="btn-open-folder" style="width: 100%; padding: 10px; margin-bottom: 8px;">
                        📁 选择文件夹
                    </button>
                    ${currentWorkspace && currentWorkspace.folderHandle ? `
                    <button class="ws-btn ws-btn-secondary" id="btn-file-manager" style="width: 100%; padding: 10px;">
                        🗂️ 打开文件管理器
                    </button>
                    ` : ''}
                    <div class="folder-info" id="folder-path"></div>
                </div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                    <h3 style="margin-bottom: 12px; color: #1f2937;">📥 导入工作空间</h3>
                    <input type="file" class="form-input" id="import-workspace-file" accept=".json">
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        
        // 绑定所有按钮事件
        bindWorkspaceEvents();
    }

    /**
     * 绑定工作空间管理器事件
     */
    function bindWorkspaceEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('btn-close-ws');
        if (closeBtn) closeBtn.addEventListener('click', closeWorkspaceManager);
        
        // 创建工作空间按钮
        const createBtn = document.getElementById('btn-create-ws');
        if (createBtn) createBtn.addEventListener('click', createNewWorkspace);
        
        // 打开文件夹按钮
        const openFolderBtn = document.getElementById('btn-open-folder');
        if (openFolderBtn) openFolderBtn.addEventListener('click', openFolder);
        
        // 打开文件管理器按钮
        const fileManagerBtn = document.getElementById('btn-file-manager');
        if (fileManagerBtn) fileManagerBtn.addEventListener('click', showFileManager);
        
        // 导入文件按钮
        const importFile = document.getElementById('import-workspace-file');
        if (importFile) importFile.addEventListener('change', (e) => handleImport(e.target));
        
        // 切换按钮
        document.querySelectorAll('.ws-btn-switch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wsId = e.target.dataset.wsId;
                switchWorkspace(wsId);
            });
        });
        
        // 重命名按钮
        document.querySelectorAll('.ws-btn-rename').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wsId = e.target.dataset.wsId;
                const wsName = e.target.dataset.wsName;
                renameWorkspacePrompt(wsId, wsName);
            });
        });
        
        // 导出按钮
        document.querySelectorAll('.ws-btn-export').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wsId = e.target.dataset.wsId;
                exportWorkspaceFile(wsId);
            });
        });
        
        // 删除按钮
        document.querySelectorAll('.ws-btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wsId = e.target.dataset.wsId;
                deleteWorkspaceConfirm(wsId);
            });
        });
    }

    /**
     * 关闭工作空间管理器
     */
    function closeWorkspaceManager() {
        const modal = document.getElementById('workspace-manager-modal');
        if (modal) modal.remove();
    }

    /**
     * 切换工作空间
     */
    function switchWorkspace(id) {
        loadWorkspace(id);
        closeWorkspaceManager();
        
        // 刷新页面或通知其他模块
        window.dispatchEvent(new CustomEvent('workspace-changed', { 
            detail: { workspaceId: id } 
        }));
        
        alert(`已切换到工作空间: ${currentWorkspace.name}`);
    }

    /**
     * 创建新工作空间
     */
    function createNewWorkspace() {
        const nameInput = document.getElementById('new-workspace-name');
        const descInput = document.getElementById('new-workspace-desc');
        
        const name = nameInput.value.trim();
        const description = descInput.value.trim();
        
        if (!name) {
            alert('请输入工作空间名称');
            return;
        }
        
        const workspace = createWorkspace(name, description);
        closeWorkspaceManager();
        showWorkspaceManager(); // 重新打开以显示新列表
        
        alert(`工作空间 "${name}" 创建成功!`);
    }

    /**
     * 重命名工作空间提示
     */
    function renameWorkspacePrompt(id, currentName) {
        const newName = prompt('输入新的工作空间名称:', currentName);
        if (newName && newName.trim()) {
            renameWorkspace(id, newName.trim());
            closeWorkspaceManager();
            showWorkspaceManager();
        }
    }

    /**
     * 删除工作空间确认
     */
    function deleteWorkspaceConfirm(id) {
        if (confirm('确定要删除这个工作空间吗?此操作不可恢复!')) {
            deleteWorkspace(id);
            closeWorkspaceManager();
            showWorkspaceManager();
        }
    }

    /**
     * 导出工作空间文件
     */
    function exportWorkspaceFile(id) {
        const jsonData = exportWorkspace(id);
        if (jsonData) {
            const workspace = workspaces.find(ws => ws.id === id);
            const filename = `workspace-${workspace.name}-${Date.now()}.json`;
            
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert('工作空间已导出!');
        }
    }

    /**
     * 处理导入文件
     */
    function handleImport(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const workspace = importWorkspace(e.target.result);
            if (workspace) {
                closeWorkspaceManager();
                showWorkspaceManager();
                alert(`工作空间 "${workspace.name}" 导入成功!`);
            } else {
                alert('导入失败,请检查文件格式');
            }
        };
        reader.readAsText(file);
    }

    /**
     * 打开本地文件夹 (使用 File System Access API)
     */
    async function openFolder() {
        try {
            // 检查浏览器支持
            if (!('showDirectoryPicker' in window)) {
                alert('❌ 您的浏览器不支持文件夹访问功能\n\n请使用 Chrome 86+ 或 Edge 86+ 浏览器');
                return;
            }

            // 打开文件夹选择对话框
            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            const folderName = dirHandle.name;
            
            // 检查工作空间配置文件
            let workspaceData = null;
            try {
                const configFile = await dirHandle.getFileHandle('.workspace.json', { create: false });
                const file = await configFile.getFile();
                const content = await file.text();
                workspaceData = JSON.parse(content);
                console.log('✅ 找到工作空间配置文件');
            } catch (error) {
                console.log('ℹ️ 未找到配置文件,将创建新的工作空间');
            }

            // 创建工作空间
            let workspace;
            if (workspaceData) {
                // 使用已有配置
                workspace = {
                    id: workspaceData.id || generateId(),
                    name: workspaceData.name || folderName,
                    description: workspaceData.description || `本地文件夹: ${folderName}`,
                    createdAt: workspaceData.createdAt || Date.now(),
                    updatedAt: Date.now(),
                    data: workspaceData.data || {
                        conversations: [],
                        settings: {},
                        customData: {}
                    },
                    folderPath: folderName,
                    folderHandle: dirHandle
                };
                
                // 检查工作空间是否已存在
                const existingIndex = workspaces.findIndex(ws => ws.id === workspace.id);
                if (existingIndex > -1) {
                    // 更新现有工作空间
                    workspaces[existingIndex] = workspace;
                } else {
                    workspaces.push(workspace);
                }
            } else {
                // 创建新工作空间
                workspace = createWorkspace(folderName, `本地文件夹: ${folderName}`);
                workspace.folderPath = folderName;
                workspace.folderHandle = dirHandle;
                
                // 保存初始配置到文件夹
                await saveWorkspaceConfigToFolder(workspace, dirHandle);
            }
            
            // 持久化 folderHandle 到 IndexedDB
            await persistDirectoryHandle(workspace.id, dirHandle);
            
            console.log('🔍 调试 openFolder - workspace.folderHandle:', workspace.folderHandle);
            console.log('🔍 调试 openFolder - workspace 完整对象:', JSON.stringify(workspace, (key, value) => {
                if (key === 'folderHandle') return '[FileSystemDirectoryHandle]';
                return value;
            }, 2));
            
            saveWorkspaces();
            await loadWorkspace(workspace.id);
            
            console.log('🔍 调试 openFolder - 调用 loadWorkspace 后');
            console.log('🔍 调试 openFolder - currentWorkspace:', currentWorkspace);
            console.log('🔍 调试 openFolder - currentWorkspace.folderHandle:', currentWorkspace?.folderHandle);

            // 显示路径
            const pathDiv = document.getElementById('folder-path');
            if (pathDiv) {
                pathDiv.innerHTML = `<span style="color: #10b981;">✅ 已打开: ${folderName}</span>`;
            }

            // 关闭并重新打开管理器
            setTimeout(() => {
                closeWorkspaceManager();
                showWorkspaceManager();
            }, 500);

            alert(`✅ 已成功打开文件夹: ${folderName}\n\n该文件夹将作为新的工作空间`);
            
            // 刷新侧边栏（如果存在）
            if (typeof UIManager !== 'undefined' && UIManager.loadWorkspaceList) {
                UIManager.loadWorkspaceList();
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('用户取消了选择');
            } else {
                console.error('打开文件夹失败:', error);
                alert(`❌ 打开文件夹失败: ${error.message}`);
            }
        }
    }
    
    /**
     * 显示文件管理器 UI（现在在侧边栏中打开）
     */
    function showFileManager() {
        // 打开侧边栏
        if (typeof UIManager !== 'undefined' && UIManager.loadWorkspaceList) {
            const sidebar = document.getElementById('agent-sidebar');
            const workspaceBtn = document.getElementById('sidebar-workspace');
            
            if (sidebar && !sidebar.classList.contains('expanded')) {
                sidebar.classList.add('expanded');
                workspaceBtn?.classList.add('active');
                UIManager.loadWorkspaceList();
            }
        }
    }

    /**
     * 保存工作空间配置到文件夹
     */
    async function saveWorkspaceConfigToFolder(workspace, dirHandle) {
        try {
            const configData = {
                version: '1.0.0',
                id: workspace.id,
                name: workspace.name,
                description: workspace.description,
                createdAt: workspace.createdAt,
                updatedAt: Date.now(),
                data: workspace.data
            };

            // 创建或更新配置文件
            const configFile = await dirHandle.getFileHandle('.workspace.json', { create: true });
            const writable = await configFile.createWritable();
            await writable.write(JSON.stringify(configData, null, 2));
            await writable.close();

            console.log('✅ 工作空间配置已保存到文件夹');
        } catch (error) {
            console.error('保存配置失败:', error);
        }
    }

    /**
     * 从文件夹加载工作空间配置
     */
    async function loadWorkspaceConfigFromFolder(dirHandle) {
        try {
            const configFile = await dirHandle.getFileHandle('.workspace.json', { create: false });
            const file = await configFile.getFile();
            const content = await file.text();
            return JSON.parse(content);
        } catch (error) {
            console.error('加载配置失败:', error);
            return null;
        }
    }

    // 文件管理器状态（参考优秀实践）
    let currentDirectory = null; // 当前目录句柄
    let currentDirPath = []; // 当前路径数组 [根目录句柄, 子目录1, 子目录2, ...]
    
    // 目录历史记录（参考浏览器 History API）
    class FileSystemHistory {
        constructor(init) {
            this.stack = [init];
            this.forwardStack = [];
        }
        push(handle) {
            this.stack.push(handle);
            this.forwardStack = [];
        }
        back() {
            if (this.stack.length === 1) return this.stack[this.stack.length - 1];
            const back = this.stack.pop();
            this.forwardStack.push(back);
            return this.stack[this.stack.length - 1];
        }
        forward() {
            if (this.forwardStack.length === 0) return this.stack[this.stack.length - 1];
            const forward = this.forwardStack.pop();
            this.stack.push(forward);
            return forward;
        }
        canBack() {
            return this.stack.length > 1;
        }
        canForward() {
            return this.forwardStack.length > 0;
        }
    }
    
    let dirHistory = null; // 目录历史记录

    /**
     * 获取当前目录下的文件列表
     */
    async function getDirectoryList(dirHandle) {
        const asyncIterator = dirHandle.entries();
        const directories = [];
        const files = [];
        
        for await (const [key, value] of asyncIterator) {
            // 跳过 .workspace.json 配置文件
            if (key === '.workspace.json') continue;
            
            if (value.kind === 'directory') {
                directories.push({
                    type: 'directory',
                    name: key,
                    handle: value
                });
            } else if (value.kind === 'file') {
                files.push({
                    type: 'file',
                    name: key,
                    handle: value
                });
            }
        }
        
        // 按名称排序，目录在前
        directories.sort((a, b) => a.name.localeCompare(b.name));
        files.sort((a, b) => a.name.localeCompare(b.name));
        
        return directories.concat(files);
    }

    /**
     * 读取文件内容
     */
    async function readFileContent(fileHandle) {
        try {
            const file = await fileHandle.getFile();
            const content = await file.text();
            return content;
        } catch (error) {
            console.error('读取文件失败:', error);
            throw error;
        }
    }

    /**
     * 写入文件内容
     */
    async function writeFileContent(fileHandle, content) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            console.log('✅ 文件已保存');
        } catch (error) {
            console.error('写入文件失败:', error);
            throw error;
        }
    }

    /**
     * 在文件夹中创建新文件
     */
    async function createFileInFolder(dirHandle, fileName, content = '') {
        try {
            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
            await writeFileContent(fileHandle, content);
            return fileHandle;
        } catch (error) {
            console.error('创建文件失败:', error);
            throw error;
        }
    }

    /**
     * 显示文件管理器 UI
     */
    async function showFileManager() {
        const currentWs = getCurrentWorkspace();
        if (!currentWs || !currentWs.folderHandle) {
            alert('⚠️ 请先打开一个文件夹作为工作空间');
            return;
        }

        // 检查权限
        try {
            const permission = await currentWs.folderHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                alert('⚠️ 需要重新授权访问文件夹\n\n请在工作空间中重新打开该文件夹');
                return;
            }
        } catch (e) {
            alert('⚠️ 文件夹句柄无效，请重新打开');
            return;
        }

        // 创建文件管理器面板
        const overlay = document.createElement('div');
        overlay.id = 'file-manager-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 99998;
        `;

        const panel = document.createElement('div');
        panel.id = 'file-manager-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 800px;
            height: 600px;
            background: #1e293b;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            z-index: 99999;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;

        // 标题栏
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid #334155;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #0f172a;
            border-radius: 12px 12px 0 0;
        `;
        header.innerHTML = `
            <div style="color: #f1f5f9; font-size: 16px; font-weight: 600;">
                📁 文件管理器 - ${escapeHtml(currentWs.name)}
            </div>
            <button id="close-file-manager" style="
                background: transparent;
                border: none;
                color: #94a3b8;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                line-height: 32px;
                text-align: center;
            ">&times;</button>
        `;

        // 工具栏
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
            padding: 12px 20px;
            border-bottom: 1px solid #334155;
            display: flex;
            gap: 10px;
            background: #1e293b;
        `;
        toolbar.innerHTML = `
            <button id="back-button" style="
                padding: 6px 12px;
                background: #64748b;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            " title="返回上级目录">⬅️ 后退</button>
            <span id="current-path" style="
                flex: 1;
                color: #94a3b8;
                font-size: 13px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            ">根目录</span>
            <button id="refresh-files" style="
                padding: 8px 16px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">🔄 刷新</button>
            <button id="new-file" style="
                padding: 8px 16px;
                background: #10b981;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">➕ 新建文件</button>
            <button id="new-folder" style="
                padding: 8px 16px;
                background: #f59e0b;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">📁 新建文件夹</button>
            <button id="upload-file" style="
                padding: 8px 16px;
                background: #8b5cf6;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">⬆️ 上传文件</button>
        `;

        // 文件列表区域
        const fileListContainer = document.createElement('div');
        fileListContainer.id = 'file-list-container';
        fileListContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            background: #0f172a;
        `;

        // 文件编辑器区域（默认隐藏）
        const editorContainer = document.createElement('div');
        editorContainer.id = 'file-editor-container';
        editorContainer.style.cssText = `
            flex: 1;
            display: none;
            flex-direction: column;
            background: #1e293b;
        `;
        editorContainer.innerHTML = `
            <div style="padding: 12px 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
                <span id="editing-file-name" style="color: #f1f5f9; font-weight: 600;"></span>
                <div style="display: flex; gap: 8px;">
                    <button id="save-file" style="
                        padding: 6px 16px;
                        background: #10b981;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                    ">💾 保存</button>
                    <button id="cancel-edit" style="
                        padding: 6px 16px;
                        background: #64748b;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                    ">✖ 取消</button>
                </div>
            </div>
            <textarea id="file-editor" style="
                flex: 1;
                padding: 16px;
                background: #0f172a;
                color: #e2e8f0;
                border: none;
                resize: none;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 14px;
                line-height: 1.6;
            "></textarea>
        `;

        panel.appendChild(header);
        panel.appendChild(toolbar);
        panel.appendChild(fileListContainer);
        panel.appendChild(editorContainer);
        document.body.appendChild(panel);
        document.body.appendChild(overlay);

        // 关闭按钮事件
        document.getElementById('close-file-manager').onclick = closeFileManager;
        overlay.onclick = closeFileManager;

        // 后退按钮事件
        document.getElementById('back-button').onclick = () => goBack();
        
        // 刷新按钮
        document.getElementById('refresh-files').onclick = () => loadFileList(fileListContainer, currentDirectory || currentWs.folderHandle);

        // 新建文件按钮
        document.getElementById('new-file').onclick = () => createNewFile(currentWs.folderHandle, fileListContainer);
        
        // 新建文件夹按钮
        document.getElementById('new-folder').onclick = () => createNewFolder(currentWs.folderHandle, fileListContainer);
        
        // 上传文件按钮
        document.getElementById('upload-file').onclick = () => uploadFiles(currentWs.folderHandle, fileListContainer);

        // 保存文件按钮
        document.getElementById('save-file').onclick = () => saveEditedFile();

        // 取消编辑按钮
        document.getElementById('cancel-edit').onclick = () => {
            editorContainer.style.display = 'none';
            fileListContainer.style.display = 'block';
            toolbar.style.display = 'flex';
        };

        // 加载文件列表
        await loadFileList(fileListContainer, currentWs.folderHandle);
    }

    /**
     * 加载文件列表（使用扁平列表结构）
     */
    async function loadFileList(container, dirHandle) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #94a3b8;">加载中...</div>';
        
        try {
            // 更新当前目录
            currentDirectory = dirHandle;
            
            // 获取当前目录下的文件和文件夹列表
            const items = await getDirectoryList(dirHandle);
            
            if (items.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #64748b;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
                        <div style="font-size: 14px;">文件夹为空</div>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            
            // 渲染文件列表
            renderFileList(items, container, dirHandle);
            
        } catch (error) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ef4444;">
                    ❌ 加载文件列表失败: ${escapeHtml(error.message)}
                </div>
            `;
        }
    }

    /**
     * 渲染文件列表（扁平结构）
     */
    function renderFileList(items, container, dirHandle) {
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            const isDir = item.type === 'directory';
            
            itemDiv.style.cssText = `
                padding: 8px 16px;
                background: ${isDir ? '#1e3a5f' : '#1e293b'};
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background 0.2s;
                margin-bottom: 2px;
            `;
            itemDiv.onmouseover = () => itemDiv.style.background = isDir ? '#254a75' : '#334155';
            itemDiv.onmouseout = () => itemDiv.style.background = isDir ? '#1e3a5f' : '#1e293b';
            
            const icon = isDir ? '📁' : getFileIcon(item.name);
            
            itemDiv.innerHTML = `
                <span style="font-size: 16px;">${icon}</span>
                <span style="color: #e2e8f0; font-size: 14px; flex: 1;">${escapeHtml(item.name)}</span>
                ${!isDir ? `
                <div style="display: flex; gap: 4px;" onclick="event.stopPropagation()">
                    <button class="file-action-btn" data-action="edit" title="编辑" style="
                        padding: 2px 6px;
                        background: #3b82f6;
                        color: white;
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    ">✏️</button>
                    <button class="file-action-btn" data-action="download" title="下载" style="
                        padding: 2px 6px;
                        background: #8b5cf6;
                        color: white;
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    ">⬇️</button>
                </div>
                ` : ''}
                <div style="display: flex; gap: 4px;" onclick="event.stopPropagation()">
                    <button class="file-action-btn" data-action="rename" title="重命名" style="
                        padding: 2px 6px;
                        background: #f59e0b;
                        color: white;
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    ">✍️</button>
                    <button class="file-action-btn" data-action="delete" title="删除" style="
                        padding: 2px 6px;
                        background: #ef4444;
                        color: white;
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    ">🗑️</button>
                </div>
            `;
            
            // 点击文件名打开编辑（仅文件）或进入目录
            const nameSpan = itemDiv.querySelector('span:nth-child(2)');
            nameSpan.onclick = () => {
                if (isDir) {
                    // 双击进入子目录
                    enterDirectory(item.handle, item.name);
                } else {
                    openFileForEdit(item.handle, item.name);
                }
            };
            
            // 绑定操作按钮
            itemDiv.querySelectorAll('.file-action-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    handleFileAction(action, { 
                        name: item.name, 
                        kind: item.type,
                        handle: item.handle 
                    }, dirHandle, container);
                };
            });
            
            container.appendChild(itemDiv);
        });
    }

    /**
     * 进入子目录
     */
    async function enterDirectory(subDirHandle, dirName) {
        try {
            // 更新历史记录
            if (!dirHistory) {
                dirHistory = new FileSystemHistory(currentDirectory);
            }
            dirHistory.push(subDirHandle);
            
            // 更新路径显示
            currentDirPath.push(dirName);
            updatePathDisplay();
            
            // 加载新目录内容
            const fileListContainer = document.getElementById('file-list-container');
            await loadFileList(fileListContainer, subDirHandle);
        } catch (error) {
            alert(`❌ 进入目录失败: ${error.message}`);
        }
    }

    /**
     * 返回上级目录
     */
    async function goBack() {
        if (!dirHistory || !dirHistory.canBack()) {
            alert('已经是最顶层目录了');
            return;
        }
        
        try {
            const parentDir = dirHistory.back();
            currentDirPath.pop();
            updatePathDisplay();
            
            const fileListContainer = document.getElementById('file-list-container');
            await loadFileList(fileListContainer, parentDir);
        } catch (error) {
            alert(`❌ 返回失败: ${error.message}`);
        }
    }

    /**
     * 更新路径显示
     */
    function updatePathDisplay() {
        const pathElement = document.getElementById('current-path');
        if (pathElement) {
            pathElement.textContent = currentDirPath.join(' / ') || '根目录';
        }
    }

    /**
     * 获取文件图标
     */
    function getFileIcon(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const icons = {
            'js': '📜',
            'ts': '📘',
            'html': '🌐',
            'css': '🎨',
            'json': '📋',
            'md': '📝',
            'txt': '📄',
            'py': '🐍',
            'java': '☕',
            'xml': '📰'
        };
        return icons[ext] || '📄';
    }

    /**
     * 打开文件进行编辑
     */
    async function openFileForEdit(fileHandle, fileName) {
        try {
            const content = await readFileContent(fileHandle);
            
            const fileListContainer = document.getElementById('file-list-container');
            const editorContainer = document.getElementById('file-editor-container');
            const editingFileName = document.getElementById('editing-file-name');
            const fileEditor = document.getElementById('file-editor');
            
            // 直接保存 fileHandle 引用
            currentFileInstance = fileHandle;
            
            editingFileName.textContent = fileName;
            fileEditor.value = content;
            
            fileListContainer.style.display = 'none';
            document.getElementById('refresh-files').parentElement.style.display = 'none';
            editorContainer.style.display = 'flex';
        } catch (error) {
            alert(`❌ 打开文件失败: ${error.message}`);
        }
    }

    /**
     * 保存编辑的文件
     */
    async function saveEditedFile() {
        try {
            const fileEditor = document.getElementById('file-editor');
            const content = fileEditor.value;
            
            if (!currentFileInstance) {
                throw new Error('文件句柄丢失，请重新打开文件');
            }
            
            await writeFileContent(currentFileInstance, content);
            
            alert('✅ 文件已保存');
            
            // 返回文件列表
            document.getElementById('cancel-edit').click();
            document.getElementById('refresh-files').parentElement.style.display = 'flex';
            
            // 刷新文件列表
            const currentWs = getCurrentWorkspace();
            if (currentWs && currentWs.folderHandle) {
                await loadFileList(document.getElementById('file-list-container'), currentWs.folderHandle);
            }
        } catch (error) {
            alert(`❌ 保存文件失败: ${error.message}`);
        }
    }

    /**
     * 创建新文件
     */
    async function createNewFile(dirHandle, fileListContainer) {
        const fileName = prompt('请输入文件名（包含扩展名）:');
        if (!fileName) return;
        
        try {
            await createFileInFolder(dirHandle, fileName, '');
            alert(`✅ 文件 "${fileName}" 已创建`);
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        } catch (error) {
            alert(`❌ 创建文件失败: ${error.message}`);
        }
    }

    /**
     * 创建新文件夹
     */
    async function createNewFolder(dirHandle, fileListContainer) {
        const folderName = prompt('请输入文件夹名称:');
        if (!folderName) return;
        
        try {
            const newFolderHandle = await dirHandle.getDirectoryHandle(folderName, { create: true });
            alert(`✅ 文件夹 "${folderName}" 已创建`);
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        } catch (error) {
            alert(`❌ 创建文件夹失败: ${error.message}`);
        }
    }

    /**
     * 上传文件
     */
    async function uploadFiles(dirHandle, fileListContainer) {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;
            
            let successCount = 0;
            let failCount = 0;
            
            for (const file of files) {
                try {
                    const content = await readFileAsText(file);
                    await createFileInFolder(dirHandle, file.name, content);
                    successCount++;
                } catch (error) {
                    console.error(`上传文件 ${file.name} 失败:`, error);
                    failCount++;
                }
            }
            
            if (successCount > 0) {
                alert(`✅ 成功上传 ${successCount} 个文件${failCount > 0 ? `, ${failCount} 个失败` : ''}`);
            } else {
                alert('❌ 所有文件上传失败');
            }
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        };
        
        input.click();
    }

    /**
     * 读取文件为文本
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    /**
     * 处理文件操作（编辑、下载、重命名、删除）
     */
    async function handleFileAction(action, file, dirHandle, fileListContainer) {
        switch (action) {
            case 'edit':
                if (file.kind === 'file') {
                    openFileForEdit(file.handle, file.name);
                }
                break;
                
            case 'download':
                if (file.kind === 'file') {
                    downloadFile(file.handle, file.name);
                }
                break;
                
            case 'rename':
                await renameFileOrFolder(file, dirHandle, fileListContainer);
                break;
                
            case 'delete':
                await deleteFileOrFolder(file, dirHandle, fileListContainer);
                break;
                
            default:
                console.warn('未知操作:', action);
        }
    }

    /**
     * 下载文件
     */
    async function downloadFile(fileHandle, fileName) {
        try {
            const content = await readFileContent(fileHandle);
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert(`❌ 下载文件失败: ${error.message}`);
        }
    }

    /**
     * 重命名文件或文件夹
     */
    async function renameFileOrFolder(file, dirHandle, fileListContainer) {
        const newName = prompt(`输入新的名称:`, file.name);
        if (!newName || newName === file.name) return;
        
        try {
            if (file.kind === 'file') {
                // 文件重命名：读取内容 -> 创建新文件 -> 删除旧文件
                const content = await readFileContent(file.handle);
                await createFileInFolder(dirHandle, newName, content);
                await dirHandle.removeEntry(file.name);
                
                // 更新缓存中的文件名
                if (fileHandleCache.has(file.name)) {
                    const handle = fileHandleCache.get(file.name);
                    fileHandleCache.delete(file.name);
                    fileHandleCache.set(newName, handle);
                }
                
                alert(`✅ 文件已重命名为 "${newName}"`);
            } else {
                // 文件夹重命名：File System Access API 不直接支持
                // 需要提示用户手动操作
                alert('⚠️ 文件夹重命名功能暂不支持\n\n请在文件资源管理器中手动重命名');
                return;
            }
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        } catch (error) {
            alert(`❌ 重命名失败: ${error.message}`);
        }
    }

    /**
     * 删除文件或文件夹
     */
    async function deleteFileOrFolder(file, dirHandle, fileListContainer) {
        const confirmMsg = file.kind === 'directory' 
            ? `确定要删除文件夹 "${file.name}" 及其所有内容吗？`
            : `确定要删除文件 "${file.name}" 吗？`;
            
        if (!confirm(confirmMsg)) return;
        
        try {
            await dirHandle.removeEntry(file.name, { recursive: true });
            alert(`✅ ${file.kind === 'directory' ? '文件夹' : '文件'} "${file.name}" 已删除`);
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        } catch (error) {
            alert(`❌ 删除失败: ${error.message}`);
        }
    }

    /**
     * 关闭文件管理器
     */
    function closeFileManager() {
        const panel = document.getElementById('file-manager-panel');
        const overlay = document.getElementById('file-manager-overlay');
        if (panel) panel.remove();
        if (overlay) overlay.remove();
        
        // 清理状态
        currentFileInstance = null;
        currentDirHandle = null;
    }

    /**
     * 生成唯一 ID
     */
    function generateId() {
        return 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
    function saveWorkspaces() {
        console.log('🔍 调试 saveWorkspaces - 保存前 workspaces 数组:');
        workspaces.forEach((ws, index) => {
            console.log(`  [${index}] id: ${ws.id}, folderHandle:`, ws.folderHandle);
        });
        
        // 注意: folderHandle 是 File System Access API 对象，不能 JSON 序列化
        // 保存到 GM 存储时需要排除，但保留在内存中的 workspaces 对象里
        const workspacesToSave = workspaces.map(ws => {
            const { folderHandle, ...rest } = ws;
            return rest;
        });
        GM_setValue(WORKSPACE_KEY, JSON.stringify(workspacesToSave));
        
        console.log('🔍 调试 saveWorkspaces - 保存后 workspaces 数组:');
        workspaces.forEach((ws, index) => {
            console.log(`  [${index}] id: ${ws.id}, folderHandle:`, ws.folderHandle);
        });
    }

    // 暴露全局函数 (供 HTML 中的 onclick 使用)
    window.StorageManager = {
        showWorkspaceManager,
        closeWorkspaceManager,
        switchWorkspace,
        createNewWorkspace,
        renameWorkspacePrompt,
        deleteWorkspaceConfirm,
        exportWorkspaceFile,
        handleImport,
        openFolder,
        showFileManager
    };

    return {
        init,
        createWorkspace,
        deleteWorkspace,
        renameWorkspace,
        loadWorkspace,
        switchWorkspace: loadWorkspace,  // 别名，用于侧边栏切换
        getCurrentWorkspace,
        getAllWorkspaces,
        saveToWorkspace,
        loadFromWorkspace,
        saveConversations,
        loadConversations,
        saveCustomSettings,
        loadCustomSettings,
        exportWorkspace,
        importWorkspace,
        showWorkspaceManager,
        loadWorkspaceConfigFromFolder,
        showFileManager,
        openFolder,
        readFileContent,
        writeFileContent,
        createFileInFolder,
        createNewFolder,
        uploadFiles,
        downloadFile,
        renameFileOrFolder,
        deleteFileOrFolder
    };
})();


// ==================== utils.js ====================

// ==================== 工具函数模块 ====================

const Utils = (function() {
    /**
     * HTML 转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 格式化代码块
     */
    function formatCodeBlock(code, language) {
        const escapedCode = escapeHtml(code.trim());
        return `
            <div class="code-block">
                <div class="code-language">${language || 'text'}</div>
                <pre>${escapedCode}</pre>
            </div>
        `;
    }

    /**
     * 生成唯一 ID
     */
    function generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 防抖函数
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 节流函数
     */
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * 深拷贝对象
     */
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * 检查是否为空值
     */
    function isEmpty(value) {
        return value === null || value === undefined || value === '';
    }

    /**
     * 格式化时间
     */
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        return date.toLocaleDateString();
    }

    /**
     * 截断文本
     */
    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * 复制到剪贴板
     */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('复制失败:', error);
            return false;
        }
    }

    /**
     * 下载文件
     */
    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * 读取本地文件
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    return {
        escapeHtml,
        formatCodeBlock,
        generateId,
        debounce,
        throttle,
        deepClone,
        isEmpty,
        formatTime,
        truncateText,
        copyToClipboard,
        downloadFile,
        readFileAsText
    };
})();


// ==================== main.js ====================

// ==================== 主入口模块 ====================

(function() {
    'use strict';

    /**
     * 初始化应用
     */
    async function init() {
        console.log('🚀 AI Agent 正在启动...');
        
        try {
            // 1. 初始化工作空间管理器
            await StorageManager.init();
            console.log('✅ 工作空间已加载');
            
            // 2. 初始化配置 (必须 await，因为 init 是 async)
            const config = await ConfigManager.init();
            console.log('✅ 配置已加载:', config);
            
            // 3. 基于域名加载会话历史
            const history = ConfigManager.loadConversationHistory();
            console.log(`✅ 已加载 ${history.length} 条对话历史`);
            
            // 4. 创建 UI
            UIManager.createAssistant(config);
            console.log('✅ UI 已创建');
            
            // 5. 根据域名恢复聊天窗口显示状态
            const isVisible = ConfigManager.getChatVisibility();
            if (!isVisible) {
                UIManager.hide();
                console.log('👁️ 聊天窗口已隐藏（根据上次状态）');
            } else {
                // 6. 显示欢迎消息（如果窗口可见且有历史记录，则不显示欢迎消息）
                if (history.length === 0) {
                    ChatManager.showWelcomeMessage();
                    console.log('✅ 欢迎消息已显示');
                } else {
                    console.log('💬 已有对话历史，跳过欢迎消息');
                }
            }
            
            // 7. 设置事件监听
            setupEventListeners();
            console.log('✅ 事件监听已设置');
            
            console.log('🎉 AI Agent 启动成功!');
            
        } catch (error) {
            console.error('❌ 启动失败:', error);
        }
    }

    /**
     * 设置全局事件监听
     */
    function setupEventListeners() {
        // 发送消息事件
        window.addEventListener('agent-message-sent', async (e) => {
            const message = e.detail;
            await handleUserMessage(message);
        });

        // 打开设置事件
        window.addEventListener('agent-open-settings', () => {
            SettingsManager.showSettings();
        });

        // 清空聊天事件
        window.addEventListener('agent-clear-chat', () => {
            ChatManager.clearChat();
        });

        // 执行代码事件 (来自代码块按钮)
        window.addEventListener('agent-execute-code', (e) => {
            const code = e.detail;
            ChatManager.executeJavaScript(code);
        });
    }

    /**
     * 处理用户消息
     */
    async function handleUserMessage(message) {
        const config = ConfigManager.getAll();
        
        // 检查 API Key
        if (!config.apiKey) {
            UIManager.appendMessage(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #ef4444;">
                        ⚠️ 请先在设置中配置 API Key<br><br>
                        💡 获取免费 API Key: <a href="https://openrouter.ai/keys" target="_blank">点击获取</a>
                    </div>
                </div>
            `);
            return;
        }

        // 添加用户消息到界面
        ChatManager.addUserMessage(message);
        
        // 处理快捷命令
        const result = await ChatManager.handleMessage(message, config);
        
        // 如果不是命令,调用 API
        if (result.type === 'chat') {
            await callAPIAndRespond(message, config);
        }
    }

    /**
     * 调用 API 并显示回复
     */
    async function callAPIAndRespond(userMessage, config) {
        // 显示打字指示器
        UIManager.showTypingIndicator();
        UIManager.updateSendButtonState(true);
        
        try {
            const history = ConfigManager.get('conversationHistory');
            const response = await APIManager.callAPI(userMessage, history, config);
            
            // 隐藏打字指示器
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false);
            
            if (response.success) {
                ChatManager.addAssistantMessage(response.message);
            } else {
                showError(response.error);
            }
            
        } catch (error) {
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false);
            showError(error.message);
        }
    }

    /**
     * 显示错误信息
     */
    function showError(errorMessage) {
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #ef4444;">
                    ❌ 请求失败: ${escapeHtml(errorMessage)}<br><br>
                    💡 可能的原因:<br>
                    • API Key 无效或已过期<br>
                    • 网络连接问题<br>
                    • 模型暂时不可用 (尝试切换模型)<br>
                    • 达到速率限制 (稍后重试)
                </div>
            </div>
        `);
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
     * 创建启动按钮
     */
    function createLauncherButton() {
        // 检查是否已存在启动按钮
        if (document.getElementById('agent-launcher-btn')) {
            console.log('🔘 启动按钮已存在，跳过创建');
            return;
        }

        setTimeout(() => {
            const badge = document.createElement('div');
            badge.id = 'agent-launcher-btn';
            badge.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 50%;
                font-size: 24px;
                font-family: -apple-system, sans-serif;
                z-index: 999998;
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                border: none;
            `;
            badge.textContent = '🤖';
            badge.title = '点击打开 AI Agent';
            
            // 悬停效果
            badge.addEventListener('mouseenter', () => {
                badge.style.transform = 'scale(1.1)';
                badge.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
            });
            
            badge.addEventListener('mouseleave', () => {
                badge.style.transform = 'scale(1)';
                badge.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)';
            });
            
            badge.addEventListener('click', () => {
                // 触发打开 Agent 的事件
                window.dispatchEvent(new CustomEvent('open-ai-agent'));
                
                // 点击后隐藏按钮（Agent 打开后不需要显示）
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(0)';
                badge.style.opacity = '0';
                setTimeout(() => {
                    badge.style.display = 'none';
                }, 300);
            });
            
            document.body.appendChild(badge);
            
            // 监听 Agent 关闭事件，重新显示按钮
            window.addEventListener('agent-closed', () => {
                badge.style.display = 'flex';
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(1)';
                badge.style.opacity = '1';
            }, { once: false });
            
            console.log('🔘 AI Agent 启动按钮已创建（右下角圆形按钮）');
        }, 1000);
    }

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init();
            // 创建启动按钮
            createLauncherButton();
        });
    } else {
        init();
        // 创建启动按钮
        createLauncherButton();
    }

})();

