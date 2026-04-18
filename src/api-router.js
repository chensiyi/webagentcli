// ==================== API 路由模块 ====================
// 负责模型选择、故障转移和重试逻辑

const APIRouter = (function() {
    'use strict';

    /**
     * 获取可用模型列表（按优先级排序）
     */
    function getAvailableModels(currentModel) {
        const cached = ModelManager.loadCachedModels();
        let models = [...cached.models];

        // 将当前选中的模型排在最前面
        if (currentModel && currentModel !== 'openrouter/auto') {
            models.sort((a, b) => {
                if (a.id === currentModel) return -1;
                if (b.id === currentModel) return 1;
                return 0;
            });
        }

        // 过滤掉明确标记为不可用的模型（除非是用户强制选中的）
        if (currentModel && currentModel !== 'openrouter/auto') {
            return models; // 如果用户指定了模型，则不根据可用性过滤，交给路由层去试
        }

        return models.filter(m => ModelManager.isModelAvailable(m.id));
    }

    /**
     * 发送请求（带自动重试和故障转移）
     * @param {Object} params - 请求参数
     * @param {Function} onChunk - 流式回调
     * @returns {Promise<Object>}
     */
    async function sendRequest(params, onChunk) {
        const { userMessage, conversationHistory, config, abortController } = params;
        
        let modelsToTry = getAvailableModels(config.model);
        if (modelsToTry.length === 0) {
            // 如果没有可用模型，尝试使用默认列表
            modelsToTry = ModelManager.DEFAULT_MODELS;
        }

        let lastError = null;
        let attempts = 0;
        const MAX_ATTEMPTS_PER_MODEL = 2;

        for (const model of modelsToTry) {
            // 创建当前模型的配置副本
            const currentConfig = { ...config, model: model.id };
            
            for (let i = 0; i < MAX_ATTEMPTS_PER_MODEL; i++) {
                if (abortController?.signal.aborted) {
                    return { success: false, cancelled: true, error: '请求已取消' };
                }

                attempts++;
                Utils.debugLog(`🔄 尝试模型: ${model.id} (第 ${i + 1} 次)`);

                try {
                    const result = await APIManager.callAPIStreaming(
                        userMessage, 
                        conversationHistory, 
                        currentConfig, 
                        abortController, 
                        onChunk
                    );

                    if (result.success) {
                        // 标记模型可用
                        ModelManager.markModelTest(model.id, true);
                        return result;
                    }

                    // 如果是因为被取消，直接返回
                    if (result.cancelled) {
                        return result;
                    }

                    lastError = new Error(result.error || '未知错误');
                    ModelManager.markModelTest(model.id, false);
                    
                } catch (error) {
                    lastError = error;
                    ModelManager.markModelTest(model.id, false);
                    if (error.name === 'AbortError') {
                        return { success: false, cancelled: true, error: '请求已取消' };
                    }
                }
            }
        }

        return { 
            success: false, 
            error: `所有模型均失败。最后错误: ${lastError?.message || '未知'}`,
            attempts 
        };
    }

    return {
        sendRequest,
        getAvailableModels
    };
})();
