// ==================== OpenRouter API 客户端 ====================
// v4.1.0: OpenRouter 专用实现

class OpenRouterClient extends BaseAPIClient {
    /**
     * 构造函数
     * @param {Object} config - 配置对象
     */
    constructor(config) {
        super({
            baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
            apiKey: config.apiKey,
            model: config.model,
            timeout: config.timeout
        });
        
        this.validateConfig();
    }

    /**
     * 构建请求头
     */
    buildHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        
        // OpenRouter 特定的头部
        headers['HTTP-Referer'] = window.location.href;
        headers['X-Title'] = 'Free Web AI Agent';
        
        return headers;
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
            console.warn('[OpenRouterClient] 解析失败:', e);
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
        
        return true;
    }
}
