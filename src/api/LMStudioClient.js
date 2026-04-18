// ==================== LM Studio API 客户端 ====================
// v4.1.0: LM Studio 本地服务实现

class LMStudioClient extends BaseAPIClient {
    /**
     * 构造函数
     * @param {Object} config - 配置对象
     */
    constructor(config) {
        super({
            baseUrl: config.baseUrl || 'http://localhost:1234/v1',
            apiKey: config.apiKey || 'lm-studio', // LM Studio 不需要真实 API Key
            model: config.model,
            timeout: config.timeout || 60000 // 本地服务可能需要更长时间
        });
        
        this.validateConfig();
    }

    /**
     * 构建请求头
     */
    buildHeaders() {
        return {
            'Content-Type': 'application/json'
        };
    }

    /**
     * 构建请求体
     */
    buildBody(messages, params = {}) {
        return {
            model: this.model,
            messages: messages,
            stream: params.stream || false,
            temperature: params.temperature || 0.7,
            max_tokens: params.maxTokens || 4096,
            ...params
        };
    }

    /**
     * 获取端点 URL
     */
    getEndpoint() {
        return `${this.baseUrl}/chat/completions`;
    }

    /**
     * 解析流式响应块
     */
    parseStreamChunk(chunk) {
        try {
            const data = JSON.parse(chunk);
            
            if (data.choices && data.choices[0] && data.choices[0].delta) {
                const delta = data.choices[0].delta;
                return {
                    content: delta.content || '',
                    role: delta.role || null,
                    finish_reason: data.choices[0].finish_reason || null
                };
            }
            
            return null;
        } catch (e) {
            console.warn('[LMStudioClient] 解析失败:', e);
            return null;
        }
    }

    /**
     * 验证配置
     */
    validateConfig() {
        super.validateConfig();
        
        if (!this.model) {
            throw new Error('model 不能为空');
        }
        
        // LM Studio 是本地服务，检查是否为 localhost
        if (!this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1')) {
            console.warn('[LMStudioClient] LM Studio 通常运行在 localhost，请确认 baseUrl 是否正确');
        }
        
        return true;
    }
}
