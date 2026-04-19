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
        config: {},                // Agent 配置
        estimatedTokens: 0,        // 估算的 token 数量
        contextStats: {            // 上下文统计信息
            totalTokens: 0,
            systemTokens: 0,
            pageContextTokens: 0,
            historyTokens: 0,
            userMessageTokens: 0,
            reservedTokens: 2000,  // 预留给响应的 token
            utilizationRate: 0     // 窗口使用率
        }
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
            maxContextTokens: config.maxContextTokens || 8000,  // 最大上下文 token 数
            defaultModel: config.defaultModel || 'auto',
            defaultTemperature: config.defaultTemperature || 0.7,
            defaultMaxTokens: config.defaultMaxTokens || 4096,
            enableModelRouter: config.enableModelRouter !== false,  // 启用智能路由
            contextStrategy: config.contextStrategy || 'auto',  // 'auto' | 'strict' | 'relaxed'
            enableSummary: config.enableSummary !== false,  // 启用历史摘要
            ...config
        };

        // 根据策略调整 token 限制
        if (agentState.config.contextStrategy === 'strict') {
            agentState.config.maxContextTokens = Math.min(agentState.config.maxContextTokens, 4000);
        } else if (agentState.config.contextStrategy === 'relaxed') {
            agentState.config.maxContextTokens = Math.max(agentState.config.maxContextTokens, 12000);
        }

        agentState.isInitialized = true;
        console.log('[AIAgent] ✅ 初始化完成', {
            maxContextTokens: agentState.config.maxContextTokens,
            contextStrategy: agentState.config.contextStrategy,
            enableSummary: agentState.config.enableSummary
        });
    }

    /**
     * 发送消息到 AI（Agent 的核心能力）
     * @param {string} userMessage - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 响应结果
     */
    async function sendMessage(userMessage, options = {}) {
        console.log('[AIAgent] 📤 收到 sendMessage 调用');
        console.log('[AIAgent] 📋 消息:', userMessage.substring(0, 100));
        
        // 1. 验证状态
        if (!agentState.isInitialized) {
            console.error('[AIAgent] ❌ Agent 未初始化');
            throw new Error('Agent 未初始化，请先调用 init()');
        }
        
        if (agentState.isProcessing) {
            console.error('[AIAgent] ❌ Agent 正在处理中');
            throw new Error('Agent 正在处理中，请稍后');
        }

        agentState.isProcessing = true;
        agentState.lastError = null;
        
        console.log('[AIAgent] ✅ 状态检查通过，开始构建上下文...');
        
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

            // 4. 智能模型选择（如果启用 Model Router）
            let selectedModel = config.model;
            if (agentState.config.enableModelRouter && config.model === 'auto') {
                selectedModel = await selectOptimalModel(messages);
                Utils.debugLog(`[AIAgent] 🤖 智能选择模型: ${selectedModel}`);
            }

            Utils.debugLog(`[AIAgent] 发送消息，模型: ${selectedModel}`);

            // 5. 通过 API Router 发送请求（委托给底层模块）
            console.log('[AIAgent] 🚀 调用 APIRouter.sendRequest...');
            console.log('[AIAgent] 📊 消息数量:', messages.length);
            console.log('[AIAgent] 🎯 模型:', selectedModel);
            
            const result = await dependencies.APIRouter.sendRequest(
                {
                    messages,  // ✅ 传递完整的消息数组（包含 System Prompt）
                    config: { ...config, model: selectedModel },
                    abortController
                },
                options.onChunk // 流式回调
            );
            
            console.log('[AIAgent] 📨 APIRouter 返回结果:', result);

            // 6. 处理响应
            if (result.success) {
                // 添加到对话历史
                addToHistory('user', userMessage);
                addToHistory('assistant', result.content);

                // 更新 token 估算
                updateTokenEstimate();

                Utils.debugLog(`[AIAgent] ✅ 成功，模型: ${result.model}, 尝试次数: ${result.attempts}`);

                return {
                    success: true,
                    content: result.content,
                    model: result.model,
                    attempts: result.attempts,
                    estimatedTokens: agentState.estimatedTokens
                };
            } else {
                agentState.lastError = result.error;
                throw new Error(result.error);
            }

        } catch (error) {
            agentState.lastError = error.message;
            
            // 记录错误并标记模型不可用
            if (dependencies.ModelManager && config?.model) {
                dependencies.ModelManager.markModelTest(config.model, false, error.message);
            }
            
            // 记录错误
            dependencies.ErrorTracker.report(error, {
                category: 'AGENT_SEND_MESSAGE',
                message: userMessage.substring(0, 50),
                model: config?.model
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
        const stats = {
            systemTokens: 0,
            pageContextTokens: 0,
            historyTokens: 0,
            userMessageTokens: 0
        };

        // 1. 系统提示词（每次对话都添加，确保 AI 了解自己的能力）
        const systemPrompt = options.systemPrompt || buildDefaultSystemPrompt(options);
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
            stats.systemTokens = estimateTextTokens(systemPrompt) + 4;
            Utils.debugLog(`[AIAgent] 📝 System Prompt 已添加 (~${stats.systemTokens} tokens)`);
        }

        // 2. 页面上下文（Agent 的核心能力：自动理解页面）
        if (options.includePageContext !== false && agentState.config.autoAttachPageContext) {
            const pageContext = await getPageContext(options.pageContextOptions);
            if (pageContext) {
                const pageContent = `## 当前页面上下文\n\n${pageContext}\n\n请基于以上页面内容回答用户问题。`;
                messages.push({
                    role: 'system',
                    content: pageContent
                });
                stats.pageContextTokens = estimateTextTokens(pageContent) + 4;
                Utils.debugLog(`[AIAgent] 📄 页面上下文已添加 (~${stats.pageContextTokens} tokens)`);
            }
        }

        // 3. 对话历史（保持上下文连贯性）
        if (agentState.currentConversation.length > 0) {
            // 智能截断：基于 token 数量而非固定条数
            const contextMessages = smartTruncateHistory(agentState.currentConversation, userMessage);
            messages.push(...contextMessages);
            stats.historyTokens = estimateMessagesTokens(contextMessages);
            Utils.debugLog(`[AIAgent] 💬 添加了 ${contextMessages.length} 条历史消息 (~${stats.historyTokens} tokens)`);
        }

        // 4. 当前用户消息
        messages.push({ role: 'user', content: userMessage });
        stats.userMessageTokens = estimateTextTokens(userMessage) + 4;

        // 5. 计算总体统计
        const totalTokens = stats.systemTokens + stats.pageContextTokens + stats.historyTokens + stats.userMessageTokens;
        const maxTokens = agentState.config.maxContextTokens;
        const utilizationRate = Math.round((totalTokens / maxTokens) * 100);
        
        // 更新状态
        agentState.contextStats = {
            totalTokens,
            ...stats,
            reservedTokens: 2000,
            utilizationRate,
            maxTokens
        };
        
        Utils.debugLog(`[AIAgent] 📨 消息上下文构建完成: ${messages.length} 条消息, ${totalTokens}/${maxTokens} tokens (${utilizationRate}%)`);
        
        // 警告：如果使用率过高
        if (utilizationRate > 90) {
            console.warn(`[AIAgent] ⚠️ 上下文窗口使用率过高: ${utilizationRate}%`);
        }
        
        return messages;
    }

    /**
     * 构建默认系统提示词
     */
    function buildDefaultSystemPrompt(options = {}) {
        const prompt = `# AI Browser Agent - 智能网页交互助手

## 你的定位
你是一个运行在浏览器中的 AI 助手，帮助用户提升在网页中的交互能力。你可以理解页面内容、生成 JavaScript 代码并自动执行，完成各种网页操作任务。

## 核心能力
1. **页面理解** - 你能看到当前页面的内容和结构
2. **代码生成** - 你可以生成 JavaScript 代码来操作页面
3. **自动执行** - 你生成的代码会被自动执行，无需用户确认
4. **对话交互** - 你可以与用户进行自然语言对话

## 代码执行规范
当你需要操作页面时，请生成 JavaScript 代码块，格式如下：

\`\`\`runjs
// 你的代码
\`\`\`

**重要规则**:
- ✅ 代码必须是有效的 JavaScript
- ✅ 优先使用原生 DOM API（document.querySelector, document.getElementById 等）
- ✅ 如果元素可能不存在，使用可选链 (?.) 或条件判断
- ✅ 对于异步操作，使用 async/await 或 Promise
- ❌ 不要使用 alert()、confirm()、prompt() 等阻塞对话框
- ❌ 不要使用 window.open() 打开新窗口
- ❌ 不要生成无限循环或资源密集型代码

## 特殊命令
用户可以通过以下命令与你交互：
- **/runjs <代码>** - 直接执行指定的 JavaScript 代码
  示例：/runjs document.title
  
当用户输入 /runjs 命令时，直接执行后面的代码，不需要生成代码块。

## 交互风格
- **简洁明了** - 直接给出解决方案，不需要过多解释
- **主动执行** - 如果需要操作页面，直接生成代码，不要询问用户是否执行
- **错误处理** - 如果操作可能失败，添加适当的错误处理
- **分步执行** - 复杂任务分解为多个代码块，按顺序执行

## 示例

**用户**: "帮我点击登录按钮"
**你**: 
\`\`\`runjs
document.querySelector('.login-btn')?.click();
\`\`\`
已点击登录按钮。

**用户**: "获取页面所有链接的 URL"
**你**:
\`\`\`runjs
Array.from(document.querySelectorAll('a')).map(a => a.href)
\`\`\`
找到 ${typeof document !== 'undefined' ? document.querySelectorAll('a').length : 'N'} 个链接。

**用户**: "/runjs document.title"
**你**: （直接执行代码，返回结果）

---

现在，请帮助用户完成任务。`;

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
     * 智能选择最优模型
     * @param {Array} messages - 消息数组
     * @returns {Promise<string>} 选中的模型 ID
     */
    async function selectOptimalModel(messages) {
        try {
            // 1. 估算 token 数量
            const estimatedTokens = estimateMessagesTokens(messages);
            
            // 2. 获取可用模型列表
            if (!dependencies.ModelManager) {
                console.warn('[AIAgent] ModelManager 不可用，使用默认模型');
                return agentState.config.defaultModel;
            }

            const availableModels = await dependencies.ModelManager.getAvailableModels();
            
            if (!availableModels || availableModels.length === 0) {
                console.warn('[AIAgent] 没有可用模型，使用默认模型');
                return agentState.config.defaultModel;
            }

            // 3. 过滤出支持当前 token 数量的模型
            const suitableModels = availableModels.filter(model => {
                const maxTokens = model.max_tokens || 8192;
                return maxTokens >= estimatedTokens + 1000; // 预留 1000 tokens 给响应
            });

            // 4. 按可用性排序（优先使用成功率高的模型）
            const sortedModels = dependencies.ModelManager.sortModelsByAvailability(suitableModels);
            
            if (sortedModels.length > 0) {
                Utils.debugLog(`[AIAgent] 🤖 从 ${suitableModels.length} 个合适模型中选择: ${sortedModels[0].id}`);
                return sortedModels[0].id;
            }

            // 5. 如果没有合适的，返回第一个可用模型
            return availableModels[0].id;

        } catch (error) {
            console.error('[AIAgent] 智能模型选择失败:', error);
            return agentState.config.defaultModel;
        }
    }

    /**
     * 估算消息的 token 数量
     * @param {Array} messages - 消息数组
     * @returns {number} 估算的 token 数
     */
    function estimateMessagesTokens(messages) {
        let totalTokens = 0;
        for (const msg of messages) {
            totalTokens += estimateTextTokens(msg.content || '');
            totalTokens += 4; // 每条消息的固定开销（role + 格式）
        }
        return totalTokens;
    }

    /**
     * 估算文本的 token 数量（增强版）
     * @param {string} text - 文本内容
     * @returns {number} 估算的 token 数
     */
    function estimateTextTokens(text) {
        if (!text) return 0;
        
        // 更精确的 token 估算策略
        let tokens = 0;
        
        // 1. 代码块：通常 token 密度更高
        const codeBlockRegex = /```[\s\S]*?```/g;
        const codeBlocks = text.match(codeBlockRegex) || [];
        let codeLength = 0;
        codeBlocks.forEach(block => codeLength += block.length);
        const textLength = text.length - codeLength;
        
        // 2. 代码部分：约 2.5 字符/token
        tokens += Math.ceil(codeLength / 2.5);
        
        // 3. 普通文本：根据语言特征估算
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = textLength - chineseChars;
        
        // 中文约 1.5 字符/token，英文约 3.5 字符/token
        tokens += Math.ceil(chineseChars / 1.5);
        tokens += Math.ceil(englishWords / 3.5);
        
        return tokens;
    }

    /**
     * 智能截断历史记录（多级策略）
     * @param {Array} history - 完整历史
     * @param {string} newUserMessage - 新的用户消息
     * @returns {Array} 截断后的历史
     */
    function smartTruncateHistory(history, newUserMessage) {
        const maxTokens = agentState.config.maxContextTokens;
        const strategy = agentState.config.contextStrategy || 'auto';
        
        // 计算预留空间
        const newUserTokens = estimateTextTokens(newUserMessage);
        const reservedTokens = newUserTokens + (strategy === 'strict' ? 1000 : 2000);
        const availableTokens = maxTokens - reservedTokens;
        
        // 计算完整历史需要的 token
        const fullHistoryTokens = estimateMessagesTokens(history);
        
        Utils.debugLog(`[AIAgent] 📊 上下文分析: 最大${maxTokens}, 预留${reservedTokens}, 可用${availableTokens}, 历史${fullHistoryTokens}`);
        
        // 策略 1: 如果完整历史可以容纳，直接返回
        if (fullHistoryTokens <= availableTokens) {
            Utils.debugLog(`[AIAgent] ✅ 完整历史可容纳，无需截断`);
            return [...history];
        }
        
        // 策略 2: 渐进式截断
        let truncated = [];
        
        if (strategy === 'strict' || fullHistoryTokens > availableTokens * 1.5) {
            // 严格模式：快速截断，只保留最近的消息
            truncated = truncateByTokenLimit(history, availableTokens * 0.8);
        } else {
            // 智能模式：分级截断
            truncated = smartTruncate(history, availableTokens);
        }
        
        // 确保至少保留第一条消息（如果历史不为空）
        if (truncated.length === 0 && history.length > 0) {
            truncated = [history[0]];
            Utils.debugLog(`[AIAgent] ⚠️ 历史被大量截断，保留首条消息`);
        }
        
        // 如果截断了消息，添加摘要提示
        if (truncated.length < history.length && agentState.config.enableSummary) {
            const skippedCount = history.length - truncated.length;
            const firstMsg = history[0];
            const lastSkippedMsg = history[history.length - truncated.length - 1];
            
            // 生成简要摘要
            const summary = generateContextSummary(skippedCount, firstMsg, lastSkippedMsg);
            truncated.unshift({
                role: 'system',
                content: summary
            });
        }
        
        const finalTokens = estimateMessagesTokens(truncated);
        Utils.debugLog(`[AIAgent] 📊 历史截断: ${truncated.length}/${history.length} 条消息, ~${finalTokens} tokens`);
        
        return truncated;
    }
    
    /**
     * 基于 token 限制截断历史
     */
    function truncateByTokenLimit(history, maxTokens) {
        let selectedMessages = [];
        let currentTokens = 0;
        
        // 从后往前遍历，保留最近的消息
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            const msgTokens = estimateTextTokens(msg.content || '') + 4;
            
            if (currentTokens + msgTokens <= maxTokens) {
                selectedMessages.unshift(msg);
                currentTokens += msgTokens;
            } else {
                break;
            }
        }
        
        return selectedMessages;
    }
    
    /**
     * 智能分级截断
     */
    function smartTruncate(history, availableTokens) {
        const minMessages = Math.min(3, history.length);
        let currentTokens = 0;
        let selectedMessages = [];
        
        // 1. 优先保留最后 minMessages 条消息（最近的上下文）
        const recentMessages = history.slice(-minMessages);
        recentMessages.forEach(msg => {
            const msgTokens = estimateTextTokens(msg.content || '') + 4;
            selectedMessages.push(msg);
            currentTokens += msgTokens;
        });
        
        // 2. 剩余空间用于保留早期消息
        const remainingTokens = availableTokens - currentTokens;
        if (remainingTokens > 0 && history.length > minMessages) {
            const earlyHistory = history.slice(0, -minMessages);
            
            // 尝试保留第一条（通常是重要上下文）
            if (earlyHistory.length > 0) {
                const firstMsg = earlyHistory[0];
                const firstTokens = estimateTextTokens(firstMsg.content || '') + 4;
                if (firstTokens <= remainingTokens * 0.3) {
                    selectedMessages.unshift(firstMsg);
                    currentTokens += firstTokens;
                }
            }
            
            // 尝试保留中间的关键消息（包含代码块的）
            const middleMessages = earlyHistory.slice(1);
            for (const msg of middleMessages) {
                const msgTokens = estimateTextTokens(msg.content || '') + 4;
                const hasCode = msg.content && msg.content.includes('```');
                
                // 包含代码的消息优先级更高
                const threshold = hasCode ? remainingTokens * 0.5 : remainingTokens * 0.3;
                
                if (currentTokens + msgTokens <= availableTokens) {
                    // 插入到正确位置（保持时间顺序）
                    const insertIndex = selectedMessages.findIndex(m => 
                        history.indexOf(m) > history.indexOf(msg)
                    );
                    
                    if (insertIndex === -1) {
                        selectedMessages.push(msg);
                    } else {
                        selectedMessages.splice(insertIndex, 0, msg);
                    }
                    currentTokens += msgTokens;
                }
            }
        }
        
        // 按原始顺序排序
        selectedMessages.sort((a, b) => history.indexOf(a) - history.indexOf(b));
        
        return selectedMessages;
    }
    
    /**
     * 生成上下文摘要
     */
    function generateContextSummary(skippedCount, firstMsg, lastSkippedMsg) {
        let summary = `[上下文摘要：已省略 ${skippedCount} 条历史对话]`;
        
        // 如果有首尾消息，提供简要提示
        if (firstMsg && firstMsg.content) {
            const preview = firstMsg.content.substring(0, 50).replace(/\n/g, ' ');
            summary += `\n最早话题: "${preview}..."`;
        }
        
        if (lastSkippedMsg && lastSkippedMsg.content) {
            const preview = lastSkippedMsg.content.substring(0, 50).replace(/\n/g, ' ');
            summary += `\n最近省略: "${preview}..."`;
        }
        
        summary += '\n\n如有需要，请告知我回顾特定内容。';
        
        return summary;
    }

    /**
     * 更新 token 估算
     */
    function updateTokenEstimate() {
        agentState.estimatedTokens = estimateMessagesTokens(agentState.currentConversation);
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

        // 更新 token 估算
        updateTokenEstimate();
    }

    /**
     * 清空对话历史
     */
    function clearHistory() {
        agentState.currentConversation = [];
        agentState.pageContext = null;
        agentState.estimatedTokens = 0;
        agentState.contextStats = {
            totalTokens: 0,
            systemTokens: 0,
            pageContextTokens: 0,
            historyTokens: 0,
            userMessageTokens: 0,
            reservedTokens: 2000,
            utilizationRate: 0
        };
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
            history: [...agentState.currentConversation],  // 返回对话历史副本
            hasPageContext: !!agentState.pageContext,
            lastError: agentState.lastError,
            config: { ...agentState.config },
            estimatedTokens: agentState.estimatedTokens,
            contextStats: { ...agentState.contextStats }  // 上下文统计信息
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
        
        // 智能功能
        selectOptimalModel,
        estimateMessagesTokens,
        smartTruncateHistory,
        
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
