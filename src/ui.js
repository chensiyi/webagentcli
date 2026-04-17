// ==================== UI 界面模块 (重构版) ====================
// 职责：UI 交互逻辑、事件处理、DOM 操作
// 样式已分离到 ui-styles.js
// 模板已分离到 ui-templates.js

const UIManager = (function() {
    'use strict';
    
    // ========== 状态管理 ==========
    let assistant = null;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let rafId = null; // requestAnimationFrame ID
    let currentMousePos = { x: 0, y: 0 }; // 当前鼠标位置
    let escapeHandler = null; // ESC 键处理器

    // ========== CSS 样式管理 ==========

    /**
     * 添加所有样式（从 UIStyles 模块获取）
     */
    function addStyles() {
        GM_addStyle(UIStyles.getMainStyles());
        GM_addStyle(getSettingsStyles()); // 设置对话框样式保留在此
    }

    /**
     * 获取主界面样式
     */
    function getMainStyles() {
        return `
            #ai-agent {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 450px;
                height: 500px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                z-index: 2147483647 !important;
                display: flex;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 1px solid #e0e0e0;
                transition: all 0.3s ease;
                pointer-events: auto !important;
            }
            
            /* 主内容区域 */
            #agent-main {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
                overflow: hidden;
                pointer-events: auto !important;
            }
            #agent-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                min-height: 44px;
                flex-shrink: 0;
                pointer-events: auto !important;
                position: relative;
                z-index: 2;
            }
            #agent-title { 
                font-weight: 600; 
                font-size: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
                pointer-events: auto !important;
            }
            #agent-controls {
                display: flex;
                gap: 6px;
                pointer-events: auto !important;
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
                pointer-events: auto !important;
                position: relative;
                z-index: 3;
            }
            .header-btn:hover { background: rgba(255,255,255,0.3); }
            #agent-chat {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                background: #f5f7fa;
                scroll-behavior: smooth;
                display: flex;
                flex-direction: column;
                gap: 10px;
                min-height: 0;
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
                align-self: flex-end;
            }
            .assistant-message {
                background: white;
                border: 1px solid #e0e0e0;
                padding: 10px 14px;
                border-radius: 16px 16px 16px 6px;
                max-width: 85%;
                word-wrap: break-word;
                align-self: flex-start;
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
                flex-shrink: 0;
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
                z-index: 999;
                position: relative;
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
                z-index: 999;
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
                z-index: 999;
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
        `;
    }

    // ========== DOM 创建 ==========

    /**
     * 创建主界面
     */
    function createAssistant(config) {
        assistant = document.createElement('div');
        assistant.id = 'ai-agent';
        assistant.innerHTML = buildMainHTML(config);
        document.body.appendChild(assistant);
        
        setupEventListeners();
        setupChatEventDelegation();
        
        return assistant;
    }

    /**
     * 构建主界面 HTML（从 UITemplates 模块获取）
     */
    function buildMainHTML(config) {
        return UITemplates.buildMainHTML(config);
    }

    // ========== 事件处理 ==========

    /**
     * 设置事件监听
     */
    function setupEventListeners() {
        setupInputEvents();
        setupButtonEvents();
        setupDragEvents();
    }

    /**
     * 设置输入框事件
     */
    function setupInputEvents() {
        const sendBtn = document.getElementById('agent-send');
        const input = document.getElementById('agent-input');
        
        if (!sendBtn) {
            console.error('❌ 发送按钮未找到！DOM 元素可能尚未创建');
            return;
        }
        
        console.log('✅ 发送按钮已找到，绑定点击事件');
        
        // 发送按钮点击
        sendBtn.addEventListener('click', () => {
            console.log('📨 发送按钮被点击');
            
            // 检查是否是停止按钮
            if (sendBtn.textContent.includes('停止')) {
                console.log('⏹ 用户请求停止');
                EventManager.emit('agent:stop:request');
                return;
            }
            
            const message = input.value.trim();
            if (!message) return; // 空消息不发送
            
            console.log('📨 消息内容:', message);
            EventManager.emit(EventManager.EventTypes.CHAT_MESSAGE_SENT, message);
            // 发送成功后清空输入框
            input.value = '';
        });
        
        // 回车发送
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                EventManager.emit(EventManager.EventTypes.CHAT_MESSAGE_SENT, input.value.trim());
                // 发送成功后清空输入框
                input.value = '';
            }
        });
    }

    /**
     * 设置按钮事件
     */
    function setupButtonEvents() {
        const closeBtn = document.getElementById('agent-close');
        const settingsBtn = document.getElementById('agent-settings');
        const clearBtn = document.getElementById('agent-clear');

        // 关闭按钮
        closeBtn.addEventListener('click', () => {
            hide();
        });

        // 设置按钮
        settingsBtn.addEventListener('click', () => {
            EventManager.emit(EventManager.EventTypes.SETTINGS_OPEN);
        });

        // 清空按钮
        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有对话记录吗?')) {
                EventManager.emit(EventManager.EventTypes.CHAT_CLEAR);
            }
        });
    }

    /**
     * 设置拖拽事件（优化版：使用 requestAnimationFrame）
     */
    function setupDragEvents() {
        const header = document.getElementById('agent-header');
        
        // mousedown: 开始拖动
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.header-btn')) return;
            isDragging = true;
            dragOffset.x = e.clientX - assistant.offsetLeft;
            dragOffset.y = e.clientY - assistant.offsetTop;
            assistant.style.cursor = 'grabbing';
            
            // 阻止默认行为，防止文本选择
            e.preventDefault();
        });

        // mousemove: 更新鼠标位置，使用 rAF 优化
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            // 更新当前鼠标位置
            currentMousePos.x = e.clientX;
            currentMousePos.y = e.clientY;
            
            // 如果已经有 pending 的 rAF，跳过
            if (rafId !== null) return;
            
            // 请求下一帧更新位置
            rafId = requestAnimationFrame(() => {
                updateAssistantPosition();
                rafId = null;
            });
        });

        // mouseup: 结束拖动
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            assistant.style.cursor = '';
            
            // 取消 pending 的 rAF
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        });
    }
    
    /**
     * 更新助手窗口位置（在 rAF 回调中调用）
     */
    function updateAssistantPosition() {
        if (!isDragging || !assistant) return;
        
        const newLeft = currentMousePos.x - dragOffset.x;
        const newTop = currentMousePos.y - dragOffset.y;
        
        // 批量更新样式，减少重排
        assistant.style.left = newLeft + 'px';
        assistant.style.top = newTop + 'px';
        assistant.style.right = 'auto';
        assistant.style.bottom = 'auto';
    }

    /**
     * 设置聊天区域事件委托
     */
    function setupChatEventDelegation() {
        const chat = document.getElementById('agent-chat');
        if (!chat) return;

        // 使用事件委托处理代码块按钮点击
        chat.addEventListener('click', (e) => {
            const target = e.target.closest('button[data-action]');
            if (!target) return;

            handleCodeBlockAction(target);
        });
    }

    /**
     * 处理代码块操作
     */
    function handleCodeBlockAction(button) {
        const action = button.dataset.action;
        const assistantMessage = button.closest('.assistant-message');
        if (!assistantMessage) return;

        const codeBlock = assistantMessage.querySelector('.code-block');
        if (!codeBlock) return;

        // 从全局存储中获取代码（避免 HTML 转义问题）
        const blockId = codeBlock.dataset.codeId;
        const code = ChatManager.getCodeFromStore(blockId);
        
        if (!code) {
            Utils.debugError('未找到代码块:', blockId);
            return;
        }

        if (action === 'execute-code') {
            // 触发执行代码事件
            EventManager.emit('agent:execute:code', code);
        } else if (action === 'copy-code') {
            copyToClipboard(code, button);
        }
    }

    /**
     * 复制代码到剪贴板
     */
    function copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = button.textContent;
            button.textContent = '✓ 已复制';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        });
    }

    // ========== 消息显示 ==========

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
        appendMessage(typingHTML);
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
    function updateSendButtonState(isProcessing) {
        const sendBtn = document.getElementById('agent-send');
        if (sendBtn) {
            sendBtn.disabled = false; // 始终启用，允许停止
            if (isProcessing) {
                sendBtn.textContent = '⏹ 停止';
                sendBtn.style.background = '#ef4444'; // 红色背景表示可以停止
            } else {
                sendBtn.textContent = '发送 ➤';
                sendBtn.style.background = ''; // 恢复默认渐变
            }
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

    // ========== 窗口控制 ==========

    /**
     * 显示助手
     */
    function show() {
        if (assistant) {
            assistant.style.display = 'flex';
            
            // 保存显示状态到当前域名（使用 StateManager）
            if (typeof StateManager !== 'undefined') {
                StateManager.saveChatVisibility(true);
            }
        }
    }

    /**
     * 隐藏助手
     */
    function hide() {
        if (assistant) {
            assistant.style.display = 'none';
            // 触发 Agent 关闭事件，让 main.js 处理状态保存和日志记录
            EventManager.emit(EventManager.EventTypes.AGENT_CLOSE);
        }
    }

    // ========== 设置对话框 ==========

    /**
     * 显示设置对话框
     */
    function showSettings() {
        // 检查是否已经存在设置对话框
        const existingModal = document.getElementById('settings-modal');
        if (existingModal) {
            Utils.debugLog('⚙️ 设置对话框已存在，跳过创建');
            return;
        }
        
        const config = ConfigManager.getAll();
        
        // 添加设置对话框样式
        GM_addStyle(getSettingsStyles());

        const modalHTML = buildSettingsHTML(config);
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 初始化模型选择
        initializeModelSelect(config.model);

        // 绑定事件
        bindSettingsEvents();
        
        // 绑定 ESC 键关闭
        bindEscapeKey();
    }

    /**
     * 获取设置对话框样式
     */
    function getSettingsStyles() {
        return `
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
                max-height: 80vh;
                overflow-y: auto;
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
        `;
    }

    /**
     * 构建设置对话框 HTML
     */
    function buildSettingsHTML(config) {
        return `
            <div class="modal-overlay" id="settings-modal">
                <div class="modal-content">
                    <div class="modal-title">⚙️ 设置</div>
                    
                    <div class="form-group">
                        <label class="form-label">API Key *</label>
                        <input type="password" class="form-input" id="setting-api-key" 
                               value="${config.apiKey}" 
                               placeholder="输入你的 API Key">
                        <div class="form-hint">
                            从 <a href="https://openrouter.ai/keys" target="_blank">OpenRouter Keys</a> 获取免费 API Key
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">模型选择 (免费)</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <select class="form-input" id="setting-model" style="flex: 1;">
                                <option value="auto">🔄 Auto (自动选择)</option>
                            </select>
                            <button class="btn-secondary" id="refresh-models" title="刷新模型列表" style="padding: 8px 12px; white-space: nowrap;">🔄 刷新</button>
                        </div>
                        <div class="form-hint">
                            所有标记 :free 的模型都完全免费 | Auto 会自动选择最佳可用模型 | 点击刷新获取最新列表
                        </div>
                        <div id="models-status" style="margin-top: 8px; font-size: 12px; color: #6b7280;"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Temperature: <span id="temp-value">${config.temperature}</span></label>
                        <input type="range" class="form-input" id="setting-temperature" 
                               min="0" max="1" step="0.1" value="${config.temperature}">
                        <div class="form-hint">控制回复的随机性 (0=确定, 1=创意)</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Top P: <span id="topp-value">${config.topP}</span></label>
                        <input type="range" class="form-input" id="setting-top-p" 
                               min="0" max="1" step="0.1" value="${config.topP}">
                        <div class="form-hint">核采样参数,控制多样性 (0.95 推荐)</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">最大输出 Token</label>
                        <input type="number" class="form-input" id="setting-max-tokens" 
                               value="${config.maxTokens}" min="100" max="4096">
                    </div>

                    <div class="setting-row">
                        <div>
                            <div style="font-weight: 500;">JavaScript 执行</div>
                            <div style="font-size: 12px; color: #6b7280;">允许执行 AI 生成的代码</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-js-enabled" ${config.jsExecutionEnabled ? 'checked' : ''}>
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
    }

    /**
     * 绑定设置对话框的事件监听
     */
    function bindSettingsEvents() {
        // 温度滑块实时更新
        document.getElementById('setting-temperature').addEventListener('input', (e) => {
            document.getElementById('temp-value').textContent = e.target.value;
        });

        // Top P 滑块实时更新
        document.getElementById('setting-top-p').addEventListener('input', (e) => {
            document.getElementById('topp-value').textContent = e.target.value;
        });

        // 刷新模型列表
        setupModelRefresh();

        // 保存设置
        document.getElementById('save-settings').addEventListener('click', saveSettings);

        // 取消
        document.getElementById('cancel-settings').addEventListener('click', closeModal);
        
        // 点击遮罩层关闭
        const modalOverlay = document.getElementById('settings-modal');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                // 只有点击遮罩层本身才关闭，点击内容区域不关闭
                if (e.target === modalOverlay) {
                    closeModal();
                }
            });
        }
    }

    /**
     * 初始化模型选择
     */
    function initializeModelSelect(currentModel) {
        const cached = ModelManager.loadCachedModels();
        ModelManager.updateModelSelect(cached.models, currentModel);
        
        const modelsStatus = document.getElementById('models-status');
        if (modelsStatus && !cached.isExpired) {
            modelsStatus.innerHTML = `<span style="color: #6b7280;">📦 已加载缓存 (${cached.hoursAgo}小时前) | 点击刷新获取最新</span>`;
        }
    }

    /**
     * 设置模型刷新功能
     */
    function setupModelRefresh() {
        const refreshBtn = document.getElementById('refresh-models');
        const modelsStatus = document.getElementById('models-status');
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 加载中...';
            modelsStatus.innerHTML = '<span style="color: #3b82f6;">⏳ 正在获取最新模型列表...</span>';
            
            try {
                const result = await ModelManager.refreshModels();
                
                if (result.success) {
                    const select = document.getElementById('setting-model');
                    const currentModel = select.value;
                    ModelManager.updateModelSelect(result.models, currentModel);
                    modelsStatus.innerHTML = `<span style="color: #10b981;">✅ 已更新!找到 ${result.count} 个免费模型 (最后更新: ${new Date().toLocaleTimeString()})</span>`;
                } else {
                    throw new Error(result.error);
                }
                
            } catch (error) {
                console.error('获取模型列表失败:', error);
                modelsStatus.innerHTML = `<span style="color: #ef4444;">❌ 获取失败: ${error.message}</span><br><span style="color: #6b7280;">提示: Auto 模式仍然可用</span>`;
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 刷新';
            }
        });
    }

    /**
     * 保存设置
     */
    function saveSettings() {
        const apiKey = document.getElementById('setting-api-key').value.trim();
        const model = document.getElementById('setting-model').value;
        const temperature = parseFloat(document.getElementById('setting-temperature').value);
        const topP = parseFloat(document.getElementById('setting-top-p').value);
        let maxTokens = parseInt(document.getElementById('setting-max-tokens').value);
        const jsEnabled = document.getElementById('setting-js-enabled').checked;

        // 验证并限制 maxTokens 范围
        if (isNaN(maxTokens) || maxTokens < 100) {
            maxTokens = 2048;
        } else if (maxTokens > 8192) {
            maxTokens = 8192;
            alert('⚠️ maxTokens 已自动限制为 8192，避免超出 API 限制');
        }

        // 保存到配置管理器 (浏览器存储)
        ConfigManager.set('apiKey', apiKey);
        ConfigManager.set('model', model);
        ConfigManager.set('temperature', temperature);
        ConfigManager.set('topP', topP);
        ConfigManager.set('maxTokens', maxTokens);
        ConfigManager.set('jsExecutionEnabled', jsEnabled);

        closeModal();
        
        // 更新 UI 状态徽章
        updateStatusBadge(apiKey.length > 0);
        
        // 显示成功消息
        appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #10b981;">
                    ✅ 设置已保存 - 开始免费使用!
                </div>
            </div>
        `);
    }

    /**
     * 绑定 ESC 键关闭设置对话框
     */
    function bindEscapeKey() {
        // 先移除旧的监听器（如果存在）
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
        }
        
        // 创建新的处理器
        escapeHandler = (e) => {
            if (e.key === 'Escape' || e.keyCode === 27) {
                closeModal();
            }
        };
        
        document.addEventListener('keydown', escapeHandler);
    }

    /**
     * 关闭模态框
     */
    function closeModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.remove();
        }
        
        // 移除 ESC 键监听器
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
            escapeHandler = null;
        }
    }

    // ========== 流式消息管理 ==========

    // 流式更新节流状态
    let streamingUpdateState = {
        lastUpdateTime: 0,
        pendingUpdate: null,
        rafId: null
    };

    /**
     * 创建流式消息容器
     * @returns {string} 消息 ID
     */
    function createStreamingMessage() {
        const messageId = 'streaming_' + Date.now();
        const messageHTML = `
            <div class="assistant-message" id="${messageId}">
                <div class="message-content"></div>
            </div>
        `;
        appendMessage(messageHTML);
        return messageId;
    }

    /**
     * 更新流式消息内容（带节流优化）
     * @param {string} messageId - 消息 ID
     * @param {string} text - 完整文本
     */
    function updateStreamingMessage(messageId, text) {
        const now = Date.now();
        
        // 如果距离上次更新不足 50ms，使用 requestAnimationFrame 延迟更新
        if (now - streamingUpdateState.lastUpdateTime < 50) {
            // 取消之前的 pending 更新
            if (streamingUpdateState.rafId !== null) {
                cancelAnimationFrame(streamingUpdateState.rafId);
            }
            
            // 保存最新的文本
            streamingUpdateState.pendingUpdate = { messageId, text };
            
            // 安排在下一帧更新
            streamingUpdateState.rafId = requestAnimationFrame(() => {
                if (streamingUpdateState.pendingUpdate) {
                    performStreamingUpdate(
                        streamingUpdateState.pendingUpdate.messageId,
                        streamingUpdateState.pendingUpdate.text
                    );
                    streamingUpdateState.pendingUpdate = null;
                    streamingUpdateState.rafId = null;
                }
            });
        } else {
            // 直接更新
            performStreamingUpdate(messageId, text);
        }
    }

    /**
     * 执行实际的流式更新（内部函数）
     */
    function performStreamingUpdate(messageId, text) {
        const messageEl = document.getElementById(messageId);
        if (!messageEl) return;
        
        const contentEl = messageEl.querySelector('.message-content');
        if (contentEl) {
            // 格式化文本（支持代码块等）
            const formattedText = formatStreamingText(text);
            contentEl.innerHTML = formattedText;
            
            // 自动滚动到底部
            const chat = document.getElementById('agent-chat');
            if (chat) {
                chat.scrollTop = chat.scrollHeight;
            }
        }
        
        // 更新最后更新时间
        streamingUpdateState.lastUpdateTime = Date.now();
    }

    /**
     * 完成流式消息
     * @param {string} messageId - 消息 ID
     */
    function finalizeStreamingMessage(messageId) {
        const messageEl = document.getElementById(messageId);
        if (messageEl) {
            // 移除 ID，标记为完成
            messageEl.removeAttribute('id');
        }
    }

    /**
     * 格式化流式文本（增强版，支持更多 Markdown 格式）
     */
    function formatStreamingText(text) {
        // 转义 HTML
        let formatted = UITemplates.escapeHtml(text);
        
        // 处理代码块（简单匹配）
        formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<div class="code-block"><div class="code-language">${lang || 'text'}</div><pre>${code.trim()}</pre></div>`;
        });
        
        // 处理行内代码
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>');
        
        // 处理粗体 **text** 或 __text__
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
        
        // 处理斜体 *text* 或 _text_
        formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
        
        // 处理链接 [text](url)
        formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #667eea; text-decoration: underline;">$1</a>');
        
        // 处理无序列表 - item 或 * item
        formatted = formatted.replace(/^[\-\*]\s+(.+)$/gm, '<li style="margin-left: 20px;">$1</li>');
        
        // 处理有序列表 1. item
        formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-left: 20px; list-style-type: decimal;">$1</li>');
        
        // 处理换行（在列表项之后）
        formatted = formatted.replace(/<\/li>\n/g, '</li>');
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }

    // ========== 初始化 ==========
    addStyles();

    // ========== 公共接口 ==========
    return {
        createAssistant,
        appendMessage,
        showTypingIndicator,
        hideTypingIndicator,
        updateSendButtonState,
        updateStatusBadge,
        show,
        hide,
        showSettings,
        closeModal,
        createStreamingMessage,
        updateStreamingMessage,
        finalizeStreamingMessage
    };
})();
