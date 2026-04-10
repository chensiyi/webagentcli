// ==UserScript==
// @name         OpenRouter Free AI Agent
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  基于 OpenRouter 免费模型的浏览器 AI 助手,支持 JS 执行,完全免费
// @author       OpenRouter Agent
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      openrouter.ai
// @icon         https://openrouter.ai/favicon.ico
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 样式定义 ====================
    GM_addStyle(`
        #gemini-agent {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            height: 550px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            border: 1px solid #e0e0e0;
            transition: all 0.3s ease;
        }
        #gemini-agent.minimized {
            height: 50px;
            overflow: hidden;
        }
        #gemini-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 12px 12px 0 0;
            cursor: move;
        }
        #gemini-title { 
            font-weight: 600; 
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #gemini-controls {
            display: flex;
            gap: 6px;
        }
        .header-btn {
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            transition: background 0.2s;
        }
        .header-btn:hover { background: rgba(255,255,255,0.3); }
        #gemini-chat {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            background: #f5f7fa;
            scroll-behavior: smooth;
        }
        .message { 
            margin: 10px 0;
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .user-message {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 10px 14px;
            border-radius: 16px 16px 6px 16px;
            margin-left: auto;
            max-width: 85%;
            word-wrap: break-word;
        }
        .assistant-message {
            background: white;
            border: 1px solid #e0e0e0;
            padding: 10px 14px;
            border-radius: 16px 16px 16px 6px;
            max-width: 85%;
            word-wrap: break-word;
        }
        .message-content { 
            line-height: 1.5; 
            font-size: 14px;
            white-space: pre-wrap;
        }
        .code-block {
            background: #282c34;
            color: #abb2bf;
            padding: 12px;
            border-radius: 8px;
            margin: 8px 0;
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 12px;
            overflow-x: auto;
            position: relative;
        }
        .code-language {
            position: absolute;
            top: 4px;
            right: 8px;
            font-size: 10px;
            color: #5c6370;
            text-transform: uppercase;
        }
        .code-actions { 
            margin-top: 8px;
            display: flex;
            gap: 6px;
        }
        .code-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .code-btn:hover { 
            background: #5568d3;
            transform: translateY(-1px);
        }
        .code-btn.execute { background: #10b981; }
        .code-btn.execute:hover { background: #059669; }
        #gemini-input-area { 
            border-top: 1px solid #e0e0e0; 
            padding: 12px;
            background: white;
            border-radius: 0 0 12px 12px;
        }
        #gemini-input {
            width: 100%;
            min-height: 60px;
            max-height: 150px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 8px;
            resize: vertical;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.2s;
        }
        #gemini-input:focus { 
            outline: none; 
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        #gemini-controls-bar { 
            display: flex; 
            gap: 8px; 
            margin-top: 10px;
            align-items: center;
        }
        #gemini-send {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }
        #gemini-send:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        #gemini-send:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        .control-btn {
            background: #f5f7fa;
            border: 1px solid #ddd;
            padding: 8px 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }
        .control-btn:hover {
            background: #e8ecf1;
            border-color: #667eea;
        }
        .execution-result {
            margin-top: 10px;
            padding: 10px;
            border-radius: 8px;
            font-family: 'SF Mono', monospace;
            font-size: 12px;
            line-height: 1.5;
        }
        .execution-success { 
            background: #d1fae5; 
            border-left: 4px solid #10b981;
            color: #065f46;
        }
        .execution-error { 
            background: #fee2e2; 
            border-left: 4px solid #ef4444;
            color: #991b1b;
        }
        .typing { 
            display: flex; 
            gap: 4px; 
            padding: 12px;
            align-items: center;
        }
        .typing-dot {
            width: 8px;
            height: 8px;
            background: #667eea;
            border-radius: 50%;
            animation: typing 1.4s infinite ease-in-out;
        }
        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes typing {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
        }
        /* 设置对话框 */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .modal-content {
            background: white;
            padding: 24px;
            border-radius: 12px;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .modal-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #1f2937;
        }
        .form-group {
            margin-bottom: 16px;
        }
        .form-label {
            display: block;
            margin-bottom: 6px;
            font-size: 14px;
            font-weight: 500;
            color: #374151;
        }
        .form-input {
            width: 100%;
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.2s;
        }
        .form-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .form-hint {
            font-size: 12px;
            color: #6b7280;
            margin-top: 4px;
        }
        .modal-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
        }
        .btn-primary {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
        }
        .btn-secondary {
            background: #f3f4f6;
            color: #374151;
            border: 1px solid #d1d5db;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        }
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 48px;
            height: 24px;
        }
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 24px;
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .toggle-slider {
            background-color: #667eea;
        }
        input:checked + .toggle-slider:before {
            transform: translateX(24px);
        }
        .setting-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            margin-left: 8px;
        }
        .status-active {
            background: #d1fae5;
            color: #065f46;
        }
        .status-inactive {
            background: #fee2e2;
            color: #991b1b;
        }
    `);

    // ==================== 配置管理 ====================
    const CONFIG = {
        // OpenRouter API 配置
        apiKey: GM_getValue('openrouter_api_key', ''),
        apiEndpoint: GM_getValue('openrouter_endpoint', 'https://openrouter.ai/api/v1/chat/completions'),
        model: GM_getValue('openrouter_model', 'google/gemma-3-12b-it:free'),
        
        // 对话参数
        temperature: GM_getValue('temperature', 0.7),
        topP: GM_getValue('top_p', 0.95),
        maxTokens: GM_getValue('max_tokens', 2048),
        
        // 功能开关
        jsExecutionEnabled: GM_getValue('js_execution_enabled', true),
        
        // 用户标识
        userId: GM_getValue('user_id', 'openrouter_user_' + Date.now()),
        
        // 对话历史
        conversationHistory: GM_getValue('conversation_history', [])
    };

    // ==================== 全局状态 ====================
    let isProcessing = false;
    let currentAssistant = null;

    // ==================== 核心功能 ====================
    
    /**
     * 创建 AI 助手界面
     */
    function createAssistant() {
        const assistant = document.createElement('div');
        assistant.id = 'gemini-agent';
        assistant.innerHTML = `
            <div id="gemini-header">
                <div id="gemini-title">
                    <span>✨</span>
                    <span>OpenRouter AI</span>
                    ${CONFIG.apiKey ? '<span class="status-badge status-active">已配置</span>' : '<span class="status-badge status-inactive">未配置</span>'}
                </div>
                <div id="gemini-controls">
                    <button class="header-btn" id="gemini-minimize" title="最小化">−</button>
                    <button class="header-btn" id="gemini-close" title="关闭">×</button>
                </div>
            </div>
            <div id="gemini-chat"></div>
            <div id="gemini-input-area">
                <textarea id="gemini-input" placeholder="输入消息...&#10;使用 /js 执行代码,例如: /js alert('Hello')"></textarea>
                <div id="gemini-controls-bar">
                    <button class="control-btn" id="gemini-settings">⚙️ 设置</button>
                    <button class="control-btn" id="gemini-clear">🗑️ 清空</button>
                    <button id="gemini-send">发送 ➤</button>
                </div>
            </div>
        `;
        document.body.appendChild(assistant);
        
        setupEventListeners(assistant);
        addWelcomeMessage();
        
        return assistant;
    }

    /**
     * 设置事件监听
     */
    function setupEventListeners(assistant) {
        const sendBtn = document.getElementById('gemini-send');
        const input = document.getElementById('gemini-input');
        const closeBtn = document.getElementById('gemini-close');
        const minimizeBtn = document.getElementById('gemini-minimize');
        const settingsBtn = document.getElementById('gemini-settings');
        const clearBtn = document.getElementById('gemini-clear');

        // 发送消息
        sendBtn.addEventListener('click', () => sendMessage());
        
        // 回车发送
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // 关闭按钮
        closeBtn.addEventListener('click', () => {
            assistant.style.display = 'none';
        });

        // 最小化按钮
        minimizeBtn.addEventListener('click', () => {
            assistant.classList.toggle('minimized');
            minimizeBtn.textContent = assistant.classList.contains('minimized') ? '□' : '−';
        });

        // 设置按钮
        settingsBtn.addEventListener('click', showSettings);

        // 清空对话
        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有对话记录吗?')) {
                const chat = document.getElementById('gemini-chat');
                chat.innerHTML = '';
                CONFIG.conversationHistory = [];
                GM_setValue('conversation_history', []);
                addWelcomeMessage();
            }
        });

        // 拖拽功能
        let isDragging = false;
        let offsetX, offsetY;

        document.getElementById('gemini-header').addEventListener('mousedown', (e) => {
            if (e.target.closest('.header-btn')) return;
            isDragging = true;
            offsetX = e.clientX - assistant.offsetLeft;
            offsetY = e.clientY - assistant.offsetTop;
            assistant.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            assistant.style.left = (e.clientX - offsetX) + 'px';
            assistant.style.top = (e.clientY - offsetY) + 'px';
            assistant.style.right = 'auto';
            assistant.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            assistant.style.cursor = '';
        });
    }

    /**
     * 添加欢迎消息
     */
    function addWelcomeMessage() {
        const welcomeHTML = `
            <div class="assistant-message">
                <div class="message-content">
                    👋 你好!我是基于 <strong>OpenRouter 免费模型</strong> 的浏览器 AI 助手。
                    
<strong>功能特性:</strong>
• 💬 智能对话 - 使用 OpenRouter 免费模型
• 💻 代码执行 - 支持 JavaScript 执行
• 🎯 页面操作 - 可以操作当前页面元素
• 💾 本地存储 - 对话历史自动保存
• 🆓 完全免费 - 无需付费即可使用

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行 JavaScript
• <code>/clear</code> - 清空对话
• <code>/help</code> - 显示帮助

${!CONFIG.apiKey ? '<strong style="color: #ef4444;">⚠️ 请先在设置中配置 API Key</strong>' : ''}
                </div>
            </div>
        `;
        appendToChat(welcomeHTML);
    }

    /**
     * 发送消息
     */
    async function sendMessage() {
        const input = document.getElementById('gemini-input');
        const message = input.value.trim();
        
        if (!message || isProcessing) return;
        
        // 检查 API Key
        if (!CONFIG.apiKey) {
            appendToChat(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #ef4444;">
                        ⚠️ 请先在设置中配置 OpenRouter API Key
                    </div>
                </div>
            `);
            showSettings();
            return;
        }

        // 处理快捷命令
        if (message.startsWith('/js ')) {
            const code = message.substring(4);
            addUserMessage(message);
            executeJavaScript(code);
            input.value = '';
            return;
        }
        
        if (message === '/clear') {
            addUserMessage(message);
            document.getElementById('gemini-clear').click();
            input.value = '';
            return;
        }
        
        if (message === '/help') {
            addUserMessage(message);
            showHelp();
            input.value = '';
            return;
        }

        // 正常对话
        addUserMessage(message);
        input.value = '';
        
        await callOpenRouterAPI(message);
    }

    /**
     * 添加用户消息
     */
    function addUserMessage(text) {
        const messageHTML = `
            <div class="user-message">
                <div class="message-content">${escapeHtml(text)}</div>
            </div>
        `;
        appendToChat(messageHTML);
        
        // 保存到历史
        CONFIG.conversationHistory.push({ role: 'user', content: text });
        saveConversationHistory();
    }

    /**
     * 调用 OpenRouter API
     */
    async function callOpenRouterAPI(userMessage) {
        isProcessing = true;
        updateSendButtonState();
        showTypingIndicator();

        try {
            // 构建请求内容
            const messages = buildConversationContext(userMessage);
            
            const requestBody = {
                model: CONFIG.model,
                messages: messages,
                temperature: CONFIG.temperature,
                top_p: CONFIG.topP,
                max_tokens: CONFIG.maxTokens
            };

            // 发起 API 请求
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: CONFIG.apiEndpoint,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${CONFIG.apiKey}`,
                        'HTTP-Referer': window.location.href,
                        'X-Title': 'OpenRouter Browser Agent'
                    },
                    data: JSON.stringify(requestBody),
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                        }
                    },
                    onerror: (error) => reject(error),
                    ontimeout: () => reject(new Error('请求超时'))
                });
            });

            // 解析响应
            const data = JSON.parse(response.responseText);
            
            if (data.choices && data.choices.length > 0) {
                const assistantMessage = data.choices[0].message.content;
                
                hideTypingIndicator();
                addAssistantMessage(assistantMessage);
                
                // 保存到历史
                CONFIG.conversationHistory.push({ role: 'assistant', content: assistantMessage });
                saveConversationHistory();
            } else {
                throw new Error('无效的 API 响应: ' + JSON.stringify(data));
            }

        } catch (error) {
            hideTypingIndicator();
            appendToChat(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #ef4444;">
                        ❌ 错误: ${escapeHtml(error.message)}
                        <br><br>
                        请检查:
                        <br>• API Key 是否正确
                        <br>• 网络连接是否正常
                        <br>• 模型是否可用
                        <br>• 是否超出速率限制
                    </div>
                </div>
            `);
            console.error('OpenRouter API Error:', error);
        } finally {
            isProcessing = false;
            updateSendButtonState();
        }
    }

    /**
     * 构建对话上下文
     */
    function buildConversationContext(currentMessage) {
        // 系统提示词
        const systemMessage = {
            role: 'system',
            content: `你是一个运行在浏览器中的 AI 助手。你可以:
1. 回答各种问题
2. 帮助分析和操作当前网页
3. 生成和执行 JavaScript 代码

当前页面信息:
- URL: ${window.location.href}
- 标题: ${document.title}

请用简洁、实用的方式回答问题。如果需要执行代码,请使用 \`\`\`javascript 代码块包裹。`
        };

        // 获取最近的对话历史(最多保留最近 10 轮)
        const recentHistory = CONFIG.conversationHistory.slice(-10);
        
        // 转换为通义千问的消息格式
        const messages = [
            systemMessage,
            ...recentHistory.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.content
            })),
            {
                role: 'user',
                content: currentMessage
            }
        ];

        return messages;
    }

    /**
     * 添加助手消息
     */
    function addAssistantMessage(text) {
        const formattedText = formatMessage(text);
        appendToChat(formattedText);
    }

    /**
     * 从 OpenRouter API 获取免费模型列表
     */
    async function fetchFreeModels() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://openrouter.ai/api/v1/models',
                headers: {
                    'Content-Type': 'application/json'
                },
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.data) {
                            // 过滤出免费模型
                            const freeModels = data.data
                                .filter(model => model.id.includes(':free') || model.pricing?.prompt === 0)
                                .map(model => ({
                                    id: model.id,
                                    name: model.name || model.id,
                                    provider: model.id.split('/')[0],
                                    context_length: model.context_length || 'N/A'
                                }))
                                .sort((a, b) => a.name.localeCompare(b.name));
                            
                            resolve(freeModels);
                        } else {
                            reject(new Error('无效的响应格式'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    /**
     * 更新模型选择下拉框
     */
    function updateModelSelect(models) {
        const select = document.getElementById('setting-model');
        if (!select) return;
        
        // 保存当前选中的值
        const currentValue = select.value;
        
        // 清空现有选项 (保留 Auto 选项)
        select.innerHTML = '';
        
        // 添加 Auto 选项 (始终在第一位)
        const autoOption = document.createElement('option');
        autoOption.value = 'openrouter/auto';
        autoOption.textContent = '🎲 Auto (智能路由 - 推荐)';
        if (currentValue === 'openrouter/auto') autoOption.selected = true;
        select.appendChild(autoOption);
        
        // 添加分隔线
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────────';
        select.appendChild(separator);
        
        // 添加免费模型选项
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            
            // 添加图标
            let icon = '🤖';
            if (model.provider.includes('google')) icon = '✨';
            else if (model.provider.includes('meta') || model.provider.includes('llama')) icon = '🦙';
            else if (model.provider.includes('qwen') || model.provider.includes('aliyun')) icon = '💬';
            else if (model.provider.includes('deepseek')) icon = '🧠';
            else if (model.provider.includes('mistral')) icon = '⚡';
            else if (model.provider.includes('openai')) icon = '🤖';
            else if (model.provider.includes('zhipu') || model.provider.includes('glm')) icon = '🇨🇳';
            
            option.textContent = `${icon} ${model.name}`;
            
            // 恢复之前的选择
            if (model.id === currentValue) {
                option.selected = true;
            }
            
            select.appendChild(option);
        });
    }

    /**
     * 加载缓存的模型列表
     */
    function loadCachedModels() {
        const cached = GM_getValue('cached_models', null);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                const models = data.models;
                const timestamp = data.timestamp;
                const age = Date.now() - timestamp;
                
                // 如果缓存不超过 24 小时,使用缓存
                if (age < 24 * 60 * 60 * 1000) {
                    updateModelSelect(models);
                    const modelsStatus = document.getElementById('models-status');
                    if (modelsStatus) {
                        const hoursAgo = Math.floor(age / (60 * 60 * 1000));
                        modelsStatus.innerHTML = `<span style="color: #6b7280;">📦 已加载缓存 (${hoursAgo}小时前) | 点击刷新获取最新</span>`;
                    }
                }
            } catch (error) {
                console.error('加载缓存失败:', error);
            }
        }
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
                        <button class="code-btn execute" onclick="executeCodeFromBlock(this)">▶ 执行代码</button>
                        <button class="code-btn" onclick="copyCode(this)">📋 复制</button>
                    </div>
                ` : `
                    <div class="code-actions">
                        <button class="code-btn" onclick="copyCode(this)">📋 复制</button>
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
     * 执行 JavaScript 代码
     */
    function executeJavaScript(code) {
        if (!CONFIG.jsExecutionEnabled) {
            appendToChat(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #ef4444;">
                        ⚠️ JavaScript 执行已被禁用,请在设置中启用
                    </div>
                </div>
            `);
            return;
        }

        try {
            // 在 unsafeWindow 上下文中执行代码
            const result = unsafeWindow.eval(code);
            
            const resultStr = typeof result === 'object' 
                ? JSON.stringify(result, null, 2) 
                : String(result);
            
            appendToChat(`
                <div class="execution-result execution-success">
                    <strong>✅ 执行成功</strong>
                    <br>
                    <pre style="margin-top: 8px;">${escapeHtml(resultStr)}</pre>
                </div>
            `);
            
            // 保存执行记录
            CONFIG.conversationHistory.push({ 
                role: 'system', 
                content: `[代码执行] ${code}\n结果: ${resultStr}` 
            });
            saveConversationHistory();
            
        } catch (error) {
            appendToChat(`
                <div class="execution-result execution-error">
                    <strong>❌ 执行失败</strong>
                    <br>
                    <pre style="margin-top: 8px;">${escapeHtml(error.toString())}</pre>
                </div>
            `);
        }
    }

    /**
     * 从代码块执行代码
     */
    window.executeCodeFromBlock = function(btn) {
        const codeBlock = btn.closest('.assistant-message').querySelector('.code-block pre');
        const code = codeBlock.textContent;
        executeJavaScript(code);
    };

    /**
     * 复制代码
     */
    window.copyCode = function(btn) {
        const codeBlock = btn.closest('.assistant-message').querySelector('.code-block pre');
        const code = codeBlock.textContent;
        
        navigator.clipboard.writeText(code).then(() => {
            const originalText = btn.textContent;
            btn.textContent = '✓ 已复制';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    };

    /**
     * 显示设置对话框
     */
    function showSettings() {
        const modalHTML = `
            <div class="modal-overlay" id="settings-modal">
                <div class="modal-content">
                    <div class="modal-title">⚙️ OpenRouter 设置</div>
                    
                    <div class="form-group">
                        <label class="form-label">API Key *</label>
                        <input type="password" class="form-input" id="setting-api-key" 
                               value="${CONFIG.apiKey}" 
                               placeholder="输入你的 OpenRouter API Key">
                        <div class="form-hint">
                            从 <a href="https://openrouter.ai/keys" target="_blank">OpenRouter Keys</a> 获取免费 API Key
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">模型选择 (免费)</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <select class="form-input" id="setting-model" style="flex: 1;">
                                <option value="google/gemma-3-12b-it:free" ${CONFIG.model === 'google/gemma-3-12b-it:free' ? 'selected' : ''}>🌟 Gemma 3 12B (推荐)</option>
                                <option value="meta-llama/llama-3.3-70b-instruct:free" ${CONFIG.model === 'meta-llama/llama-3.3-70b-instruct:free' ? 'selected' : ''}>🦙 Llama 3.3 70B</option>
                                <option value="qwen/qwen-2.5-72b-instruct:free" ${CONFIG.model === 'qwen/qwen-2.5-72b-instruct:free' ? 'selected' : ''}>💬 Qwen 2.5 72B (中文好)</option>
                                <option value="deepseek/deepseek-r1-0528:free" ${CONFIG.model === 'deepseek/deepseek-r1-0528:free' ? 'selected' : ''}>🧠 DeepSeek R1 (推理强)</option>
                                <option value="mistralai/mistral-7b-instruct:free" ${CONFIG.model === 'mistralai/mistral-7b-instruct:free' ? 'selected' : ''}>⚡ Mistral 7B (快速)</option>
                                <option value="google/gemini-2.0-flash-exp:free" ${CONFIG.model === 'google/gemini-2.0-flash-exp:free' ? 'selected' : ''}>✨ Gemini 2.0 Flash</option>
                                <option value="openai/gpt-oss-20b:free" ${CONFIG.model === 'openai/gpt-oss-20b:free' ? 'selected' : ''}>🤖 GPT-OSS 20B</option>
                                <option value="zhipuai/glm-4.5-air:free" ${CONFIG.model === 'zhipuai/glm-4.5-air:free' ? 'selected' : ''}>🇨🇳 GLM-4.5 Air</option>
                                <option value="stepfun/step-3.5-flash:free" ${CONFIG.model === 'stepfun/step-3.5-flash:free' ? 'selected' : ''}>🚀 Step 3.5 Flash</option>
                                <option value="arcee/trinity-mini:free" ${CONFIG.model === 'arcee/trinity-mini:free' ? 'selected' : ''}>🔹 Trinity Mini 26B</option>
                                <option value="openrouter/auto" ${CONFIG.model === 'openrouter/auto' ? 'selected' : ''}>🎲 Auto (智能路由 - 推荐)</option>
                            </select>
                            <button class="btn-secondary" id="refresh-models" title="刷新模型列表" style="padding: 8px 12px; white-space: nowrap;">🔄 刷新</button>
                        </div>
                        <div class="form-hint">
                            所有标记 :free 的模型都完全免费 | Auto 会自动选择最佳可用模型 | 点击刷新获取最新列表
                        </div>
                        <div id="models-status" style="margin-top: 8px; font-size: 12px; color: #6b7280;"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Temperature: <span id="temp-value">${CONFIG.temperature}</span></label>
                        <input type="range" class="form-input" id="setting-temperature" 
                               min="0" max="1" step="0.1" value="${CONFIG.temperature}">
                        <div class="form-hint">控制回复的随机性 (0=确定, 1=创意)</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Top P: <span id="topp-value">${CONFIG.topP}</span></label>
                        <input type="range" class="form-input" id="setting-top-p" 
                               min="0" max="1" step="0.1" value="${CONFIG.topP}">
                        <div class="form-hint">核采样参数,控制多样性 (0.95 推荐)</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">最大输出 Token</label>
                        <input type="number" class="form-input" id="setting-max-tokens" 
                               value="${CONFIG.maxTokens}" min="100" max="4096">
                    </div>

                    <div class="setting-row">
                        <div>
                            <div style="font-weight: 500;">JavaScript 执行</div>
                            <div style="font-size: 12px; color: #6b7280;">允许执行 AI 生成的代码</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-js-enabled" ${CONFIG.jsExecutionEnabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="modal-actions">
                        <button class="btn-secondary" id="cancel-settings">取消</button>
                        <button class="btn-primary" id="save-settings">保存</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 温度滑块实时更新
        document.getElementById('setting-temperature').addEventListener('input', (e) => {
            document.getElementById('temp-value').textContent = e.target.value;
        });

        // Top P 滑块实时更新
        document.getElementById('setting-top-p').addEventListener('input', (e) => {
            document.getElementById('topp-value').textContent = e.target.value;
        });

        // 刷新模型列表
        const refreshBtn = document.getElementById('refresh-models');
        const modelsStatus = document.getElementById('models-status');
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 加载中...';
            modelsStatus.innerHTML = '<span style="color: #3b82f6;">⏳ 正在获取最新模型列表...</span>';
            
            try {
                const models = await fetchFreeModels();
                updateModelSelect(models);
                modelsStatus.innerHTML = `<span style="color: #10b981;">✅ 已更新!找到 ${models.length} 个免费模型 (最后更新: ${new Date().toLocaleTimeString()})</span>`;
                
                // 保存模型列表到本地存储
                GM_setValue('cached_models', JSON.stringify({
                    models: models,
                    timestamp: Date.now()
                }));
                
            } catch (error) {
                console.error('获取模型列表失败:', error);
                modelsStatus.innerHTML = `<span style="color: #ef4444;">❌ 获取失败: ${error.message}</span><br><span style="color: #6b7280;">提示: Auto 模式仍然可用</span>`;
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 刷新';
            }
        });
        
        // 加载缓存的模型列表
        loadCachedModels();

        // 保存设置
        document.getElementById('save-settings').addEventListener('click', () => {
            CONFIG.apiKey = document.getElementById('setting-api-key').value.trim();
            CONFIG.model = document.getElementById('setting-model').value;
            CONFIG.temperature = parseFloat(document.getElementById('setting-temperature').value);
            CONFIG.topP = parseFloat(document.getElementById('setting-top-p').value);
            CONFIG.maxTokens = parseInt(document.getElementById('setting-max-tokens').value);
            CONFIG.jsExecutionEnabled = document.getElementById('setting-js-enabled').checked;

            // 持久化保存
            GM_setValue('openrouter_api_key', CONFIG.apiKey);
            GM_setValue('openrouter_model', CONFIG.model);
            GM_setValue('temperature', CONFIG.temperature);
            GM_setValue('top_p', CONFIG.topP);
            GM_setValue('max_tokens', CONFIG.maxTokens);
            GM_setValue('js_execution_enabled', CONFIG.jsExecutionEnabled);

            closeModal();
            
            // 更新状态徽章
            updateStatusBadge();
            
            // 提示
            appendToChat(`
                <div class="assistant-message">
                    <div class="message-content" style="color: #10b981;">
                        ✅ 设置已保存 - 开始免费使用!
                    </div>
                </div>
            `);
        });

        // 取消
        document.getElementById('cancel-settings').addEventListener('click', closeModal);
    }

    /**
     * 关闭模态框
     */
    function closeModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.remove();
    }

    /**
     * 更新状态徽章
     */
    function updateStatusBadge() {
        const badge = document.querySelector('#gemini-title .status-badge');
        if (badge) {
            if (CONFIG.apiKey) {
                badge.className = 'status-badge status-active';
                badge.textContent = '已配置';
            } else {
                badge.className = 'status-badge status-inactive';
                badge.textContent = '未配置';
            }
        }
    }

    /**
     * 显示帮助
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
        
        appendToChat(`
            <div class="assistant-message">
                <div class="message-content">${helpText}</div>
            </div>
        `);
    }

    // ==================== 工具函数 ====================

    /**
     * 追加消息到聊天区域
     */
    function appendToChat(html) {
        const chat = document.getElementById('gemini-chat');
        chat.insertAdjacentHTML('beforeend', html);
        chat.scrollTop = chat.scrollHeight;
    }

    /**
     * 显示打字指示器
     */
    function showTypingIndicator() {
        const typingHTML = `
            <div class="typing" id="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        appendToChat(typingHTML);
    }

    /**
     * 隐藏打字指示器
     */
    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    /**
     * 更新发送按钮状态
     */
    function updateSendButtonState() {
        const sendBtn = document.getElementById('gemini-send');
        sendBtn.disabled = isProcessing;
        sendBtn.textContent = isProcessing ? '思考中...' : '发送 ➤';
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
     * 保存对话历史
     */
    function saveConversationHistory() {
        // 只保留最近 50 条消息
        if (CONFIG.conversationHistory.length > 50) {
            CONFIG.conversationHistory = CONFIG.conversationHistory.slice(-50);
        }
        GM_setValue('conversation_history', CONFIG.conversationHistory);
    }

    // ==================== 初始化 ====================
    
    // 延迟初始化,确保页面完全加载
    setTimeout(() => {
        currentAssistant = createAssistant();
        console.log('✨ OpenRouter Free AI Agent 已加载 - 完全免费!');
    }, 1000);

})();
