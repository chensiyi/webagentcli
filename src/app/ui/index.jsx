// ==================== React UI 根组件 ====================
// v5.0: React 入口点
// 注意：需要先加载 React 库文件

(function() {
    'use strict';
    
    console.log('[React UI] 🚀 React UI 模块已加载');
    
    // 检查 React 是否可用
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
        console.error('[React UI] ❌ React 或 ReactDOM 未加载');
        return;
    }
    
    console.log('[React UI] ✅ React 版本:', React.version);
    
    /**
     * App 主组件
     */
    function App() {
        const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
        
        // P0: 高危代码确认对话框状态
        const [codeConfirm, setCodeConfirm] = React.useState({
            isOpen: false,
            code: '',
            riskType: '',
            resolve: null,
            reject: null
        });
        
        // 从 StorageManager 加载窗口可见性状态（默认隐藏）
        const getInitialChatState = () => {
            if (window.StorageManager) {
                const savedVisible = window.StorageManager.getState('ui.visible');
                return savedVisible === true;  // 只有明确保存为 true 才显示
            }
            return false;  // 默认隐藏
        };
        
        const [isChatOpen, setIsChatOpen] = React.useState(getInitialChatState());
        
        // P0: 监听高危代码确认事件
        React.useEffect(() => {
            if (!EventManager || !window.CodeConfirmDialog) return;
            
            const confirmationId = EventManager.on(
                EventManager.EventTypes.CODE_CONFIRMATION_REQUIRED,
                (data) => {
                    setCodeConfirm({
                        isOpen: true,
                        code: data.code,
                        riskType: data.riskType,
                        resolve: data.resolve,
                        reject: data.reject
                    });
                }
            );
            
            return () => {
                EventManager.off(EventManager.EventTypes.CODE_CONFIRMATION_REQUIRED, confirmationId);
            };
        }, []);
        
        // 监听快捷键切换窗口事件
        React.useEffect(() => {
            if (!window.EventManager) return;
            
            const handler = () => {
                setIsChatOpen(prev => {
                    const newState = !prev;
                    // 同步到 StorageManager
                    if (window.StorageManager) {
                        if (newState) {
                            window.StorageManager.setState('ui.visible', true);
                        } else {
                            window.StorageManager.setState('ui.visible', null);
                        }
                    }
                    return newState;
                });
            };
            
            window.EventManager.on('TOGGLE_CHAT_WINDOW', handler);
            return () => window.EventManager.off('TOGGLE_CHAT_WINDOW', handler);
        }, []);

        // P0: 处理确认
        function handleCodeConfirm() {
            if (codeConfirm.resolve) {
                codeConfirm.resolve();
            }
            setCodeConfirm({ isOpen: false, code: '', riskType: '', resolve: null, reject: null });
        }
        
        // P0: 处理取消
        function handleCodeCancel() {
            if (codeConfirm.reject) {
                codeConfirm.reject(new Error('用户取消了高危代码执行'));
            }
            setCodeConfirm({ isOpen: false, code: '', riskType: '', resolve: null, reject: null });
        }
        
        return React.createElement('div', null, [
            // 机器人图标按钮（切换聊天窗口）
            !isChatOpen ? React.createElement('button', {
                key: 'robot-toggle',
                onClick: () => {
                    const newState = !isChatOpen;
                    setIsChatOpen(newState);
                    
                    // 只在打开时保存可见性状态，关闭时删除
                    if (window.StorageManager) {
                        if (newState) {
                            // 打开窗口：保存 visible = true
                            window.StorageManager.setState('ui.visible', true);
                        } else {
                            // 关闭窗口：删除 visible 键
                            window.StorageManager.setState('ui.visible', null);
                        }
                    }
                },
                style: {
                    position: 'fixed',
                    bottom: '30px',
                    right: '30px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: '#2196F3',
                    color: 'white',
                    border: 'none',
                    fontSize: '28px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 999997,
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }
            }, '') : null,
            
            // 聊天窗口
            window.ChatWindow ? React.createElement(window.ChatWindow, {
                key: 'chat',
                isOpen: isChatOpen,
                onClose: () => setIsChatOpen(false),
                onOpenSettings: () => setIsSettingsOpen(true)
            }) : null,
            
            // 设置对话框
            window.SettingsDialog ? React.createElement(window.SettingsDialog, {
                key: 'settings',
                isOpen: isSettingsOpen,
                onClose: () => setIsSettingsOpen(false)
            }) : null,
            
            // P0: 高危代码确认对话框
            window.CodeConfirmDialog ? React.createElement(window.CodeConfirmDialog, {
                key: 'code-confirm',
                isOpen: codeConfirm.isOpen,
                code: codeConfirm.code,
                riskType: codeConfirm.riskType,
                onConfirm: handleCodeConfirm,
                onCancel: handleCodeCancel
            }) : null
        ]);
    }
    
    /**
     * 挂载 React 应用
     */
    function mountApp() {
        // 检查是否已经挂载
        const existingContainer = document.getElementById('react-app-container');
        if (existingContainer) {
            console.log('[React UI] ⚠️ 应用已挂载，跳过');
            return;
        }
        
        // 创建容器（不需要定位，因为子元素都是 fixed）
        const container = document.createElement('div');
        container.id = 'react-app-container';
        document.body.appendChild(container);
        
        // 创建 React 根
        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(App));
        
        console.log('[React UI] ✅ React 应用已挂载');
    }
    
    // P0: 等待初始化完成后挂载（轮询检查，不使用事件）
    const waitForInitialization = () => {
        console.log('[React UI] 🔍 检查初始化状态...');
        
        // 检查是否已经初始化完成
        if (window.__AGENT_INITIALIZED__) {
            console.log('[React UI] ✅ 检测到初始化完成，开始挂载');
            mountApp();
            return;
        }
        
        // 未初始化，100ms 后重试
        console.log('[React UI] ⏳ 等待初始化完成...');
        setTimeout(waitForInitialization, 100);
    };
    
    // 页面加载完成后开始等待
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[React UI] 📄 DOMContentLoaded，开始等待初始化');
            waitForInitialization();
        });
    } else {
        console.log('[React UI] 📄 DOM 已就绪，开始等待初始化');
        waitForInitialization();
    }
    
})();
