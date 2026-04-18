/**
 * ProviderManager - 模型提供商管理器
 * 
 * 功能：
 * 1. 管理多个模型提供商（OpenRouter、LM Studio、Ollama 等）
 * 2. 支持多种 API 模板（OpenAI、Anthropic、Ollama 等）
 * 3. 提供商配置的持久化（按域名隔离）
 * 4. 本地服务自动发现
 */

// 注意：此文件通过 build.js 合并，EventManager 和 ConfigManager 已在全局作用域

// ==================== 模型模板定义 ====================

const ModelTemplates = {
    /**
     * OpenAI 兼容模板
     * 适用于：OpenAI、OpenRouter、LM Studio、Azure OpenAI 等
     */
    OPENAI: {
        name: 'OpenAI Compatible',
        endpoint: '{baseUrl}/chat/completions',
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }),
        buildRequest: (model, messages, params) => ({
            model,
            messages,
            stream: true,
            ...params
        }),
        parseResponse: (response) => response.choices?.[0]?.message?.content || '',
        parseStreamChunk: (chunk) => chunk.choices?.[0]?.delta?.content || '',
        isStreamFinished: (chunk) => chunk.choices?.[0]?.finish_reason === 'stop'
    },

    /**
     * Anthropic Claude 模板
     * 适用于：Anthropic API
     */
    ANTHROPIC: {
        name: 'Anthropic Claude',
        endpoint: '{baseUrl}/messages',
        headers: (apiKey) => ({
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'messages-2023-12-15',
            'Content-Type': 'application/json'
        }),
        buildRequest: (model, messages, params) => {
            // Anthropic 不支持 system 角色，需要特殊处理
            const systemMessage = messages.find(m => m.role === 'system');
            const chatMessages = messages.filter(m => m.role !== 'system');
            
            return {
                model,
                messages: chatMessages.map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content
                })),
                system: systemMessage?.content,
                stream: true,
                max_tokens: params.max_tokens || 4096,
                ...params
            };
        },
        parseResponse: (response) => response.content?.[0]?.text || '',
        parseStreamChunk: (chunk) => {
            if (chunk.type === 'content_block_delta') {
                return chunk.delta?.text || '';
            }
            return '';
        },
        isStreamFinished: (chunk) => chunk.type === 'message_stop'
    },

    /**
     * Ollama 本地模板
     * 适用于：Ollama 本地服务
     */
    OLLAMA: {
        name: 'Ollama Local',
        endpoint: '{baseUrl}/api/chat',
        headers: () => ({
            'Content-Type': 'application/json'
        }),
        buildRequest: (model, messages, params) => ({
            model,
            messages,
            stream: true,
            options: {
                temperature: params.temperature,
                top_p: params.top_p,
                num_predict: params.max_tokens
            }
        }),
        parseResponse: (response) => response.message?.content || '',
        parseStreamChunk: (chunk) => chunk.message?.content || '',
        isStreamFinished: (chunk) => chunk.done === true
    },

    /**
     * Google Gemini 模板
     * 适用于：Google AI Studio
     */
    GEMINI: {
        name: 'Google Gemini',
        endpoint: '{baseUrl}/models/{model}:streamGenerateContent?alt=sse&key={apiKey}',
        headers: () => ({
            'Content-Type': 'application/json'
        }),
        buildRequest: (model, messages, params) => {
            // Gemini 的消息格式转换
            const contents = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));
            
            return {
                contents,
                generationConfig: {
                    temperature: params.temperature,
                    topP: params.top_p,
                    maxOutputTokens: params.max_tokens
                }
            };
        },
        parseResponse: (response) => {
            const candidates = response.candidates;
            return candidates?.[0]?.content?.parts?.[0]?.text || '';
        },
        parseStreamChunk: (chunk) => {
            // Gemini SSE 格式特殊，需要解析 data: 行
            return chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        },
        isStreamFinished: (chunk) => chunk.candidates?.[0]?.finishReason === 'STOP'
    }
};

// ==================== 默认提供商配置 ====================

const DEFAULT_PROVIDERS = [
    {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        template: 'OPENAI',
        enabled: true,
        priority: 1,
        models: [],  // 动态加载
        autoDiscover: false
    }
];

// ==================== 官方供应商预设模板 ====================

const OFFICIAL_PROVIDER_TEMPLATES = {
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        template: 'OPENAI',
        priority: 1,
        description: '多模型聚合平台，支持 200+ 模型',
        website: 'https://openrouter.ai'
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: '',
        template: 'ANTHROPIC',
        priority: 2,
        description: 'Claude 系列模型，强大的推理能力',
        website: 'https://console.anthropic.com'
    },
    google: {
        id: 'google',
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        template: 'GEMINI',
        priority: 3,
        description: 'Gemini 系列模型，免费额度充足',
        website: 'https://aistudio.google.com'
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        template: 'OPENAI',
        priority: 4,
        description: 'GPT-4、GPT-3.5 等官方模型',
        website: 'https://platform.openai.com'
    },
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        template: 'OPENAI',
        priority: 5,
        description: 'DeepSeek-V3 等国产优秀模型',
        website: 'https://platform.deepseek.com'
    },
    zhipu: {
        id: 'zhipu',
        name: '智谱 AI',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: '',
        template: 'OPENAI',
        priority: 6,
        description: 'GLM 系列模型，中文优化',
        website: 'https://open.bigmodel.cn'
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama (本地)',
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        template: 'OLLAMA',
        priority: 10,
        description: '本地运行的开源模型',
        website: 'https://ollama.ai',
        isLocal: true
    },
    lmstudio: {
        id: 'lm-studio',
        name: 'LM Studio (本地)',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: '',
        template: 'OPENAI',
        priority: 11,
        description: '本地 GUI 工具，支持多种模型',
        website: 'https://lmstudio.ai',
        isLocal: true
    }
};

// ==================== ProviderManager 核心逻辑 ====================

let providers = [];
let templates = { ...ModelTemplates };

/**
 * 初始化 ProviderManager
 */
async function init() {
    await loadProviders();
    
    // 如果没有提供商，使用默认配置
    if (providers.length === 0) {
        providers = [...DEFAULT_PROVIDERS];
        await saveProviders();
    }
    
    // 加载 OpenRouter 模型列表
    await loadOpenRouterModels();
    
    console.log('[ProviderManager] Initialized with', providers.length, 'providers');
}

/**
 * 加载提供商配置
 */
async function loadProviders() {
    try {
        const saved = GM_getValue('providers', []);
        providers = Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.error('[ProviderManager] Failed to load providers:', error);
        providers = [];
    }
}

/**
 * 保存提供商配置
 */
async function saveProviders() {
    try {
        GM_setValue('providers', providers);
    } catch (error) {
        console.error('[ProviderManager] Failed to save providers:', error);
    }
}

/**
 * 加载 OpenRouter 模型列表
 */
async function loadOpenRouterModels() {
    try {
        const openrouter = providers.find(p => p.id === 'openrouter');
        if (!openrouter) return;
        
        // 如果没有 API Key，跳过
        if (!openrouter.apiKey) {
            console.log('[ProviderManager] OpenRouter API Key 未配置，跳过模型加载');
            return;
        }
        
        console.log('[ProviderManager] 🔄 正在加载 OpenRouter 模型列表...');
        
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${openrouter.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.data && Array.isArray(data.data)) {
            // 转换为内部格式
            openrouter.models = data.data.map(model => ({
                id: model.id,
                name: model.name || model.id,
                enabled: true,  // 默认启用
                contextLength: model.context_length,
                pricing: model.pricing
            }));
            
            await saveProviders();
            console.log(`[ProviderManager] ✅ 加载了 ${openrouter.models.length} 个 OpenRouter 模型`);
        }
        
    } catch (error) {
        console.error('[ProviderManager] ❌ 加载 OpenRouter 模型失败:', error);
    }
}

/**
 * 获取所有提供商
 */
function getAllProviders() {
    return providers.map(p => ({
        ...p,
        apiKey: p.apiKey ? '***' + p.apiKey.slice(-4) : ''  // 隐藏 API Key
    }));
}

/**
 * 获取启用的提供商（按优先级排序）
 */
function getEnabledProviders() {
    return providers
        .filter(p => p.enabled)
        .sort((a, b) => a.priority - b.priority);
}

/**
 * 获取单个提供商（包含完整信息，包括 API Key）
 */
function getProviderById(id) {
    return providers.find(p => p.id === id);
}

/**
 * 根据模型 ID 查找对应的提供商
 */
function getProviderByModel(modelId) {
    for (const provider of providers) {
        if (!provider.enabled) continue;
        
        // 检查模型是否属于该提供商
        if (provider.models.some(m => m.id === modelId)) {
            return provider;
        }
    }
    
    // 如果没找到，返回第一个启用的提供商（向后兼容）
    return getEnabledProviders()[0] || null;
}

/**
 * 添加提供商
 */
async function addProvider(provider) {
    // 验证必填字段
    if (!provider.id || !provider.name || !provider.baseUrl || !provider.template) {
        throw new Error('Provider must have id, name, baseUrl, and template');
    }
    
    // 检查 ID 是否已存在
    if (providers.some(p => p.id === provider.id)) {
        throw new Error(`Provider with id "${provider.id}" already exists`);
    }
    
    // 设置默认值
    const newProvider = {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey || '',
        template: provider.template,
        enabled: provider.enabled !== undefined ? provider.enabled : true,
        priority: provider.priority || providers.length + 1,
        models: provider.models || [],
        autoDiscover: provider.autoDiscover || false,
        createdAt: Date.now()
    };
    
    providers.push(newProvider);
    await saveProviders();
    
    EventManager.emit('providerAdded', newProvider);
    console.log('[ProviderManager] Added provider:', newProvider.id);
    
    return newProvider;
}

/**
 * 更新提供商
 */
async function updateProvider(id, updates) {
    const index = providers.findIndex(p => p.id === id);
    if (index === -1) {
        throw new Error(`Provider "${id}" not found`);
    }
    
    // 不允许修改 ID
    if (updates.id && updates.id !== id) {
        throw new Error('Cannot change provider ID');
    }
    
    providers[index] = {
        ...providers[index],
        ...updates,
        updatedAt: Date.now()
    };
    
    await saveProviders();
    
    EventManager.emit('providerUpdated', providers[index]);
    console.log('[ProviderManager] Updated provider:', id);
    
    return providers[index];
}

/**
 * 删除提供商
 */
async function deleteProvider(id) {
    const index = providers.findIndex(p => p.id === id);
    if (index === -1) {
        throw new Error(`Provider "${id}" not found`);
    }
    
    const deleted = providers.splice(index, 1)[0];
    await saveProviders();
    
    EventManager.emit('providerDeleted', deleted);
    console.log('[ProviderManager] Deleted provider:', id);
    
    return deleted;
}

/**
 * 为提供商添加模型
 */
async function addModelsToProvider(providerId, models) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        throw new Error(`Provider "${providerId}" not found`);
    }
    
    // 合并模型列表（去重）
    const existingIds = new Set(provider.models.map(m => m.id));
    const newModels = models.filter(m => !existingIds.has(m.id));
    
    provider.models = [
        ...provider.models,
        ...newModels.map(m => ({
            id: m.id,
            name: m.name || m.id,
            provider: providerId,
            ...m
        }))
    ];
    
    await saveProviders();
    
    EventManager.emit('modelsUpdated', providerId);
    console.log('[ProviderManager] Added', newModels.length, 'models to', providerId);
    
    return provider.models;
}

/**
 * 清除提供商的模型列表
 */
async function clearProviderModels(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        throw new Error(`Provider "${providerId}" not found`);
    }
    
    provider.models = [];
    await saveProviders();
    
    EventManager.emit('modelsCleared', providerId);
    console.log('[ProviderManager] Cleared models for', providerId);
}

/**
 * 获取所有可用模型（来自所有启用的提供商）
 */
function getAllAvailableModels() {
    const allModels = [];
    
    for (const provider of providers) {
        if (!provider.enabled) continue;
        
        for (const model of provider.models) {
            allModels.push({
                ...model,
                providerId: provider.id,
                providerName: provider.name,
                template: provider.template
            });
        }
    }
    
    return allModels;
}

/**
 * 获取所有可用的模板
 */
function getAvailableTemplates() {
    return Object.keys(templates).map(key => ({
        id: key,
        name: templates[key].name
    }));
}

/**
 * 获取官方供应商预设模板列表
 */
function getOfficialProviderTemplates() {
    return Object.values(OFFICIAL_PROVIDER_TEMPLATES);
}

/**
 * 根据 ID 获取官方供应商预设模板
 */
function getOfficialProviderTemplateById(id) {
    return OFFICIAL_PROVIDER_TEMPLATES[id] || null;
}

/**
 * 获取模板详情
 */
function getTemplate(templateId) {
    return templates[templateId] || null;
}

/**
 * 注册自定义模板
 */
function registerTemplate(id, template) {
    if (templates[id]) {
        console.warn('[ProviderManager] Template', id, 'already exists, overwriting');
    }
    
    templates[id] = template;
    console.log('[ProviderManager] Registered template:', id);
}

/**
 * 测试提供商连接
 */
async function testProviderConnection(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        throw new Error(`Provider "${providerId}" not found`);
    }
    
    const template = templates[provider.template];
    if (!template) {
        throw new Error(`Template "${provider.template}" not found`);
    }
    
    try {
        // 构建测试请求
        const testEndpoint = template.endpoint
            .replace('{baseUrl}', provider.baseUrl)
            .replace('{apiKey}', provider.apiKey || '')
            .replace('{model}', 'test');
        
        const headers = template.headers(provider.apiKey);
        const requestBody = template.buildRequest('test', [
            { role: 'user', content: 'Hello' }
        ], {});
        
        // 发送测试请求（使用 GM_xmlhttpRequest）
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: testEndpoint,
                headers,
                data: JSON.stringify(requestBody),
                timeout: 10000,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve({
                            success: true,
                            message: 'Connection successful',
                            status: response.status
                        });
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: (error) => {
                    reject(new Error(`Connection failed: ${error}`));
                },
                ontimeout: () => {
                    reject(new Error('Connection timeout'));
                }
            });
        });
    } catch (error) {
        throw new Error(`Test failed: ${error.message}`);
    }
}

/**
 * 自动发现本地服务（LM Studio、Ollama）
 */
async function autoDiscoverLocalServices() {
    const discovered = [];
    
    // 检测 LM Studio
    try {
        const lmStudioProvider = {
            id: 'lm-studio',
            name: 'LM Studio (Local)',
            baseUrl: 'http://localhost:1234/v1',
            apiKey: '',
            template: 'OPENAI',
            enabled: false,
            priority: 2,
            models: [],
            autoDiscover: true
        };
        
        // 尝试连接
        const result = await testProviderConnectionInternal(lmStudioProvider);
        if (result.success) {
            discovered.push(lmStudioProvider);
            console.log('[ProviderManager] Discovered LM Studio');
        }
    } catch (error) {
        // LM Studio 未运行
    }
    
    // 检测 Ollama
    try {
        const ollamaProvider = {
            id: 'ollama',
            name: 'Ollama (Local)',
            baseUrl: 'http://localhost:11434',
            apiKey: '',
            template: 'OLLAMA',
            enabled: false,
            priority: 3,
            models: [],
            autoDiscover: true
        };
        
        const result = await testProviderConnectionInternal(ollamaProvider);
        if (result.success) {
            discovered.push(ollamaProvider);
            console.log('[ProviderManager] Discovered Ollama');
        }
    } catch (error) {
        // Ollama 未运行
    }
    
    return discovered;
}

/**
 * 内部测试方法（不抛出异常）
 */
async function testProviderConnectionInternal(provider) {
    const template = templates[provider.template];
    if (!template) return { success: false };
    
    try {
        const testEndpoint = template.endpoint
            .replace('{baseUrl}', provider.baseUrl)
            .replace('{apiKey}', provider.apiKey || '');
        
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: testEndpoint,
                timeout: 3000,
                onload: (response) => {
                    resolve({
                        success: response.status >= 200 && response.status < 300
                    });
                },
                onerror: () => resolve({ success: false }),
                ontimeout: () => resolve({ success: false })
            });
        });
    } catch (error) {
        return { success: false };
    }
}

/**
 * v4.0.0: 数据迁移 - 为本地服务自动添加 isLocal 标志
 */
async function migrateProvidersData() {
    console.log('[ProviderManager] ========== 开始数据迁移检查 ==========');
    console.log('[ProviderManager] 当前供应商数量:', providers.length);
    
    const migrated = [];
    
    // 需要标记为本地服务的供应商 ID 模式
    const localPatterns = ['lm-studio', 'ollama', 'localhost'];
    
    for (const provider of providers) {
        console.log(`[ProviderManager] 检查供应商: ${provider.id}, isLocal=${provider.isLocal}, baseUrl=${provider.baseUrl}`);
        
        let shouldMigrate = false;
        
        // 检查是否匹配本地服务模式
        if (!provider.isLocal) {
            // 1. ID 包含本地关键词
            if (localPatterns.some(pattern => provider.id.includes(pattern))) {
                console.log(`[ProviderManager]   -> 匹配 ID 模式`);
                shouldMigrate = true;
            }
            // 2. baseUrl 指向 localhost
            else if (provider.baseUrl && provider.baseUrl.includes('localhost')) {
                console.log(`[ProviderManager]   -> 匹配 localhost URL`);
                shouldMigrate = true;
            }
            // 3. 名称包含"本地"
            else if (provider.name && provider.name.includes('本地')) {
                console.log(`[ProviderManager]   -> 匹配名称`);
                shouldMigrate = true;
            }
        }
        
        if (shouldMigrate) {
            console.log(`[ProviderManager] ✅ 迁移供应商: ${provider.id} -> isLocal=true`);
            provider.isLocal = true;
            migrated.push(provider.id);
        }
    }
    
    if (migrated.length > 0) {
        await saveProviders();
        console.log(`[ProviderManager] ========== 迁移完成: ${migrated.length} 个供应商已更新 ==========`);
    } else {
        console.log('[ProviderManager] ========== 无需迁移 ==========');
    }
    
    return migrated;
}

// ==================== 导出接口 ====================

const ProviderManager = {
    init,
    getAllProviders,
    getEnabledProviders,
    getProviderById,
    getProviderByModel,
    addProvider,
    updateProvider,
    deleteProvider,
    addModelsToProvider,
    clearProviderModels,
    getAllAvailableModels,
    getAvailableTemplates,
    getTemplate,
    registerTemplate,
    getOfficialProviderTemplates,
    getOfficialProviderTemplateById,
    testProviderConnection,
    autoDiscoverLocalServices,
    migrateProvidersData
};
