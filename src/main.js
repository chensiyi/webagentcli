// ==================== 主入口模块 (重构版) ====================
// 使用模块化架构，降低耦合度

(function() {
    'use strict';
    
    // 标记是否已经初始化
    let isInitialized = false;
    
    /**
     * 初始化应用
     */
    async function init() {
        // 防止重复初始化
        if (isInitialized) {
            console.log('⚠️ 应用已初始化，跳过');
            return;
        }
        isInitialized = true;
        
        console.log('🚀 AI Agent 正在启动...');
        
        try {
            // 1. 初始化核心模块
            await initCoreModules();
            console.log('✅ 核心模块已初始化');
            
            // 2. 初始化业务模块
            await initBusinessModules();
            console.log('✅ 业务模块已初始化');
            
            // 3. 设置事件监听
            setupEventListeners();
            console.log('✅ 事件监听已设置');
            
            // 4. 创建启动按钮
            createLauncherButton();
            console.log('✅ 启动按钮已创建');
            
            // 5. 启动应用
            startApplication();
            console.log('🎉 AI Agent 启动成功!');
            
        } catch (error) {
            console.error('❌ 启动失败:', error);
            EventManager?.emit(EventManager.EventTypes.APP_ERROR, { error });
        }
    }
    
    /**
     * 初始化核心模块
     */
    async function initCoreModules() {
        // 初始化配置管理器（带依赖注入）
        await ConfigManager.init({
            eventManager: EventManager
        });
        
        // 初始化历史管理器
        await HistoryManager.init();
        
        // 初始化状态管理器
        await StateManager.init();
        
        console.log('✅ 核心模块加载完成');
    }
    
    /**
     * 初始化业务模块
     */
    async function initBusinessModules() {
        const config = ConfigManager.getAll();
        
        // 初始化各模块
        try {
            // 先加载对话历史，判断是否首次使用
            const history = HistoryManager.getHistory();
            const isFirstUse = history.length === 0;
            
            // 检查聊天窗口状态
            const cachedVisibility = StateManager.getChatVisibility();
            
            // 初始化UI
            UIManager.createAssistant(config);
            
            // 根据状态显示/隐藏聊天窗口
            // 默认隐藏，需要用户点击按钮唤醒
            if (cachedVisibility) {
                // 状态为打开：显示 + 加载历史
                UIManager.show();
                ChatManager.renderHistory(history);
            } else {
                // 默认隐藏（包括首次使用）
                UIManager.hide();
            }
            
        } catch (error) {
            console.error('❌ 业务模块初始化失败:', error);
            throw error;
        }
    }

    /**
     * 设置全局事件监听（简化版）
     * @returns {Array<number>} 监听器 ID 列表
     */
    function setupEventListeners() {
        const { EventTypes } = EventManager;
        const listenerIds = [];
        
        // 聊天消息发送事件 - 直接调用 ChatManager.handleMessage
        listenerIds.push(
            EventManager.on(EventTypes.CHAT_MESSAGE_SENT, async (message) => {
                await ChatManager.handleMessage(message);
            })
        );
        
        // 打开设置事件
        listenerIds.push(
            EventManager.on(EventTypes.SETTINGS_OPEN, () => {
                UIManager.showSettings();
            })
        );
        
        // 清空聊天事件
        listenerIds.push(
            EventManager.on(EventTypes.CHAT_CLEAR, () => {
                ChatManager.clearChat();
            })
        );
        
        // 执行代码事件
        listenerIds.push(
            EventManager.on('agent:execute:code', (code) => {
                ChatManager.executeJavaScript(code);
            })
        );
        
        // 停止请求事件
        listenerIds.push(
            EventManager.on('agent:stop:request', () => {
                ChatManager.stopCurrentRequest();
            })
        );
        
        // 打开/关闭 Agent 窗口事件
        listenerIds.push(
            EventManager.on(EventTypes.AGENT_OPEN, async () => {
                UIManager.show();
                StateManager.saveChatVisibility(true);
                
                // 加载历史记录（如果有的话）
                const history = HistoryManager.getHistory();
                if (history.length > 0) {
                    ChatManager.renderHistory(history);
                }
            })
        );
        
        listenerIds.push(
            EventManager.on(EventTypes.AGENT_CLOSE, () => {
                // 注意：UIManager.hide() 已经在 ui.js 中调用过了，这里不需要再次调用
                // 只需要保存状态和记录日志
                StateManager.saveChatVisibility(false);
            })
        );
        
        return listenerIds;
    }

    /**
     * 启动应用逻辑
     */
    function startApplication() {
        const config = ConfigManager.getAll();
        
        // 触发应用启动事件
        EventManager.emit(EventManager.EventTypes.APP_STARTED, {
            config: ConfigManager.exportConfig(),
            timestamp: Date.now()
        });
        
        console.log('🎯 应用已启动，等待用户交互...');
    }

    /**
     * 创建启动按钮
     * @returns {number|null} 监听器 ID
     */
    function createLauncherButton() {
        // 检查是否已存在启动按钮
        if (document.getElementById('agent-launcher-btn')) {
            console.log('🔘 启动按钮已存在，跳过创建');
            return null;
        }

        setTimeout(() => {
            const badge = document.createElement('div');
            badge.id = 'agent-launcher-btn';
            badge.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 50%;
                font-size: 24px;
                font-family: -apple-system, sans-serif;
                z-index: 999998;
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                border: none;
            `;
            badge.textContent = '🤖';
            badge.title = '点击打开 AI Agent';
            
            // 根据聊天窗口状态决定按钮初始显示状态
            const isChatVisible = StateManager.getChatVisibility();
            if (isChatVisible) {
                badge.style.display = 'none';
            }
            
            // 悬停效果
            badge.addEventListener('mouseenter', () => {
                badge.style.transform = 'scale(1.1)';
                badge.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
            });
            
            badge.addEventListener('mouseleave', () => {
                badge.style.transform = 'scale(1)';
                badge.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)';
            });
            
            badge.addEventListener('click', () => {
                // 使用事件系统打开 Agent
                EventManager.emit(EventManager.EventTypes.AGENT_OPEN);
                
                // 点击后隐藏按钮（Agent 打开后不需要显示）
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(0)';
                badge.style.opacity = '0';
                setTimeout(() => {
                    badge.style.display = 'none';
                }, 300);
            });
            
            document.body.appendChild(badge);
            
            // 监听 Agent 关闭事件，重新显示按钮
            const listenerId = EventManager.on(EventManager.EventTypes.AGENT_CLOSE, () => {
                badge.style.display = 'flex';
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(1)';
                badge.style.opacity = '1';
            });
            
            console.log('🔘 AI Agent 启动按钮已创建（右下角圆形按钮）');
            return listenerId;
        }, 1000);
    }

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init();
        });
    } else {
        // DOM 已经加载完成，直接初始化
        // 使用 setTimeout 确保在下一个事件循环中执行，避免潜在的问题
        setTimeout(() => {
            init();
        }, 0);
    }

})();
