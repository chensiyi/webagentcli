// ==================== Ollama API 客户端 ====================
// v4.0.0: 支持 Ollama 本地服务
// 文档: https://github.com/ollama/ollama/blob/main/docs/api.md

class OllamaClient extends BaseAPIClient {
    constructor(config) {
        super({
            ...config,
            baseUrl: config.baseUrl || 'http://localhost:11434'
        });
        
        this.model = config.model;
    }

    /**
     * 构建请求体
     */
    buildRequestBody(messages, options = {}) {
        return {
            model: this.model,
            messages: messages.map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            })),
            stream: true,
            options: {
                temperature: options.temperature || 0.7,
                top_p: options.topP || 0.9,
                num_predict: options.maxTokens || 4096
            }
        };
    }

    /**
     * 发送流式请求
     */
    async sendStreamingRequest(messages, onChunk, options = {}, abortController = null) {
        try {
            const requestBody = this.buildRequestBody(messages, options);
            
            Utils.debugLog('[OllamaClient] Sending request:', {
                model: this.model,
                messageCount: messages.length,
                temperature: options.temperature
            });

            return new Promise((resolve, reject) => {
                let fullContent = '';
                let isComplete = false;

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${this.baseUrl}/api/chat`,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(requestBody),
                    responseType: 'text',
                    timeout: this.timeout || 60000,
                    
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            // Ollama 的流式响应是 NDJSON 格式（每行一个 JSON）
                            const lines = response.responseText.split('\n').filter(line => line.trim());
                            
                            for (const line of lines) {
                                try {
                                    const chunk = JSON.parse(line);
                                    
                                    // 检查是否完成
                                    if (chunk.done) {
                                        isComplete = true;
                                        break;
                                    }
                                    
                                    // 提取内容
                                    const content = chunk.message?.content || '';
                                    if (content) {
                                        fullContent += content;
                                        
                                        // 调用回调
                                        if (onChunk) {
                                            onChunk(content);
                                        }
                                    }
                                } catch (e) {
                                    ErrorTracker.report(
                                        `解析 Ollama 响应失败: ${e.message}`,
                                        { line },
                                        ErrorTracker.ErrorCategory.API,
                                        ErrorTracker.ErrorLevel.WARN
                                    );
                                }
                            }
                            
                            resolve({
                                success: true,
                                content: fullContent,
                                complete: isComplete
                            });
                        } else {
                            reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                        }
                    },
                    
                    onerror: (error) => {
                        ErrorTracker.report(
                            'Ollama 请求失败',
                            { error, model: this.model },
                            ErrorTracker.ErrorCategory.API,
                            ErrorTracker.ErrorLevel.ERROR
                        );
                        reject(new Error(`Ollama 连接失败: ${error}`));
                    },
                    
                    ontimeout: () => {
                        reject(new Error('Ollama 请求超时'));
                    },
                    
                    onabort: () => {
                        reject(new DOMException('请求已取消', 'AbortError'));
                    }
                });

                // 监听中止信号
                if (abortController?.signal) {
                    abortController.signal.addEventListener('abort', () => {
                        // GM_xmlhttpRequest 不支持直接中止，但我们可以在这里标记
                        reject(new DOMException('请求已取消', 'AbortError'));
                    });
                }
            });
        } catch (error) {
            ErrorTracker.report(
                'Ollama 客户端错误',
                { error, model: this.model },
                ErrorTracker.ErrorCategory.API,
                ErrorTracker.ErrorLevel.ERROR
            );
            throw error;
        }
    }

    /**
     * 测试连接
     */
    async testConnection() {
        try {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${this.baseUrl}/api/tags`,
                    timeout: 5000,
                    
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve({
                                success: true,
                                message: 'Ollama 连接成功'
                            });
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    
                    onerror: () => {
                        reject(new Error('无法连接到 Ollama 服务'));
                    },
                    
                    ontimeout: () => {
                        reject(new Error('连接超时'));
                    }
                });
            });
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取可用模型列表
     */
    async fetchModels() {
        try {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${this.baseUrl}/api/tags`,
                    timeout: 5000,
                    
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const data = JSON.parse(response.responseText);
                                const models = (data.models || []).map(model => ({
                                    id: model.name,
                                    name: model.name,
                                    provider: 'ollama',
                                    size: model.size ? this.formatSize(model.size) : '未知'
                                }));
                                
                                resolve({
                                    success: true,
                                    models
                                });
                            } catch (e) {
                                reject(new Error(`解析响应失败: ${e.message}`));
                            }
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    
                    onerror: () => {
                        reject(new Error('获取模型列表失败'));
                    },
                    
                    ontimeout: () => {
                        reject(new Error('请求超时'));
                    }
                });
            });
        } catch (error) {
            return {
                success: false,
                error: error.message,
                models: []
            };
        }
    }

    /**
     * 格式化文件大小
     */
    formatSize(bytes) {
        if (!bytes) return '未知';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
}
