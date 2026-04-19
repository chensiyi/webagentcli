// ==================== Agent Hook ====================
// 连接 WebAgentClient，处理消息发送和流式更新

(function() {
    'use strict';
    
    /**
     * Agent Hook
     * @returns {Object} Agent 状态和方法
     */
    function useAgent() {
        const [messages, setMessages] = React.useState([]);
        const [isProcessing, setIsProcessing] = React.useState(false);
        const [streamingMessageId, setStreamingMessageId] = React.useState(null);
        const [currentModel, setCurrentModel] = React.useState('auto');
        const [availableModels, setAvailableModels] = React.useState([]);
        
        // P0: 动态获取 WebAgentClient 和 EventManager（每次调用时获取最新引用）
        const getWebAgentClient = () => window.WebAgentClient;
        const getEventManager = () => window.EventManager;
        
        // 加载历史消息 + 监听会话恢复事件（P2: 由 WebAgentClient 统一管理，这里只监听事件）
        React.useEffect(() => {
            console.log('[useAgent] 🔄 组件挂载，开始加载历史');
            
            // P2: 从 AIAgent 获取当前历史（如果已初始化）
            const loadHistoryFromAIAgent = () => {
                const AIAgent = window.AIAgent;
                if (AIAgent && AIAgent.getState) {
                    try {
                        const agentState = AIAgent.getState();
                        console.log('[useAgent] 🔍 检查 AIAgent 状态:', {
                            isInitialized: agentState.isInitialized,
                            historyLength: agentState.history?.length || 0
                        });
                        
                        if (agentState.history && agentState.history.length > 0) {
                            // 将 AIAgent 历史转换为 UI 消息格式
                            const uiMessages = agentState.history.map((msg, index) => ({
                                id: msg.id || `msg_${index}_${Date.now()}`,
                                role: msg.role,
                                content: msg.content,
                                timestamp: msg.timestamp || new Date().toISOString(),
                                isStreaming: false
                            }));
                            setMessages(uiMessages);
                            console.log('[useAgent] 📂 从 AIAgent 恢复', uiMessages.length, '条历史消息');
                            return true; // 成功加载
                        } else {
                            console.log('[useAgent] ℹ️ AIAgent 没有历史消息');
                            return false;
                        }
                    } catch (error) {
                        console.warn('[useAgent] ⚠️ 从 AIAgent 加载历史失败:', error);
                        return false;
                    }
                } else {
                    console.warn('[useAgent] ⚠️ AIAgent 未就绪');
                    return false;
                }
            };
            
            // P2: 监听会话恢复事件
            let sessionRestoredHandler = null;
            if (window.EventManager) {
                sessionRestoredHandler = (data) => {
                    console.log('[useAgent] 📂 会话已恢复，重新加载历史');
                    setTimeout(() => {
                        loadHistoryFromAIAgent();
                    }, 50);
                };
                
                window.EventManager.on(EventManager.EventTypes.SESSION_RESTORED, sessionRestoredHandler);
            }
            
            // 尝试立即加载历史（此时应该已经初始化完成）
            loadHistoryFromAIAgent();
            
            // 加载模型列表
            loadModels();
            
            // 清理函数：组件卸载时移除事件监听器
            return () => {
                if (sessionRestoredHandler) {
                    window.EventManager.off(EventManager.EventTypes.SESSION_RESTORED, sessionRestoredHandler);
                }
            };
        }, []);
        
        async function loadModels() {
            try {
                // 从 ConfigManager 获取当前模型
                if (ConfigManager) {
                    const model = ConfigManager.get('model') || 'auto';
                    setCurrentModel(model);
                }
                
                // 从 ProviderManager 获取可用模型列表
                if (!ProviderManager) {
                    console.warn('[useAgent] ProviderManager 未加载');
                    return;
                }
                
                // 等待 ProviderManager 初始化完成
                let retryCount = 0;
                const maxRetries = 10;
                while (retryCount < maxRetries) {
                    const providers = ProviderManager.getAllProviders();
                    if (providers && providers.length > 0) {
                        break;
                    }
                    
                    console.log(`[useAgent] ⏳ 等待 ProviderManager 初始化... (${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    retryCount++;
                }
                
                const providers = ProviderManager.getAllProviders();
                if (!providers || providers.length === 0) {
                    console.warn('[useAgent] ProviderManager 没有可用的提供商');
                    return;
                }
                
                const models = [];
                
                // 添加 auto 选项
                models.push({ id: 'auto', name: '🚀 Auto (自动选择)', provider: 'System', invalid: false });
                
                // 收集所有供应商的模型
                providers.forEach(provider => {
                    if (provider.models && provider.models.length > 0) {
                        provider.models.forEach(model => {
                            if (model.enabled) {
                                models.push({
                                    id: model.id,
                                    name: `${model.name || model.id} (${provider.name})`,
                                    provider: provider.name,
                                    invalid: model.invalid || false  // P2: 标记无效模型
                                });
                            }
                        });
                    }
                });
                
                // P2: 排序 - 有效模型在前，无效模型在后
                models.sort((a, b) => {
                    if (a.invalid === b.invalid) return 0;
                    return a.invalid ? 1 : -1;
                });
                
                setAvailableModels(models);
                console.log('[useAgent] ✅ 加载了', models.length, '个模型');
            } catch (error) {
                console.error('[useAgent] 加载模型列表失败:', error);
            }
        }
        
        async function loadHistory() {
            try {
                // 从 StorageManager 加载保存的会话消息
                if (window.StorageManager) {
                    const savedMessages = window.StorageManager.getState('session.messages');
                    if (savedMessages && Array.isArray(savedMessages)) {
                        setMessages(savedMessages);
                        console.log('[useAgent] 📂 已恢复', savedMessages.length, '条历史消息');
                    }
                }
            } catch (error) {
                console.error('[useAgent] 加载历史失败:', error);
            }
        }
        
        // 发送消息
        async function sendMessage(userMessage) {
            console.log('[useAgent] 📤 sendMessage 被调用');
            console.log('[useAgent] 📋 消息:', userMessage.substring(0, 100));
            console.log('[useAgent] 🔧 WebAgentClient 存在:', !!WebAgentClient);
            console.log('[useAgent] 🔧 isProcessing:', isProcessing);
            
            if (!userMessage.trim() || isProcessing) return;
            
            try {
                setIsProcessing(true);
                
                // 添加用户消息到列表
                const userMsg = {
                    id: 'user_' + Date.now(),
                    role: 'user',
                    content: userMessage,
                    timestamp: new Date().toISOString()
                };
                
                setMessages(prev => [...prev, userMsg]);
                
                // 创建 AI 消息占位符
                const aiMessageId = 'ai_' + Date.now();
                setStreamingMessageId(aiMessageId);
                
                const aiMsg = {
                    id: aiMessageId,
                    role: 'assistant',
                    content: '',
                    isStreaming: true,
                    timestamp: new Date().toISOString()
                };
                
                setMessages(prev => [...prev, aiMsg]);
                
                // 通过 WebAgentClient 发送消息
                const WebAgentClient = getWebAgentClient();
                console.log('[useAgent] 🚀 调用 WebAgentClient.handleUserMessage...');
                if (WebAgentClient && WebAgentClient.handleUserMessage) {
                    try {
                        await WebAgentClient.handleUserMessage(userMessage);
                        console.log('[useAgent] ✅ WebAgentClient.handleUserMessage 返回');
                        // 注意：isProcessing 和 streamingMessageId 由 MESSAGE_COMPLETE 事件处理
                    } catch (error) {
                        console.error('[useAgent] ❌ WebAgentClient 处理失败:', error);
                        setIsProcessing(false);
                        setStreamingMessageId(null);
                        throw error;
                    }
                } else {
                    console.error('[useAgent] ❌ WebAgentClient 或 handleUserMessage 不存在');
                    setIsProcessing(false);
                    setStreamingMessageId(null);
                }
                
            } catch (error) {
                console.error('[useAgent] 发送消息失败:', error);
                setIsProcessing(false);
                setStreamingMessageId(null);
            }
        }
        
        // 更新流式消息内容（追加模式）
        function updateStreamingMessage(messageId, chunk) {
            setMessages(prev => prev.map(msg => 
                msg.id === messageId 
                    ? { ...msg, content: msg.content + chunk, isStreaming: true }
                    : msg
            ));
        }
        
        // 完成流式消息
        function finalizeMessage(messageId) {
            setMessages(prev => prev.map(msg => 
                msg.id === messageId 
                    ? { ...msg, isStreaming: false }
                    : msg
            ));
            setIsProcessing(false);
            setStreamingMessageId(null);
        }
        
        // 清空聊天
        function clearChat() {
            const WebAgentClient = getWebAgentClient();
            if (WebAgentClient && WebAgentClient.handleClearChat) {
                WebAgentClient.handleClearChat();
            }
            setMessages([]);
        }
        
        // 停止生成
        function stopGeneration() {
            const WebAgentClient = getWebAgentClient();
            if (WebAgentClient && WebAgentClient.stopGeneration) {
                WebAgentClient.stopGeneration();
            }
            setIsProcessing(false);
            setStreamingMessageId(null);
        }
        
        // 切换模型
        async function switchModel(modelId) {
            try {
                setCurrentModel(modelId);
                
                // 保存到 ConfigManager
                if (ConfigManager) {
                    ConfigManager.set('model', modelId);
                }
                
                console.log('[useAgent] ✅ 模型已切换:', modelId);
                
            } catch (error) {
                console.error('[useAgent] 切换模型失败:', error);
            }
        }
        
        // 监听消息更新事件
        React.useEffect(() => {
            const EventManager = getEventManager();
            if (!EventManager) {
                console.warn('[useAgent] ⚠️ EventManager 未加载');
                return;
            }
            
            // 监听流式消息更新
            const onStreamingId = EventManager.on(EventManager.EventTypes.MESSAGE_STREAMING, (data) => {
                if (streamingMessageId && data.chunk) {
                    // 使用函数式更新，确保获取最新的 messages 状态
                    setMessages(prev => prev.map(msg => 
                        msg.id === streamingMessageId 
                            ? { ...msg, content: msg.content + data.chunk, isStreaming: true }
                            : msg
                    ));
                }
            });
            
            // 监听消息完成
            const onCompleteId = EventManager.on(EventManager.EventTypes.MESSAGE_COMPLETE, (data) => {
                console.log('[useAgent] 📨 收到 MESSAGE_COMPLETE 事件');
                console.log('[useAgent] 🔍 streamingMessageId:', streamingMessageId);
                console.log('[useAgent] 🔍 data.result:', data.result ? '存在' : '不存在');
                console.log('[useAgent] 🔍 data.result.content 长度:', data.result?.content?.length || 0);
                
                if (streamingMessageId && data.result) {
                    console.log('[useAgent] ✅ 开始更新消息', streamingMessageId);
                    setMessages(prev => {
                        console.log('[useAgent] 📋 当前 messages 数量:', prev.length);
                        const updated = prev.map(msg => {
                            if (msg.id === streamingMessageId) {
                                console.log('[useAgent] ✏️ 找到匹配的消息，更新内容');
                                console.log('[useAgent] 📄 新内容长度:', data.result.content.length);
                                return { 
                                    ...msg, 
                                    isStreaming: false,
                                    content: data.result.content || msg.content
                                };
                            }
                            return msg;
                        });
                        console.log('[useAgent] ✅ 消息更新完成');
                        return updated;
                    });
                    console.log('[useAgent] ✅ 消息完成，内容长度:', (data.result.content || '').length);
                    setIsProcessing(false);
                    setStreamingMessageId(null);
                    console.log('[useAgent] 🧹 streamingMessageId 已清空');
                } else {
                    console.warn('[useAgent] ⚠️ MESSAGE_COMPLETE 被忽略:', {
                        hasStreamingId: !!streamingMessageId,
                        hasResult: !!data.result
                    });
                }
            });
            
            // 监听消息错误
            const onErrorId = EventManager.on(EventManager.EventTypes.MESSAGE_ERROR, (data) => {
                console.error('[useAgent] 消息错误:', data.error);
                setIsProcessing(false);
                setStreamingMessageId(null);
            });
            
            // P2: 监听单个代码执行完成，更新 UI
            const onCodeExecutedId = EventManager.on(EventManager.EventTypes.CODE_EXECUTED, (data) => {
                console.log('[useAgent] ✅ 代码执行完成:', data.blockId);
                // 注意：代码执行结果由 WebAgentClient 自动反馈给大模型
                // 这里只需要记录日志，不需要更新 UI（UI 由 MESSAGE_COMPLETE 更新）
            });
            
            // 注意：SESSION_RESTORED 监听器已在第一个 useEffect 中注册，无需重复注册
            
            // P0: 监听代码批量执行完成
            const onCodeBatchId = EventManager.on(EventManager.EventTypes.CODE_BATCH_EXECUTED, (data) => {
                console.log('[useAgent] 📊 代码批量执行完成', data.results.length, '个结果');
                console.log('[useAgent] 🔄 准备接收最终回复，创建新的消息占位符');
                
                // 创建新的 AI 消息占位符（用于接收最终回复）
                const aiMessageId = 'ai_' + Date.now();
                setStreamingMessageId(aiMessageId);
                
                const aiMsg = {
                    id: aiMessageId,
                    role: 'assistant',
                    content: '',
                    isStreaming: true,
                    timestamp: new Date().toISOString()
                };
                
                setMessages(prev => [...prev, aiMsg]);
                console.log('[useAgent] ✅ 新消息占位符已创建:', aiMessageId);
            });
            
            return () => {
                EventManager.off(EventManager.EventTypes.MESSAGE_STREAMING, onStreamingId);
                EventManager.off(EventManager.EventTypes.MESSAGE_COMPLETE, onCompleteId);
                EventManager.off(EventManager.EventTypes.MESSAGE_ERROR, onErrorId);
                EventManager.off(EventManager.EventTypes.CODE_EXECUTED, onCodeExecutedId);
                EventManager.off(EventManager.EventTypes.CODE_BATCH_EXECUTED, onCodeBatchId);
            };
        }, [streamingMessageId]);
        
        return {
            messages,
            isProcessing,
            streamingMessageId,
            currentModel,
            availableModels,
            sendMessage,
            clearChat,
            stopGeneration,
            switchModel,
            reloadHistory: loadHistory,
            reloadModels: loadModels  // P2: 暴露重新加载模型的方法
        };
    }
    
    // 暴露到全局
    window.useAgent = useAgent;
    
})();
