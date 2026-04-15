// ==================== 主入口模块 (重构版) ====================
// 使用模块化架构，降低耦合度

(function() {
    'use strict';
    
    // 模块管理器引用
    let moduleManager = null;
    let eventManager = null;
    
    /**
     * 初始化应用
     */
    async function init() {
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
            eventManager?.emit(eventManager.EventTypes.APP_ERROR, { error });
        }
    }
    
    /**
     * 初始化核心模块
     */
    async function initCoreModules() {
        // 注册和初始化模块管理器
        ModuleManager.registerModule('ModuleManager', ModuleManager);
        
        // 初始化事件管理器
        eventManager = EventManager;
        ModuleManager.registerModule('EventManager', eventManager);
        
        // 初始化配置管理器（带依赖注入）
        const configManager = ConfigManager;
        await configManager.init({
            eventManager: eventManager,
            // storageManager 将在业务模块中注入
        });
        ModuleManager.registerModule('ConfigManager', configManager);
        
        console.log('✅ 核心模块加载完成');
    }
    
    /**
     * 初始化业务模块
     */
    async function initBusinessModules() {
        const configManager = ModuleManager.getModule('ConfigManager');
        const config = configManager.getAll();
        
        // 注意：这里使用旧的模块名称保持兼容性
        // 实际项目中会重构这些模块
        
        // 注册其他业务模块
        ModuleManager.registerModule('UIManager', UIManager);
        ModuleManager.registerModule('ChatManager', ChatManager);
        ModuleManager.registerModule('APIManager', APIManager);
        ModuleManager.registerModule('StorageManager', StorageManager);
        ModuleManager.registerModule('SettingsManager', SettingsManager);
        ModuleManager.registerModule('ModelManager', ModelManager);
        ModuleManager.registerModule('Utils', Utils);
        
        // 初始化各模块（简化版，实际需重构各模块的init方法）
        try {
            // 初始化UI
            UIManager.createAssistant(config);
            console.log('✅ UI 已创建');
            
            // 检查聊天窗口状态
            const isVisible = configManager.getChatVisibility();
            if (!isVisible) {
                UIManager.hide();
                console.log('👁️ 聊天窗口已隐藏（根据上次状态）');
            }
            
            // 显示欢迎消息
            const history = configManager.getConversationHistory();
            if (history.length === 0 && isVisible) {
                ChatManager.showWelcomeMessage();
                console.log('✅ 欢迎消息已显示');
            }
            
        } catch (error) {
            console.error('❌ 业务模块初始化失败:', error);
            throw error;
        }
    }

    /**
     * 设置全局事件监听（使用新的事件系统）
     */
    function setupEventListeners() {
        // 使用新的事件管理器
        const { EventTypes } = eventManager;
        
        // 聊天消息发送事件
        eventManager.on(EventTypes.CHAT_MESSAGE_SENT, async (message) => {
            await handleUserMessage(message);
        });
        
        // 打开设置事件
        eventManager.on(EventTypes.SETTINGS_OPEN, () => {
            ModuleManager.getModule('SettingsManager')?.showSettings?.();
        });
        
        // 清空聊天事件
        eventManager.on(EventTypes.CHAT_CLEAR, () => {
            ModuleManager.getModule('ChatManager')?.clearChat?.();
        });
        
        // 执行代码事件
        eventManager.on('agent-execute-code', (code) => {
            ModuleManager.getModule('ChatManager')?.executeJavaScript?.(code);
        });
        
        // 兼容旧事件（逐步迁移）
        window.addEventListener('agent-message-sent', async (e) => {
            eventManager.emit(EventTypes.CHAT_MESSAGE_SENT, e.detail);
        });
        
        window.addEventListener('agent-open-settings', () => {
            eventManager.emit(EventTypes.SETTINGS_OPEN);
        });
        
        window.addEventListener('agent-clear-chat', () => {
            eventManager.emit(EventTypes.CHAT_CLEAR);
        });
        
        window.addEventListener('agent-execute-code', (e) => {
            eventManager.emit('agent-execute-code', e.detail);
        });
        
        console.log('🔌 事件监听器已设置');
    }

    /**
     * 启动应用逻辑
     */
    function startApplication() {
        const configManager = ModuleManager.getModule('ConfigManager');
        const config = configManager.getAll();
        
        // 触发应用启动事件
        eventManager.emit(eventManager.EventTypes.APP_STARTED, {
            config: configManager.exportConfig(),
            timestamp: Date.now()
        });
        
        console.log('🎯 应用已启动，等待用户交互...');
    }
    
    /**
     * 处理用户消息（使用模块化架构）
     */
    async function handleUserMessage(message) {
        const configManager = ModuleManager.getModule('ConfigManager');
        const uiManager = ModuleManager.getModule('UIManager');
        const chatManager = ModuleManager.getModule('ChatManager');
        const config = configManager.getAll();
        
        // 检查 API Key
        if (!config.apiKey) {
            uiManager.appendMessage(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #ef4444;">
                        ⚠️ 请先在设置中配置 API Key<br><br>
                        💡 获取免费 API Key: <a href="https://openrouter.ai/keys" target="_blank">点击获取</a>
                    </div>
                </div>
            `);
            return;
        }

        // 触发 API 调用开始事件
        eventManager.emit(eventManager.EventTypes.API_CALL_START, { message });
        
        try {
            // 添加用户消息到界面
            chatManager.addUserMessage(message);
            
            // 处理快捷命令
            const result = await chatManager.handleMessage(message, config);
            
            // 如果不是命令,调用 API
            if (result.type === 'chat') {
                await callAPIAndRespond(message, config);
            }
        } catch (error) {
            console.error('消息处理失败:', error);
            eventManager.emit(eventManager.EventTypes.APP_ERROR, { 
                context: 'handleUserMessage',
                error 
            });
        }
    }

    /**
     * 调用 API 并显示回复（使用模块化架构）
     */
    async function callAPIAndRespond(userMessage, config) {
        const uiManager = ModuleManager.getModule('UIManager');
        const apiManager = ModuleManager.getModule('APIManager');
        const chatManager = ModuleManager.getModule('ChatManager');
        const configManager = ModuleManager.getModule('ConfigManager');
        
        // 显示打字指示器
        uiManager.showTypingIndicator();
        uiManager.updateSendButtonState(true);
        
        try {
            const history = configManager.getConversationHistory();
            const response = await apiManager.callAPI(userMessage, history, config);
            
            // 隐藏打字指示器
            uiManager.hideTypingIndicator();
            uiManager.updateSendButtonState(false);
            
            if (response.success) {
                chatManager.addAssistantMessage(response.message);
                eventManager.emit(eventManager.EventTypes.API_CALL_SUCCESS, {
                    message: userMessage,
                    response: response.message
                });
            } else {
                showError(response.error);
                eventManager.emit(eventManager.EventTypes.API_CALL_ERROR, {
                    message: userMessage,
                    error: response.error
                });
            }
            
        } catch (error) {
            uiManager.hideTypingIndicator();
            uiManager.updateSendButtonState(false);
            showError(error.message);
            eventManager.emit(eventManager.EventTypes.API_CALL_ERROR, {
                message: userMessage,
                error: error.message
            });
        }
    }

    /**
     * 显示错误信息（使用事件系统）
     */
    function showError(errorMessage) {
        const uiManager = ModuleManager.getModule('UIManager');
        const utils = ModuleManager.getModule('Utils');
        
        uiManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #ef4444;">
                    ❌ 请求失败: ${utils?.escapeHtml?.(errorMessage) || escapeHtml(errorMessage)}<br><br>
                    💡 可能的原因:<br>
                    • API Key 无效或已过期<br>
                    • 网络连接问题<br>
                    • 模型暂时不可用 (尝试切换模型)<br>
                    • 达到速率限制 (稍后重试)
                </div>
            </div>
        `);
    }

    /**
     * HTML 转义（兼容性函数）
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 创建启动按钮
     */
    function createLauncherButton() {
        // 检查是否已存在启动按钮
        if (document.getElementById('agent-launcher-btn')) {
            console.log('🔘 启动按钮已存在，跳过创建');
            return;
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
                // 使用新的事件系统打开 Agent
                eventManager.emit(eventManager.EventTypes.AGENT_OPEN);
                
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
            eventManager.on(eventManager.EventTypes.AGENT_CLOSE, () => {
                badge.style.display = 'flex';
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(1)';
                badge.style.opacity = '1';
            });
            
            console.log('🔘 AI Agent 启动按钮已创建（右下角圆形按钮）');
        }, 1000);
    }

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init();
            // 创建启动按钮
            createLauncherButton();
        });
    } else {
        init();
        // 创建启动按钮
        createLauncherButton();
    }

})();
