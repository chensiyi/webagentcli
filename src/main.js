// ==================== 主入口模块 ====================

(function() {
    'use strict';

    /**
     * 初始化应用
     */
    async function init() {
        console.log('🚀 AI Agent 正在启动...');
        
        try {
            // 1. 初始化工作空间管理器
            await StorageManager.init();
            console.log('✅ 工作空间已加载');
            
            // 2. 初始化配置 (必须 await，因为 init 是 async)
            const config = await ConfigManager.init();
            console.log('✅ 配置已加载:', config);
            
            // 3. 基于域名加载会话历史
            const history = ConfigManager.loadConversationHistory();
            console.log(`✅ 已加载 ${history.length} 条对话历史`);
            
            // 4. 创建 UI
            UIManager.createAssistant(config);
            console.log('✅ UI 已创建');
            
            // 5. 根据域名恢复聊天窗口显示状态
            const isVisible = ConfigManager.getChatVisibility();
            if (!isVisible) {
                UIManager.hide();
                console.log('👁️ 聊天窗口已隐藏（根据上次状态）');
            } else {
                // 6. 显示欢迎消息（如果窗口可见且有历史记录，则不显示欢迎消息）
                if (history.length === 0) {
                    ChatManager.showWelcomeMessage();
                    console.log('✅ 欢迎消息已显示');
                } else {
                    console.log('💬 已有对话历史，跳过欢迎消息');
                }
            }
            
            // 7. 设置事件监听
            setupEventListeners();
            console.log('✅ 事件监听已设置');
            
            console.log('🎉 AI Agent 启动成功!');
            
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
                        ⚠️ 请先在设置中配置 API Key<br><br>
                        💡 获取免费 API Key: <a href="https://openrouter.ai/keys" target="_blank">点击获取</a>
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
                // 触发打开 Agent 的事件
                window.dispatchEvent(new CustomEvent('open-ai-agent'));
                
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
            window.addEventListener('agent-closed', () => {
                badge.style.display = 'flex';
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(1)';
                badge.style.opacity = '1';
            }, { once: false });
            
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
