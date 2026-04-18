// ==================== 模型管理模块 ====================
// v4.0.0: 重构为从 ProviderManager 动态获取模型

// 注意：此文件通过 build.js 合并，ProviderManager 已在全局作用域

const ModelManager = (function() {
    const CACHE_KEY = 'cached_models';
    const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时
    const STATUS_KEY = 'model_status';

    // 模型状态管理: { modelId: { available: boolean, lastTest: timestamp } }
    let modelStatus = {};

    /**
     * 初始化模型管理器
     */
    async function init() {
        await loadModelStatus();
        console.log('[ModelManager] Initialized');
    }

    /**
     * 获取所有可用模型（从 ProviderManager）
     */
    async function getAvailableModels() {
        // 从 ProviderManager 获取所有可用模型
        const models = ProviderManager.getAllAvailableModels();
        
        // 如果没有任何模型，返回默认模型列表（向后兼容）
        if (models.length === 0) {
            console.warn('[ModelManager] No models found, using fallback');
            return [
                { id: 'openrouter/auto', name: '🎲 Auto (智能路由)', provider: 'openrouter' }
            ];
        }
        
        return models;
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
        const now = Date.now();
        
        if (!modelStatus[modelId]) {
            modelStatus[modelId] = {
                available: true,
                lastTest: now,
                consecutiveFailures: 0  // 连续失败次数
            };
        }
        
        if (success) {
            // 成功：重置失败计数，标记为可用
            modelStatus[modelId].available = true;
            modelStatus[modelId].consecutiveFailures = 0;
            modelStatus[modelId].lastTest = now;
        } else {
            // 失败：增加失败计数
            modelStatus[modelId].consecutiveFailures++;
            modelStatus[modelId].lastTest = now;
            
            console.log(`[ModelManager] 📊 模型 ${modelId} 失败计数: ${modelStatus[modelId].consecutiveFailures}/3`);
            
            // ✅ 连续失败 3 次后才标记为不可用
            if (modelStatus[modelId].consecutiveFailures >= 3) {
                modelStatus[modelId].available = false;
                console.warn(`[ModelManager] ⛔ 模型 ${modelId} 已连续失败 ${modelStatus[modelId].consecutiveFailures} 次，标记为不可用（1小时后自动恢复）`);
                console.log(`[ModelManager] 💾 当前状态:`, JSON.stringify(modelStatus[modelId]));
                ErrorTracker.report(
                    `模型 ${modelId} 连续失败 ${modelStatus[modelId].consecutiveFailures} 次`,
                    { modelId, failures: modelStatus[modelId].consecutiveFailures },
                    ErrorTracker.ErrorCategory.API,
                    ErrorTracker.ErrorLevel.WARN
                );
            }
        }
        
        saveModelStatus();
        console.log(`[ModelManager] ✅ 已保存模型状态到 GM_setValue`);
    }

    /**
     * 获取模型可用性状态
     * @param {string} modelId - 模型ID
     * @returns {boolean}
     */
    function isModelAvailable(modelId) {
        const status = modelStatus[modelId];
        
        console.log(`[ModelManager] 🔍 检查模型 ${modelId}:`, status ? `存在 (available=${status.available}, failures=${status.consecutiveFailures})` : '不存在');
        
        // 未测试或超过1小时：视为可用，并重置状态
        if (!status || (Date.now() - status.lastTest > 60 * 60 * 1000)) {
            if (status) {
                // ✅ 1小时后自动恢复：重置失败计数
                console.log(`[ModelManager] ⏰ 模型 ${modelId} 超过1小时未测试，自动恢复为可用状态`);
                delete modelStatus[modelId];
                saveModelStatus();
            } else {
                console.log(`[ModelManager] ✨ 模型 ${modelId} 从未测试过，视为可用`);
            }
            return true;
        }
        
        const isAvail = status.available;
        console.log(`[ModelManager] 📊 模型 ${modelId} 可用性: ${isAvail ? '✅ 可用' : '❌ 不可用'} (失败次数: ${status.consecutiveFailures}, lastTest: ${new Date(status.lastTest).toLocaleTimeString()})`);
        return isAvail;
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
     * 更新模型选择下拉框（按提供商分组显示）
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
        
        // 按提供商分组
        const groupedModels = {};
        models.forEach(model => {
            const providerId = model.providerId || model.provider || 'unknown';
            const providerName = model.providerName || providerId;
            
            if (!groupedModels[providerId]) {
                groupedModels[providerId] = {
                    name: providerName,
                    models: []
                };
            }
            groupedModels[providerId].models.push(model);
        });
        
        // 添加每个提供商的模型
        Object.keys(groupedModels).forEach(providerId => {
            const group = groupedModels[providerId];
            
            // 提供商标题
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${group.name} (${group.models.length})`;
            
            // 排序并添加模型
            const sortedModels = sortModelsByAvailability(group.models);
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
                optgroup.appendChild(option);
            });
            
            select.appendChild(optgroup);
        });
    }

    /**
     * 加载缓存的模型列表（v4.0.0: 已废弃，使用 ProviderManager）
     */
    function loadCachedModels() {
        // v4.0.0: 此函数已废弃，保留仅为向后兼容
        console.warn('[ModelManager] loadCachedModels is deprecated, use ProviderManager instead');
        return { models: [], isExpired: true, hoursAgo: 0 };
    }

    /**
     * 保存模型列表到缓存（v4.0.0: 已废弃）
     */
    function saveToCache(models) {
        // v4.0.0: 此函数已废弃
        console.warn('[ModelManager] saveToCache is deprecated');
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
        init,
        getAvailableModels,
        updateModelSelect,
        loadCachedModels,
        saveToCache,
        isModelAvailable,
        testModel,
        batchTestModels,
        markModelTest
    };
})();
