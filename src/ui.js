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
        
        // v4.0.0: 数据迁移（为本地服务添加 isLocal 标志）
        ProviderManager.migrateProvidersData().catch(err => {
            console.error('[UI] Migration failed:', err);
        });
        
        // v4.0.0: 初始化模型选择器
        initializeMainModelSelect(config.model);
        
        // ✅ v4.0.0: 加载保存的窗口大小
        loadWindowSize();
        
        setupEventListeners();
        setupChatEventDelegation();
        setupDragEvents();
        setupResizeEvents(); // ✅ v4.0.0: 设置调整大小功能
        
        return assistant;
    }

    /**
     * 构建主界面 HTML（从 UITemplates 模块获取）
     */
    function buildMainHTML(config) {
        return UITemplates.buildMainHTML(config);
    }
    
    /**
     * v4.0.0: 初始化主界面模型选择器
     */
    async function initializeMainModelSelect(currentModel) {
        const select = document.getElementById('main-model-select');
        const statusSpan = document.getElementById('model-status');
        
        if (!select) {
            console.warn('[UI] Model select not found');
            return;
        }
        
        // 从 ProviderManager 获取所有可用模型
        const models = ProviderManager.getAllAvailableModels();
        
        if (models.length === 0) {
            // 没有模型，显示提示
            if (statusSpan) {
                statusSpan.textContent = '⚠️ 未配置供应商';
                statusSpan.style.color = '#f59e0b';
            }
            return;
        }
        
        // 清空现有选项（保留 Auto）
        select.innerHTML = '<option value="auto">🔄 Auto (智能路由)</option>';
        
        // 按供应商分组添加模型
        const groupedModels = {};
        models.forEach(model => {
            const providerId = model.providerId || model.provider || 'unknown';
            const providerName = model.providerName || providerId;
            
            if (!groupedModels[providerId]) {
                groupedModels[providerId] = { name: providerName, models: [] };
            }
            groupedModels[providerId].models.push(model);
        });
        
        // 添加分组选项
        Object.keys(groupedModels).forEach(providerId => {
            const group = groupedModels[providerId];
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${group.name} (${group.models.length})`;
            
            group.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = getModelDisplayName(model);
                if (model.id === currentModel) {
                    option.selected = true;
                }
                optgroup.appendChild(option);
            });
            
            select.appendChild(optgroup);
        });
        
        // 更新状态显示
        if (statusSpan) {
            const providerCount = ProviderManager.getAllProviders().filter(p => p.enabled).length;
            statusSpan.textContent = `✅ ${models.length} 个模型 | ${providerCount} 个供应商`;
            statusSpan.style.color = '#10b981';
        }
        
        // 绑定变化事件
        select.addEventListener('change', (e) => {
            const selectedModel = e.target.value;
            console.log('[UI] Model select changed to:', selectedModel);
            
            ConfigManager.set('model', selectedModel);
            
            // 验证是否保存成功
            const savedModel = ConfigManager.get('model');
            console.log('[UI] Model saved to config:', savedModel);
            console.log('[UI] Select value matches config:', selectedModel === savedModel);
        });
        
        console.log('[UI] Model selector initialized with', models.length, 'models');
    }

    /**
     * v4.0.0: 刷新主界面模型选择器（用于供应商列表更新后）
     */
    function refreshMainModelSelect() {
        const select = document.getElementById('main-model-select');
        if (!select) {
            console.warn('[UI] Model select not found for refresh');
            return;
        }
        
        // 获取当前选中的模型
        const currentModel = select.value;
        
        // 重新初始化
        initializeMainModelSelect(currentModel);
        console.log('[UI] Model selector refreshed');
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
     * ✅ v4.0.0: 设置调整大小事件
     */
    function setupResizeEvents() {
        const handles = document.querySelectorAll('.resize-handle');
        let isResizing = false;
        let resizeDirection = '';
        let resizeStartPos = { x: 0, y: 0 };
        let resizeStartSize = { width: 0, height: 0 };
        let resizeStartPos2 = { left: 0, top: 0 }; // 用于记录初始位置
        let resizeRafId = null;
        
        // 最小尺寸限制
        const MIN_WIDTH = 300;
        const MIN_HEIGHT = 400;
        
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                isResizing = true;
                resizeDirection = handle.dataset.resize;
                resizeStartPos.x = e.clientX;
                resizeStartPos.y = e.clientY;
                resizeStartSize.width = assistant.offsetWidth;
                resizeStartSize.height = assistant.offsetHeight;
                resizeStartPos2.left = assistant.offsetLeft;
                resizeStartPos2.top = assistant.offsetTop;
                
                // 添加全局鼠标事件监听
                document.addEventListener('mousemove', handleResizeMove);
                document.addEventListener('mouseup', handleResizeEnd);
            });
        });
        
        function handleResizeMove(e) {
            if (!isResizing) return;
            
            // 使用 requestAnimationFrame 优化性能
            if (resizeRafId !== null) return;
            
            resizeRafId = requestAnimationFrame(() => {
                performResize(e);
                resizeRafId = null;
            });
        }
        
        function performResize(e) {
            const deltaX = e.clientX - resizeStartPos.x;
            const deltaY = e.clientY - resizeStartPos.y;
            
            let newWidth = resizeStartSize.width;
            let newHeight = resizeStartSize.height;
            let newLeft = resizeStartPos2.left;
            let newTop = resizeStartPos2.top;
            
            // 根据拖拽方向计算新尺寸和位置
            if (resizeDirection.includes('e')) {
                // 东边（右）
                newWidth = Math.max(MIN_WIDTH, resizeStartSize.width + deltaX);
            }
            if (resizeDirection.includes('w')) {
                // 西边（左）
                const proposedWidth = Math.max(MIN_WIDTH, resizeStartSize.width - deltaX);
                if (proposedWidth > MIN_WIDTH) {
                    newWidth = proposedWidth;
                    newLeft = resizeStartPos2.left + (resizeStartSize.width - proposedWidth);
                }
            }
            if (resizeDirection.includes('s')) {
                // 南边（下）
                newHeight = Math.max(MIN_HEIGHT, resizeStartSize.height + deltaY);
            }
            if (resizeDirection.includes('n')) {
                // 北边（上）
                const proposedHeight = Math.max(MIN_HEIGHT, resizeStartSize.height - deltaY);
                if (proposedHeight > MIN_HEIGHT) {
                    newHeight = proposedHeight;
                    newTop = resizeStartPos2.top + (resizeStartSize.height - proposedHeight);
                }
            }
            
            // 应用新尺寸和位置
            assistant.style.width = newWidth + 'px';
            assistant.style.height = newHeight + 'px';
            assistant.style.left = newLeft + 'px';
            assistant.style.top = newTop + 'px';
            assistant.style.right = 'auto';
            assistant.style.bottom = 'auto';
        }
        
        function handleResizeEnd() {
            if (!isResizing) return;
            
            isResizing = false;
            resizeDirection = '';
            
            // 取消 pending 的 rAF
            if (resizeRafId !== null) {
                cancelAnimationFrame(resizeRafId);
                resizeRafId = null;
            }
            
            // 移除全局事件监听
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
            
            // 保存窗口大小到本地存储
            saveWindowSize();
        }
        
        console.log('[UI] 调整大小功能已启用');
    }
    
    /**
     * ✅ v4.0.0: 保存窗口大小
     */
    function saveWindowSize() {
        try {
            const size = {
                width: assistant.offsetWidth,
                height: assistant.offsetHeight
            };
            GM_setValue('window_size', size);
        } catch (e) {
            console.error('[UI] 保存窗口大小失败:', e);
        }
    }
    
    /**
     * ✅ v4.0.0: 加载窗口大小
     */
    function loadWindowSize() {
        try {
            const size = GM_getValue('window_size', null);
            if (size && size.width && size.height) {
                assistant.style.width = size.width + 'px';
                assistant.style.height = size.height + 'px';
                return true;
            }
        } catch (e) {
            console.error('[UI] 加载窗口大小失败:', e);
        }
        return false;
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
     * 显示设置对话框（v4.0.0: 异步初始化模型）
     */
    async function showSettings() {
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

        // v4.0.0: 异步初始化模型选择
        await initializeModelSelect(config.model);

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
                z-index: 2147483648; /* 比聊天窗口 (2147483647) 高一层 */
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
            
            /* v4.0.0: 标签页样式 */
            .settings-tabs {
                display: flex;
                gap: 8px;
                border-bottom: 2px solid #e5e7eb;
                margin-bottom: 20px;
            }
            .tab-btn {
                padding: 10px 16px;
                border: none;
                background: none;
                cursor: pointer;
                font-size: 14px;
                color: #6b7280;
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
                transition: all 0.2s;
            }
            .tab-btn:hover {
                color: #374151;
                background: #f9fafb;
            }
            .tab-btn.active {
                color: #667eea;
                border-bottom-color: #667eea;
                font-weight: 500;
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            
            /* v4.0.0: 供应商卡片样式 */
            .provider-list {
                max-height: 400px;
                overflow-y: auto;
                margin-bottom: 16px;
            }
            .provider-card {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 12px;
                transition: all 0.2s;
            }
            .provider-card:hover {
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                border-color: #d1d5db;
            }
            .provider-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            .provider-info {
                flex: 1;
            }
            .provider-name {
                font-size: 16px;
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 4px;
            }
            .provider-id {
                font-size: 12px;
                color: #6b7280;
                font-family: monospace;
            }
            .provider-status {
                font-size: 13px;
                font-weight: 500;
            }
            .provider-details {
                background: white;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 12px;
            }
            .provider-detail-row {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                border-bottom: 1px solid #f3f4f6;
                font-size: 13px;
            }
            .provider-detail-row:last-child {
                border-bottom: none;
            }
            .detail-label {
                color: #6b7280;
                font-weight: 500;
            }
            .detail-value {
                color: #374151;
                font-family: monospace;
                max-width: 300px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .provider-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            .add-provider-section {
                margin-top: 16px;
            }
            .provider-form {
                background: #f9fafb;
                border: 2px solid #667eea;
                border-radius: 8px;
                padding: 20px;
                margin-top: 16px;
            }
            
            /* v4.0.0: 表单分隔符 */
            .form-divider {
                text-align: center;
                margin: 16px 0;
                position: relative;
                color: #9ca3af;
                font-size: 13px;
            }
            .form-divider::before,
            .form-divider::after {
                content: '';
                position: absolute;
                top: 50%;
                width: 40%;
                height: 1px;
                background: #e5e7eb;
            }
            .form-divider::before {
                left: 0;
            }
            .form-divider::after {
                right: 0;
            }
            
            /* v4.0.0: 模型列表样式 */
            .models-section {
                margin-top: 12px;
                border-top: 1px solid #e5e7eb;
                padding-top: 12px;
            }
            .models-header {
                font-size: 13px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .models-bulk-actions {
                display: flex;
                gap: 6px;
            }
            .models-bulk-actions button {
                padding: 4px 8px;
                font-size: 11px;
                background: #f3f4f6;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .models-bulk-actions button:hover {
                background: #e5e7eb;
            }
            .models-list {
                max-height: 300px;
                overflow-y: auto;
                background: white;
                border-radius: 6px;
                padding: 8px;
                border: 1px solid #e5e7eb;
            }
            .model-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                font-size: 12px;
                color: #4b5563;
                border-radius: 4px;
                margin-bottom: 4px;
                background: #f9fafb;
                border: 1px solid transparent;
                transition: all 0.2s;
            }
            .model-item:hover {
                background: #f3f4f6;
                border-color: #d1d5db;
            }
            .model-item.dragging {
                opacity: 0.5;
                background: #e0e7ff;
                border-color: #667eea;
            }
            .model-item.disabled {
                opacity: 0.5;
                background: #f3f4f6;
            }
            .model-drag-handle {
                cursor: grab;
                color: #9ca3af;
                font-size: 14px;
                user-select: none;
                padding: 0 4px;
            }
            .model-drag-handle:active {
                cursor: grabbing;
            }
            .model-name {
                flex: 1;
                font-family: monospace;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .model-actions {
                display: flex;
                gap: 4px;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .model-item:hover .model-actions {
                opacity: 1;
            }
            .model-actions button {
                padding: 2px 6px;
                font-size: 12px;
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .model-actions button:hover {
                background: #f3f4f6;
                border-color: #667eea;
            }
            .models-hint {
                margin-top: 8px;
                padding: 8px;
                font-size: 11px;
                color: #6b7280;
                background: #f9fafb;
                border-radius: 4px;
                text-align: center;
            }
            .models-empty {
                padding: 20px;
                text-align: center;
                font-size: 13px;
                color: #9ca3af;
                font-style: italic;
            }
        `;
    }

    /**
     * 构建供应商列表 HTML
     */
    function buildProviderListHTML(providers) {
        if (!providers || providers.length === 0) {
            return `
                <div style="text-align: center; padding: 40px 20px; color: #6b7280;">
                    <div style="font-size: 48px; margin-bottom: 12px;">🔌</div>
                    <div style="font-size: 14px; margin-bottom: 8px;">还没有配置任何供应商</div>
                    <div style="font-size: 12px;">点击“嗅探本地服务”或“手动添加供应商”开始配置</div>
                </div>
            `;
        }
        
        return providers.map(provider => {
            const template = ProviderManager.getTemplate(provider.template);
            const models = provider.models || [];
            const modelCount = models.length;
            const statusColor = provider.enabled ? '#10b981' : '#ef4444';
            const statusText = provider.enabled ? '已启用' : '已禁用';
            const maskedKey = provider.apiKey ? 
                (provider.apiKey.substring(0, 8) + '...' + provider.apiKey.substring(provider.apiKey.length - 4)) : 
                '未设置';
            
            // 构建模型列表 HTML
            let modelsSection = '';
            if (modelCount > 0) {
                // v4.0.0: 生成完整的模型列表，支持编辑和排序
                const modelsHtml = models.map((model, index) => {
                    const modelName = typeof model === 'string' ? model : (model.name || model.id);
                    const modelId = typeof model === 'string' ? model : model.id;
                    const isEnabled = model.enabled !== false; // 默认启用
                    
                    return `
                        <div class="model-item" data-model-id="${modelId}" data-index="${index}" draggable="true">
                            <span class="model-drag-handle" title="拖拽排序">⋮⋮</span>
                            <span class="model-name">${modelName}</span>
                            <div class="model-actions">
                                <button class="btn-model-up" data-action="move-up" data-model-id="${modelId}" data-provider-id="${provider.id}" title="上移">↑</button>
                                <button class="btn-model-down" data-action="move-down" data-model-id="${modelId}" data-provider-id="${provider.id}" title="下移">↓</button>
                                <button class="btn-model-toggle" data-action="toggle-enable" data-model-id="${modelId}" data-provider-id="${provider.id}" 
                                        title="${isEnabled ? '禁用' : '启用'}" style="color: ${isEnabled ? '#10b981' : '#9ca3af'};">
                                    ${isEnabled ? '✓' : '✗'}
                                </button>
                                <button class="btn-model-delete" data-action="delete-model" data-model-id="${modelId}" data-provider-id="${provider.id}" title="删除">🗑️</button>
                            </div>
                        </div>
                    `;
                }).join('');
                
                modelsSection = `
                    <div class="models-section" id="models-${provider.id}" style="display: none;">
                        <div class="models-header">
                            <span>📦 可用模型 (${modelCount})</span>
                            <div class="models-bulk-actions">
                                <button class="btn-add-model" data-action="add-model" data-provider-id="${provider.id}" 
                                        style="padding: 4px 8px; font-size: 11px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    ➕ 添加模型
                                </button>
                                <button class="btn-test-models" data-action="test-models" data-provider-id="${provider.id}" 
                                        style="padding: 4px 8px; font-size: 11px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    🧪 测试模型
                                </button>
                                <button class="btn-remove-invalid" data-action="remove-invalid" data-provider-id="${provider.id}"
                                        style="padding: 4px 8px; font-size: 11px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    🗑️ 删除无效
                                </button>
                                <button class="btn-bulk-enable" data-action="bulk-enable" data-provider-id="${provider.id}">全部启用</button>
                                <button class="btn-bulk-disable" data-action="bulk-disable" data-provider-id="${provider.id}">全部禁用</button>
                            </div>
                        </div>
                        <div class="models-list" data-provider-id="${provider.id}">
                            ${modelsHtml}
                        </div>
                        <div class="models-hint">
                            💡 提示：拖拽 ⋮⋮ 图标可调整顺序，点击 ✓/✗ 可启用/禁用模型，🧪 测试后可一键删除无效模型
                        </div>
                    </div>
                `;
            } else {
                modelsSection = `
                    <div class="models-section" id="models-${provider.id}" style="display: none;">
                        <div class="models-empty">
                            暂无模型，点击“刷新模型”按钮获取
                        </div>
                    </div>
                `;
            }
            
            return `
                <div class="provider-card" data-provider-id="${provider.id}">
                    <div class="provider-header">
                        <div class="provider-info">
                            <div class="provider-name">${provider.name}</div>
                            <div class="provider-id">ID: ${provider.id}</div>
                        </div>
                        <div class="provider-status" style="color: ${statusColor};">
                            ● ${statusText}
                        </div>
                    </div>
                    
                    <div class="provider-details">
                        <div class="provider-detail-row">
                            <span class="detail-label">Base URL:</span>
                            <span class="detail-value" title="${provider.baseUrl}">${truncateUrl(provider.baseUrl)}</span>
                        </div>
                        <div class="provider-detail-row">
                            <span class="detail-label">API Key:</span>
                            <span class="detail-value">${maskedKey}</span>
                        </div>
                        <div class="provider-detail-row">
                            <span class="detail-label">模板:</span>
                            <span class="detail-value">${template ? template.name : provider.template}</span>
                        </div>
                        <div class="provider-detail-row">
                            <span class="detail-label">模型数量:</span>
                            <span class="detail-value">${modelCount} 个</span>
                        </div>
                        <div class="provider-detail-row">
                            <span class="detail-label">优先级:</span>
                            <span class="detail-value">${provider.priority || 1}</span>
                        </div>
                    </div>
                    
                    <div class="provider-actions">
                        <button class="btn-toggle-models" data-action="toggle-models" data-provider-id="${provider.id}" 
                                style="padding: 6px 12px; font-size: 12px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            📦 查看模型
                        </button>
                        <button class="btn-test-connection" data-action="test" data-provider-id="${provider.id}" 
                                style="padding: 6px 12px; font-size: 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            🔍 测试连接
                        </button>
                        <button class="btn-refresh-models" data-action="refresh" data-provider-id="${provider.id}"
                                style="padding: 6px 12px; font-size: 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            🔄 刷新模型
                        </button>
                        <button class="btn-edit-provider" data-action="edit" data-provider-id="${provider.id}"
                                style="padding: 6px 12px; font-size: 12px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            ✏️ 编辑
                        </button>
                        <button class="btn-delete-provider" data-action="delete" data-provider-id="${provider.id}"
                                style="padding: 6px 12px; font-size: 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            🗑️ 删除
                        </button>
                    </div>
                    
                    ${modelsSection}
                </div>
            `;
        }).join('');
    }
    
    /**
     * 截断 URL 显示
     */
    function truncateUrl(url, maxLength = 50) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength) + '...';
    }
    
    /**
     * 构建官方供应商选项 HTML
     */
    function buildOfficialProviderOptions() {
        const templates = ProviderManager.getOfficialProviderTemplates();
        
        return templates.map(template => {
            const icon = template.isLocal ? '💻' : '☁️';
            return `<option value="${template.id}">${icon} ${template.name}</option>`;
        }).join('');
    }

    /**
     * 构建设置对话框 HTML（v4.0.0: 供应商管理为核心）
     */
    function buildSettingsHTML(config) {
        // 获取所有供应商
        const providers = ProviderManager.getAllProviders();
        const templates = ProviderManager.getAvailableTemplates();
        
        return `
            <div class="modal-overlay" id="settings-modal">
                <div class="modal-content" style="max-width: 700px;">
                    <div class="modal-title">⚙️ 设置</div>
                    
                    <!-- v4.0.0: 供应商与模型管理标签页（核心） -->
                    <div class="settings-tabs">
                        <button class="tab-btn active" data-tab="providers">🔌 供应商与模型</button>
                        <button class="tab-btn" data-tab="advanced">⚡ 高级设置</button>
                    </div>
                    
                    <!-- 供应商与模型管理标签页 -->
                    <div class="tab-content active" id="tab-providers">
                        <!-- 本地服务嗅探按钮 -->
                        <div style="margin-bottom: 16px; display: flex; gap: 8px;">
                            <button class="btn-primary" id="scan-local-services" 
                                    style="flex: 1; padding: 10px; font-size: 13px;">
                                🔍 嗅探本地服务
                            </button>
                            <button class="btn-secondary" id="add-provider-btn" 
                                    style="flex: 1; padding: 10px; font-size: 13px;">
                                ➕ 手动添加供应商
                            </button>
                        </div>
                        
                        <div class="provider-list" id="provider-list">
                            ${buildProviderListHTML(providers)}
                        </div>
                        
                        <!-- 添加/编辑供应商表单 -->
                        <div class="provider-form" id="provider-form" style="display: none;">
                            <!-- v4.0.0: 官方供应商快速选择 -->
                            <div class="form-group">
                                <label class="form-label">🚀 快速选择官方供应商</label>
                                <select class="form-input" id="official-provider-select">
                                    <option value="">-- 选择官方供应商（自动填充配置） --</option>
                                    ${buildOfficialProviderOptions()}
                                </select>
                                <div class="form-hint">选择后将自动填充 Base URL、API 模板等配置</div>
                            </div>
                            
                            <div class="form-divider">或手动填写</div>
                            
                            <div class="form-group">
                                <label class="form-label">供应商 ID *</label>
                                <input type="text" class="form-input" id="provider-id" 
                                       placeholder="例如: openrouter, lm-studio, ollama">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">供应商名称 *</label>
                                <input type="text" class="form-input" id="provider-name" 
                                       placeholder="例如: OpenRouter, LM Studio">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">API Base URL *</label>
                                <input type="text" class="form-input" id="provider-base-url" 
                                       placeholder="https://openrouter.ai/api/v1">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">API Key</label>
                                <input type="password" class="form-input" id="provider-api-key" 
                                       placeholder="sk-or-... (本地服务可留空)">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">API 模板 *</label>
                                <select class="form-input" id="provider-template">
                                    ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">优先级</label>
                                <input type="number" class="form-input" id="provider-priority" 
                                       value="1" min="1" max="100">
                                <div class="form-hint">数字越小优先级越高，故障转移时按此顺序尝试</div>
                            </div>
                            
                            <div style="display: flex; gap: 8px; margin-top: 16px;">
                                <button class="btn-secondary" id="cancel-provider-form" style="flex: 1;">取消</button>
                                <button class="btn-primary" id="save-provider" style="flex: 1;">保存</button>
                            </div>
                        </div>
                        
                        <div class="form-hint" style="margin-top: 12px;">
                            💡 提示: 每个供应商独立配置，系统会自动按优先级进行故障转移。
                            模型列表在下方展开显示，可针对单个供应商刷新或测试。
                        </div>
                    </div>
                    
                    <!-- 高级设置标签页 -->
                    <div class="tab-content" id="tab-advanced">
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
                    </div>

                    <div class="modal-actions">
                        <button class="btn-secondary" id="cancel-settings">取消</button>
                        <button class="btn-primary" id="save-settings">保存设置</button>
                    </div>
                </div>
            </div>
        `;
    }

    // ========== v4.0.0: 供应商管理辅助函数 ==========
    
    /**
     * 显示供应商表单（添加/编辑）
     */
    function showProviderForm(providerId = null) {
        const form = document.getElementById('provider-form');
        const addBtn = document.getElementById('add-provider-btn');
        
        if (!form || !addBtn) return;
        
        form.style.display = 'block';
        addBtn.style.display = 'none';
        
        // 重置官方选择器
        const officialSelect = document.getElementById('official-provider-select');
        if (officialSelect) {
            officialSelect.value = '';
        }
        
        // 如果是编辑模式，填充数据
        if (providerId) {
            const provider = ProviderManager.getProviderById(providerId);
            if (provider) {
                document.getElementById('provider-id').value = provider.id;
                document.getElementById('provider-id').disabled = true; // ID 不可修改
                document.getElementById('provider-name').value = provider.name;
                document.getElementById('provider-base-url').value = provider.baseUrl;
                document.getElementById('provider-api-key').value = provider.apiKey || '';
                document.getElementById('provider-template').value = provider.template;
                document.getElementById('provider-priority').value = provider.priority || 1;
                
                // 标记为编辑模式
                form.dataset.editMode = 'true';
                form.dataset.providerId = providerId;
            }
        } else {
            // 清空表单
            document.getElementById('provider-id').value = '';
            document.getElementById('provider-id').disabled = false;
            document.getElementById('provider-name').value = '';
            document.getElementById('provider-base-url').value = '';
            document.getElementById('provider-api-key').value = '';
            document.getElementById('provider-template').value = 'OPENAI';
            document.getElementById('provider-priority').value = '1';
            
            form.dataset.editMode = 'false';
            delete form.dataset.providerId;
        }
        
        // 滚动到表单
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    /**
     * 从官方模板填充表单
     */
    function fillProviderFormFromTemplate(templateId) {
        const template = ProviderManager.getOfficialProviderTemplateById(templateId);
        if (!template) return;
        
        // 设置为添加模式（非编辑模式）
        const form = document.getElementById('provider-form');
        form.dataset.editMode = 'false';
        delete form.dataset.providerId;
        
        // 填充表单字段
        document.getElementById('provider-id').value = template.id;
        document.getElementById('provider-id').disabled = false;
        document.getElementById('provider-name').value = template.name;
        document.getElementById('provider-base-url').value = template.baseUrl;
        document.getElementById('provider-api-key').value = '';
        document.getElementById('provider-template').value = template.template;
        document.getElementById('provider-priority').value = template.priority || 1;
        
        // 聚焦到 API Key 字段
        document.getElementById('provider-api-key').focus();
        
        // 显示提示
        const hint = document.createElement('div');
        hint.style.cssText = 'margin-top: 8px; padding: 8px; background: #dbeafe; border-radius: 4px; font-size: 12px; color: #1e40af;';
        hint.innerHTML = `✅ 已自动填充配置！请填写 API Key 后保存。<br><small>了解更多: <a href="${template.website}" target="_blank" style="color: #1e40af;">${template.website}</a></small>`;
        
        // 移除旧的提示
        const oldHint = document.querySelector('.auto-fill-hint');
        if (oldHint) oldHint.remove();
        
        hint.className = 'auto-fill-hint';
        document.getElementById('provider-form').appendChild(hint);
    }
    
    /**
     * 隐藏供应商表单
     */
    function hideProviderForm() {
        const form = document.getElementById('provider-form');
        const addBtn = document.getElementById('add-provider-btn');
        
        if (!form || !addBtn) return;
        
        form.style.display = 'none';
        addBtn.style.display = 'block';
        
        // 清空表单状态
        delete form.dataset.editMode;
        delete form.dataset.providerId;
    }
    
    /**
     * 处理保存供应商
     */
    async function handleSaveProvider() {
        console.log('[UI] Save provider button clicked');
        
        const id = document.getElementById('provider-id').value.trim();
        const name = document.getElementById('provider-name').value.trim();
        const baseUrl = document.getElementById('provider-base-url').value.trim();
        const apiKey = document.getElementById('provider-api-key').value.trim();
        const template = document.getElementById('provider-template').value;
        const priority = parseInt(document.getElementById('provider-priority').value) || 1;
        
        console.log('[UI] Form data:', { id, name, baseUrl, template, priority });
        
        // 验证必填字段
        if (!id || !name || !baseUrl || !template) {
            alert('请填写所有必填字段（ID、名称、Base URL、模板）');
            return;
        }
        
        // 验证 ID 格式
        if (!/^[a-z0-9_-]+$/.test(id)) {
            alert('供应商 ID 只能包含小写字母、数字、下划线和连字符');
            return;
        }
        
        try {
            const form = document.getElementById('provider-form');
            const isEditMode = form.dataset.editMode === 'true';
            
            console.log('[UI] Save mode:', isEditMode ? 'update' : 'add');
            
            if (isEditMode) {
                // 更新现有供应商
                await ProviderManager.updateProvider(id, {
                    name,
                    baseUrl,
                    apiKey,
                    template,
                    priority
                });
                console.log('[UI] Provider updated:', id);
            } else {
                // 添加新供应商
                await ProviderManager.addProvider({
                    id,
                    name,
                    baseUrl,
                    apiKey,
                    template,
                    priority,
                    enabled: true
                });
                console.log('[UI] Provider added:', id);
            }
            
            // 刷新列表
            refreshProviderList();
            
            // 隐藏表单
            hideProviderForm();
            
            // 显示成功提示
            alert(isEditMode ? '✅ 供应商已更新！' : '✅ 供应商已添加！');
            
        } catch (error) {
            console.error('[UI] Failed to save provider:', error);
            alert('❌ 保存失败: ' + error.message);
        }
    }
    
    /**
     * 处理测试连接
     */
    async function handleTestConnection(providerId, button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = '⏳ 测试中...';
        
        try {
            const result = await ProviderManager.testProviderConnection(providerId);
            
            if (result.success) {
                button.textContent = '✅ 连接成功';
                button.style.background = '#10b981';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#3b82f6';
                    button.disabled = false;
                }, 2000);
            } else {
                button.textContent = '❌ 连接失败';
                button.style.background = '#ef4444';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#3b82f6';
                    button.disabled = false;
                }, 2000);
                
                alert(`连接测试失败:\n${result.error}`);
            }
        } catch (error) {
            console.error('[UI] Test connection failed:', error);
            button.textContent = '❌ 错误';
            button.style.background = '#ef4444';
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#3b82f6';
                button.disabled = false;
            }, 2000);
            
            alert('测试出错: ' + error.message);
        }
    }
    
    /**
     * 处理刷新模型
     */
    async function handleRefreshModels(providerId, button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = '⏳ 刷新中...';
        
        try {
            const provider = ProviderManager.getProviderById(providerId);
            if (!provider) {
                throw new Error('供应商不存在');
            }
            
            // 保存旧模型列表用于对比
            const oldModels = provider.models || [];
            const oldModelIds = oldModels.map(m => typeof m === 'string' ? m : m.id);
            
            // 根据提供商类型选择不同的刷新策略
            let models = [];
            
            if (providerId === 'openrouter') {
                // OpenRouter: 从 API 获取
                models = await fetchModelsFromOpenRouter();
            } else if (provider.baseUrl.includes('localhost') || provider.baseUrl.includes('127.0.0.1')) {
                // 本地服务: 尝试自动发现
                models = await ProviderManager.autoDiscoverLocalServices(provider.baseUrl);
            } else {
                // ✅ 其他提供商: 尝试使用标准 OpenAI 兼容的 /v1/models 接口
                console.log('[UI] 尝试通过 /v1/models 接口获取模型列表...');
                
                try {
                    const modelsUrl = `${provider.baseUrl}/models`;
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    
                    // 如果有 API Key，添加到请求头
                    if (provider.apiKey) {
                        headers['Authorization'] = `Bearer ${provider.apiKey}`;
                    }
                    
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: modelsUrl,
                            headers: headers,
                            timeout: 10000,
                            onload: (resp) => {
                                if (resp.status >= 200 && resp.status < 300) {
                                    resolve(resp);
                                } else {
                                    reject(new Error(`HTTP ${resp.status}: ${resp.statusText}`));
                                }
                            },
                            onerror: () => reject(new Error('网络请求失败')),
                            ontimeout: () => reject(new Error('请求超时'))
                        });
                    });
                    
                    const data = JSON.parse(response.responseText);
                    
                    // 解析模型列表（支持多种格式）
                    if (data.data && Array.isArray(data.data)) {
                        // OpenAI 格式: { data: [{ id: 'xxx', ... }, ...] }
                        models = data.data.map(m => ({
                            id: m.id,
                            name: m.id,
                            provider: providerId
                        }));
                        console.log(`[UI] 成功获取 ${models.length} 个模型`);
                    } else if (Array.isArray(data)) {
                        // 直接返回数组格式
                        models = data.map(m => ({
                            id: typeof m === 'string' ? m : m.id,
                            name: typeof m === 'string' ? m : (m.name || m.id),
                            provider: providerId
                        }));
                        console.log(`[UI] 成功获取 ${models.length} 个模型`);
                    } else {
                        throw new Error('无法解析模型列表格式');
                    }
                    
                } catch (error) {
                    console.warn('[UI] /v1/models 接口失败:', error.message);
                    alert(`该供应商暂不支持自动刷新模型。

错误信息: ${error.message}

您可以:
1. 在 "模型选择" 标签页中使用 Auto 模式
2. 或手动添加模型 ID
3. 或联系开发者添加支持`);
                    button.textContent = originalText;
                    button.disabled = false;
                    return;
                }
            }
            
            if (models && models.length > 0) {
                // ✅ 检查是否有旧模型不在新列表中
                const newModelIds = models.map(m => typeof m === 'string' ? m : m.id);
                const missingModels = oldModelIds.filter(id => !newModelIds.includes(id));
                
                // 如果有缺失的模型，询问用户是否保留
                if (missingModels.length > 0) {
                    const confirmMsg = `发现 ${missingModels.length} 个模型不在最新名单中：\n\n${missingModels.slice(0, 10).join('\n')}${missingModels.length > 10 ? '\n...' : ''}\n\n是否保留这些模型？\n- 点击“确定”保留（合并到最新列表）\n- 点击“取消”只保留最新模型`;
                    
                    if (confirm(confirmMsg)) {
                        // 用户选择保留：将旧模型添加到新列表中
                        const modelsToAdd = oldModels.filter(m => {
                            const modelId = typeof m === 'string' ? m : m.id;
                            return missingModels.includes(modelId);
                        });
                        
                        // 合并模型列表
                        models = [...models, ...modelsToAdd];
                        console.log(`[UI] 保留了 ${modelsToAdd.length} 个旧模型`);
                    } else {
                        console.log(`[UI] 删除了 ${missingModels.length} 个不在最新名单中的模型`);
                    }
                }
                
                // ✅ 使用 updateProvider 替换模型列表（而不是追加）
                await ProviderManager.updateProvider(providerId, { models: models });
                
                // 刷新列表
                refreshProviderList();
                
                button.textContent = `✅ ${models.length}个模型`;
                button.style.background = '#10b981';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#10b981';
                    button.disabled = false;
                }, 2000);
            } else {
                throw new Error('未找到任何模型');
            }
            
        } catch (error) {
            console.error('[UI] Refresh models failed:', error);
            button.textContent = '❌ 失败';
            button.style.background = '#ef4444';
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#10b981';
                button.disabled = false;
            }, 2000);
            
            alert('刷新模型失败: ' + error.message);
        }
    }
    
    /**
     * 处理编辑供应商
     */
    function handleEditProvider(providerId) {
        showProviderForm(providerId);
    }
    
    /**
     * 处理删除供应商
     */
    async function handleDeleteProvider(providerId) {
        if (!confirm(`确定要删除供应商 "${providerId}" 吗？\n\n此操作不可恢复！`)) {
            return;
        }
        
        try {
            await ProviderManager.deleteProvider(providerId);
            
            // 刷新列表
            refreshProviderList();
            
            alert('✅ 供应商已删除');
        } catch (error) {
            console.error('[UI] Delete provider failed:', error);
            alert('❌ 删除失败: ' + error.message);
        }
    }
    
    /**
     * 刷新供应商列表
     */
    function refreshProviderList() {
        const providers = ProviderManager.getAllProviders();
        const providerListEl = document.getElementById('provider-list');
        
        if (providerListEl) {
            providerListEl.innerHTML = buildProviderListHTML(providers);
        }
        
        // v4.0.0: 同时刷新主界面的模型选择器
        refreshMainModelSelect();
    }

    /**
     * 处理切换模型列表显示/隐藏
     */
    function handleToggleModels(providerId, button) {
        const modelsSection = document.getElementById(`models-${providerId}`);
        if (!modelsSection) return;
        
        const isVisible = modelsSection.style.display !== 'none';
        
        if (isVisible) {
            modelsSection.style.display = 'none';
            button.textContent = '📦 查看模型';
        } else {
            modelsSection.style.display = 'block';
            button.textContent = '🔼 隐藏模型';
        }
    }

    /**
     * v4.0.0: 处理模型上移
     */
    async function handleMoveModelUp(providerId, modelId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const index = provider.models.findIndex(m => (typeof m === 'string' ? m : m.id) === modelId);
        if (index <= 0) return; // 已经在最上面
        
        // 创建新数组并交换位置
        const newModels = [...provider.models];
        [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] Model moved up:', modelId);
    }

    /**
     * v4.0.0: 处理模型下移
     */
    async function handleMoveModelDown(providerId, modelId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const index = provider.models.findIndex(m => (typeof m === 'string' ? m : m.id) === modelId);
        if (index < 0 || index >= provider.models.length - 1) return; // 已经在最下面
        
        // 创建新数组并交换位置
        const newModels = [...provider.models];
        [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] Model moved down:', modelId);
    }

    /**
     * v4.0.0: 处理启用/禁用模型
     */
    async function handleToggleModelEnable(providerId, modelId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const modelIndex = provider.models.findIndex(m => (typeof m === 'string' ? m : m.id) === modelId);
        if (modelIndex < 0) return;
        
        // 创建新数组
        const newModels = [...provider.models];
        const model = newModels[modelIndex];
        
        // 切换 enabled 状态
        if (typeof model === 'object') {
            newModels[modelIndex] = { ...model, enabled: model.enabled !== false ? false : true };
        } else {
            // 如果是字符串，转换为对象
            newModels[modelIndex] = { id: model, enabled: false };
        }
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] Model toggled:', modelId, 'enabled:', newModels[modelIndex].enabled);
    }

    /**
     * v4.0.0: 处理删除模型
     */
    async function handleDeleteModel(providerId, modelId) {
        if (!confirm(`确定要删除模型 "${modelId}" 吗？`)) return;
        
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const newModels = provider.models.filter(m => (typeof m === 'string' ? m : m.id) !== modelId);
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] Model deleted:', modelId);
    }

    /**
     * v4.0.0: 处理批量启用模型
     */
    async function handleBulkEnableModels(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const newModels = provider.models.map(m => {
            if (typeof m === 'object') {
                return { ...m, enabled: true };
            }
            return m;
        });
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] All models enabled');
    }

    /**
     * v4.0.0: 处理批量禁用模型
     */
    async function handleBulkDisableModels(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models) return;
        
        const newModels = provider.models.map(m => {
            if (typeof m === 'object') {
                return { ...m, enabled: false };
            }
            return { id: typeof m === 'string' ? m : m.id, enabled: false };
        });
        
        await ProviderManager.updateProvider(providerId, { models: newModels });
        refreshProviderList();
        console.log('[UI] All models disabled');
    }

    /**
     * v4.0.0: 处理测试所有模型
     */
    async function handleTestModels(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models || provider.models.length === 0) {
            alert('没有可测试的模型');
            return;
        }
        
        // 检查是否有 API Key（本地服务不需要）
        if (!provider.apiKey && !provider.isLocal) {
            alert('请先配置 API Key');
            return;
        }
        
        const testBtn = document.querySelector(`[data-action="test-models"][data-provider-id="${providerId}"]`);
        if (testBtn) {
            testBtn.disabled = true;
            testBtn.textContent = '⏳ 测试中...';
        }
        
        try {
            let successCount = 0;
            let failCount = 0;
            const total = provider.models.length;
            
            console.log(`[UI] 开始测试 ${total} 个模型...`);
            
            // 获取供应商的模板和配置
            const template = ProviderManager.getTemplate(provider.template || 'openai');
            if (!template) {
                alert('无法获取 API 模板');
                return;
            }
            
            // 逐个测试模型
            for (let i = 0; i < provider.models.length; i++) {
                const model = provider.models[i];
                const modelId = typeof model === 'string' ? model : model.id;
                
                console.log(`[UI] 测试模型 ${i + 1}/${total}: ${modelId}`);
                
                try {
                    // 构建测试请求
                    const testUrl = `${provider.baseUrl}${template.endpoint}`;
                    const testHeaders = {};
                    
                    // 添加模板定义的 headers
                    if (template.headers) {
                        Object.keys(template.headers).forEach(key => {
                            let value = template.headers[key];
                            // 替换变量
                            if (value === '{{apiKey}}') {
                                value = provider.apiKey || '';
                            } else if (value === '{{model}}') {
                                value = modelId;
                            }
                            testHeaders[key] = value;
                        });
                    }
                    
                    // 添加 Content-Type
                    if (!testHeaders['Content-Type']) {
                        testHeaders['Content-Type'] = 'application/json';
                    }
                    
                    // 构建请求体
                    const testBody = {
                        model: modelId,
                        messages: [{ role: 'user', content: 'Hi' }],
                        max_tokens: 5
                    };
                    
                    // 发送测试请求
                    const result = await new Promise((resolve) => {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: testUrl,
                            headers: testHeaders,
                            data: JSON.stringify(testBody),
                            timeout: 10000, // 10秒超时
                            onload: (response) => {
                                resolve(response.status >= 200 && response.status < 300);
                            },
                            onerror: () => resolve(false),
                            ontimeout: () => resolve(false)
                        });
                    });
                    
                    if (result) {
                        successCount++;
                        // ✅ 保存测试结果
                        ModelManager.markModelTest(modelId, true);
                        console.log(`[UI] ✅ ${modelId} 测试成功`);
                    } else {
                        failCount++;
                        // ✅ 保存测试结果
                        ModelManager.markModelTest(modelId, false);
                        console.warn(`[UI] ❌ ${modelId} 测试失败`);
                    }
                    
                    // 更新按钮显示进度
                    if (testBtn) {
                        testBtn.textContent = `⏳ ${i + 1}/${total}`;
                    }
                    
                } catch (error) {
                    failCount++;
                    console.error(`[UI] ❌ ${modelId} 测试异常:`, error.message);
                }
            }
            
            // 显示测试结果
            const message = `测试完成！\n\n总计: ${total}\n✅ 成功: ${successCount}\n❌ 失败: ${failCount}\n\n可以点击“删除无效”按钮移除失败的模型。`;
            alert(message);
            
            console.log(`[UI] 测试完成: 成功 ${successCount}, 失败 ${failCount}`);
            
        } catch (error) {
            console.error('[UI] 测试过程出错:', error);
            alert('测试过程中出现错误: ' + error.message);
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.textContent = '🧪 测试模型';
            }
        }
    }

    /**
     * v4.0.0: 处理删除无效模型（测试失败的模型）
     */
    async function handleRemoveInvalidModels(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider || !provider.models || provider.models.length === 0) {
            alert('没有可删除的模型');
            return;
        }
        
        // 获取所有测试失败的模型
        const invalidModels = [];
        const validModels = [];
        
        for (const model of provider.models) {
            const modelId = typeof model === 'string' ? model : model.id;
            const isAvailable = ModelManager.isModelAvailable(modelId);
            
            if (isAvailable) {
                validModels.push(model);
            } else {
                invalidModels.push(modelId);
            }
        }
        
        if (invalidModels.length === 0) {
            alert('没有找到无效的模型，所有模型都可用！');
            return;
        }
        
        // 确认删除
        const confirmMsg = `确定要删除以下 ${invalidModels.length} 个无效模型吗？\n\n${invalidModels.slice(0, 10).join('\n')}${invalidModels.length > 10 ? '\n...' : ''}`;
        if (!confirm(confirmMsg)) {
            return;
        }
        
        // 更新模型列表
        await ProviderManager.updateProvider(providerId, { models: validModels });
        
        // ✅ 清除已删除模型的测试缓存
        invalidModels.forEach(modelId => {
            // 从 ModelManager 的状态中移除
            const status = GM_getValue('model_status', {});
            delete status[modelId];
            GM_setValue('model_status', status);
        });
        
        refreshProviderList();
        
        console.log(`[UI] 已删除 ${invalidModels.length} 个无效模型`);
        alert(`已删除 ${invalidModels.length} 个无效模型`);
    }

    /**
     * v4.0.0: 处理手动添加模型
     */
    function handleAddModel(providerId) {
        const provider = ProviderManager.getProviderById(providerId);
        if (!provider) {
            alert('供应商不存在');
            return;
        }
        
        // 弹窗输入模型 ID
        const modelId = prompt('请输入模型 ID：\n\n例如：gpt-4、claude-3-opus、qwen-max 等');
        
        if (!modelId || !modelId.trim()) {
            return; // 用户取消或输入为空
        }
        
        const trimmedModelId = modelId.trim();
        
        // 检查是否已存在
        const existingModels = provider.models || [];
        const exists = existingModels.some(m => {
            const id = typeof m === 'string' ? m : m.id;
            return id === trimmedModelId;
        });
        
        if (exists) {
            alert(`模型 "${trimmedModelId}" 已存在！`);
            return;
        }
        
        // 添加模型
        const newModel = {
            id: trimmedModelId,
            name: trimmedModelId,
            provider: providerId,
            enabled: true
        };
        
        const updatedModels = [...existingModels, newModel];
        
        ProviderManager.updateProvider(providerId, { models: updatedModels })
            .then(() => {
                refreshProviderList();
                console.log(`[UI] 已添加模型: ${trimmedModelId}`);
                alert(`✅ 模型 "${trimmedModelId}" 已添加！\n\n建议：\n1. 点击“🧪 测试模型”验证可用性\n2. 拖拽 ⋮⋮ 调整优先级`);
            })
            .catch(error => {
                console.error('[UI] 添加模型失败:', error);
                alert('❌ 添加模型失败: ' + error.message);
            });
    }

    /**
     * v4.0.0: 设置模型列表拖拽排序
     */
    function setupModelDragAndDrop(container) {
        let draggedItem = null;
        let dragSourceProvider = null;
        
        // 监听拖拽开始
        container.addEventListener('dragstart', (e) => {
            const modelItem = e.target.closest('.model-item');
            if (!modelItem) return;
            
            draggedItem = modelItem;
            dragSourceProvider = modelItem.closest('.models-list')?.dataset.providerId;
            
            modelItem.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', modelItem.dataset.modelId);
        });
        
        // 监听拖拽结束
        container.addEventListener('dragend', (e) => {
            const modelItem = e.target.closest('.model-item');
            if (modelItem) {
                modelItem.classList.remove('dragging');
            }
            draggedItem = null;
            dragSourceProvider = null;
        });
        
        // 监听拖拽经过
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const modelItem = e.target.closest('.model-item');
            if (!modelItem || !draggedItem || modelItem === draggedItem) return;
            
            // 确保是同一个供应商的模型
            const targetProvider = modelItem.closest('.models-list')?.dataset.providerId;
            if (targetProvider !== dragSourceProvider) return;
            
            e.dataTransfer.dropEffect = 'move';
            
            // 获取鼠标位置，决定插入位置
            const rect = modelItem.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            
            if (e.clientY < midpoint) {
                modelItem.parentNode.insertBefore(draggedItem, modelItem);
            } else {
                modelItem.parentNode.insertBefore(draggedItem, modelItem.nextSibling);
            }
        });
        
        // 监听放置
        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            
            if (!draggedItem || !dragSourceProvider) return;
            
            const modelId = draggedItem.dataset.modelId;
            const modelsList = draggedItem.closest('.models-list');
            
            // 获取新的顺序
            const newOrder = Array.from(modelsList.querySelectorAll('.model-item'))
                .map(item => item.dataset.modelId);
            
            console.log('[UI] New model order:', newOrder);
            
            // 更新供应商的模型顺序
            const provider = ProviderManager.getProviderById(dragSourceProvider);
            if (!provider || !provider.models) return;
            
            // 根据新顺序重新排列模型
            const reorderedModels = [];
            for (const id of newOrder) {
                const model = provider.models.find(m => (typeof m === 'string' ? m : m.id) === id);
                if (model) {
                    reorderedModels.push(model);
                }
            }
            
            await ProviderManager.updateProvider(dragSourceProvider, { models: reorderedModels });
            
            // 刷新显示
            refreshProviderList();
            console.log('[UI] Model order updated via drag & drop');
        });
    }
    
    /**
     * 处理嗅探本地服务
     */
    async function handleScanLocalServices() {
        const scanBtn = document.getElementById('scan-local-services');
        if (!scanBtn) return;
        
        const originalText = scanBtn.textContent;
        scanBtn.disabled = true;
        scanBtn.textContent = '⏳ 嗅探中...';
        
        try {
            // 常见的本地服务端口
            const commonPorts = [
                { name: 'LM Studio', port: 1234 },
                { name: 'Ollama', port: 11434 },
                { name: 'Text Generation WebUI', port: 5000 },
                { name: 'KoboldAI', port: 5001 }
            ];
            
            let foundCount = 0;
            const results = [];
            
            for (const service of commonPorts) {
                const baseUrl = `http://localhost:${service.port}/v1`;
                
                try {
                    // 尝试连接测试
                    const result = await new Promise((resolve) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: `${baseUrl}/models`,
                            timeout: 2000,
                            onload: (response) => {
                                if (response.status === 200) {
                                    resolve({ success: true, data: response.responseText });
                                } else {
                                    resolve({ success: false });
                                }
                            },
                            onerror: () => resolve({ success: false }),
                            ontimeout: () => resolve({ success: false })
                        });
                    });
                    
                    if (result.success) {
                        const data = JSON.parse(result.data);
                        const models = data.data || [];
                        
                        if (models.length > 0) {
                            // 检查是否已存在该供应商
                            const existingProvider = ProviderManager.getProviderById(service.name.toLowerCase().replace(/\s+/g, '-'));
                            
                            if (!existingProvider) {
                                // 创建新供应商
                                await ProviderManager.addProvider({
                                    id: service.name.toLowerCase().replace(/\s+/g, '-'),
                                    name: service.name,
                                    baseUrl: baseUrl,
                                    apiKey: '',
                                    template: 'OPENAI',
                                    priority: 10,
                                    enabled: true,
                                    isLocal: true  // v4.0.0: 标记为本地服务
                                });
                                
                                // 添加模型
                                const modelList = models.map(m => ({
                                    id: m.id,
                                    name: m.id,
                                    provider: service.name.toLowerCase().replace(/\s+/g, '-')
                                }));
                                
                                await ProviderManager.addModelsToProvider(
                                    service.name.toLowerCase().replace(/\s+/g, '-'),
                                    modelList
                                );
                                
                                foundCount++;
                                results.push(`${service.name} (${models.length} 个模型)`);
                            }
                        }
                    }
                } catch (error) {
                    // 忽略单个服务的错误，继续尝试其他端口
                }
            }
            
            // 刷新列表
            refreshProviderList();
            
            if (foundCount > 0) {
                scanBtn.textContent = `✅ 找到 ${foundCount} 个服务`;
                scanBtn.style.background = '#10b981';
                setTimeout(() => {
                    scanBtn.textContent = originalText;
                    scanBtn.style.background = '';
                    scanBtn.disabled = false;
                }, 3000);
                
                alert(`✅ 发现 ${foundCount} 个本地服务:\n\n${results.join('\n')}\n\n已自动添加到供应商列表。`);
            } else {
                scanBtn.textContent = '❌ 未找到服务';
                scanBtn.style.background = '#ef4444';
                setTimeout(() => {
                    scanBtn.textContent = originalText;
                    scanBtn.style.background = '';
                    scanBtn.disabled = false;
                }, 3000);
                
                alert('❌ 未检测到任何本地服务。\n\n请确保:\n• LM Studio / Ollama 等服务正在运行\n• 使用默认端口（1234, 11434 等）\n• 或手动添加供应商');
            }
            
        } catch (error) {
            console.error('[UI] Scan local services failed:', error);
            scanBtn.textContent = '❌ 错误';
            scanBtn.style.background = '#ef4444';
            setTimeout(() => {
                scanBtn.textContent = originalText;
                scanBtn.style.background = '';
                scanBtn.disabled = false;
            }, 3000);
            
            alert('嗅探失败: ' + error.message);
        }
    }

    /**
     * 从 OpenRouter API 获取模型列表
     */
    async function fetchModelsFromOpenRouter() {
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
                                    name: getModelDisplayName(model),
                                    provider: 'openrouter',
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
     * 获取模型显示名称
     */
    function getModelDisplayName(model) {
        const providerIcons = {
            'google': '✨',
            'meta-llama': '🦙',
            'llama': '🦙',
            'qwen': '💬',
            'aliyun': '💬',
            'deepseek': '🧠',
            'mistral': '⚡',
            'mistralai': '⚡',
            'openai': '🤖',
            'zhipu': '🇨🇳',
            'glm': '🇨🇳',
            'stepfun': '🚀',
            'arcee': '🔹'
        };

        const provider = model.id.split('/')[0];
        const icon = providerIcons[provider] || '🤖';
        
        return `${icon} ${model.name || model.id}`;
    }

    /**
     * 绑定设置对话框的事件监听
     */
    function bindSettingsEvents() {
        console.log('[UI] Binding settings events...');
        
        // v4.0.0: 标签页切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // 移除所有活动状态
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // 激活当前标签
                btn.classList.add('active');
                const tabId = `tab-${btn.dataset.tab}`;
                document.getElementById(tabId).classList.add('active');
            });
        });
        
        // v4.0.0: 使用事件委托处理表单按钮（更可靠）
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
            modalContent.addEventListener('click', (e) => {
                const target = e.target;
                
                // 添加供应商按钮
                if (target.id === 'add-provider-btn') {
                    console.log('[UI] Add provider button clicked');
                    showProviderForm();
                    return;
                }
                
                // 取消表单按钮
                if (target.id === 'cancel-provider-form') {
                    console.log('[UI] Cancel form button clicked');
                    hideProviderForm();
                    return;
                }
                
                // 保存供应商按钮
                if (target.id === 'save-provider') {
                    console.log('[UI] Save provider button clicked (via delegation)');
                    handleSaveProvider();
                    return;
                }
                
                // 保存设置按钮
                if (target.id === 'save-settings') {
                    console.log('[UI] Save settings button clicked (via delegation)');
                    saveSettings();
                    return;
                }
                
                // 取消设置按钮
                if (target.id === 'cancel-settings') {
                    console.log('[UI] Cancel settings button clicked (via delegation)');
                    closeModal();
                    return;
                }
            });
            
            // 官方供应商选择器变化事件
            const officialSelect = document.getElementById('official-provider-select');
            if (officialSelect) {
                officialSelect.addEventListener('change', (e) => {
                    const templateId = e.target.value;
                    if (templateId) {
                        console.log('[UI] Official provider selected:', templateId);
                        fillProviderFormFromTemplate(templateId);
                    }
                });
            } else {
                console.warn('[UI] official-provider-select not found');
            }
        } else {
            console.error('[UI] Modal content not found!');
        }
        
        // v4.0.0: 供应商卡片操作按钮（事件委托）
        const providerList = document.getElementById('provider-list');
        if (providerList) {
            providerList.addEventListener('click', async (e) => {
                const button = e.target.closest('[data-action]');
                if (!button) return;
                
                const action = button.dataset.action;
                const providerId = button.dataset.providerId;
                
                switch(action) {
                    case 'toggle-models':
                        handleToggleModels(providerId, button);
                        break;
                    case 'test':
                        await handleTestConnection(providerId, button);
                        break;
                    case 'refresh':
                        await handleRefreshModels(providerId, button);
                        break;
                    case 'edit':
                        handleEditProvider(providerId);
                        break;
                    case 'delete':
                        await handleDeleteProvider(providerId);
                        break;
                    // v4.0.0: 模型操作
                    case 'move-up':
                        await handleMoveModelUp(providerId, button.dataset.modelId);
                        break;
                    case 'move-down':
                        await handleMoveModelDown(providerId, button.dataset.modelId);
                        break;
                    case 'toggle-enable':
                        await handleToggleModelEnable(providerId, button.dataset.modelId);
                        break;
                    case 'delete-model':
                        await handleDeleteModel(providerId, button.dataset.modelId);
                        break;
                    case 'bulk-enable':
                        await handleBulkEnableModels(button.dataset.providerId);
                        break;
                    case 'bulk-disable':
                        await handleBulkDisableModels(button.dataset.providerId);
                        break;
                    // v4.0.0: 模型测试功能
                    case 'test-models':
                        await handleTestModels(button.dataset.providerId);
                        break;
                    case 'remove-invalid':
                        await handleRemoveInvalidModels(button.dataset.providerId);
                        break;
                    // v4.0.0: 手动添加模型
                    case 'add-model':
                        handleAddModel(button.dataset.providerId);
                        break;
                }
            });
            
            // v4.0.0: 模型列表拖拽排序
            setupModelDragAndDrop(providerList);
        }
        
        // v4.0.0: 嗅探本地服务
        const scanLocalBtn = document.getElementById('scan-local-services');
        if (scanLocalBtn) {
            scanLocalBtn.addEventListener('click', handleScanLocalServices);
        }
        
        // 温度滑块实时更新
        const tempSlider = document.getElementById('setting-temperature');
        if (tempSlider) {
            tempSlider.addEventListener('input', (e) => {
                const tempValue = document.getElementById('temp-value');
                if (tempValue) tempValue.textContent = e.target.value;
            });
        }

        // Top P 滑块实时更新
        const topPSlider = document.getElementById('setting-top-p');
        if (topPSlider) {
            topPSlider.addEventListener('input', (e) => {
                const toppValue = document.getElementById('topp-value');
                if (toppValue) toppValue.textContent = e.target.value;
            });
        }

        // 刷新模型列表
        setupModelRefresh();
        
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
     * 初始化模型选择（v4.0.0: 从 ProviderManager 获取）
     */
    async function initializeModelSelect(currentModel) {
        // v4.0.0: 从 ProviderManager 获取所有可用模型
        const models = ProviderManager.getAllAvailableModels();
        
        if (models.length === 0) {
            console.warn('[UI] No models available from providers');
            // 显示提示信息
            const modelsStatus = document.getElementById('models-status');
            if (modelsStatus) {
                modelsStatus.innerHTML = '<span style="color: #f59e0b;">⚠️ 没有可用模型，请配置提供商</span>';
            }
            return;
        }
        
        ModelManager.updateModelSelect(models, currentModel);
        
        // 显示模型统计信息
        const modelsStatus = document.getElementById('models-status');
        if (modelsStatus) {
            const providerCount = ProviderManager.getAllProviders().filter(p => p.enabled).length;
            modelsStatus.innerHTML = `<span style="color: #6b7280;">📦 已加载 ${models.length} 个模型 | ${providerCount} 个启用的提供商</span>`;
        }
    }

    /**
     * 设置模型刷新功能（v4.0.0: 已废弃，模型管理移至供应商管理）
     */
    function setupModelRefresh() {
        // v4.0.0: 此功能已移至供应商管理界面
        console.log('[UI] setupModelRefresh is deprecated in v4.0.0');
    }

    /**
     * 保存设置
     */
    function saveSettings() {
        console.log('[UI] Saving settings...');
        
        // v4.0.0: API Key 现在在供应商管理中配置，不再在这里设置
        const model = document.getElementById('setting-model')?.value || 'auto';
        const temperature = parseFloat(document.getElementById('setting-temperature')?.value || '0.7');
        const topP = parseFloat(document.getElementById('setting-top-p')?.value || '0.95');
        let maxTokens = parseInt(document.getElementById('setting-max-tokens')?.value || '2048');
        const jsEnabled = document.getElementById('setting-js-enabled')?.checked ?? true;

        console.log('[UI] Settings:', { model, temperature, topP, maxTokens, jsEnabled });

        // 验证并限制 maxTokens 范围
        if (isNaN(maxTokens) || maxTokens < 100) {
            maxTokens = 2048;
        } else if (maxTokens > 8192) {
            maxTokens = 8192;
            alert('⚠️ maxTokens 已自动限制为 8192，避免超出 API 限制');
        }

        // 保存到配置管理器 (浏览器存储)
        ConfigManager.set('model', model);
        ConfigManager.set('temperature', temperature);
        ConfigManager.set('topP', topP);
        ConfigManager.set('maxTokens', maxTokens);
        ConfigManager.set('jsExecutionEnabled', jsEnabled);

        console.log('[UI] 设置保存成功');

        closeModal();
        
        // 更新 UI 状态徽章
        updateStatusBadge(true); // v4.0.0: 只要有供应商就认为已配置
        
        // 显示成功消息
        appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #10b981;">
                    ✅ 设置已保存！
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
        console.log('[UI] updateStreamingMessage called:', messageId, 'text length:', text.length, 'first 50 chars:', text.substring(0, 50));
        
        const now = Date.now();
        const timeSinceLastUpdate = now - streamingUpdateState.lastUpdateTime;
        
        // 调试：记录节流决策
        console.log('[UI] Throttle check: timeSinceLastUpdate =', timeSinceLastUpdate, 'ms');
        
        // 如果距离上次更新不足 50ms，使用 requestAnimationFrame 延迟更新
        if (timeSinceLastUpdate < 50 && streamingUpdateState.lastUpdateTime !== 0) {
            console.log('[UI] Throttling: queuing update');
            
            // 取消之前的 pending 更新
            if (streamingUpdateState.rafId !== null) {
                cancelAnimationFrame(streamingUpdateState.rafId);
                console.log('[UI] Cancelled previous RAF');
            }
            
            // 保存最新的文本
            streamingUpdateState.pendingUpdate = { messageId, text };
            
            // 安排在下一帧更新
            streamingUpdateState.rafId = requestAnimationFrame(() => {
                if (streamingUpdateState.pendingUpdate) {
                    console.log('[UI] Performing pending update, text length:', streamingUpdateState.pendingUpdate.text.length);
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
            console.log('[UI] Performing direct update');
            performStreamingUpdate(messageId, text);
        }
    }

    /**
     * 执行实际的流式更新（内部函数）
     */
    function performStreamingUpdate(messageId, text) {
        console.log('[UI] performStreamingUpdate:', messageId, 'text length:', text.length);
        
        const messageEl = document.getElementById(messageId);
        if (!messageEl) {
            // 元素不存在可能是因为已经被 finalize 移除了 ID
            // 这是正常的竞态条件，静默忽略即可
            console.log('[UI] Message element not found (already finalized or removed):', messageId);
            return;
        }
        
        const contentEl = messageEl.querySelector('.message-content');
        if (contentEl) {
            console.log('[UI] Updating content, text preview:', text.substring(0, 100));
            // 格式化文本（支持代码块等）
            const formattedText = formatStreamingText(text);
            contentEl.innerHTML = formattedText;
            
            // 自动滚动到底部
            const chat = document.getElementById('agent-chat');
            if (chat) {
                chat.scrollTop = chat.scrollHeight;
            }
        } else {
            console.error('[UI] Content element not found in message:', messageId);
        }
        
        // 更新最后更新时间
        streamingUpdateState.lastUpdateTime = Date.now();
    }

    /**
     * 完成流式消息
     * @param {string} messageId - 消息 ID
     */
    function finalizeStreamingMessage(messageId) {
        console.log('[UI] Finalizing streaming message:', messageId);
        
        // 取消任何 pending 的更新
        if (streamingUpdateState.rafId !== null) {
            cancelAnimationFrame(streamingUpdateState.rafId);
            console.log('[UI] Cancelled pending RAF during finalize');
            streamingUpdateState.rafId = null;
        }
        
        // 清空 pending update
        if (streamingUpdateState.pendingUpdate) {
            // 如果 pending 的是当前消息，先执行最后一次更新
            if (streamingUpdateState.pendingUpdate.messageId === messageId) {
                console.log('[UI] Flushing final pending update before finalize');
                performStreamingUpdate(
                    streamingUpdateState.pendingUpdate.messageId,
                    streamingUpdateState.pendingUpdate.text
                );
            }
            streamingUpdateState.pendingUpdate = null;
        }
        
        const messageEl = document.getElementById(messageId);
        if (messageEl) {
            // 移除 ID，标记为完成
            messageEl.removeAttribute('id');
            console.log('[UI] Message finalized, ID removed');
        } else {
            console.warn('[UI] Message element not found during finalize:', messageId);
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
        finalizeStreamingMessage,
        initializeMainModelSelect,  // v4.0.0
        refreshMainModelSelect      // v4.0.0
    };
})();
