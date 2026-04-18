// ==================== 模型管理模块 ====================

const ModelManager = (function() {
    const CACHE_KEY = 'cached_models';
    const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时
    const STATUS_KEY = 'model_status';

    // 模型状态管理: { modelId: { available: boolean, lastTest: timestamp } }
    let modelStatus = {};

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
     * 初始化模型管理器
     */
    function init() {
        loadCachedModels();
        loadModelStatus();
    }

    /**
     * 加载模型状态
     */
    function loadModelStatus() {
        try {
            modelStatus = GM_getValue(STATUS_KEY, {});
        } catch (e) {
            modelStatus = {};
        }
    }

    /**
     * 保存模型状态
     */
    function saveModelStatus() {
        GM_setValue(STATUS_KEY, modelStatus);
    }

    /**
     * 标记模型测试结果
     * @param {string} modelId - 模型ID
     * @param {boolean} success - 是否成功
     */
    function markModelTest(modelId, success) {
        modelStatus[modelId] = {
            available: success,
            lastTest: Date.now()
        };
        saveModelStatus();
    }

    /**
     * 获取模型可用性状态
     * @param {string} modelId - 模型ID
     * @returns {boolean}
     */
    function isModelAvailable(modelId) {
        const status = modelStatus[modelId];
        if (!status || (Date.now() - status.lastTest > 60 * 60 * 1000)) {
            return true; // 未测试或超过1小时视为可用
        }
        return status.available;
    }

    /**
     * 对模型列表进行排序：可用的在前，不可用的在后
     * @param {Array} models - 模型数组
     * @returns {Array} 排序后的模型数组
     */
    function sortModelsByAvailability(models) {
        return [...models].sort((a, b) => {
            const aAvail = isModelAvailable(a.id);
            const bAvail = isModelAvailable(b.id);
            if (aAvail === bAvail) return 0;
            return aAvail ? -1 : 1;
        });
    }

    /**
     * 测试单个模型
     * @param {string} modelId - 模型ID
     * @param {string} apiKey - API Key
     * @returns {Promise<boolean>}
     */
    function testModel(modelId, apiKey) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: JSON.stringify({
                    model: modelId,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 5
                }),
                onload: (response) => {
                    resolve(response.status >= 200 && response.status < 300);
                },
                onerror: () => resolve(false),
                ontimeout: () => resolve(false)
            });
        });
    }

    /**
     * 批量测试所有模型
     * @param {Array} models - 模型列表
     * @param {string} apiKey - API Key
     * @param {Function} onProgress - 进度回调 (current, total, modelId, success)
     */
    async function batchTestModels(models, apiKey, onProgress) {
        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            const success = await testModel(model.id, apiKey);
            markModelTest(model.id, success);
            if (onProgress) {
                onProgress(i + 1, models.length, model.id, success);
            }
        }
    }

    /**
     * 更新模型选择下拉框（带可用性排序）
     */
    function updateModelSelect(models, currentModel) {
        const select = document.getElementById('setting-model');
        if (!select) return;
        
        const currentValue = currentModel || select.value;
        select.innerHTML = '';
        
        // Auto 选项
        const autoOption = document.createElement('option');
        autoOption.value = 'openrouter/auto';
        autoOption.textContent = '🎲 Auto (智能路由 - 推荐)';
        if (currentValue === 'openrouter/auto') autoOption.selected = true;
        select.appendChild(autoOption);
        
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────────';
        select.appendChild(separator);
        
        // 排序并添加模型
        const sortedModels = sortModelsByAvailability(models);
        sortedModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            const isAvail = isModelAvailable(model.id);
            option.textContent = isAvail ? model.name : `${model.name} (不可用)`;
            if (!isAvail) {
                option.style.color = '#999';
            }
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
        init,
        fetchFreeModels,
        updateModelSelect,
        loadCachedModels,
        saveToCache,
        refreshModels,
        getProviderIcon,
        getModelDisplayName,
        batchTestModels,
        isModelAvailable,
        markModelTest
    };
})();
