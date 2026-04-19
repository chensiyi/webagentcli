// ==================== 主入口模块 (v5.0 重构版) ====================
// Main Layer (程序启动层) - "园区建设"
// 职责：初始化模块、设置监听、暴露接口
// 注意：不包含业务逻辑，只负责"启动"和"接线"

(function() {
    'use strict';
    
    // 记录启动时间
    const startTime = Date.now();
    
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
        
        console.log('[Main] 🚀 AI Agent v5.1 正在启动...');
        console.log('[Main] 📅 时间:', new Date().toISOString());
        
        try {
            // 1. 初始化核心工具层
            console.log('[Main] 🔧 步骤 1/6: 初始化核心工具层...');
            await initCoreUtilities();
            console.log('[Main] ✅ 核心工具层已初始化');
            
            // 2. 初始化服务层
            console.log('[Main] 🔧 步骤 2/6: 初始化服务层...');
            await initServices();
            console.log('[Main] ✅ 服务层已初始化');
            
            // 3. 初始化基础设施层
            console.log('[Main] 🔧 步骤 3/6: 初始化基础设施层...');
            await initInfrastructure();
            console.log('[Main] ✅ 基础设施层已初始化');
            
            // 4. 启动业务逻辑层（园区工厂）
            console.log('[Main] 🔧 步骤 4/6: 启动业务逻辑层...');
            await initBusinessLayer();
            console.log('[Main] ✅ 业务逻辑层已启动');
            
            // 5. 初始化全局快捷键
            console.log('[Main] 🔧 步骤 5/6: 初始化全局快捷键...');
            initGlobalShortcuts();
            console.log('[Main] ✅ 全局快捷键已初始化');
            
            // 6. 暴露全局调试接口
            console.log('[Main] 🔧 步骤 6/6: 暴露全局调试接口...');
            exposeDebugInterface();
            console.log('[Main] ✅ 调试接口已暴露');
            
            console.log('[Main] 🎉 AI Agent v5.1 启动成功!');
            
            // P0: 设置全局初始化完成标志
            window.__AGENT_INITIALIZED__ = true;
            console.log('[Main] ✅ 初始化完成标志已设置');
            console.log('[Main] 📊 总耗时:', Date.now() - startTime, 'ms');
            
        } catch (error) {
            console.error('[Main] ❌ 启动失败:', error);
            console.error('[Main] 📋 错误堆栈:', error.stack);
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
        
        // ProviderManager
        await ProviderManager.init();
        
        // ModelManager
        await ModelManager.init();
    }
    
    /**
     * 初始化基础设施层
     * 注意: AIAgent 由 WebAgentClient 统一初始化,这里只确保依赖模块就绪
     */
    async function initInfrastructure() {
        // 基础设施层模块已在服务层初始化
        // AIAgent 将在 WebAgentClient.init() 中初始化
        console.log('[Main] ℹ️ AIAgent 将由 WebAgentClient 初始化');
    }
    
    /**
     * 初始化业务逻辑层（园区工厂）
     */
    async function initBusinessLayer() {
        // WebAgentClient - 业务编排器
        await WebAgentClient.init();
    }
    
    /**
     * 初始化全局快捷键（Alt+A / Ctrl+Shift+A）
     */
    function initGlobalShortcuts() {
        console.log('[Main] ⌨️ 注册全局快捷键...');
        
        function handleKeyDown(e) {
            // Alt+A: 打开/关闭聊天窗口
            if (e.altKey && e.key.toLowerCase() === 'a') {
                toggleChatWindow();
                e.preventDefault();
                return;
            }
            
            // Ctrl+Shift+A: 打开/关闭聊天窗口（备选）
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
                toggleChatWindow();
                e.preventDefault();
                return;
            }
        }
        
        window.addEventListener('keydown', handleKeyDown);
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
