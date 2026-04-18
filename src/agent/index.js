// ==================== AI Agent 核心 ====================
// v4.4.0: Agent 实例的核心运行逻辑
// 整合聊天、页面理解、上下文管理等功能

const AIAgent = (function() {
    'use strict';

    // Agent 状态
    let agentState = {
        isProcessing: false,
        currentConversation: [],
        pageContext: null,
        lastError: null
    };

    /**
     * 初始化 Agent
     */
    function init() {
        console.log('[AIAgent] 初始化完成');
    }

    /**
     * 发送消息到 AI
     * @param {string} userMessage - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 响应结果
     */
    async function sendMessage(userMessage, options = {}) {
        if (agentState.isProcessing) {
            throw new Error('Agent 正在处理中，请稍后');
        }

        agentState.isProcessing = true;
        agentState.lastError = null;

        try {
            // 1. 构建完整的消息上下文
            const messages = await buildMessageContext(userMessage, options);

            // 2. 获取配置
            const config = {
                model: options.model || ConfigManager.getConfig('model') || 'auto',
                temperature: options.temperature || ConfigManager.getConfig('temperature') || 0.7,
                maxTokens: options.maxTokens || ConfigManager.getConfig('maxTokens') || 4096
            };

            // 3. 通过 API Router 发送请求
            const result = await APIRouter.sendRequest(
                {
                    userMessage,
                    conversationHistory: agentState.currentConversation,
                    config,
                    abortController: options.abortController
                },
                options.onChunk // 流式回调
            );

            // 4. 处理响应
            if (result.success) {
                // 添加到对话历史
                addToHistory('user', userMessage);
                addToHistory('assistant', result.content);

                return {
                    success: true,
                    content: result.content,
                    model: result.model,
                    attempts: result.attempts
                };
            } else {
                agentState.lastError = result.error;
                throw new Error(result.error);
            }

        } catch (error) {
            agentState.lastError = error.message;
            ErrorTracker.report(error, {
                category: 'AGENT_SEND_MESSAGE'
            }, ErrorTracker.ErrorCategory.EXECUTION, ErrorTracker.ErrorLevel.ERROR);
            
            throw error;
        } finally {
            agentState.isProcessing = false;
        }
    }

    /**
     * 构建消息上下文（包含页面信息）
     * @param {string} userMessage - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 消息数组
     */
    async function buildMessageContext(userMessage, options = {}) {
        const messages = [];

        // 1. 系统提示词
        const systemPrompt = buildSystemPrompt(options);
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        // 2. 页面上下文（如果启用）
        if (options.includePageContext !== false) {
            const pageContext = await getPageContext(options.pageContextOptions);
            if (pageContext) {
                messages.push({
                    role: 'system',
                    content: `当前页面上下文：\n\n${pageContext}`
                });
            }
        }

        // 3. 对话历史
        messages.push(...agentState.currentConversation);

        return messages;
    }

    /**
     * 构建系统提示词
     */
    function buildSystemPrompt(options = {}) {
        let prompt = '你是一个智能 AI 助手，帮助用户解答问题和完成任务。';

        // 添加特殊能力说明
        if (options.capabilities) {
            prompt += '\n\n你具备以下能力：';
            if (options.capabilities.codeExecution) {
                prompt += '\n- 可以执行 JavaScript 代码';
            }
            if (options.capabilities.pageAnalysis) {
                prompt += '\n- 可以分析和理解当前页面内容';
            }
        }

        return prompt;
    }

    /**
     * 获取页面上下文
     */
    async function getPageContext(options = {}) {
        try {
            // 使用 PageAnalyzer 分析当前页面
            if (typeof PageAnalyzer !== 'undefined') {
                const summary = PageAnalyzer.generateSummary({
                    maxContentLength: options.maxContentLength || 5000,
                    includeLinks: options.includeLinks || false,
                    detectForms: options.detectForms || false
                });
                
                agentState.pageContext = summary;
                return summary;
            }
        } catch (error) {
            console.warn('[AIAgent] 获取页面上下文失败:', error);
        }
        
        return null;
    }

    /**
     * 添加消息到历史记录
     */
    function addToHistory(role, content) {
        agentState.currentConversation.push({ role, content });

        // 限制历史长度（避免 token 过多）
        const maxHistory = 20; // 最多保留 20 条消息
        if (agentState.currentConversation.length > maxHistory) {
            agentState.currentConversation = agentState.currentConversation.slice(-maxHistory);
        }
    }

    /**
     * 清空对话历史
     */
    function clearHistory() {
        agentState.currentConversation = [];
        agentState.pageContext = null;
    }

    /**
     * 获取 Agent 状态
     */
    function getState() {
        return {
            isProcessing: agentState.isProcessing,
            historyLength: agentState.currentConversation.length,
            hasPageContext: !!agentState.pageContext,
            lastError: agentState.lastError
        };
    }

    /**
     * 取消当前请求
     */
    function cancelRequest() {
        if (agentState.abortController) {
            agentState.abortController.abort();
            agentState.abortController = null;
        }
    }

    return {
        init,
        sendMessage,
        clearHistory,
        getState,
        cancelRequest,
        buildMessageContext,
        getPageContext
    };
})();
