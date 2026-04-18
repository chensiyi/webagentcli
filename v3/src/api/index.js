// ==================== API 客户端工厂 ====================
// v4.1.0: 根据提供商类型创建对应的客户端

const APIClientFactory = (function() {
    'use strict';

    /**
     * 创建 API 客户端
     * @param {Object} providerConfig - 提供商配置
     * @param {string} modelId - 模型 ID
     * @returns {BaseAPIClient} API 客户端实例
     */
    function createClient(providerConfig, modelId) {
        const config = {
            baseUrl: providerConfig.baseUrl,
            apiKey: providerConfig.apiKey,
            model: modelId,
            timeout: providerConfig.timeout
        };

        // 根据提供商类型或 baseUrl 判断使用哪个客户端
        const providerType = detectProviderType(providerConfig);

        switch (providerType) {
            case 'openrouter':
                return new OpenRouterClient(config);
            
            case 'lmstudio':
                return new LMStudioClient(config);
            
            case 'ollama':
                // TODO: 实现 OllamaClient
                throw new Error('Ollama 客户端尚未实现');
            
            default:
                // 默认使用 OpenRouter 兼容的客户端
                console.log(`[APIClientFactory] 使用 OpenRouter 兼容客户端 for ${providerType}`);
                return new OpenRouterClient(config);
        }
    }

    /**
     * 检测提供商类型
     * @param {Object} providerConfig - 提供商配置
     * @returns {string} 提供商类型
     */
    function detectProviderType(providerConfig) {
        const baseUrl = providerConfig.baseUrl || '';
        const name = (providerConfig.name || '').toLowerCase();

        // 检查是否为 LM Studio
        if (baseUrl.includes('localhost:1234') || 
            baseUrl.includes('127.0.0.1:1234') ||
            name.includes('lm studio') ||
            name.includes('lmstudio')) {
            return 'lmstudio';
        }

        // 检查是否为 Ollama
        if (baseUrl.includes('localhost:11434') ||
            baseUrl.includes('127.0.0.1:11434') ||
            name.includes('ollama')) {
            return 'ollama';
        }

        // 默认为 OpenRouter
        return 'openrouter';
    }

    return {
        createClient,
        detectProviderType
    };
})();
