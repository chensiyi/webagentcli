// ==================== 聊天逻辑模块 ====================

const ChatManager = (function() {
    /**
     * 处理用户发送的消息
     */
    async function handleMessage(message, config) {
        // 检查快捷命令
        if (message.startsWith('/js ')) {
            const code = message.substring(4);
            executeJavaScript(code);
            return { type: 'command', command: 'js' };
        }
        
        if (message === '/clear') {
            window.dispatchEvent(new CustomEvent('agent-clear-chat'));
            return { type: 'command', command: 'clear' };
        }
        
        if (message === '/help') {
            showHelp();
            return { type: 'command', command: 'help' };
        }

        // 正常对话
        return { type: 'chat', message: message };
    }

    /**
     * 执行 JavaScript 代码
     */
    function executeJavaScript(code) {
        if (!ConfigManager.get('jsExecutionEnabled')) {
            UIManager.appendMessage(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #ef4444;">
                        ⚠️ JavaScript 执行已被禁用,请在设置中启用
                    </div>
                </div>
            `);
            return;
        }

        try {
            const result = unsafeWindow.eval(code);
            
            const resultStr = typeof result === 'object' 
                ? JSON.stringify(result, null, 2) 
                : String(result);
            
            UIManager.appendMessage(`
                <div class="execution-result execution-success">
                    <strong>✅ 执行成功</strong>
                    <br>
                    <pre style="margin-top: 8px;">${escapeHtml(resultStr)}</pre>
                </div>
            `);
            
            // 保存执行记录
            const history = ConfigManager.get('conversationHistory');
            history.push({ 
                role: 'system', 
                content: `[代码执行] ${code}\n结果: ${resultStr}` 
            });
            ConfigManager.saveConversationHistory(history);
            
        } catch (error) {
            UIManager.appendMessage(`
                <div class="execution-result execution-error">
                    <strong>❌ 执行失败</strong>
                    <br>
                    <pre style="margin-top: 8px;">${escapeHtml(error.toString())}</pre>
                </div>
            `);
        }
    }

    /**
     * 显示帮助信息
     */
    function showHelp() {
        const helpText = `
<strong>💡 使用帮助</strong>

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行 JavaScript 代码
• <code>/clear</code> - 清空对话历史
• <code>/help</code> - 显示此帮助

<strong>示例:</strong>
• "帮我修改页面背景色为蓝色"
• "/js document.body.style.background = 'blue'"
• "提取页面上所有链接"
• "分析当前页面的结构"

<strong>提示:</strong>
• 按 Enter 发送消息,Shift+Enter 换行
• 可以拖拽标题栏移动窗口
• 点击 − 最小化窗口
• 代码块可以直接执行或复制
        `;
        
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content">${helpText}</div>
            </div>
        `);
    }

    /**
     * 添加用户消息到界面
     */
    function addUserMessage(text) {
        const messageHTML = `
            <div class="user-message">
                <div class="message-content">${escapeHtml(text)}</div>
            </div>
        `;
        UIManager.appendMessage(messageHTML);
        
        // 保存到历史
        const history = ConfigManager.get('conversationHistory');
        history.push({ role: 'user', content: text });
        ConfigManager.saveConversationHistory(history);
    }

    /**
     * 添加助手消息到界面
     */
    function addAssistantMessage(text) {
        const formattedText = formatMessage(text);
        UIManager.appendMessage(formattedText);
        
        // 保存到历史
        const history = ConfigManager.get('conversationHistory');
        history.push({ role: 'assistant', content: text });
        ConfigManager.saveConversationHistory(history);
    }

    /**
     * 格式化消息(支持代码块)
     */
    function formatMessage(text) {
        // 转义 HTML
        let formatted = escapeHtml(text);
        
        // 处理代码块
        formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'text';
            const escapedCode = code.trim();
            
            return `
                <div class="code-block">
                    <div class="code-language">${language}</div>
                    <pre>${escapedCode}</pre>
                </div>
                ${language === 'javascript' || language === 'js' ? `
                    <div class="code-actions">
                        <button class="code-btn execute" data-action="execute-code">▶ 执行代码</button>
                        <button class="code-btn" data-action="copy-code">📋 复制</button>
                    </div>
                ` : `
                    <div class="code-actions">
                        <button class="code-btn" data-action="copy-code">📋 复制</button>
                    </div>
                `}
            `;
        });
        
        // 处理行内代码
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>');
        
        return `
            <div class="assistant-message">
                <div class="message-content">${formatted}</div>
            </div>
        `;
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
     * 清空聊天
     */
    function clearChat() {
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.innerHTML = '';
        }
        ConfigManager.saveConversationHistory([]);
        showWelcomeMessage();
    }

    /**
     * 显示欢迎消息
     */
    function showWelcomeMessage() {
        const config = ConfigManager.getAll();
        const welcomeHTML = `
            <div class="assistant-message">
                <div class="message-content">
                    👋 你好!我是你的 <strong>浏览器 AI 助手</strong>。
                    
<strong>功能特性:</strong>
• 💬 智能对话 - 支持多种免费模型
• 💻 代码执行 - 支持 JavaScript 执行
• 🎯 页面操作 - 可以操作当前页面元素
• 💾 本地存储 - 对话历史自动保存
• 🆓 完全免费 - 无需付费即可使用

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行 JavaScript
• <code>/clear</code> - 清空对话
• <code>/help</code> - 显示帮助

${!config.apiKey ? '<strong style="color: #ef4444;">⚠️ 请先在设置中配置 API Key</strong>' : ''}
                </div>
            </div>
        `;
        UIManager.appendMessage(welcomeHTML);
    }

    return {
        handleMessage,
        addUserMessage,
        addAssistantMessage,
        clearChat,
        showWelcomeMessage,
        executeJavaScript
    };
})();
