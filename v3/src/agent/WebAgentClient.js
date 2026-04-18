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
        lastError: null
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

            // 1. 加载配置
            clientState.settings = await loadSettings(options);

            // 2. 初始化 AIAgent（基础设施）
            await AIAgent.init({
                autoAttachPageContext: clientState.settings.autoAttachPageContext !== false,
                maxHistoryLength: clientState.settings.maxHistoryLength || 30,
                defaultModel: clientState.settings.defaultModel || 'auto',
                defaultTemperature: clientState.settings.temperature || 0.7,
                defaultMaxTokens: clientState.settings.maxTokens || 4096
            });

            // 3. 恢复会话
            await restoreSession();

            // 4. 注册事件监听
            setupEventListeners();

            clientState.isInitialized = true;
            clientState.currentSession = {
                id: generateSessionId(),
                startTime: Date.now(),
                messageCount: 0
            };

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

        if (clientState.isProcessing) {
            throw new Error('正在处理中，请稍后');
        }

        clientState.isProcessing = true;
        clientState.lastError = null;

        try {
            // 1. 验证消息
            validateMessage(message);

            // 2. 发送消息到 AIAgent
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
            }

            // 5. 触发完成事件
            EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
                result,
                sessionId: clientState.currentSession.id
            });

            return result;

        } catch (error) {
            clientState.lastError = error;
            
            // 错误处理策略
            await handleError(error, message, options);
            
            throw error;

        } finally {
            clientState.isProcessing = false;
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

        try {
            console.log('[WebAgentClient] 🛠️ 执行代码');

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

            throw error;
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

        EventManager.emit(EventManager.EventTypes.CHAT_CLEARED, {
            sessionId: clientState.currentSession.id
        });

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
        
        EventManager.emit(EventManager.EventTypes.REQUEST_CANCELLED, {
            sessionId: clientState.currentSession.id
        });

        console.log('[WebAgentClient] ⛔ 请求已取消');
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
        
        // 持久化
        await saveSettings(clientState.settings);

        // 如果修改了模型相关配置，重新初始化 AIAgent
        if (newSettings.defaultModel || newSettings.temperature || newSettings.maxTokens) {
            AIAgent.updateConfig({
                defaultModel: newSettings.defaultModel,
                defaultTemperature: newSettings.temperature,
                defaultMaxTokens: newSettings.maxTokens
            });
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
            defaultModel: 'auto',
            temperature: 0.7,
            maxTokens: 4096,
            theme: 'light',
            language: 'zh-CN'
        };

        // 从 ConfigManager 加载
        const saved = {
            defaultModel: ConfigManager?.getConfig('model'),
            temperature: ConfigManager?.getConfig('temperature'),
            maxTokens: ConfigManager?.getConfig('maxTokens')
        };

        return { ...defaults, ...saved, ...options };
    }

    /**
     * 保存设置
     */
    async function saveSettings(settings) {
        if (ConfigManager) {
            ConfigManager.setConfig('model', settings.defaultModel);
            ConfigManager.setConfig('temperature', settings.temperature);
            ConfigManager.setConfig('maxTokens', settings.maxTokens);
        }
    }

    /**
     * 恢复会话
     */
    async function restoreSession() {
        // TODO: 从持久化存储恢复上次的会话
        console.log('[WebAgentClient] 📂 会话恢复功能待实现');
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

    // ==================== 导出接口 ====================

    return {
        // 初始化
        init,
        
        // 核心业务方法
        handleUserMessage,
        handleCodeExecution,
        handleCodeFromMessage,
        handleClearChat,
        handleCancelRequest,
        
        // 状态管理
        getState,
        updateSettings,
        updateUIState
    };
})();
