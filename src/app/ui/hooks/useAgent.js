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
        
        // 加载历史消息
        React.useEffect(() => {
            loadHistory();
            loadModels();
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
                models.push({ id: 'auto', name: '🚀 Auto (自动选择)', provider: 'System' });
                
                // 收集所有供应商的模型
                providers.forEach(provider => {
                    if (provider.models && provider.models.length > 0) {
                        provider.models.forEach(model => {
                            if (model.enabled) {
                                models.push({
                                    id: model.id,
                                    name: `${model.name || model.id} (${provider.name})`,
                                    provider: provider.name
                                });
                            }
                        });
                    }
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
                if (WebAgentClient && WebAgentClient.handleUserMessage) {
                    await WebAgentClient.handleUserMessage(userMessage);
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
            if (WebAgentClient && WebAgentClient.handleClearChat) {
                WebAgentClient.handleClearChat();
            }
            setMessages([]);
        }
        
        // 停止生成
        function stopGeneration() {
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
            if (!EventManager) return;
            
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
                if (streamingMessageId && data.result) {
                    setMessages(prev => prev.map(msg => 
                        msg.id === streamingMessageId 
                            ? { 
                                ...msg, 
                                isStreaming: false,
                                content: data.result.content || msg.content  // ← 更新为包含执行结果的完整内容
                              }
                            : msg
                    ));
                    console.log('[useAgent] ✅ 消息完成，内容长度:', (data.result.content || '').length);
                    setIsProcessing(false);
                    setStreamingMessageId(null);
                }
            });
            
            // 监听消息错误
            const onErrorId = EventManager.on(EventManager.EventTypes.MESSAGE_ERROR, (data) => {
                console.error('[useAgent] 消息错误:', data.error);
                setIsProcessing(false);
                setStreamingMessageId(null);
            });
            
            return () => {
                EventManager.off(EventManager.EventTypes.MESSAGE_STREAMING, onStreamingId);
                EventManager.off(EventManager.EventTypes.MESSAGE_COMPLETE, onCompleteId);
                EventManager.off(EventManager.EventTypes.MESSAGE_ERROR, onErrorId);
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
            reloadHistory: loadHistory
        };
    }
    
    // 暴露到全局
    window.useAgent = useAgent;
    
})();
