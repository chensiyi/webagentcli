// ==================== API 调用模块 ====================

const APIManager = (function() {
    let isProcessing = false;

    /**
     * 调用 AI API
     */
    async function callAPI(userMessage, conversationHistory, config) {
        if (isProcessing) return null;
        
        isProcessing = true;
        
        try {
            const messages = buildMessages(userMessage, conversationHistory, config);
            
            const requestBody = {
                model: config.model,
                messages: messages,
                temperature: config.temperature,
                top_p: config.topP,
                max_tokens: config.maxTokens
            };

            const response = await makeRequest(requestBody, config.apiKey);
            
            if (response.choices && response.choices.length > 0) {
                const assistantMessage = response.choices[0].message.content;
                return { success: true, message: assistantMessage };
            } else {
                throw new Error('无效的 API 响应');
            }

        } catch (error) {
            console.error('API 调用失败:', error);
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
            content: `你是一个运行在浏览器中的 AI 助手。你可以:
1. 回答各种问题
2. 帮助分析和操作当前网页
3. 生成和执行 JavaScript 代码

当前页面信息:
- URL: ${window.location.href}
- 标题: ${document.title}

请用简洁、实用的方式回答问题。如果需要执行代码,请使用 \`\`\`javascript 代码块包裹。`
        };

        // 获取最近的对话历史(最多保留最近 10 轮)
        const recentHistory = history.slice(-10);
        
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
    function makeRequest(requestBody, apiKey) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
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
                        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('请求超时'))
            });
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
