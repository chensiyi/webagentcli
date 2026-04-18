// ==================== AI Agent 核心 ====================
// v4.4.0: Agent 作为组合器，整合所有底层模块
// Agent = ModelManager + APIClient + PageAnalyzer + HistoryManager + ...

const AIAgent = (function() {
    'use strict';

    // ==================== 依赖注入 ====================
    // Agent 组合以下模块形成完整能力
    const dependencies = {
        ModelManager,      // 模型选择和可用性管理
        APIRouter,         // API 路由和故障转移
        PageAnalyzer,      // 页面理解和分析
        ConfigManager,     // 配置管理
        ErrorTracker,      // 错误追踪
        Utils,             // 工具函数
        CodeExecutor       // v4.5.0: 代码执行器
    };

    // ==================== Agent 状态 ====================
    let agentState = {
        isInitialized: false,
        isProcessing: false,
        currentConversation: [],  // 当前对话历史
        pageContext: null,        // 缓存的页面上下文
        lastError: null,
        abortController: null,
        config: {}                // Agent 配置
    };

    /**
     * 初始化 Agent
     */
    function init(config = {}) {
        if (agentState.isInitialized) {
            console.warn('[AIAgent] 已经初始化，跳过');
            return;
        }

        // 合并配置
        agentState.config = {
            autoAttachPageContext: config.autoAttachPageContext !== false,  // 默认启用
            maxHistoryLength: config.maxHistoryLength || 20,
            defaultModel: config.defaultModel || 'auto',
            defaultTemperature: config.defaultTemperature || 0.7,
            defaultMaxTokens: config.defaultMaxTokens || 4096,
            ...config
        };

        agentState.isInitialized = true;
        console.log('[AIAgent] ✅ 初始化完成', agentState.config);
    }

    /**
     * 发送消息到 AI（Agent 的核心能力）
     * @param {string} userMessage - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 响应结果
     */
    async function sendMessage(userMessage, options = {}) {
        // 1. 验证状态
        if (!agentState.isInitialized) {
            throw new Error('Agent 未初始化，请先调用 init()');
        }
        
        if (agentState.isProcessing) {
            throw new Error('Agent 正在处理中，请稍后');
        }

        agentState.isProcessing = true;
        agentState.lastError = null;
        
        // 创建中止控制器
        const abortController = options.abortController || new AbortController();
        agentState.abortController = abortController;

        try {
            // 2. 构建完整的消息上下文（Agent 的核心逻辑）
            const messages = await buildMessageContext(userMessage, options);

            // 3. 获取配置（优先使用传入的，其次使用默认配置）
            const config = {
                model: options.model || agentState.config.defaultModel,
                temperature: options.temperature || agentState.config.defaultTemperature,
                maxTokens: options.maxTokens || agentState.config.defaultMaxTokens
            };

            Utils.debugLog(`[AIAgent] 发送消息，模型: ${config.model}`);

            // 4. 通过 API Router 发送请求（委托给底层模块）
            const result = await dependencies.APIRouter.sendRequest(
                {
                    userMessage,
                    conversationHistory: agentState.currentConversation,
                    config,
                    abortController
                },
                options.onChunk // 流式回调
            );

            // 5. 处理响应
            if (result.success) {
                // 添加到对话历史
                addToHistory('user', userMessage);
                addToHistory('assistant', result.content);

                Utils.debugLog(`[AIAgent] ✅ 成功，模型: ${result.model}, 尝试次数: ${result.attempts}`);

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
            
            // 记录错误
            dependencies.ErrorTracker.report(error, {
                category: 'AGENT_SEND_MESSAGE',
                message: userMessage.substring(0, 50)
            }, dependencies.ErrorTracker.ErrorCategory.EXECUTION, dependencies.ErrorTracker.ErrorLevel.ERROR);
            
            Utils.debugLog(`[AIAgent] ❌ 失败: ${error.message}`);
            throw error;
            
        } finally {
            agentState.isProcessing = false;
            agentState.abortController = null;
        }
    }

    /**
     * 构建消息上下文（Agent 的智能之处）
     * @param {string} userMessage - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 消息数组
     */
    async function buildMessageContext(userMessage, options = {}) {
        const messages = [];

        // 1. 系统提示词（可选）
        const systemPrompt = options.systemPrompt || buildDefaultSystemPrompt(options);
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        // 2. 页面上下文（Agent 的核心能力：自动理解页面）
        if (options.includePageContext !== false && agentState.config.autoAttachPageContext) {
            const pageContext = await getPageContext(options.pageContextOptions);
            if (pageContext) {
                messages.push({
                    role: 'system',
                    content: `## 当前页面上下文\n\n${pageContext}\n\n请基于以上页面内容回答用户问题。`
                });
            }
        }

        // 3. 对话历史（保持上下文连贯性）
        if (agentState.currentConversation.length > 0) {
            messages.push(...agentState.currentConversation);
        }

        return messages;
    }

    /**
     * 构建默认系统提示词
     */
    function buildDefaultSystemPrompt(options = {}) {
        let prompt = '你是一个智能 AI 助手，帮助用户解答问题和完成任务。';

        // 根据能力添加说明
        const capabilities = [];
        if (options.capabilities?.codeExecution) {
            capabilities.push('可以执行 JavaScript 代码');
        }
        if (options.capabilities?.pageAnalysis) {
            capabilities.push('可以分析和理解当前页面内容');
        }
        
        if (capabilities.length > 0) {
            prompt += '\n\n你具备以下能力：' + capabilities.map(c => `\n- ${c}`).join('');
        }

        return prompt;
    }

    /**
     * 获取页面上下文（委托给 PageAnalyzer）
     */
    async function getPageContext(options = {}) {
        try {
            // 检查 PageAnalyzer 是否可用
            if (typeof dependencies.PageAnalyzer === 'undefined') {
                console.warn('[AIAgent] PageAnalyzer 不可用');
                return null;
            }

            const summary = dependencies.PageAnalyzer.generateSummary({
                maxContentLength: options.maxContentLength || 5000,
                includeLinks: options.includeLinks || false,
                detectForms: options.detectForms || false
            });
            
            agentState.pageContext = summary;
            return summary;
            
        } catch (error) {
            console.warn('[AIAgent] 获取页面上下文失败:', error);
            return null;
        }
    }

    /**
     * 添加消息到历史记录
     */
    function addToHistory(role, content) {
        agentState.currentConversation.push({ role, content });

        // 限制历史长度（避免 token 过多）
        const maxLength = agentState.config.maxHistoryLength;
        if (agentState.currentConversation.length > maxLength) {
            agentState.currentConversation = agentState.currentConversation.slice(-maxLength);
        }
    }

    /**
     * 清空对话历史
     */
    function clearHistory() {
        agentState.currentConversation = [];
        agentState.pageContext = null;
        Utils.debugLog('[AIAgent] 🗑️ 历史已清空');
    }

    /**
     * 获取 Agent 状态
     */
    function getState() {
        return {
            isInitialized: agentState.isInitialized,
            isProcessing: agentState.isProcessing,
            historyLength: agentState.currentConversation.length,
            hasPageContext: !!agentState.pageContext,
            lastError: agentState.lastError,
            config: { ...agentState.config }
        };
    }

    /**
     * 取消当前请求
     */
    function cancelRequest() {
        if (agentState.abortController) {
            agentState.abortController.abort();
            agentState.abortController = null;
            Utils.debugLog('[AIAgent] ⛔ 请求已取消');
        }
    }

    /**
     * 更新 Agent 配置
     */
    function updateConfig(newConfig) {
        agentState.config = { ...agentState.config, ...newConfig };
        Utils.debugLog('[AIAgent] ⚙️ 配置已更新', agentState.config);
    }

    /**
     * 获取依赖模块（用于调试或扩展）
     */
    function getDependencies() {
        return { ...dependencies };
    }

    /**
     * 执行代码（委托给 CodeExecutor）
     * @param {string} code - JavaScript 代码
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    async function executeCode(code, options = {}) {
        if (!dependencies.CodeExecutor) {
            throw new Error('CodeExecutor 不可用');
        }

        Utils.debugLog('[AIAgent] 🛠️ 执行代码', code.substring(0, 50) + '...');

        try {
            const result = await dependencies.CodeExecutor.executeCode(code, {
                strictMode: options.strictMode !== false  // 默认启用严格模式
            });

            Utils.debugLog('[AIAgent] ✅ 代码执行成功');
            return result;

        } catch (error) {
            Utils.debugLog('[AIAgent] ❌ 代码执行失败:', error.message || error.error);
            throw error;
        }
    }

    /**
     * 从消息中提取并执行代码块
     * @param {string} messageText - AI 回复的文本
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 执行结果数组
     */
    async function executeCodeFromMessage(messageText, options = {}) {
        if (!dependencies.CodeExecutor) {
            throw new Error('CodeExecutor 不可用');
        }

        // 1. 提取代码块
        const codeBlocks = dependencies.CodeExecutor.extractCodeBlocks(messageText);

        if (codeBlocks.length === 0) {
            Utils.debugLog('[AIAgent] ⚠️ 未找到代码块');
            return [];
        }

        Utils.debugLog(`[AIAgent] 🛠️ 找到 ${codeBlocks.length} 个代码块，开始执行`);

        // 2. 批量执行
        const results = await dependencies.CodeExecutor.executeBatch(codeBlocks, {
            strictMode: options.strictMode,
            stopOnError: options.stopOnError !== false
        });

        Utils.debugLog(`[AIAgent] ✅ 完成 ${results.length} 个代码块的执行`);
        return results;
    }

    return {
        // 核心方法
        init,
        sendMessage,
        
        // 上下文管理
        buildMessageContext,
        getPageContext,
        clearHistory,
        addToHistory,
        
        // 代码执行 (v4.5.0)
        executeCode,
        executeCodeFromMessage,
        
        // 状态管理
        getState,
        updateConfig,
        cancelRequest,
        
        // 调试和扩展
        getDependencies
    };
})();
