// ==================== API 路由模块 ====================
// v4.0.0: 重构为使用 ProviderManager
// 负责模型选择、故障转移和重试逻辑

const APIRouter = (function() {
    'use strict';

    /**
     * 获取可用模型列表（按优先级排序）
     */
    function getAvailableModels(currentModel) {
        // v4.0.0: 从 ProviderManager 获取所有可用模型
        const allModels = ProviderManager.getAllAvailableModels();
        
        let models = [...allModels];
        
        console.log(`[API Router] 📋 总模型数: ${models.length}, 当前模式: ${currentModel || 'auto'}`);

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
            console.log(`[API Router] ⚠️ 用户指定模型，不过滤可用性`);
            return models; // 如果用户指定了模型，则不根据可用性过滤，交给路由层去试
        }

        // ✅ Auto 模式：过滤掉不可用的模型
        const availableModels = models.filter(m => {
            const isAvail = ModelManager.isModelAvailable(m.id);
            if (!isAvail) {
                console.log(`[API Router] 🚫 过滤掉不可用模型: ${m.id}`);
            }
            return isAvail;
        });
        
        console.log(`[API Router] ✅ 过滤后可用模型数: ${availableModels.length} / ${models.length}`);
        return availableModels;
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
            // 如果没有可用模型，返回错误
            return { 
                success: false, 
                error: '没有可用的模型。请检查提供商配置。',
                attempts: 0 
            };
        }

        let lastError = null;
        let attempts = 0;
        const MAX_ATTEMPTS_PER_MODEL = 3; // ✅ 每个模型最多测试 3 次

        for (const model of modelsToTry) {
            // 创建当前模型的配置副本
            const currentConfig = { ...config, model: model.id };
            
            for (let i = 0; i < MAX_ATTEMPTS_PER_MODEL; i++) {
                if (abortController?.signal.aborted) {
                    return { success: false, cancelled: true, error: '请求已取消' };
                }

                attempts++;
                console.log(`[API Router] 🔄 尝试模型: ${model.id} (第 ${i + 1} 次)`);
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
                        console.log('[API Router] Request cancelled');
                        return result;
                    }

                    // 请求失败，记录错误
                    lastError = new Error(result.error || '未知错误');
                    console.log(`[API Router] ❌ 模型 ${model.id} 第 ${i + 1}/${MAX_ATTEMPTS_PER_MODEL} 次尝试失败`);
                    ErrorTracker.report(lastError, {
                        model: model.id,
                        attempt: i + 1,
                        error: result.error
                    }, ErrorTracker.ErrorCategory.API, ErrorTracker.ErrorLevel.WARN);
                    ModelManager.markModelTest(model.id, false);
                    
                } catch (error) {
                    lastError = error;
                    ModelManager.markModelTest(model.id, false);
                    
                    ErrorTracker.report(error, {
                        model: model.id,
                        attempt: i + 1,
                        category: 'API_REQUEST'
                    }, ErrorTracker.ErrorCategory.API, ErrorTracker.ErrorLevel.ERROR);
                    
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
