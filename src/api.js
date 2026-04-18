// ==================== API 调用模块 ====================
// v4.0.0: 支持多提供商 API 调用

const APIManager = (function() {
    let isProcessing = false;

    /**
     * 根据模型 ID 获取对应的提供商配置
     */
    function getProviderConfig(modelId) {
        const provider = ProviderManager.getProviderByModel(modelId);
        if (!provider) {
            throw new Error(`未找到模型 "${modelId}" 的提供商配置`);
        }
        
        const template = ProviderManager.getTemplate(provider.template);
        if (!template) {
            throw new Error(`未找到模板 "${provider.template}"`);
        }
        
        return { provider, template };
    }

    /**
     * 构建请求（使用模板）
     */
    function buildRequestWithTemplate(template, provider, model, messages, params) {
        // 构建端点 URL
        let endpoint = template.endpoint
            .replace('{baseUrl}', provider.baseUrl)
            .replace('{apiKey}', provider.apiKey || '')
            .replace('{model}', model);
        
        // 构建请求头
        const headers = template.headers(provider.apiKey);
        
        // 构建请求体
        const body = template.buildRequest(model, messages, params);
        
        return { endpoint, headers, body };
    }

    /**
     * 解析流式响应（使用模板）
     */
    function parseStreamChunk(template, chunk) {
        return template.parseStreamChunk(chunk);
    }

    /**
     * 检查流是否结束（使用模板）
     */
    function isStreamFinished(template, chunk) {
        return template.isStreamFinished ? template.isStreamFinished(chunk) : false;
    }

    /**
     * 调用 AI API（流式输出版本 - v4.0.0 多提供商支持）
     */
    async function callAPIStreaming(userMessage, conversationHistory, config, abortController, onChunk) {
        if (isProcessing) return null;
        
        isProcessing = true;
        let fullText = '';
        
        try {
            // 验证配置
            if (!config.model) {
                throw new Error('模型未设置');
            }
            
            console.log('[API] Using model:', config.model);
            
            // v4.0.0: 获取提供商配置和模板
            const { provider, template } = getProviderConfig(config.model);
            
            console.log('[API] Provider:', provider.name, '(', provider.id, ')');
            console.log('[API] Template:', template.name);
            
            // v4.0.0: 验证 API Key（本地服务不需要）
            if (!provider.apiKey && !provider.isLocal && template.headers.toString().includes('apiKey')) {
                throw new Error(`提供商 "${provider.name}" 的 API Key 未设置`);
            }
            
            const messages = buildMessages(userMessage, conversationHistory, config);
            
            // v4.0.0: 使用模板构建请求
            const params = {
                temperature: config.temperature || 0.7,
                top_p: config.topP || 0.95,
                max_tokens: Math.min(config.maxTokens || 2048, 8192)
            };
            
            const { endpoint, headers, body } = buildRequestWithTemplate(
                template, provider, config.model, messages, params
            );
            
            Utils.debugLog('📤 API 流式请求:', { 
                model: config.model, 
                provider: provider.name,
                template: provider.template,
                messagesCount: messages.length 
            });
            
            // v4.0.0: 根据提供商类型选择请求方法
            // 对于本地服务（localhost），使用 GM_xmlhttpRequest 绕过 CORS
            const isLocalhost = provider.baseUrl.includes('localhost') || 
                               provider.baseUrl.includes('127.0.0.1');
            
            let response;
            if (isLocalhost) {
                // 使用 GM_xmlhttpRequest 处理本地请求
                response = await makeGMRequest(endpoint, headers, body, abortController);
            } else {
                // 使用 fetch 处理远程请求
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'HTTP-Referer': window.location.href,
                        'X-Title': 'AI Browser Agent'
                    },
                    body: JSON.stringify(body),
                    signal: abortController?.signal
                });
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            // 获取 ReadableStream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            // 读取流式数据
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                // 解码数据块
                buffer += decoder.decode(value, { stream: true });
                
                // 分割 SSE 消息
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留不完整的行
                
                // 处理每一行
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                    
                    const dataStr = trimmedLine.slice(6);
                    
                    // 检查是否结束
                    if (dataStr === '[DONE]') {
                        Utils.debugLog('✅ 流式输出完成');
                        return { success: true, message: fullText };
                    }
                    
                    try {
                        const data = JSON.parse(dataStr);
                        
                        // v4.0.0: 使用模板解析响应
                        const content = parseStreamChunk(template, data);
                        
                        if (content) {
                            fullText += content;
                            // 调用回调，传递增量文本
                            onChunk(content, fullText);
                        }
                        
                        // v4.0.0: 检查流是否结束
                        if (isStreamFinished(template, data)) {
                            Utils.debugLog('✅ 流式输出完成（模板标记）');
                            return { success: true, message: fullText };
                        }
                    } catch (e) {
                        Utils.debugWarn('⚠️ SSE 解析失败:', e);
                    }
                }
            }
            
            Utils.debugLog('📥 流式响应完成，总长度:', fullText.length);
            return { success: true, message: fullText };
            
        } catch (error) {
            Utils.debugError('API 流式调用失败:', error);
            
            // 检查是否是用户主动取消
            if (error.name === 'AbortError') {
                return { success: false, cancelled: true, error: '请求已取消', message: fullText };
            }
            
            return { success: false, error: error.message, message: fullText };
        } finally {
            isProcessing = false;
        }
    }

    /**
     * 调用 AI API（旧版阻塞式）
     * @note 保留作为 fallback，当浏览器不支持 ReadableStream 时使用
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
            
            Utils.debugLog('📤 API 请求:', { model: config.model, messagesCount: messages.length });
            
            const response = await makeRequest(requestBody, config.apiKey, abortController);
            
            Utils.debugLog('📥 API 响应:', response.choices ? '成功' : '失败');
            
            if (response.choices && response.choices.length > 0) {
                const assistantMessage = response.choices[0].message.content;
                return { success: true, message: assistantMessage };
            } else {
                throw new Error('无效的 API 响应');
            }

        } catch (error) {
            Utils.debugError('API 调用失败:', error);
            
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
     * 使用 GM_xmlhttpRequest 发起请求（用于本地服务，绕过 CORS）
     */
    function makeGMRequest(endpoint, headers, body, abortController) {
        return new Promise((resolve, reject) => {
            let aborted = false;
            
            // 监听中止信号
            if (abortController && abortController.signal) {
                try {
                    abortController.signal.addEventListener('abort', () => {
                        aborted = true;
                        reject(new DOMException('The user aborted a request.', 'AbortError'));
                    });
                } catch (error) {
                    console.warn('[API] Failed to add abort listener:', error);
                }
            }
            
            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(body),
                responseType: 'text',
                timeout: 60000, // 60秒超时
                onload: (response) => {
                    if (aborted) return;
                    
                    // 创建模拟的 Response 对象
                    const mockResponse = {
                        ok: response.status >= 200 && response.status < 300,
                        status: response.status,
                        statusText: response.statusText,
                        body: {
                            getReader: () => {
                                // 将文本转换为 ReadableStream
                                const encoder = new TextEncoder();
                                const chunks = [];
                                let position = 0;
                                
                                // 按行分割响应
                                const lines = response.responseText.split('\n');
                                lines.forEach(line => {
                                    if (line.trim()) {
                                        chunks.push(encoder.encode(line + '\n'));
                                    }
                                });
                                
                                return {
                                    read: async () => {
                                        if (position >= chunks.length) {
                                            return { done: true, value: undefined };
                                        }
                                        return { done: false, value: chunks[position++] };
                                    }
                                };
                            }
                        },
                        text: async () => response.responseText
                    };
                    
                    resolve(mockResponse);
                },
                onerror: (error) => {
                    if (!aborted) {
                        reject(new Error(`GM_xmlhttpRequest error: ${error}`));
                    }
                },
                ontimeout: () => {
                    if (!aborted) {
                        reject(new Error('Request timeout'));
                    }
                }
            });
        });
    }

    /**
     * 估算文本的 token 数量（粗略估算）
     * 中文约 1.5-2 字符/token，英文约 4 字符/token
     */
    function estimateTokens(text) {
        if (!text) return 0;
        
        // 简单估算：中文字符和英文字符分开计算
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = text.length - chineseChars;
        
        // 中文：1.8 字符/token，其他：4 字符/token
        const tokens = Math.ceil(chineseChars / 1.8) + Math.ceil(otherChars / 4);
        
        return tokens;
    }

    /**
     * 构建消息数组（带智能上下文管理）
     */
    function buildMessages(currentMessage, history, config) {
        // 系统提示词
        const systemMessage = {
            role: 'system',
            content: `你是运行在浏览器中的 AI Web 助手，通过 Tampermonkey 用户脚本运行在当前网页中。

## 核心能力
- **执行 JavaScript 代码**：你可以发送 \`\`\`js 包裹的 JavaScript 代码块，系统会自动执行并显示结果
- **操作当前页面**：可以读取和修改当前网页的 DOM、样式、内容等
- **获取页面信息**：可以提取页面文本、链接、图片等信息
- **与页面交互**：可以模拟点击、输入、滚动等操作
- 你的回复应该明确且有针对性，旨在解决用户的问题或完成用户任务

## ⚠️ 重要：代码执行规则
1. **代码在全局作用域执行**，不能使用 return 语句
2. **直接写表达式或语句**，系统会自动捕获最后一个表达式的值
3. **如需返回复杂数据**，直接写出变量名或对象即可
4. **异步代码需用 async/await**：如需执行异步操作，使用 async 函数
5. **避免阻塞操作**：不要执行长时间运行的同步代码

## ✅ 正确示例

**查询页面标题：**
\`\`\`js
document.title
\`\`\`

**统计页面元素数量：**
\`\`\`js
document.querySelectorAll('body *').length
\`\`\`

**获取所有链接：**
\`\`\`js
Array.from(document.querySelectorAll('a')).map(a => ({
  text: a.textContent.trim(),
  href: a.href
})).slice(0, 10)
\`\`\`

**修改页面背景色：**
\`\`\`js
document.body.style.backgroundColor = '#f0f0f0';
'背景色已修改'
\`\`\`

## ❌ 错误示例

**不要使用 return：**
\`\`\`js
return document.title;  // ❌ 错误：SyntaxError: Illegal return statement
\`\`\`

**正确做法：**
\`\`\`js
document.title  // ✅ 正确：直接写表达式
\`\`\``
        };

        // v4.0.0: 智能上下文管理
        const maxTokens = config.maxTokens || 2048;
        
        // 为响应预留空间（至少 512，最多 1024 tokens）
        const reservedForResponse = Math.max(512, Math.min(maxTokens, 1024));
        
        // 假设模型的上下文窗口为 8K（保守估计，适用于大多数模型）
        // 常见模型的上下文窗口：
        // - GPT-3.5/4: 4K-128K
        // - Claude: 8K-200K
        // - Llama 3: 8K-128K
        // - Qwen: 8K-32K
        // - Mistral: 8K-32K
        const CONTEXT_WINDOW = 8192;
        const availableForContext = CONTEXT_WINDOW - reservedForResponse;
        
        console.log('[API] Context management: maxTokens=', maxTokens, ', reserved=', reservedForResponse, ', available=', availableForContext);
        
        // 计算当前消息和系统提示词的 token 数
        const currentMessageTokens = estimateTokens(currentMessage);
        const systemMessageTokens = estimateTokens(systemMessage.content);
        const fixedTokens = currentMessageTokens + systemMessageTokens;
        
        console.log('[API] Fixed tokens: system=', systemMessageTokens, ', current=', currentMessageTokens, ', total=', fixedTokens);
        
        // 如果固定部分已经超过可用上下文，只保留系统提示词和当前消息
        if (fixedTokens >= availableForContext) {
            console.warn('[API] ⚠️ 当前消息过长，可能超出上下文限制');
            return [
                systemMessage,
                {
                    role: 'user',
                    content: currentMessage
                }
            ];
        }
        
        // 计算可用于历史对话的 token 数
        const availableForHistory = availableForContext - fixedTokens;
        console.log('[API] Available for history:', availableForHistory, 'tokens');
        
        // 从最近的对话开始，逐步添加历史消息，直到达到 token 限制
        const recentHistory = (history || []).slice().reverse(); // 反转，从最近的消息开始
        const selectedHistory = [];
        let usedTokens = 0;
        
        for (const msg of recentHistory) {
            const msgTokens = estimateTokens(msg.content);
            
            // 如果添加这条消息会超出限制，停止
            if (usedTokens + msgTokens > availableForHistory) {
                console.log('[API] History truncated: used', usedTokens, '/', availableForHistory, 'tokens');
                break;
            }
            
            selectedHistory.unshift({  // unshift 保持原始顺序
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.content
            });
            usedTokens += msgTokens;
        }
        
        console.log('[API] Selected', selectedHistory.length, 'history messages, using', usedTokens, 'tokens');
        
        // 构建完整的消息数组
        const messages = [
            systemMessage,
            ...selectedHistory,
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
            if (abortController && abortController.signal) {
                try {
                    abortController.signal.addEventListener('abort', () => {
                        xhr.abort();
                        reject(new DOMException('The user aborted a request.', 'AbortError'));
                    });
                } catch (error) {
                    console.warn('[API] Failed to add abort listener:', error);
                }
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
        callAPIStreaming,
        getProcessingState
    };
})();
