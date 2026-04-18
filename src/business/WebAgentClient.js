// ==================== Web Agent 客户端 ====================
// v4.7.0: 业务逻辑层，协调 AIAgent 和 UI
// 职责：业务流程编排、状态管理、错误处理、生命周期管理

const WebAgentClient = (function() {
    'use strict';

    // ==================== 客户端状态 ====================
    const clientState = {
        isInitialized: false,
        isProcessing: false,
        settings: {},
        uiState: {
            visible: false,
            position: { x: null, y: null },
            size: { width: 450, height: 500 }
        },
        currentSession: {
            id: null,
            startTime: null,
            messageCount: 0
        },
        lastError: null,
        
        // 消息队列
        messageQueue: [],
        maxQueueSize: 10,  // 最大队列长度
        
        // 代码执行队列
        executionQueue: [],
        isExecuting: false,
        maxExecutionQueueSize: 20,  // 最大执行队列长度
        autoExecuteCode: true  // 是否自动执行代码（默认启用）
    };

    // ==================== 初始化 ====================

    /**
     * 初始化 WebAgentClient
     */
    async function init(options = {}) {
        if (clientState.isInitialized) {
            console.warn('[WebAgentClient] 已经初始化，跳过');
            return;
        }

        try {
            console.log('[WebAgentClient] 🚀 正在初始化...');

            // 1. 加载配置（优先使用 StorageManager）
            clientState.settings = await loadSettings(options);

            // 2. 初始化 AIAgent（基础设施）
            await AIAgent.init({
                autoAttachPageContext: clientState.settings.autoAttachPageContext !== false,
                maxHistoryLength: clientState.settings.maxHistoryLength || 30,
                maxContextTokens: clientState.settings.maxContextTokens || 8000,
                defaultModel: clientState.settings.defaultModel || 'auto',
                defaultTemperature: clientState.settings.temperature || 0.7,
                defaultMaxTokens: clientState.settings.maxTokens || 4096,
                enableModelRouter: true  // 启用智能路由
            });

            // 3. 恢复会话
            await restoreSession();

            // 4. 注册事件监听
            setupEventListeners();

            clientState.isInitialized = true;
            
            // 如果恢复了会话，使用恢复的；否则创建新会话
            if (!clientState.currentSession.id) {
                clientState.currentSession = {
                    id: generateSessionId(),
                    startTime: Date.now(),
                    messageCount: 0
                };
            }

            console.log('[WebAgentClient] ✅ 初始化完成', {
                sessionId: clientState.currentSession.id,
                settings: clientState.settings
            });

        } catch (error) {
            console.error('[WebAgentClient] ❌ 初始化失败:', error);
            throw error;
        }
    }

    // ==================== 核心业务方法 ====================

    /**
     * 处理用户消息（主要入口）
     * @param {string} message - 用户消息
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 响应结果
     */
    async function handleUserMessage(message, options = {}) {
        if (!clientState.isInitialized) {
            throw new Error('WebAgentClient 未初始化');
        }

        // 如果正在处理，将消息加入队列
        if (clientState.isProcessing) {
            if (clientState.messageQueue.length >= clientState.maxQueueSize) {
                throw new Error(`消息队列已满（最大 ${clientState.maxQueueSize} 条）`);
            }
            
            clientState.messageQueue.push({ message, options });
            console.log(`[WebAgentClient] ⏳ 消息已加入队列 (${clientState.messageQueue.length}/${clientState.maxQueueSize})`);
            
            // 返回一个占位符，表示消息已排队
            return {
                success: true,
                queued: true,
                queuePosition: clientState.messageQueue.length,
                message: '消息已加入队列，将在当前消息完成后处理'
            };
        }

        clientState.isProcessing = true;
        clientState.lastError = null;

        try {
            // 1. 验证消息
            validateMessage(message);

            // 2. 检查是否为 /runjs 命令
            if (message.startsWith('/runjs ')) {
                const code = message.substring(7).trim();
                console.log('[WebAgentClient] 🚀 检测到 /runjs 命令，直接执行代码');
                
                // 添加用户消息到历史
                AIAgent.addToHistory('user', message);
                
                // 创建 AI 消息占位符（流式输出）
                EventManager.emit(EventManager.EventTypes.MESSAGE_STREAMING, {
                    chunk: '',
                    sessionId: clientState.currentSession.id
                });
                
                try {
                    // 执行代码
                    const result = await handleCodeExecution(code, { strictMode: true });
                    
                    // 构建响应内容
                    let responseContent = '';
                    if (result.success) {
                        responseContent = '```result\n' + JSON.stringify(result.result) + '\n```';
                    } else {
                        responseContent = '```result\n执行失败: ' + (result.error || '未知错误') + '\n```';
                    }
                    
                    // 添加到历史
                    AIAgent.addToHistory('assistant', responseContent);
                    
                    // 触发完成事件
                    EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
                        result: { content: responseContent },
                        sessionId: clientState.currentSession.id
                    });
                    
                    // 更新会话统计
                    clientState.currentSession.messageCount += 2;
                    debouncedSaveSession();
                    
                    return { success: true, content: responseContent };
                    
                } catch (error) {
                    const errorMsg = '```result\n执行异常: ' + error.message + '\n```';
                    AIAgent.addToHistory('assistant', errorMsg);
                    
                    EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
                        result: { content: errorMsg },
                        sessionId: clientState.currentSession.id
                    });
                    
                    clientState.currentSession.messageCount += 2;
                    debouncedSaveSession();
                    
                    throw error;
                }
            }

            // 3. 发送消息到 AIAgent
            const result = await AIAgent.sendMessage(message, {
                model: options.model,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                includePageContext: options.includePageContext,
                onChunk: (chunk) => {
                    // 触发流式更新事件
                    EventManager.emit(EventManager.EventTypes.MESSAGE_STREAMING, {
                        chunk,
                        sessionId: clientState.currentSession.id
                    });
                }
            });

            // 3. 更新会话统计
            clientState.currentSession.messageCount += 2; // user + assistant

            // 4. 检查是否有代码块
            if (result.content && result.content.includes('```')) {
                EventManager.emit(EventManager.EventTypes.CODE_BLOCKS_DETECTED, {
                    content: result.content,
                    sessionId: clientState.currentSession.id
                });
                
                // 如果启用了自动执行，提取并执行代码，然后更新结果
                if (clientState.autoExecuteCode) {
                    const executedContent = await extractAndExecuteCode(result.content);
                    if (executedContent) {
                        // 更新返回结果，包含执行结果
                        result.content = executedContent;
                        
                        // 同步更新 AIAgent 的对话历史（确保会话记录包含执行结果）
                        const agentState = AIAgent.getState();
                        const history = agentState.history || [];
                        if (history.length > 0) {
                            const lastMsg = history[history.length - 1];
                            if (lastMsg.role === 'assistant') {
                                lastMsg.content = executedContent;
                                console.log('[WebAgentClient] 💾 已同步更新 AIAgent 历史记录');
                            }
                        }
                    }
                }
            }

            // 5. 触发完成事件
            EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
                result,
                sessionId: clientState.currentSession.id
            });

            // 6. 自动保存会话状态（防抖）
            debouncedSaveSession();

            return result;

        } catch (error) {
            clientState.lastError = error;
            
            // 错误处理策略
            await handleError(error, message, options);
            
            throw error;

        } finally {
            clientState.isProcessing = false;
            
            // 处理队列中的下一条消息
            processNextMessage();
        }
    }

    /**
     * 执行代码
     * @param {string} code - JavaScript 代码
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    async function handleCodeExecution(code, options = {}) {
        if (!clientState.isInitialized) {
            throw new Error('WebAgentClient 未初始化');
        }

        // 如果正在执行，将代码加入队列
        if (clientState.isExecuting) {
            if (clientState.executionQueue.length >= clientState.maxExecutionQueueSize) {
                throw new Error(`执行队列已满（最大 ${clientState.maxExecutionQueueSize} 条）`);
            }
            
            clientState.executionQueue.push({ code, options });
            console.log(`[WebAgentClient] ⏳ 代码已加入执行队列 (${clientState.executionQueue.length}/${clientState.maxExecutionQueueSize})`);
            
            return {
                success: true,
                queued: true,
                queuePosition: clientState.executionQueue.length,
                message: '代码已加入执行队列'
            };
        }

        try {
            console.log('[WebAgentClient] 🛠️ 执行代码');
            clientState.isExecuting = true;

            const result = await AIAgent.executeCode(code, {
                strictMode: options.strictMode !== false
            });

            EventManager.emit(EventManager.EventTypes.CODE_EXECUTED, {
                code,
                result,
                sessionId: clientState.currentSession.id
            });

            return result;

        } catch (error) {
            console.error('[WebAgentClient] ❌ 代码执行失败:', error);
            
            EventManager.emit(EventManager.EventTypes.CODE_EXECUTION_ERROR, {
                code,
                error,
                sessionId: clientState.currentSession.id
            });

            // 将错误对象包装为 Error 实例，以便正确传播
            const errorMessage = error.error || error.message || '未知错误';
            throw new Error(errorMessage);
        } finally {
            clientState.isExecuting = false;
            
            // 处理队列中的下一个代码
            processNextExecution();
        }
    }

    /**
     * 从消息中提取并执行代码
     * @param {string} messageText - AI 回复的文本
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 执行结果数组
     */
    async function handleCodeFromMessage(messageText, options = {}) {
        if (!clientState.isInitialized) {
            throw new Error('WebAgentClient 未初始化');
        }

        try {
            console.log('[WebAgentClient] 🛠️ 从消息中提取并执行代码');

            const results = await AIAgent.executeCodeFromMessage(messageText, {
                strictMode: options.strictMode,
                stopOnError: options.stopOnError
            });

            EventManager.emit(EventManager.EventTypes.CODE_BATCH_EXECUTED, {
                results,
                sessionId: clientState.currentSession.id
            });

            return results;

        } catch (error) {
            console.error('[WebAgentClient] ❌ 批量代码执行失败:', error);
            throw error;
        }
    }

    /**
     * 提取并执行代码（自动模式）
     * @param {string} messageText - AI 回复的文本
     * @returns {Promise<string|null>} 返回包含执行结果的完整内容，如果没有代码块则返回 null
     */
    async function extractAndExecuteCode(messageText) {
        try {
            // 提取所有代码块
            const codeBlocks = AIAgent.getDependencies()?.CodeExecutor?.extractCodeBlocks(messageText);
            
            if (!codeBlocks || codeBlocks.length === 0) {
                return null;  // 没有代码块，不需要修改
            }

            console.log(`[WebAgentClient] 🤖 检测到 ${codeBlocks.length} 个代码块，准备自动执行`);

            // 收集所有执行结果
            const executionResults = [];

            // 逐个执行代码
            for (const block of codeBlocks) {
                const lang = block.lang || block.language || 'runjs';  // 兼容两种字段名
                console.log(`[WebAgentClient] 🔍 检查代码块语言: ${lang}`);
                console.log(`[WebAgentClient] 🔍 代码内容:`, block.code.substring(0, 50) + '...');
                
                if (lang === 'runjs' || lang === 'javascript' || lang === 'js') {
                    console.log(`[WebAgentClient] ▶️ 准备执行 JavaScript 代码`);
                    try {
                        const result = await handleCodeExecution(block.code, {
                            strictMode: true,
                            autoGenerated: true
                        });
                        
                        executionResults.push({
                            code: block.code,
                            success: result.success,
                            output: result.result,
                            error: result.error
                        });
                        
                        console.log(`[WebAgentClient] ✅ 代码执行${result.success ? '成功' : '失败'}:`, result.result || result.error);
                    } catch (error) {
                        console.error('[WebAgentClient] ❌ 代码执行异常:', error);
                        console.error('[WebAgentClient] 🔍 错误对象详情:', JSON.stringify({
                            type: typeof error,
                            isError: error instanceof Error,
                            message: error.message,
                            errorField: error.error,
                            stack: error.stack?.substring(0, 100)
                        }, null, 2));
                        
                        executionResults.push({
                            code: block.code,
                            success: false,
                            error: error.error || error.message || '未知错误'
                        });
                        
                        console.log('[WebAgentClient] 📦 executionResult:', executionResults[executionResults.length - 1]);
                    }
                } else {
                    console.log(`[WebAgentClient] ⚠️ 跳过非 JavaScript 代码块: ${lang}`);
                }
            }

            // 如果有执行结果，构建包含执行结果的完整内容
            if (executionResults.length > 0) {
                const feedbackSection = buildExecutionFeedback(executionResults);
                console.log('[WebAgentClient] 📝 已将执行结果附加到 AI 回复');
                console.log('[WebAgentClient] 📊 执行结果详情:', JSON.stringify(executionResults, null, 2));
                
                // 移除 AI 回复中所有 "执行结果" 相关的文本（AI 会自己预测执行结果）
                let cleanMessage = messageText;
                
                // 匹配各种格式的执行结果行（更激进的正则）
                const patterns = [
                    /^\s*[*#]*\s*执行结果[*#]*\s*[:：]\s*.+$/gim,           // **执行结果**: xxx
                    /^\s*执行结果.*$/gim,                                      // 执行结果: xxx（任意格式）
                    /\*\*执行结果\*\*[:：]\s*.+/gi,                           // **执行结果**: xxx
                ];
                
                patterns.forEach((pattern, idx) => {
                    const beforeMatch = cleanMessage;
                    cleanMessage = cleanMessage.replace(pattern, '').trim();
                    if (beforeMatch !== cleanMessage) {
                        console.log(`[WebAgentClient] 🧹 模式${idx + 1} 匹配并清理成功`);
                    }
                });
                
                // 调试日志
                if (messageText !== cleanMessage) {
                    console.log('[WebAgentClient]  AI 原始回复:');
                    console.log(messageText.substring(0, 200) + '...');
                    console.log('[WebAgentClient] 📝 清理后回复:');
                    console.log(cleanMessage.substring(0, 200) + '...');
                }
                
                // 构建最终内容
                const finalContent = cleanMessage + '\n\n---\n\n' + feedbackSection;
                console.log('[WebAgentClient] 📦 最终返回内容长度:', finalContent.length);
                console.log('[WebAgentClient] 📦 最终内容预览:', finalContent.substring(finalContent.length - 200));
                
                return finalContent;
            }

            return null;  // 没有 JavaScript 代码块

        } catch (error) {
            console.error('[WebAgentClient] ❌ 自动代码提取执行失败:', error);
            return null;
        }
    }

    /**
     * 构建执行结果反馈消息
     * @param {Array} results - 执行结果数组
     * @returns {string} 反馈消息
     */
    function buildExecutionFeedback(results) {
        let feedback = '```result\n';
        
        results.forEach((result, index) => {
            const status = result.success ? '成功' : '失败';
            const detail = result.success 
                ? (result.output !== undefined ? ': ' + JSON.stringify(result.output) : '')
                : ': ' + result.error;
            
            feedback += `代码块${index + 1} ${status}${detail}\n`;
        });
        
        feedback += '```\n';
        return feedback;
    }

    /**
     * 清空对话
     */
    function handleClearChat() {
        if (!clientState.isInitialized) {
            throw new Error('WebAgentClient 未初始化');
        }

        AIAgent.clearHistory();
        
        // 开始新会话
        clientState.currentSession = {
            id: generateSessionId(),
            startTime: Date.now(),
            messageCount: 0
        };

        // 清空消息队列
        clientState.messageQueue = [];

        EventManager.emit(EventManager.EventTypes.CHAT_CLEARED, {
            sessionId: clientState.currentSession.id
        });

        // 清除保存的会话
        if (window.StorageManager) {
            window.StorageManager.setState('session.current', null);
            window.StorageManager.setState('session.messages', []);
        }

        console.log('[WebAgentClient] 🗑️ 对话已清空，新会话:', clientState.currentSession.id);
    }

    /**
     * 取消当前请求
     */
    function handleCancelRequest() {
        if (!clientState.isInitialized) {
            return;
        }

        AIAgent.cancelRequest();
        
        // 清空消息队列
        clientState.messageQueue = [];
        
        // 清空执行队列
        clientState.executionQueue = [];
        clientState.isExecuting = false;
        
        EventManager.emit(EventManager.EventTypes.REQUEST_CANCELLED, {
            sessionId: clientState.currentSession.id
        });

        console.log('[WebAgentClient] ⛔ 请求已取消，队列已清空');
    }

    // ==================== 状态管理 ====================

    /**
     * 获取客户端状态
     */
    function getState() {
        return {
            isInitialized: clientState.isInitialized,
            isProcessing: clientState.isProcessing,
            settings: { ...clientState.settings },
            uiState: { ...clientState.uiState },
            currentSession: { ...clientState.currentSession },
            lastError: clientState.lastError,
            agentState: AIAgent.getState()
        };
    }

    /**
     * 更新设置
     */
    async function updateSettings(newSettings) {
        clientState.settings = { ...clientState.settings, ...newSettings };
        
        // 持久化（优先使用 StorageManager）
        await saveSettings(clientState.settings);

        // 如果修改了模型相关配置，重新初始化 AIAgent
        if (newSettings.defaultModel || newSettings.temperature || newSettings.maxTokens || newSettings.maxContextTokens) {
            AIAgent.updateConfig({
                defaultModel: newSettings.defaultModel,
                defaultTemperature: newSettings.temperature,
                defaultMaxTokens: newSettings.maxTokens,
                maxContextTokens: newSettings.maxContextTokens
            });
        }
        
        // 更新自动执行设置
        if (newSettings.autoExecuteCode !== undefined) {
            clientState.autoExecuteCode = newSettings.autoExecuteCode;
            console.log(`[WebAgentClient] ⚙️ 自动执行代码: ${clientState.autoExecuteCode ? '✅ 启用' : '❌ 禁用'}`);
        }

        EventManager.emit(EventManager.EventTypes.SETTINGS_UPDATED, {
            settings: clientState.settings
        });

        console.log('[WebAgentClient] ⚙️ 设置已更新');
    }

    /**
     * 更新 UI 状态
     */
    function updateUIState(newState) {
        clientState.uiState = { ...clientState.uiState, ...newState };
        
        EventManager.emit(EventManager.EventTypes.UI_STATE_CHANGED, {
            uiState: clientState.uiState
        });
    }

    // ==================== 私有方法 ====================

    /**
     * 加载设置
     */
    async function loadSettings(options = {}) {
        const defaults = {
            autoAttachPageContext: true,
            maxHistoryLength: 30,
            maxContextTokens: 8000,
            defaultModel: 'auto',
            temperature: 0.7,
            maxTokens: 4096,
            theme: 'light',
            language: 'zh-CN'
        };

        let saved = {};

        // 优先从 StorageManager 加载
        if (window.StorageManager) {
            saved = {
                defaultModel: window.StorageManager.getState('settings.defaultModel'),
                temperature: window.StorageManager.getState('settings.temperature'),
                maxTokens: window.StorageManager.getState('settings.maxTokens'),
                maxContextTokens: window.StorageManager.getState('settings.maxContextTokens')
            };
            console.log('[WebAgentClient] 📦 从 StorageManager 加载设置');
        } 
        // Fallback: 从 ConfigManager 加载
        else if (ConfigManager) {
            saved = {
                defaultModel: ConfigManager.get('model'),
                temperature: ConfigManager.get('temperature'),
                maxTokens: ConfigManager.get('maxTokens')
            };
            console.log('[WebAgentClient] 📦 从 ConfigManager 加载设置');
        }

        return { ...defaults, ...saved, ...options };
    }

    /**
     * 保存设置
     */
    async function saveSettings(settings) {
        // 优先使用 StorageManager
        if (window.StorageManager) {
            window.StorageManager.setState('settings.defaultModel', settings.defaultModel);
            window.StorageManager.setState('settings.temperature', settings.temperature);
            window.StorageManager.setState('settings.maxTokens', settings.maxTokens);
            window.StorageManager.setState('settings.maxContextTokens', settings.maxContextTokens);
            console.log('[WebAgentClient] 💾 设置已保存到 StorageManager');
        }
        // Fallback: 使用 ConfigManager
        else if (ConfigManager) {
            ConfigManager.set('model', settings.defaultModel);
            ConfigManager.set('temperature', settings.temperature);
            ConfigManager.set('maxTokens', settings.maxTokens);
            console.log('[WebAgentClient] 💾 设置已保存到 ConfigManager');
        }
    }

    /**
     * 恢复会话
     */
    async function restoreSession() {
        try {
            // 从 StorageManager 恢复上次的会话状态
            if (window.StorageManager) {
                const savedSession = window.StorageManager.getState('session.current');
                const savedMessages = window.StorageManager.getState('session.messages');
                
                if (savedSession && savedMessages) {
                    clientState.currentSession = savedSession;
                    
                    // 恢复 AIAgent 的对话历史
                    if (AIAgent) {
                        // 清空当前历史
                        AIAgent.clearHistory();
                        
                        // 逐条添加恢复的消息
                        for (const msg of savedMessages) {
                            AIAgent.addToHistory(msg.role, msg.content);
                        }
                        
                        console.log(`[WebAgentClient] 📂 恢复了 ${savedMessages.length} 条消息`);
                    }
                    
                    console.log('[WebAgentClient] 📂 会话已恢复:', savedSession.id);
                    return;
                }
            }
            
            console.log('[WebAgentClient] 📂 没有找到可恢复的会话');
            
        } catch (error) {
            console.error('[WebAgentClient] ❌ 会话恢复失败:', error);
        }
    }

    /**
     * 保存会话状态
     */
    async function saveSession() {
        try {
            if (window.StorageManager && clientState.currentSession.id) {
                // 直接从 AIAgent 获取对话历史
                const agentState = AIAgent.getState();
                const messages = agentState.history || [];
                
                // 保存会话信息
                window.StorageManager.setState('session.current', clientState.currentSession);
                window.StorageManager.setState('session.messages', messages);
                
                console.log('[WebAgentClient] 💾 会话已保存:', messages.length, '条消息');
            }
        } catch (error) {
            console.error('[WebAgentClient] ❌ 会话保存失败:', error);
        }
    }

    /**
     * 设置事件监听
     */
    function setupEventListeners() {
        // 监听 AIAgent 事件
        // 可以在这里添加更多的全局事件处理
    }

    /**
     * 验证消息
     */
    function validateMessage(message) {
        if (!message || typeof message !== 'string') {
            throw new Error('消息不能为空');
        }

        if (message.trim().length === 0) {
            throw new Error('消息不能为空白');
        }

        if (message.length > 10000) {
            throw new Error('消息过长（最大 10000 字符）');
        }
    }

    /**
     * 错误处理策略
     */
    async function handleError(error, originalMessage, options) {
        console.error('[WebAgentClient] 错误处理:', error);

        // 记录错误
        if (ErrorTracker) {
            ErrorTracker.report(error, {
                category: 'WEB_AGENT_CLIENT',
                message: originalMessage?.substring(0, 50),
                sessionId: clientState.currentSession.id
            }, ErrorTracker.ErrorCategory.EXECUTION, ErrorTracker.ErrorLevel.ERROR);
        }

        // 根据错误类型采取不同策略
        if (error.message.includes('网络') || error.message.includes('timeout')) {
            // 网络错误：建议重试
            EventManager.emit(EventManager.EventTypes.NETWORK_ERROR, {
                error,
                canRetry: true
            });
        } else if (error.message.includes('模型不可用')) {
            // 模型错误：尝试切换模型
            EventManager.emit(EventManager.EventTypes.MODEL_ERROR, {
                error,
                canSwitch: true
            });
        } else {
            // 其他错误：直接抛出
            EventManager.emit(EventManager.EventTypes.GENERAL_ERROR, {
                error
            });
        }
    }

    /**
     * 生成会话 ID
     */
    function generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 防抖保存会话（300ms 延迟）
     */
    let saveSessionTimer = null;
    function debouncedSaveSession() {
        if (saveSessionTimer) {
            clearTimeout(saveSessionTimer);
        }
        saveSessionTimer = setTimeout(() => {
            saveSession();
        }, 300);
    }

    /**
     * 处理队列中的下一条消息
     */
    async function processNextMessage() {
        if (clientState.messageQueue.length > 0 && !clientState.isProcessing) {
            const next = clientState.messageQueue.shift();
            console.log(`[WebAgentClient] 📤 从队列取出消息处理 (剩余: ${clientState.messageQueue.length})`);
            
            try {
                await handleUserMessage(next.message, next.options);
            } catch (error) {
                console.error('[WebAgentClient] 队列消息处理失败:', error);
            }
        }
    }

    /**
     * 处理执行队列中的下一个代码
     */
    async function processNextExecution() {
        if (clientState.executionQueue.length > 0 && !clientState.isExecuting) {
            const next = clientState.executionQueue.shift();
            console.log(`[WebAgentClient] 📤 从执行队列取出代码处理 (剩余: ${clientState.executionQueue.length})`);
            
            try {
                await handleCodeExecution(next.code, next.options);
            } catch (error) {
                console.error('[WebAgentClient] 队列代码执行失败:', error);
            }
        }
    }

    /**
     * 获取队列状态
     */
    function getQueueStatus() {
        return {
            isProcessing: clientState.isProcessing,
            queueLength: clientState.messageQueue.length,
            maxQueueSize: clientState.maxQueueSize,
            canAcceptMore: clientState.messageQueue.length < clientState.maxQueueSize,
            
            isExecuting: clientState.isExecuting,
            executionQueueLength: clientState.executionQueue.length,
            maxExecutionQueueSize: clientState.maxExecutionQueueSize,
            canAcceptMoreExecutions: clientState.executionQueue.length < clientState.maxExecutionQueueSize,
            
            autoExecuteCode: clientState.autoExecuteCode
        };
    }

    // ==================== 导出接口 ====================

    return {
        // 初始化
        init,
        
        // 核心业务方法
        handleUserMessage,
        handleCodeExecution,
        handleCodeFromMessage,
        extractAndExecuteCode,  // 自动提取并执行代码
        handleClearChat,
        handleCancelRequest,
        
        // 状态管理
        getState,
        updateSettings,
        updateUIState,
        saveSession,  // 手动保存会话
        getQueueStatus  // 获取队列状态
    };
})();
