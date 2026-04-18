// ==================== API 基础客户端 ====================
// v4.1.0: 所有 API 客户端的基类
// 定义统一的接口规范

class BaseAPIClient {
    /**
     * 构造函数
     * @param {Object} config - 配置对象
     * @param {string} config.baseUrl - API 基础 URL
     * @param {string} config.apiKey - API 密钥（可选）
     * @param {string} config.model - 模型 ID
     */
    constructor(config) {
        if (new.target === BaseAPIClient) {
            throw new TypeError('Cannot construct BaseAPIClient directly');
        }
        
        this.baseUrl = config.baseUrl;
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.timeout = config.timeout || 30000; // 默认 30 秒超时
    }

    /**
     * 构建请求头（子类必须实现）
     * @returns {Object} 请求头对象
     */
    buildHeaders() {
        throw new Error('Method buildHeaders() must be implemented');
    }

    /**
     * 构建请求体（子类必须实现）
     * @param {Array} messages - 消息数组
     * @param {Object} params - 额外参数
     * @returns {Object} 请求体
     */
    buildBody(messages, params = {}) {
        throw new Error('Method buildBody() must be implemented');
    }

    /**
     * 获取端点 URL（子类必须实现）
     * @returns {string} 完整的 API 端点 URL
     */
    getEndpoint() {
        throw new Error('Method getEndpoint() must be implemented');
    }

    /**
     * 解析流式响应块（子类必须实现）
     * @param {string} chunk - 原始数据块
     * @returns {Object|null} 解析后的内容，null 表示跳过
     */
    parseStreamChunk(chunk) {
        throw new Error('Method parseStreamChunk() must be implemented');
    }

    /**
     * 发送非流式请求（默认实现，子类可覆盖）
     * @param {Array} messages - 消息数组
     * @param {Object} params - 额外参数
     * @param {AbortController} abortController - 中止控制器
     * @returns {Promise<Object>} 响应结果
     */
    async sendRequest(messages, params = {}, abortController = null) {
        const endpoint = this.getEndpoint();
        const headers = this.buildHeaders();
        const body = this.buildBody(messages, params);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: headers,
                data: JSON.stringify(body),
                timeout: this.timeout,
                ontimeout: () => {
                    reject(new Error(`请求超时 (${this.timeout}ms)`));
                },
                onerror: (error) => {
                    reject(new Error(`网络错误: ${error.statusText || error}`));
                },
                onload: (response) => {
                    try {
                        if (response.status >= 200 && response.status < 300) {
                            const data = JSON.parse(response.responseText);
                            resolve({
                                success: true,
                                data: data,
                                status: response.status
                            });
                        } else {
                            reject(new Error(`HTTP ${response.status}: ${response.responseText}`));
                        }
                    } catch (e) {
                        reject(new Error(`解析响应失败: ${e.message}`));
                    }
                }
            });
        });
    }

    /**
     * 发送流式请求（默认实现，子类可覆盖）
     * @param {Array} messages - 消息数组
     * @param {Function} onChunk - 每个块的回调函数
     * @param {Object} params - 额外参数
     * @param {AbortController} abortController - 中止控制器
     * @returns {Promise<Object>} 最终结果
     */
    async sendStreamingRequest(messages, onChunk, params = {}, abortController = null) {
        const endpoint = this.getEndpoint();
        const headers = this.buildHeaders();
        const body = this.buildBody(messages, { ...params, stream: true });

        let fullContent = '';
        let isComplete = false;

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: headers,
                data: JSON.stringify(body),
                responseType: 'text',
                timeout: this.timeout,
                ontimeout: () => {
                    reject(new Error(`请求超时 (${this.timeout}ms)`));
                },
                onerror: (error) => {
                    reject(new Error(`网络错误: ${error.statusText || error}`));
                },
                onreadystatechange: (response) => {
                    if (response.readyState === 3 || response.readyState === 4) {
                        const text = response.responseText;
                        
                        // 处理 SSE 格式的数据
                        const lines = text.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6).trim();
                                
                                if (data === '[DONE]') {
                                    isComplete = true;
                                    continue;
                                }

                                try {
                                    const parsed = this.parseStreamChunk(data);
                                    if (parsed && parsed.content) {
                                        fullContent += parsed.content;
                                        onChunk(parsed.content);
                                    }
                                } catch (e) {
                                    console.warn('[BaseAPIClient] 解析块失败:', e);
                                }
                            }
                        }
                    }
                },
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve({
                            success: true,
                            content: fullContent,
                            complete: isComplete
                        });
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${response.responseText}`));
                    }
                }
            });
        });
    }

    /**
     * 验证配置是否有效（子类可覆盖）
     * @returns {boolean}
     */
    validateConfig() {
        if (!this.baseUrl) {
            throw new Error('baseUrl 不能为空');
        }
        return true;
    }
}
