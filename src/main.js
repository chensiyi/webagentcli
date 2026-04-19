// ==================== 主入口模块 (v5.0 重构版) ====================
// Main Layer (程序启动层) - "园区建设"
// 职责：初始化模块、设置监听、暴露接口
// 注意：不包含业务逻辑，只负责"启动"和"接线"

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
            console.warn('[Main] ⚠️ 应用已初始化，跳过');
            return;
        }
        isInitialized = true;
        
        console.log('[Main] 🚀 AI Agent v5.0 正在启动...');
        
        try {
            // 1. 初始化核心工具层
            await initCoreUtilities();
            console.log('[Main] ✅ 核心工具层已初始化');
            
            // 2. 初始化服务层
            await initServices();
            console.log('[Main] ✅ 服务层已初始化');
            
            // 3. 初始化基础设施层
            await initInfrastructure();
            console.log('[Main] ✅ 基础设施层已初始化');
            
            // 4. 启动业务逻辑层（园区工厂）
            await initBusinessLayer();
            console.log('[Main] ✅ 业务逻辑层已启动');
            
            // 5. 设置事件监听（连接 UI 到 Client）
            setupEventListeners();
            console.log('[Main] ✅ 事件监听已设置');
            
            // 6. 初始化快捷键系统
            initShortcuts();
            console.log('[Main] ✅ 快捷键系统已初始化');
            
            // 7. 暴露全局调试接口
            exposeDebugInterface();
            console.log('[Main] ✅ 调试接口已暴露');
            
            console.log('[Main] 🎉 AI Agent v5.0 启动成功!');
            
            // P0: 设置全局初始化完成标志（兜底机制）
            window.__AGENT_INITIALIZED__ = true;
            
            // P0: 触发初始化完成事件，通知 UI 可以挂载
            EventManager.emit('APP_INITIALIZED');
            console.log('[Main] 📢 已发送 APP_INITIALIZED 事件');
            
        } catch (error) {
            console.error('[Main] ❌ 启动失败:', error);
            throw error;
        }
    }
    
    /**
     * 初始化核心工具层
     */
    async function initCoreUtilities() {
        // ErrorTracker 最先初始化
        ErrorTracker.init();
        
        // EventManager 无需初始化
    }
    
    /**
     * 初始化服务层
     */
    async function initServices() {
        // StorageManager 最先初始化（其他模块可能依赖它）
        if (window.StorageManager) {
            window.StorageManager.init();
            console.log('[Main] ✅ StorageManager 已初始化');
        }
        
        // ConfigManager
        await ConfigManager.init({
            eventManager: EventManager
        });
        
        // ProviderManager
        await ProviderManager.init();
        
        // ModelManager
        await ModelManager.init();
    }
    
    /**
     * 初始化基础设施层
     */
    async function initInfrastructure() {
        // AIAgent
        AIAgent.init({
            autoAttachPageContext: true,
            maxHistoryLength: 30,
            defaultModel: ConfigManager.get('model') || 'auto',
            defaultTemperature: ConfigManager.get('temperature') || 0.7,
            defaultMaxTokens: ConfigManager.get('maxTokens') || 4096
        });
    }
    
    /**
     * 初始化业务逻辑层（园区工厂）
     */
    async function initBusinessLayer() {
        // WebAgentClient - 业务编排器
        await WebAgentClient.init();
    }
    
    /**
     * 设置事件监听（连接 UI 事件到 WebAgentClient）
     */
    function setupEventListeners() {
        // 监听用户消息发送事件
        EventManager.on(EventManager.EventTypes.CHAT_MESSAGE_SENT, async (message) => {
            try {
                await WebAgentClient.handleUserMessage(message);
            } catch (error) {
                console.error('[Main] 处理消息失败:', error);
            }
        });
        
        // 监听清空聊天事件
        EventManager.on(EventManager.EventTypes.CHAT_CLEAR, () => {
            WebAgentClient.handleClearChat();
        });
        
        // 监听取消请求事件
        EventManager.on(EventManager.EventTypes.STOP_REQUEST, () => {
            WebAgentClient.handleCancelRequest();
        });
        
        // 监听代码执行事件
        EventManager.on('agent:execute:code', async (data) => {
            try {
                await WebAgentClient.handleCodeExecution(data.code);
            } catch (error) {
                console.error('[Main] 代码执行失败:', error);
            }
        });
    }
    
    /**
     * 初始化快捷键系统
     */
    function initShortcuts() {
        if (typeof ShortcutManager !== 'undefined') {
            ShortcutManager.init();
            
            // 注册全局快捷键
            registerGlobalShortcuts();
        }
    }
    
    /**
     * 注册全局快捷键
     */
    function registerGlobalShortcuts() {
        console.log('[Main] ⌨️ 注册全局快捷键...');
        
        // Ctrl+Shift+A: 打开/关闭聊天窗口（全局）
        ShortcutManager.register('ctrl+shift+a', (e) => {
            toggleChatWindow();
            return false;
        }, '打开/关闭聊天窗口');
        
        // Alt+A: 打开/关闭聊天窗口（备选）
        ShortcutManager.register('alt+a', (e) => {
            toggleChatWindow();
            return false;
        }, '打开/关闭聊天窗口（备选）');
        
        console.log('[Main] ✅ 全局快捷键已注册');
    }
    
    /**
     * 切换聊天窗口显示状态
     */
    function toggleChatWindow() {
        try {
            // 通过 EventManager 发送切换事件
            if (window.EventManager) {
                window.EventManager.emit('TOGGLE_CHAT_WINDOW');
                console.log('[Main] ⌨️ 通过 EventManager 切换聊天窗口');
            } else {
                console.warn('[Main] ⚠️ EventManager 未就绪');
            }
        } catch (error) {
            console.error('[Main] ❌ 切换聊天窗口失败:', error);
        }
    }

    /**
     * 暴露全局调试接口
     */
    function exposeDebugInterface() {
        // P2: 同时暴露到 window 和 unsafeWindow
        if (typeof window !== 'undefined') {
            window.WebAgentClient = WebAgentClient;
            window.AIAgent = AIAgent;
            window.EventManager = EventManager;
            console.log('[Main] ✅ 已暴露到 window');
        }
        
        if (typeof unsafeWindow !== 'undefined') {
            unsafeWindow.WebAgentClient = WebAgentClient;
            unsafeWindow.AIAgent = AIAgent;
            unsafeWindow.EventManager = EventManager;
            console.log('[Main] ✅ 已暴露到 unsafeWindow');
        }
        
        console.log('[Main] 💡 调试接口已暴露:');
        console.log('   - window.WebAgentClient - 业务逻辑层');
        console.log('   - window.AIAgent - 基础设施层');
        console.log('   - window.EventManager - 事件总线');
        console.log('   示例: await window.WebAgentClient.handleUserMessage("你好")');
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
