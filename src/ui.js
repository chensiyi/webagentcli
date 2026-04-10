// ==================== UI 界面模块 ====================

const UIManager = (function() {
    let assistant = null;
    let isDragging = false;
    let offsetX, offsetY;

    /**
     * 添加样式
     */
    function addStyles() {
        GM_addStyle(`
            #openrouter-agent {
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
            #openrouter-agent.minimized {
                height: 50px;
                overflow: hidden;
            }
            #agent-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-radius: 12px 12px 0 0;
                cursor: move;
            }
            #agent-title { 
                font-weight: 600; 
                font-size: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            #agent-controls {
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
            #agent-chat {
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
            #agent-input-area { 
                border-top: 1px solid #e0e0e0; 
                padding: 12px;
                background: white;
                border-radius: 0 0 12px 12px;
            }
            #agent-input {
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
            #agent-input:focus { 
                outline: none; 
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            #agent-controls-bar { 
                display: flex; 
                gap: 8px; 
                margin-top: 10px;
                align-items: center;
            }
            #agent-send {
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
            #agent-send:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }
            #agent-send:disabled {
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
    }

    /**
     * 创建主界面
     */
    function createAssistant(config) {
        assistant = document.createElement('div');
        assistant.id = 'openrouter-agent';
        assistant.innerHTML = `
            <div id="agent-header">
                <div id="agent-title">
                    <span>✨</span>
                    <span>OpenRouter AI</span>
                    ${config.apiKey ? '<span class="status-badge status-active">已配置</span>' : '<span class="status-badge status-inactive">未配置</span>'}
                </div>
                <div id="agent-controls">
                    <button class="header-btn" id="agent-minimize" title="最小化">−</button>
                    <button class="header-btn" id="agent-close" title="关闭">×</button>
                </div>
            </div>
            <div id="agent-chat"></div>
            <div id="agent-input-area">
                <textarea id="agent-input" placeholder="输入消息...&#10;使用 /js 执行代码,例如: /js alert('Hello')"></textarea>
                <div id="agent-controls-bar">
                    <button class="control-btn" id="agent-settings">⚙️ 设置</button>
                    <button class="control-btn" id="agent-clear">🗑️ 清空</button>
                    <button id="agent-send">发送 ➤</button>
                </div>
            </div>
        `;
        document.body.appendChild(assistant);
        
        setupEventListeners();
        
        return assistant;
    }

    /**
     * 设置事件监听
     */
    function setupEventListeners() {
        const sendBtn = document.getElementById('agent-send');
        const input = document.getElementById('agent-input');
        const closeBtn = document.getElementById('agent-close');
        const minimizeBtn = document.getElementById('agent-minimize');
        const settingsBtn = document.getElementById('agent-settings');
        const clearBtn = document.getElementById('agent-clear');

        // 发送按钮点击
        sendBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('agent-send-message'));
        });
        
        // 回车发送
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('agent-send-message'));
            }
        });

        // 打开监听自定义事件
        window.addEventListener('agent-send-message', () => {
            const message = input.value.trim();
            if (message) {
                window.dispatchEvent(new CustomEvent('agent-message-sent', { detail: message }));
                input.value = '';
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
        settingsBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('agent-open-settings'));
        });

        // 清空按钮
        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有对话记录吗?')) {
                window.dispatchEvent(new CustomEvent('agent-clear-chat'));
            }
        });

        // 拖拽功能
        const header = document.getElementById('agent-header');
        header.addEventListener('mousedown', (e) => {
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

        // 监听打开 Agent 事件 (来自 version-loader)
        window.addEventListener('open-ai-agent', () => {
            assistant.style.display = 'flex';
            assistant.classList.remove('minimized');
        });
    }

    /**
     * 追加消息到聊天区域
     */
    function appendMessage(html) {
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.insertAdjacentHTML('beforeend', html);
            chat.scrollTop = chat.scrollHeight;
        }
    }

    /**
     * 显示/隐藏打字指示器
     */
    function showTypingIndicator() {
        const typingHTML = `
            <div class="typing" id="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        appendMessage(typingHTML);
    }

    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    /**
     * 更新发送按钮状态
     */
    function updateSendButtonState(isProcessing) {
        const sendBtn = document.getElementById('agent-send');
        if (sendBtn) {
            sendBtn.disabled = isProcessing;
            sendBtn.textContent = isProcessing ? '思考中...' : '发送 ➤';
        }
    }

    /**
     * 更新状态徽章
     */
    function updateStatusBadge(hasApiKey) {
        const badge = document.querySelector('#agent-title .status-badge');
        if (badge) {
            if (hasApiKey) {
                badge.className = 'status-badge status-active';
                badge.textContent = '已配置';
            } else {
                badge.className = 'status-badge status-inactive';
                badge.textContent = '未配置';
            }
        }
    }

    /**
     * 显示助手
     */
    function show() {
        if (assistant) {
            assistant.style.display = 'flex';
            assistant.classList.remove('minimized');
        }
    }

    /**
     * 隐藏助手
     */
    function hide() {
        if (assistant) {
            assistant.style.display = 'none';
        }
    }

    // 初始化
    addStyles();

    return {
        createAssistant,
        appendMessage,
        showTypingIndicator,
        hideTypingIndicator,
        updateSendButtonState,
        updateStatusBadge,
        show,
        hide
    };
})();
