// ==================== Message Item Component ====================
// 单条消息组件（用户/AI）

(function() {
    'use strict';
    
    /**
     * 渲染代码块
     */
    function renderCodeBlock(code, language) {
        const codeId = 'code_' + Math.random().toString(36).substr(2, 9);
        
        return React.createElement('div', { 
            key: codeId,
            className: 'code-block',
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
                    borderBottom: '1px solid #ddd'
                }
            }, language || 'text'),
            React.createElement('pre', {
                key: 'code',
                style: {
                    padding: '10px',
                    overflow: 'auto',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    margin: 0
                }
            }, code)
        ]);
    }
    
    /**
     * 解析消息内容（提取代码块）
     */
    function parseMessageContent(content) {
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
            elements.push(renderCodeBlock(match[2], match[1]));
            
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
        const contentElements = parseMessageContent(message.content);
        
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
