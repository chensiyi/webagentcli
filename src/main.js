// ==================== 主入口模块 ====================

(function() {
    'use strict';

    /**
     * 初始化应用
     */
    async function init() {
        console.log('🚀 OpenRouter AI Agent 正在启动...');
        
        try {
            // 1. 初始化工作空间管理器
            StorageManager.init();
            console.log('✅ 工作空间已加载');
            
            // 2. 初始化配置
            const config = ConfigManager.init();
            console.log('✅ 配置已加载');
            
            // 3. 创建 UI
            UIManager.createAssistant(config);
            console.log('✅ UI 已创建');
            
            // 4. 显示欢迎消息
            ChatManager.showWelcomeMessage();
            console.log('✅ 欢迎消息已显示');
            
            // 5. 设置事件监听
            setupEventListeners();
            console.log('✅ 事件监听已设置');
            
            console.log('🎉 OpenRouter AI Agent 启动成功!');
            
        } catch (error) {
            console.error('❌ 启动失败:', error);
        }
    }

    /**
     * 设置全局事件监听
     */
    function setupEventListeners() {
        // 发送消息事件
        window.addEventListener('agent-message-sent', async (e) => {
            const message = e.detail;
            await handleUserMessage(message);
        });

        // 打开设置事件
        window.addEventListener('agent-open-settings', () => {
            SettingsManager.showSettings();
        });

        // 清空聊天事件
        window.addEventListener('agent-clear-chat', () => {
            ChatManager.clearChat();
        });

        // 执行代码事件 (来自代码块按钮)
        window.addEventListener('agent-execute-code', (e) => {
            const code = e.detail;
            ChatManager.executeJavaScript(code);
        });
    }

    /**
     * 处理用户消息
     */
    async function handleUserMessage(message) {
        const config = ConfigManager.getAll();
        
        // 检查 API Key
        if (!config.apiKey) {
            UIManager.appendMessage(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #ef4444;">
                        ⚠️ 请先在设置中配置 OpenRouter API Key<br><br>
                        💡 获取免费 API Key: <a href="https://openrouter.ai/keys" target="_blank">https://openrouter.ai/keys</a>
                    </div>
                </div>
            `);
            return;
        }

        // 添加用户消息到界面
        ChatManager.addUserMessage(message);
        
        // 处理快捷命令
        const result = await ChatManager.handleMessage(message, config);
        
        // 如果不是命令,调用 API
        if (result.type === 'chat') {
            await callAPIAndRespond(message, config);
        }
    }

    /**
     * 调用 API 并显示回复
     */
    async function callAPIAndRespond(userMessage, config) {
        // 显示打字指示器
        UIManager.showTypingIndicator();
        UIManager.updateSendButtonState(true);
        
        try {
            const history = ConfigManager.get('conversationHistory');
            const response = await APIManager.callAPI(userMessage, history, config);
            
            // 隐藏打字指示器
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false);
            
            if (response.success) {
                ChatManager.addAssistantMessage(response.message);
            } else {
                showError(response.error);
            }
            
        } catch (error) {
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false);
            showError(error.message);
        }
    }

    /**
     * 显示错误信息
     */
    function showError(errorMessage) {
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #ef4444;">
                    ❌ 请求失败: ${escapeHtml(errorMessage)}<br><br>
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
     * HTML 转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
