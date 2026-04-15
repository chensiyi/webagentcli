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
            // 先检查代码是否有明显的语法错误
            new Function(code);
            
            // 执行代码
            const result = unsafeWindow.eval(code);
            
            const resultStr = typeof result === 'object' 
                ? JSON.stringify(result, null, 2) 
                : String(result);
            
            // 直接插入到聊天区域，不使用 addAssistantMessage（避免二次格式化）
            UIManager.appendMessage(`
                <div class="assistant-message">
                    <div class="execution-result execution-success">
                        <strong>✅ 执行成功</strong>
                        <br>
                        <pre style="margin-top: 8px; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(resultStr)}</pre>
                    </div>
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
            // 分析错误类型
            let errorType = '未知错误';
            let suggestion = '';
            
            if (error instanceof SyntaxError) {
                errorType = '语法错误';
                suggestion = '<br><br>💡 <strong>建议:</strong> 请让 AI 重新生成代码,并检查:<br>• 字符串是否使用了正确的引号<br>• 模板字符串是否使用了反引号 (`)<br>• 括号是否匹配';
            } else if (error instanceof ReferenceError) {
                errorType = '引用错误';
                suggestion = '<br><br>💡 <strong>建议:</strong> 变量或函数未定义,请检查代码中的变量名是否正确';
            } else if (error instanceof TypeError) {
                errorType = '类型错误';
                suggestion = '<br><br>💡 <strong>建议:</strong> 调用了不存在的方法或属性,请检查对象是否存在';
            }
            
            UIManager.appendMessage(`
                <div class="execution-result execution-error">
                    <strong>❌ 执行失败 (${errorType})</strong>
                    <br>
                    <pre style="margin-top: 8px;">${escapeHtml(error.toString())}</pre>
                    ${suggestion}
                </div>
            `);
            
            console.error('❌ 代码执行失败:', error);
            console.log('📝 尝试执行的代码:', code);
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
     * 全局代码块存储（避免 HTML 转义问题）
     */
    const codeBlockStore = {};
    let codeBlockIndex = 0;
    
    /**
     * 获取存储的代码（供 UI 模块调用）
     */
    function getCodeFromStore(blockId) {
        return codeBlockStore[blockId] || '';
    }

    /**
     * 格式化消息(支持代码块)
     */
    function formatMessage(text) {
        // 先处理代码块,避免被转义
        let formatted = text;
        
        // 处理代码块 - 先提取代码块并标记占位符
        const codeBlocks = [];
        formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const index = codeBlocks.length;
            codeBlocks.push({ lang: lang || 'text', code: code.trim() });
            return `__CODE_BLOCK_${index}__`;
        });
        
        // 转义普通文本
        formatted = escapeHtml(formatted);
        
        // 恢复代码块 - 同时存储到全局和 HTML 中
        formatted = formatted.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
            const block = codeBlocks[parseInt(index)];
            
            // 生成唯一 ID 并存储到全局（用于执行/复制）
            const blockId = 'code_' + Date.now() + '_' + (++codeBlockIndex);
            codeBlockStore[blockId] = block.code;
            
            const isJs = block.lang === 'javascript' || block.lang === 'js';
            
            // 对代码进行 HTML 转义用于显示
            const safeCode = escapeHtml(block.code);
            
            // HTML 中显示代码（用于视觉展示）
            return [
                `<div class="code-block" data-code-id="${blockId}" data-lang="${block.lang}">`,
                `<div class="code-language">${block.lang}</div>`,
                `<pre>${safeCode}</pre>`,
                `</div>`,
                `<div class="code-actions">`,
                isJs ? '<button class="code-btn execute" data-action="execute-code">▶ 执行代码</button>' : '',
                '<button class="code-btn" data-action="copy-code">📋 复制</button>',
                `</div>`
            ].join('');
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
     * 渲染历史记录到界面
     */
    function renderHistory(history) {
        const chat = document.getElementById('agent-chat');
        if (!chat) return;
        
        // 清空当前聊天区域（保留欢迎语逻辑）
        chat.innerHTML = '';
        
        history.forEach(msg => {
            if (msg.role === 'user') {
                addUserMessage(msg.content);
            } else if (msg.role === 'assistant') {
                addAssistantMessage(msg.content);
            }
        });
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
        renderHistory,  // 新增
        executeJavaScript,
        getCodeFromStore
    };
})();
