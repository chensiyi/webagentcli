// ==================== API 调用模块 ====================

const APIManager = (function() {
    let isProcessing = false;

    /**
     * 调用 AI API
     */
    async function callAPI(userMessage, conversationHistory, config, abortController = null) {
        if (isProcessing) return null;
        
        isProcessing = true;
        
        try {
            // 验证配置
            if (!config.apiKey) {
                throw new Error('API Key 未设置，请在设置中配置 OpenRouter API Key');
            }
            if (!config.model) {
                throw new Error('模型未设置');
            }
            
            const messages = buildMessages(userMessage, conversationHistory, config);
            
            const requestBody = {
                model: config.model,
                messages: messages,
                temperature: config.temperature || 0.7,
                top_p: config.topP || 0.95,
                // 限制 max_tokens 最大值，避免超出 API 限制
                max_tokens: Math.min(config.maxTokens || 2048, 8192)
            };
            
            console.log('📤 API 请求:', { model: config.model, messagesCount: messages.length });
            
            const response = await makeRequest(requestBody, config.apiKey, abortController);
            
            console.log('📥 API 响应:', response.choices ? '成功' : '失败');
            
            if (response.choices && response.choices.length > 0) {
                const assistantMessage = response.choices[0].message.content;
                return { success: true, message: assistantMessage };
            } else {
                throw new Error('无效的 API 响应');
            }

        } catch (error) {
            console.error('API 调用失败:', error);
            
            // 检查是否是用户主动取消
            if (error.name === 'AbortError') {
                return { success: false, cancelled: true, error: '请求已取消' };
            }
            
            return { success: false, error: error.message };
        } finally {
            isProcessing = false;
        }
    }

    /**
     * 构建消息数组
     */
    function buildMessages(currentMessage, history, config) {
        // 系统提示词
        const systemMessage = {
            role: 'system',
            content: `你是浏览器中的AI助手,发送\`\`\`js\`\`\`包裹的代码块，执行代码，通过return获取结果`
        };

        // 获取最近的对话历史(最多保留最近 10 轮)
        const recentHistory = (history || []).slice(-10);
        
        // 构建完整的消息数组
        const messages = [
            systemMessage,
            ...recentHistory.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.content
            })),
            {
                role: 'user',
                content: currentMessage
            }
        ];

        return messages;
    }

    /**
     * 发起 HTTP 请求
     */
    function makeRequest(requestBody, apiKey, abortController = null) {
        return new Promise((resolve, reject) => {
            const xhr = GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'AI Browser Agent'
                },
                data: JSON.stringify(requestBody),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            resolve(data);
                        } catch (error) {
                            reject(new Error('响应解析失败'));
                        }
                    } else {
                        // 尝试解析错误详情
                        let errorDetail = response.statusText;
                        try {
                            const errorData = JSON.parse(response.responseText);
                            if (errorData.error) {
                                errorDetail = errorData.error.message || errorData.error.code || JSON.stringify(errorData.error);
                            }
                        } catch (e) {
                            errorDetail = response.responseText || response.statusText;
                        }
                        reject(new Error(`HTTP ${response.status}: ${errorDetail}`));
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('请求超时')),
                onreadystatechange: (readyState) => {
                    // 检查是否被中止
                    if (abortController && abortController.signal.aborted) {
                        xhr.abort();
                        reject(new DOMException('The user aborted a request.', 'AbortError'));
                    }
                }
            });
            
            // 监听 abort 信号
            if (abortController) {
                abortController.signal.addEventListener('abort', () => {
                    xhr.abort();
                    reject(new DOMException('The user aborted a request.', 'AbortError'));
                });
            }
        });
    }

    /**
     * 检查是否正在处理
     */
    function getProcessingState() {
        return isProcessing;
    }

    return {
        callAPI,
        getProcessingState
    };
})();
