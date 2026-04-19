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

        // 将当前选中的模型排在最前面
        const isAutoMode = !currentModel || currentModel === 'auto' || currentModel === 'openrouter/auto';
        
        if (!isAutoMode) {
            models.sort((a, b) => {
                if (a.id === currentModel) return -1;
                if (b.id === currentModel) return 1;
                return 0;
            });
        }

        // 过滤掉明确标记为不可用的模型（除非是用户强制选中的）
        if (!isAutoMode) {
            return models; // 如果用户指定了模型，则不根据可用性过滤，交给路由层去试
        }

        // ✅ Auto 模式：过滤掉不可用的模型
        const availableModels = models.filter(m => ModelManager.isModelAvailable(m.id));
        
        // 记录过滤统计（仅在过滤掉模型时记录）
        if (availableModels.length < models.length) {
            ErrorTracker.report(
                `自动过滤 ${models.length - availableModels.length} 个不可用模型`,
                { total: models.length, available: availableModels.length },
                ErrorTracker.ErrorCategory.API,
                ErrorTracker.ErrorLevel.INFO
            );
        }
        
        return availableModels;
    }

    /**
     * 发送请求（带自动重试和故障转移）
     * @param {Object} params - 请求参数
     * @param {Function} onChunk - 流式回调
     * @returns {Promise<Object>}
     */
    async function sendRequest(params, onChunk) {
        console.log('[API Router] 📥 收到 sendRequest 调用');
        
        const { messages, config, abortController } = params;  // ✅ 直接使用完整的 messages
        
        console.log('[API Router] 📊 消息数量:', messages?.length);
        console.log('[API Router] ⚙️ 配置模型:', config?.model);
        
        let modelsToTry = getAvailableModels(config.model);
        
        console.log('[API Router] 📋 可用模型数量:', modelsToTry.length);
        console.log('[API Router] 🎯 当前配置模型:', config.model);
        
        if (modelsToTry.length === 0) {
            console.error('[API Router] ❌ 没有可用模型！');
            // 如果没有可用模型，返回错误
            ErrorTracker.report(
                '没有可用的模型，请检查提供商配置',
                {},
                ErrorTracker.ErrorCategory.CONFIG,
                ErrorTracker.ErrorLevel.ERROR
            );
            return { 
                success: false, 
                error: '没有可用的模型。请检查提供商配置（API Key、启用状态）。',
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
                    // ✅ v4.1.0: 使用新的 API 客户端架构
                    const provider = ProviderManager.getProviderByModel(model.id);
                    if (!provider) {
                        throw new Error(`未找到模型 ${model.id} 的提供商配置`);
                    }
                    
                    const client = APIClientFactory.createClient(provider, model.id);
                    
                    // ✅ 直接使用 AIAgent 构建的完整消息数组（包含 System Prompt）
                    const result = await client.sendStreamingRequest(
                        messages,
                        onChunk,
                        {
                            temperature: currentConfig.temperature || 0.7,
                            maxTokens: currentConfig.maxTokens || 4096
                        },
                        abortController
                    );

                    // ✅ v4.1.0: 新客户端返回 { success, content, complete }
                    if (result.success) {
                        // 标记模型可用
                        ModelManager.markModelTest(model.id, true);
                        return {
                            success: true,
                            content: result.content,
                            model: model.id,
                            attempts
                        };
                    }
                    
                    // 如果请求失败
                    throw new Error(result.error || '请求失败');
                    
                } catch (error) {
                    lastError = error;
                    ModelManager.markModelTest(model.id, false);
                    
                    ErrorTracker.report(error, {
                        model: model.id,
                        attempt: i + 1,
                        category: 'API_REQUEST'
                    }, ErrorTracker.ErrorCategory.API, ErrorTracker.ErrorLevel.ERROR);
                    
                    // ✅ 检查是否已达到最大失败次数，如果是则跳出内层循环
                    const status = ModelManager.getModelStatus(model.id);
                    if (status && !status.available) {
                        ErrorTracker.report(
                            `模型 ${model.id} 已标记为不可用，停止重试`,
                            { modelId: model.id, failures: status.consecutiveFailures },
                            ErrorTracker.ErrorCategory.API,
                            ErrorTracker.ErrorLevel.WARN
                        );
                        break; // 跳出内层循环，尝试下一个模型
                    }
                    
                    // 处理中止错误
                    if (error.name === 'AbortError' || error.message.includes('取消')) {
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
