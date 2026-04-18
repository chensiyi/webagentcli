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
            
            // ✅ 连续失败 3 次后才标记为不可用
            if (modelStatus[modelId].consecutiveFailures >= 3) {
                modelStatus[modelId].available = false;
                ErrorTracker.report(
                    `模型 ${modelId} 连续失败 ${modelStatus[modelId].consecutiveFailures} 次，标记为不可用`,
                    { modelId, failures: modelStatus[modelId].consecutiveFailures },
                    ErrorTracker.ErrorCategory.API,
                    ErrorTracker.ErrorLevel.WARN
                );
            }
        }
        
        saveModelStatus();
    }

    /**
     * 获取模型可用性状态
     * @param {string} modelId - 模型ID
     * @returns {boolean}
     */
    function isModelAvailable(modelId) {
        const status = modelStatus[modelId];
        
        // 未测试或超过1小时：视为可用，并重置状态
        if (!status || (Date.now() - status.lastTest > 60 * 60 * 1000)) {
            if (status) {
                // ✅ 1小时后自动恢复：重置失败计数
                delete modelStatus[modelId];
                saveModelStatus();
            }
            return true;
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
     * 刷新模型列表（从 ProviderManager 同步）
     */
    async function refreshModels() {
        try {
            // 从 ProviderManager 获取最新模型列表
            const models = await getAvailableModels();
            return { 
                success: true, 
                models, 
                count: models.length 
            };
        } catch (error) {
            console.error('[ModelManager] 刷新模型列表失败:', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * ✅ v4.0.0: 获取模型状态（供 API Router 使用）
     * @param {string} modelId - 模型ID
     * @returns {Object|null} 模型状态对象
     */
    function getModelStatus(modelId) {
        return modelStatus[modelId] || null;
    }

    return {
        init,
        getAvailableModels,
        refreshModels,
        isModelAvailable,
        testModel,
        batchTestModels,
        markModelTest,
        getModelStatus,
        sortModelsByAvailability
    };
})();
