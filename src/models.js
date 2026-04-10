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
     * 从 OpenRouter API 获取免费模型列表
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
