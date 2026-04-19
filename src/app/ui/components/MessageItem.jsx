// ==================== Message Item Component ====================
// 单条消息组件（用户/AI）

(function() {
    'use strict';
    
    /**
     * P0: 生成稳定的代码块 ID（基于代码内容）
     * @param {string} code - 代码内容
     * @returns {string} 稳定的 ID
     */
    function generateCodeId(code) {
        // 使用简单的 hash 算法，基于代码内容生成稳定 ID
        let hash = 0;
        for (let i = 0; i < code.length; i++) {
            const char = code.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 'code_' + Math.abs(hash).toString(36);
    }
    
    /**
     * 渲染代码块
     */
    function renderCodeBlock(code, language, messageId) {
        // P0: 必须 trim()，与 WebAgentClient 保持一致
        const trimmedCode = code.trim();
        const codeId = generateCodeId(trimmedCode); // 使用稳定的 ID
        const isRunjs = language === 'runjs';
        
        // P0: 检查是否高危（需要 WebAgentClient）
        let isHighRisk = false;
        let riskType = null;
        if (isRunjs && window.WebAgentClient) {
            const CodeExecutor = window.AIAgent?.getDependencies?.()?.CodeExecutor;
            if (CodeExecutor) {
                isHighRisk = CodeExecutor.isHighRiskCode(code);
                riskType = isHighRisk ? CodeExecutor.getHighRiskType(code) : null;
            }
        }
        
        return React.createElement('div', { 
            key: codeId,
            className: 'code-block',
            'data-code-id': codeId,
            style: {
                background: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
                margin: '10px 0',
                overflow: 'hidden'
            }
        }, [
            React.createElement('div', {
                key: 'header',
                style: {
                    background: '#e0e0e0',
                    padding: '5px 10px',
                    fontSize: '12px',
                    color: '#666',
                    borderBottom: '1px solid #ddd',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }
            }, [
                React.createElement('span', { key: 'lang' }, language || 'text'),
                
                // P0: 高危代码执行按钮
                isHighRisk ? React.createElement('button', {
                    key: 'execute-btn',
                    className: 'btn-execute-high-risk',
                    onClick: () => executeHighRiskCode(code, codeId),
                    style: {
                        padding: '3px 8px',
                        fontSize: '11px',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                    }
                }, '⚠️ 执行高危代码') : null,
                
                // P0: 执行状态
                React.createElement('span', {
                    key: 'status',
                    className: 'code-execution-status',
                    'data-code-id': codeId,
                    style: {
                        fontSize: '11px',
                        color: '#6c757d'
                    }
                }, isRunjs ? '等待执行...' : '')
            ]),
            React.createElement('pre', {
                key: 'code',
                style: {
                    padding: '10px',
                    overflow: 'auto',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    margin: 0
                }
            }, code),
            
            // P0: 执行结果区域
            React.createElement('div', {
                key: 'result',
                className: 'code-execution-result',
                'data-code-id': codeId,
                style: {
                    padding: '8px 10px',
                    background: '#fff',
                    borderTop: '1px solid #ddd',
                    fontSize: '12px',
                    display: 'none'  // 默认隐藏，有结果时显示
                }
            }, '')
        ]);
    }
    
    /**
     * P0: 执行高危代码
     */
    function executeHighRiskCode(code, codeId) {
        if (!window.WebAgentClient || !window.WebAgentClient.executeHighRiskCode) {
            console.error('[MessageItem] WebAgentClient 未就绪');
            return;
        }
        
        // 更新状态为执行中
        updateCodeStatus(codeId, 'executing');
        
        window.WebAgentClient.executeHighRiskCode(code, codeId)
            .then(result => {
                updateCodeStatus(codeId, 'completed', result.result);
            })
            .catch(error => {
                updateCodeStatus(codeId, 'failed', error.message);
            });
    }
    
    /**
     * P0: 更新代码执行状态
     */
    function updateCodeStatus(codeId, status, result = null) {
        const statusEl = document.querySelector(`.code-execution-status[data-code-id="${codeId}"]`);
        const resultEl = document.querySelector(`.code-execution-result[data-code-id="${codeId}"]`);
        
        if (!statusEl || !resultEl) return;
        
        switch (status) {
            case 'executing':
                statusEl.textContent = '⏳ 执行中...';
                statusEl.style.color = '#004085';
                break;
            case 'completed':
                statusEl.textContent = '✅ 执行成功';
                statusEl.style.color = '#155724';
                resultEl.style.display = 'block';
                resultEl.textContent = String(result);
                break;
            case 'failed':
                statusEl.textContent = '❌ 执行失败';
                statusEl.style.color = '#721c24';
                resultEl.style.display = 'block';
                resultEl.textContent = String(result);
                break;
        }
    }
    
    /**
     * 解析消息内容（提取代码块）
     */
    function parseMessageContent(content, messageId) {
        if (!content) return [];
        
        const elements = [];
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;
        
        while ((match = codeBlockRegex.exec(content)) !== null) {
            // 添加代码块前的文本
            if (match.index > lastIndex) {
                const text = content.substring(lastIndex, match.index);
                if (text.trim()) {
                    elements.push(React.createElement('p', { key: 'text_' + lastIndex }, text));
                }
            }
            
            // 添加代码块
            // P0: 必须 trim()，与 WebAgentClient 保持一致
            elements.push(renderCodeBlock(match[2].trim(), match[1], messageId));
            
            lastIndex = codeBlockRegex.lastIndex;
        }
        
        // 添加剩余文本
        if (lastIndex < content.length) {
            const text = content.substring(lastIndex);
            if (text.trim()) {
                elements.push(React.createElement('p', { key: 'text_end' }, text));
            }
        }
        
        return elements.length > 0 ? elements : [React.createElement('p', { key: 'default' }, content)];
    }
    
    /**
     * MessageItem 组件
     */
    function MessageItem({ message }) {
        const isUser = message.role === 'user';
        const contentElements = parseMessageContent(message.content, message.id);
        
        // P0: 使用 ref 保存监听器 ID
        const listenerRefs = React.useRef({ executedId: null, errorId: null });
        
        // P0: 组件挂载时立即注册监听器（不依赖 useEffect）
        React.useLayoutEffect(() => {
            console.log('[MessageItem] 🔍 useLayoutEffect 执行', { messageId: message.id, isUser, role: message.role });
            
            if (!window.EventManager || isUser) {
                console.log('[MessageItem] ⚠️ 跳过监听（非 assistant 消息或 EventManager 未就绪）');
                return;
            }
            
            // 清理旧的监听器
            if (listenerRefs.current.executedId) {
                window.EventManager.off(window.EventManager.EventTypes.CODE_EXECUTED, listenerRefs.current.executedId);
            }
            if (listenerRefs.current.errorId) {
                window.EventManager.off(window.EventManager.EventTypes.CODE_EXECUTION_ERROR, listenerRefs.current.errorId);
            }
            
            const onCodeExecuted = (data) => {
                console.log('[MessageItem] 📨 收到 CODE_EXECUTED 事件:', data.blockId);
                console.log('[MessageItem] 🔍 尝试更新状态:', data.blockId);
                
                // 检查是否是当前消息的代码块
                if (data.blockId) {
                    // 检查 DOM 元素是否存在
                    const statusEl = document.querySelector(`.code-execution-status[data-code-id="${data.blockId}"]`);
                    const resultEl = document.querySelector(`.code-execution-result[data-code-id="${data.blockId}"]`);
                    
                    console.log('[MessageItem] 🔍 DOM 元素检查:', {
                        blockId: data.blockId,
                        statusElExists: !!statusEl,
                        resultElExists: !!resultEl
                    });
                    
                    if (!statusEl || !resultEl) {
                        console.warn('[MessageItem] ⚠️ DOM 元素不存在，无法更新');
                        return;
                    }
                    
                    updateCodeStatus(data.blockId, 'completed', data.result?.result);
                    console.log('[MessageItem] ✅ 状态更新完成');
                }
            };
            
            const onCodeError = (data) => {
                console.log('[MessageItem] 📨 收到 CODE_EXECUTION_ERROR 事件:', data.blockId);
                if (data.blockId) {
                    updateCodeStatus(data.blockId, 'failed', data.error?.message || data.error);
                }
            };
            
            const executedId = window.EventManager.on(window.EventManager.EventTypes.CODE_EXECUTED, onCodeExecuted);
            const errorId = window.EventManager.on(window.EventManager.EventTypes.CODE_EXECUTION_ERROR, onCodeError);
            
            listenerRefs.current = { executedId, errorId };
            
            console.log('[MessageItem] ✅ 事件监听器已注册', { executedId, errorId });
            
            return () => {
                console.log('[MessageItem] 🧹 清理事件监听器');
                if (listenerRefs.current.executedId) {
                    window.EventManager.off(window.EventManager.EventTypes.CODE_EXECUTED, listenerRefs.current.executedId);
                }
                if (listenerRefs.current.errorId) {
                    window.EventManager.off(window.EventManager.EventTypes.CODE_EXECUTION_ERROR, listenerRefs.current.errorId);
                }
            };
        }, [isUser, message.id]);
        
        return React.createElement('div', {
            className: `message-item ${isUser ? 'user-message' : 'assistant-message'}`,
            style: {
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: '15px',
                padding: '0 10px'
            }
        }, [
            React.createElement('div', {
                key: 'bubble',
                className: 'message-bubble',
                style: {
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isUser ? '#007bff' : '#f0f0f0',
                    color: isUser ? 'white' : '#333',
                    wordWrap: 'break-word'
                }
            }, [
                ...contentElements,
                message.isStreaming && React.createElement('span', {
                    key: 'cursor',
                    className: 'streaming-cursor',
                    style: {
                        display: 'inline-block',
                        width: '2px',
                        height: '1em',
                        background: '#333',
                        marginLeft: '2px',
                        animation: 'blink 1s infinite'
                    }
                }, '')
            ])
        ]);
    }
    
    // 暴露到全局
    window.MessageItem = MessageItem;
    
})();
