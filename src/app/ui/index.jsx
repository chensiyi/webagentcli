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
        
        // 从 StorageManager 加载窗口可见性状态（默认隐藏）
        const getInitialChatState = () => {
            if (window.StorageManager) {
                const savedVisible = window.StorageManager.getState('ui.window.visible');
                return savedVisible === true;  // 只有明确保存为 true 才显示
            }
            return false;  // 默认隐藏
        };
        
        const [isChatOpen, setIsChatOpen] = React.useState(getInitialChatState());
        
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
                            window.StorageManager.setState('ui.window.visible', true);
                        } else {
                            // 关闭窗口：删除 visible 键
                            window.StorageManager.setState('ui.window.visible', null);
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
    
    // 页面加载完成后挂载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountApp);
    } else {
        mountApp();
    }
    
})();
