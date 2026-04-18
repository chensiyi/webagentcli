// ==================== Chat Window Component ====================
// 聊天窗口主组件

(function() {
    'use strict';
    
    /**
     * ChatWindow 组件
     */
    function ChatWindow({ isOpen, onClose, onOpenSettings }) {
        const { 
            messages, 
            isProcessing, 
            sendMessage, 
            clearChat, 
            stopGeneration,
            currentModel,
            availableModels,
            switchModel
        } = window.useAgent();
        
        const [inputValue, setInputValue] = React.useState('');
        const messagesEndRef = React.useRef(null);
        
        // 从 StorageManager 加载窗口位置和大小（如果可用）
        const loadWindowState = () => {
            if (window.StorageManager) {
                const savedPosition = window.StorageManager.getState('ui.window.position');
                const savedSize = window.StorageManager.getState('ui.window.size');
                const savedVisible = window.StorageManager.getState('ui.window.visible');
                
                return {
                    position: savedPosition || { x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 },
                    size: savedSize || { width: 800, height: 600 },
                    visible: savedVisible === true  // 默认隐藏，只有明确保存为 true 才显示
                };
            }
            return {
                position: { x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 },
                size: { width: 800, height: 600 },
                visible: false  // 默认隐藏
            };
        };
        
        const initialState = loadWindowState();
        const [position, setPosition] = React.useState(initialState.position);
        const [size, setSize] = React.useState(initialState.size);
        // 不再使用 isVisible 状态，直接使用 isOpen prop
        const [isDragging, setIsDragging] = React.useState(false);
        const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
        const [isResizing, setIsResizing] = React.useState(false);
        const windowRef = React.useRef(null);
        
        // 自动滚动到底部
        React.useEffect(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
        }, [messages]);
        
        // 拖拽处理
        React.useEffect(() => {
            function handleMouseMove(e) {
                if (isDragging) {
                    const newX = e.clientX - dragOffset.x;
                    const newY = e.clientY - dragOffset.y;
                    
                    // 边界检查
                    const maxX = window.innerWidth - size.width;
                    const maxY = window.innerHeight - size.height;
                    
                    const newPosition = {
                        x: Math.max(0, Math.min(newX, maxX)),
                        y: Math.max(0, Math.min(newY, maxY))
                    };
                    
                    setPosition(newPosition);
                    
                    // 保存到 StorageManager（防抖）
                    if (window.StorageManager) {
                        clearTimeout(window._savePositionTimer);
                        window._savePositionTimer = setTimeout(() => {
                            window.StorageManager.setState('ui.window.position', newPosition);
                        }, 300);
                    }
                }
                
                if (isResizing && windowRef.current) {
                    const newWidth = Math.max(400, e.clientX - position.x);
                    const newHeight = Math.max(300, e.clientY - position.y);
                    
                    const newSize = {
                        width: Math.min(newWidth, window.innerWidth - position.x),
                        height: Math.min(newHeight, window.innerHeight - position.y)
                    };
                    
                    setSize(newSize);
                    
                    // 保存到 StorageManager（防抖）
                    if (window.StorageManager) {
                        clearTimeout(window._saveSizeTimer);
                        window._saveSizeTimer = setTimeout(() => {
                            window.StorageManager.setState('ui.window.size', newSize);
                        }, 300);
                    }
                }
            }
            
            function handleMouseUp() {
                setIsDragging(false);
                setIsResizing(false);
            }
            
            if (isDragging || isResizing) {
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
            
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }, [isDragging, isResizing, dragOffset, position, size]);
        
        // 监听窗口 resize 事件，确保窗口始终在可视区域内
        React.useEffect(() => {
            function handleWindowResize() {
                // 如果正在拖拽或调整大小，跳过自动调整
                if (isDragging || isResizing) {
                    return;
                }
                
                // 确保窗口不超出边界
                const maxX = Math.max(0, window.innerWidth - size.width);
                const maxY = Math.max(0, window.innerHeight - size.height);
                
                setPosition(prev => ({
                    x: Math.min(prev.x, maxX),
                    y: Math.min(prev.y, maxY)
                }));
                
                // 如果窗口太大，缩小到合适的大小
                if (size.width > window.innerWidth - 40) {
                    setSize(prev => ({
                        ...prev,
                        width: Math.max(400, window.innerWidth - 40)
                    }));
                }
                if (size.height > window.innerHeight - 40) {
                    setSize(prev => ({
                        ...prev,
                        height: Math.max(300, window.innerHeight - 40)
                    }));
                }
            }
            
            window.addEventListener('resize', handleWindowResize);
            
            return () => {
                window.removeEventListener('resize', handleWindowResize);
            };
        }, [size]);
        
        // 开始拖拽
        function handleDragStart(e) {
            if (e.target.closest('.window-controls')) return; // 排除控制按钮区域
            setIsDragging(true);
            setDragOffset({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            });
        }
        
        // 开始调整大小
        function handleResizeStart(e) {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
        }
        
        // 处理关闭窗口
        function handleClose() {
            // 关闭窗口时删除 visible 键
            if (window.StorageManager) {
                window.StorageManager.setState('ui.window.visible', null);
            }
            
            if (onClose) {
                onClose();
            }
        }
        
        // 处理发送消息
        async function handleSend() {
            if (!inputValue.trim() || isProcessing) return;
            
            const message = inputValue;
            setInputValue('');
            await sendMessage(message);
        }
        
        // 处理键盘事件
        function handleKeyDown(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        }
        
        // 渲染消息列表
        function renderMessages() {
            if (messages.length === 0) {
                return React.createElement('div', {
                    key: 'empty',
                    style: {
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: '#999'
                    }
                }, [
                    React.createElement('div', { key: 'icon', style: { fontSize: '48px', marginBottom: '10px' } }, '💬'),
                    React.createElement('p', { key: 'text' }, '开始对话吧！')
                ]);
            }
            
            return messages.map(message => 
                React.createElement(window.MessageItem, {
                    key: message.id,
                    message: message
                })
            );
        }
        
        // 主渲染
        // 如果 isOpen 为 false，返回 null
        if (!isOpen) return null;
        
        return React.createElement('div', { 
            key: 'window',
            ref: windowRef,
            className: 'chat-window',
            style: {
                position: 'fixed',
                left: position.x + 'px',
                top: position.y + 'px',
                width: size.width + 'px',
                height: size.height + 'px',
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                zIndex: 999998
            }
        }, [
                // Header (可拖拽)
                React.createElement('div', { 
                    key: 'header',
                    onMouseDown: handleDragStart,
                    style: {
                        padding: '15px 20px',
                        borderBottom: '1px solid #eee',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'move',
                        userSelect: 'none',
                        background: '#f8f9fa'
                    }
                }, [
                    React.createElement('h2', { 
                        key: 'title',
                        style: { margin: 0, fontSize: '18px' }
                    }, '🤖 AI Agent'),
                    
                    // 模型选择框
                    React.createElement('select', {
                        key: 'model-select',
                        value: currentModel,
                        onChange: (e) => switchModel(e.target.value),
                        disabled: isProcessing,
                        style: {
                            padding: '6px 12px',
                            fontSize: '13px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            background: 'white',
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            opacity: isProcessing ? 0.6 : 1,
                            maxWidth: '200px'
                        }
                    }, [
                        availableModels.map(model => 
                            React.createElement('option', {
                                key: model.id,
                                value: model.id
                            }, model.name)
                        )
                    ]),
                    
                    React.createElement('div', { 
                        key: 'actions', 
                        className: 'window-controls',
                        style: { display: 'flex', gap: '10px' } 
                    }, [
                        React.createElement('button', {
                            key: 'settings',
                            onClick: onOpenSettings,
                            style: {
                                padding: '6px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                background: '#f0f0f0',
                                border: 'none',
                                borderRadius: '4px'
                            }
                        }, '⚙️ 设置'),
                        React.createElement('button', {
                            key: 'clear',
                            onClick: clearChat,
                            style: {
                                padding: '6px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                background: '#f0f0f0',
                                border: 'none',
                                borderRadius: '4px'
                            }
                        }, '🗑️ 清空'),
                        React.createElement('button', {
                            key: 'close',
                            onClick: handleClose,
                            style: {
                                padding: '6px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                background: '#f0f0f0',
                                border: 'none',
                                borderRadius: '4px'
                            }
                        }, '✕')
                    ])
                ]),
                
                // Messages Area
                React.createElement('div', {
                    key: 'messages',
                    style: {
                        flex: 1,
                        overflow: 'auto',
                        padding: '20px'
                    }
                }, [
                    renderMessages(),
                    React.createElement('div', { key: 'end', ref: messagesEndRef })
                ]),
                
                // Input Area
                React.createElement('div', {
                    key: 'input',
                    style: {
                        padding: '15px 20px',
                        borderTop: '1px solid #eee',
                        display: 'flex',
                        gap: '10px'
                    }
                }, [
                    React.createElement('textarea', {
                        key: 'textarea',
                        value: inputValue,
                        onChange: (e) => setInputValue(e.target.value),
                        onKeyDown: handleKeyDown,
                        placeholder: '输入消息... (Shift+Enter 换行)',
                        disabled: isProcessing,
                        style: {
                            flex: 1,
                            padding: '10px',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            resize: 'none',
                            minHeight: '40px',
                            maxHeight: '120px',
                            fontFamily: 'inherit'
                        }
                    }),
                    React.createElement('button', {
                        key: 'send',
                        onClick: handleSend,
                        disabled: !inputValue.trim() || isProcessing,
                        style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: (!inputValue.trim() || isProcessing) ? 'not-allowed' : 'pointer',
                            background: (!inputValue.trim() || isProcessing) ? '#ccc' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            minWidth: '80px'
                        }
                    }, isProcessing ? '⏳ 生成中...' : '📤 发送'),
                    isProcessing && React.createElement('button', {
                        key: 'stop',
                        onClick: stopGeneration,
                        style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px'
                        }
                    }, '⏹ 停止')
                ]),
                
                // Resize Handle
                React.createElement('div', {
                    key: 'resize',
                    onMouseDown: handleResizeStart,
                    style: {
                        position: 'absolute',
                        right: 0,
                        bottom: 0,
                        width: '20px',
                        height: '20px',
                        cursor: 'nwse-resize',
                        background: 'linear-gradient(135deg, transparent 50%, #999 50%)'
                    }
                })
            ]);
    }
    
    // 暴露到全局
    window.ChatWindow = ChatWindow;
    
})();
