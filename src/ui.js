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
            #ai-agent {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 550px;  /* 增加宽度以容纳侧边栏 */
                height: 550px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                z-index: 999999;
                display: flex;
                flex-direction: row;  /* 改为横向布局 */
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 1px solid #e0e0e0;
                transition: all 0.3s ease;
                overflow: hidden;
            }

            
            /* 侧边栏样式（VSCode 风格） */
            #agent-sidebar {
                width: 40px;
                background: #2c2c2c;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 8px 0;
                gap: 4px;
                transition: width 0.3s ease;
                flex-shrink: 0;
                position: relative;
            }
            #agent-sidebar.expanded {
                width: 320px;
                align-items: stretch;
                padding: 0;
            }
            .sidebar-btn {
                width: 36px;
                height: 36px;
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                border-radius: 4px;
                transition: all 0.2s;
                position: relative;
            }
            .sidebar-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .sidebar-btn.active {
                background: rgba(255,255,255,0.15);
                color: white;
            }
            .sidebar-btn::before {
                content: attr(data-tooltip);
                position: absolute;
                left: 45px;
                background: #333;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s;
                z-index: 1000;
            }
            .sidebar-btn:hover::before {
                opacity: 1;
            }
            
            /* 收缩按钮（交界区域） */
            #sidebar-collapse {
                position: absolute;
                right: -12px;
                top: 50%;
                transform: translateY(-50%);
                width: 12px;
                height: 40px;
                background: #2c2c2c;
                border: 1px solid #3a3a3a;
                border-left: none;
                border-radius: 0 6px 6px 0;
                color: #888;
                font-size: 10px;
                cursor: pointer;
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 100;
                transition: all 0.2s;
            }
            #agent-sidebar.expanded #sidebar-collapse {
                display: flex;
            }
            #sidebar-collapse:hover {
                background: #3a3a3a;
                color: white;
                width: 14px;
            }
            
            /* 侧边栏内容区域 */
            #sidebar-content {
                display: none;
                flex: 1;
                flex-direction: column;
                background: #252526;
                overflow: hidden;
            }
            #agent-sidebar.expanded #sidebar-content {
                display: flex;
            }
            .sidebar-header {
                padding: 10px 12px;
                background: #333;
                color: white;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .sidebar-header-actions {
                display: flex;
                gap: 6px;
            }
            .sidebar-header-btn {
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                font-size: 14px;
                padding: 2px 6px;
                border-radius: 3px;
                transition: all 0.2s;
            }
            .sidebar-header-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            #workspace-tree {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            }
            .sidebar-close-btn {
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                font-size: 16px;
                padding: 2px 6px;
                border-radius: 3px;
            }
            .sidebar-close-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            #workspace-tree {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            }
            .workspace-item {
                padding: 6px 8px;
                color: #cccccc;
                cursor: pointer;
                border-radius: 4px;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 2px;
            }
            .workspace-item:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .workspace-item.active {
                background: rgba(102, 126, 234, 0.3);
                color: white;
            }
            .file-tree-item {
                padding: 4px 8px;
                padding-left: 20px;
                color: #cccccc;
                cursor: pointer;
                border-radius: 3px;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 1px;
            }
            .file-tree-item:hover {
                background: rgba(255,255,255,0.08);
                color: white;
            }
            .file-tree-item.folder {
                color: #e8e8e8;
            }
            .file-tree-item.file {
                padding-left: 32px;
            }
            .file-tree-item .file-actions {
                display: none;
                gap: 4px;
            }
            .file-tree-item:hover .file-actions {
                display: flex;
            }
            .file-action-btn {
                background: transparent;
                border: none;
                color: #888;
                cursor: pointer;
                font-size: 12px;
                padding: 2px 4px;
                border-radius: 3px;
            }
            .file-action-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            
            /* 文件编辑器 */
            #file-editor-panel {
                display: none;
                flex-direction: column;
                flex: 1;
                background: #1e1e1e;
            }
            #file-editor-panel.active {
                display: flex;
            }
            .editor-header {
                padding: 8px 12px;
                background: #2d2d2d;
                border-bottom: 1px solid #3e3e3e;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .editor-title {
                color: #cccccc;
                font-size: 12px;
                font-weight: 500;
            }
            .editor-actions {
                display: flex;
                gap: 6px;
            }
            .editor-btn {
                padding: 4px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            }
            .editor-btn.save {
                background: #0e639c;
                color: white;
            }
            .editor-btn.save:hover {
                background: #1177bb;
            }
            .editor-btn.cancel {
                background: #3c3c3c;
                color: #cccccc;
            }
            .editor-btn.cancel:hover {
                background: #505050;
            }
            #file-editor-textarea {
                flex: 1;
                padding: 12px;
                background: #1e1e1e;
                color: #d4d4d4;
                border: none;
                resize: none;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.5;
                outline: none;
            }
            
            /* 主内容区域 */
            #agent-main {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: 0;
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
        assistant.id = 'ai-agent';
        assistant.innerHTML = `
            <!-- 侧边栏（VSCode 风格） -->
            <div id="agent-sidebar">
                <button class="sidebar-btn" id="sidebar-workspace" data-tooltip="工作空间">📁</button>
                
                <!-- 侧边栏内容区域 -->
                <div id="sidebar-content">
                    <!-- 文件浏览器视图 -->
                    <div id="file-browser-view" style="display: none; flex-direction: column; flex: 1;">
                        <div class="sidebar-header">
                            <span>资源管理器</span>
                            <div class="sidebar-header-actions">
                                <button class="sidebar-header-btn" id="btn-reopen-workspace" title="重新打开工作空间">📂</button>
                                <button class="sidebar-header-btn" id="btn-refresh" title="刷新">🔄</button>
                                <button class="sidebar-header-btn" id="btn-new-file" title="新建文件">📄+</button>
                                <button class="sidebar-header-btn" id="btn-new-folder" title="新建文件夹">📁+</button>
                            </div>
                        </div>
                        <div id="workspace-tree">
                            <div style="padding: 20px; color: #888; text-align: center; font-size: 12px;">
                                点击 📁 打开文件夹
                            </div>
                        </div>
                    </div>
                    
                    <!-- 文件编辑器视图 -->
                    <div id="file-editor-panel">
                        <div class="editor-header">
                            <span class="editor-title" id="editor-file-name">未命名文件</span>
                            <div class="editor-actions">
                                <button class="editor-btn save" id="editor-save-btn">💾 保存</button>
                                <button class="editor-btn cancel" id="editor-cancel-btn">✖ 取消</button>
                            </div>
                        </div>
                        <textarea id="file-editor-textarea" placeholder="编辑文件内容..."></textarea>
                    </div>
                </div>
                
                <!-- 收缩按钮（交界区域） -->
                <div id="sidebar-collapse" title="收起侧边栏">◀</div>
            </div>
            
            <!-- 主内容区域 -->
            <div id="agent-main">
                <div id="agent-header">
                    <div id="agent-title">
                        <span>✨</span>
                        <span>AI 助手</span>
                        ${config.apiKey ? '<span class="status-badge status-active">已配置</span>' : '<span class="status-badge status-inactive">未配置</span>'}
                    </div>
                    <div id="agent-controls">
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
            </div>
        `;
        document.body.appendChild(assistant);
        
        setupEventListeners();
        setupChatEventDelegation(); // 调用事件委托，使代码执行按钮生效
        
        return assistant;
    }

    /**
     * 设置事件监听
     */
    function setupEventListeners() {
        const sendBtn = document.getElementById('agent-send');
        const input = document.getElementById('agent-input');
        const closeBtn = document.getElementById('agent-close');
        const settingsBtn = document.getElementById('agent-settings');
        const clearBtn = document.getElementById('agent-clear');
        
        // 侧边栏按钮
        const sidebarWorkspaceBtn = document.getElementById('sidebar-workspace');
        const sidebarCollapse = document.getElementById('sidebar-collapse');
        const sidebar = document.getElementById('agent-sidebar');
        
        // 侧边栏工具栏按钮
        const btnReopenWorkspace = document.getElementById('btn-reopen-workspace');
        const btnRefresh = document.getElementById('btn-refresh');
        const btnNewFile = document.getElementById('btn-new-file');
        const btnNewFolder = document.getElementById('btn-new-folder');
        
        // 编辑器按钮
        const editorSaveBtn = document.getElementById('editor-save-btn');
        const editorCancelBtn = document.getElementById('editor-cancel-btn');
        const fileEditorPanel = document.getElementById('file-editor-panel');

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
            // 触发 Agent 关闭事件，显示启动按钮
            window.dispatchEvent(new CustomEvent('agent-closed'));
            // 保存隐藏状态
            if (typeof ConfigManager !== 'undefined' && ConfigManager.saveChatVisibility) {
                ConfigManager.saveChatVisibility(false);
            }
        });

        // 侧边栏 - 工作空间按钮
        sidebarWorkspaceBtn.addEventListener('click', () => {
            toggleSidebar();
        });
        
        // 侧边栏 - 收缩按钮
        sidebarCollapse.addEventListener('click', () => {
            sidebar.classList.remove('expanded');
            sidebarWorkspaceBtn.classList.remove('active');
        });
        
        // 侧边栏 - 重新打开工作空间按钮
        btnReopenWorkspace?.addEventListener('click', () => {
            // 重新打开工作空间
            StorageManager.openFolder();
        });
        
        // 侧边栏 - 刷新按钮
        btnRefresh?.addEventListener('click', () => {
            loadWorkspaceList();
        });
        
        // 侧边栏 - 新建文件按钮
        btnNewFile?.addEventListener('click', async () => {
            const currentWs = StorageManager.getCurrentWorkspace();
            if (!currentWs || !currentWs.folderHandle) {
                alert('⚠️ 请先打开一个文件夹');
                return;
            }
            
            const fileName = prompt('请输入文件名:');
            if (fileName) {
                try {
                    await StorageManager.createFileInFolder(currentWs.folderHandle, fileName, '');
                    loadWorkspaceList(); // 刷新文件树
                } catch (error) {
                    alert(`❌ 创建文件失败: ${error.message}`);
                }
            }
        });
        
        // 侧边栏 - 新建文件夹按钮
        btnNewFolder?.addEventListener('click', async () => {
            const currentWs = StorageManager.getCurrentWorkspace();
            if (!currentWs || !currentWs.folderHandle) {
                alert('⚠️ 请先打开一个文件夹');
                return;
            }
            
            const folderName = prompt('请输入文件夹名:');
            if (folderName) {
                try {
                    await StorageManager.createNewFolder(currentWs.folderHandle, folderName);
                    loadWorkspaceList(); // 刷新文件树
                } catch (error) {
                    alert(`❌ 创建文件夹失败: ${error.message}`);
                }
            }
        });
        
        // 编辑器 - 保存按钮
        editorSaveBtn?.addEventListener('click', async () => {
            const fileName = fileEditorPanel.dataset.fileName;
            const content = document.getElementById('file-editor-textarea').value;
            const fileHandle = window._currentEditingFileHandle;
            
            if (!fileHandle || !fileName) {
                alert('⚠️ 无法获取文件句柄');
                return;
            }
            
            try {
                await StorageManager.writeFileContent(fileHandle, content);
                alert(`✅ 文件 ${fileName} 已保存`);
                closeFileEditor();
                loadWorkspaceList(); // 刷新文件树
            } catch (error) {
                alert(`❌ 保存文件失败: ${error.message}`);
            }
        });
        
        // 编辑器 - 取消按钮
        editorCancelBtn?.addEventListener('click', () => {
            if (confirm('确定要放弃未保存的更改吗？')) {
                closeFileEditor();
            }
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
    }
    
    /**
     * 切换侧边栏显示状态
     */
    function toggleSidebar() {
        const sidebar = document.getElementById('agent-sidebar');
        const workspaceBtn = document.getElementById('sidebar-workspace');
        const fileBrowserView = document.getElementById('file-browser-view');
        const fileEditorPanel = document.getElementById('file-editor-panel');
        
        if (sidebar.classList.contains('expanded')) {
            // 如果已经展开，则关闭
            sidebar.classList.remove('expanded');
            workspaceBtn.classList.remove('active');
        } else {
            // 展开工作空间
            sidebar.classList.add('expanded');
            workspaceBtn.classList.add('active');
            
            // 确保显示文件浏览器视图
            fileBrowserView.style.display = 'flex';
            fileEditorPanel.classList.remove('active');
            
            // 加载工作空间列表
            loadWorkspaceList();
        }
    }
    
    /**
     * 权限检查状态（避免重复检查）
     */
    let permissionChecked = false;
    
    /**
     * 加载工作空间列表到侧边栏
     */
    async function loadWorkspaceList() {
        const treeContainer = document.getElementById('workspace-tree');
        if (!treeContainer) return;
        
        try {
            const currentWs = StorageManager.getCurrentWorkspace();
            
            if (!currentWs) {
                treeContainer.innerHTML = `
                    <div style="padding: 20px; color: #888; text-align: center; font-size: 12px;">
                        未设置工作目录<br>
                        <button id="open-folder-btn" style="
                            margin-top: 10px;
                            padding: 6px 12px;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">📁 选择文件夹</button>
                    </div>
                `;
                
                document.getElementById('open-folder-btn')?.addEventListener('click', () => {
                    StorageManager.openFolder();
                });
                return;
            }
            
            // 显示文件树（移除工作空间头部信息，直接在文件树顶部显示）
            if (!currentWs.folderHandle) {
                treeContainer.innerHTML = `
                    <div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">
                        📁 未关联文件夹
                    </div>
                `;
                return;
            }
            
            // 仅在首次展开时检查权限，之后使用浏览器缓存
            if (!permissionChecked) {
                permissionChecked = true;
                treeContainer.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">检查权限中...</div>';
                
                try {
                    const permission = await currentWs.folderHandle.queryPermission({ mode: 'readwrite' });
                    if (permission !== 'granted') {
                        // 权限未授予，提示用户
                        treeContainer.innerHTML = `
                            <div style="padding: 8px; color: #f59e0b; font-size: 12px; text-align: center;">
                                ⚠️ 需要重新授权<br>
                                <button id="change-folder-btn" style="
                                    margin-top: 8px;
                                    padding: 6px 12px;
                                    background: #f59e0b;
                                    color: white;
                                    border: none;
                                    border-radius: 4px;
                                    cursor: pointer;
                                    font-size: 12px;
                                ">重新选择文件夹</button>
                            </div>
                        `;
                        document.getElementById('change-folder-btn')?.addEventListener('click', () => {
                            StorageManager.openFolder();
                        });
                        return;
                    }
                } catch (e) {
                    treeContainer.innerHTML = `
                        <div style="padding: 8px; color: #ef4444; font-size: 12px; text-align: center;">
                            ❌ 文件夹句柄无效<br>
                            <button id="change-folder-btn" style="
                                margin-top: 8px;
                                padding: 6px 12px;
                                background: #ef4444;
                                color: white;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            ">重新选择文件夹</button>
                        </div>
                    `;
                    document.getElementById('change-folder-btn')?.addEventListener('click', () => {
                        StorageManager.openFolder();
                    });
                    return;
                }
            }
            
            // 加载文件树
            treeContainer.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">加载中...</div>';
            
            try {
                const items = await getDirectoryList(currentWs.folderHandle);
                
                if (items.length === 0) {
                    treeContainer.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">📂 空文件夹</div>';
                    return;
                }
                
                treeContainer.innerHTML = '';
                renderFileTree(items, treeContainer, currentWs.folderHandle, 0);
                
            } catch (error) {
                console.error('加载文件树失败:', error);
                treeContainer.innerHTML = `
                    <div style="padding: 8px; color: #ef4444; font-size: 12px; text-align: center;">
                        ❌ ${error.message}
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('加载工作空间失败:', error);
            treeContainer.innerHTML = `
                <div style="padding: 20px; color: #ef4444; text-align: center; font-size: 12px;">
                    加载失败: ${error.message}
                </div>
            `;
        }
    }
    
    /**
     * 加载工作空间的文件树
     */
    async function loadWorkspaceFileTree(workspace, container) {
        if (!workspace) {
            container.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px;">工作空间不存在</div>';
            return;
        }
        
        if (!workspace.folderHandle) {
            container.innerHTML = `
                <div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">
                    📁 未关联文件夹
                </div>
            `;
            return;
        }
        
        // 检查权限
        try {
            const permission = await workspace.folderHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                container.innerHTML = `
                    <div style="padding: 8px; color: #f59e0b; font-size: 12px; text-align: center;">
                        ⚠️ 需要重新授权
                    </div>
                `;
                return;
            }
        } catch (e) {
            container.innerHTML = `
                <div style="padding: 8px; color: #ef4444; font-size: 12px; text-align: center;">
                    ❌ 文件夹句柄无效
                </div>
            `;
            return;
        }
        
        container.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">加载中...</div>';
        
        try {
            const items = await getDirectoryList(workspace.folderHandle);
            
            if (items.length === 0) {
                container.innerHTML = '<div style="padding: 8px; color: #888; font-size: 12px; text-align: center;">📂 空文件夹</div>';
                return;
            }
            
            container.innerHTML = '';
            renderFileTree(items, container, workspace.folderHandle, 0);
            
        } catch (error) {
            console.error('加载文件树失败:', error);
            container.innerHTML = `
                <div style="padding: 8px; color: #ef4444; font-size: 12px; text-align: center;">
                    ❌ ${error.message}
                </div>
            `;
        }
    }
    
    /**
     * 获取目录列表（从 StorageManager 导入）
     */
    async function getDirectoryList(dirHandle) {
        const asyncIterator = dirHandle.entries();
        const directories = [];
        const files = [];
        
        for await (const [key, value] of asyncIterator) {
            if (key === '.workspace.json') continue;
            
            if (value.kind === 'directory') {
                directories.push({
                    type: 'directory',
                    name: key,
                    handle: value
                });
            } else if (value.kind === 'file') {
                files.push({
                    type: 'file',
                    name: key,
                    handle: value
                });
            }
        }
        
        directories.sort((a, b) => a.name.localeCompare(b.name));
        files.sort((a, b) => a.name.localeCompare(b.name));
        
        return directories.concat(files);
    }
    
    /**
     * 渲染文件树
     */
    function renderFileTree(items, container, dirHandle, level = 0) {
        items.forEach(item => {
            const isDir = item.type === 'directory';
            const indent = level * 16;
            
            const itemDiv = document.createElement('div');
            itemDiv.className = `file-tree-item ${isDir ? 'folder' : 'file'}`;
            itemDiv.style.cssText = `
                padding-left: ${20 + indent}px;
            `;
            
            const icon = isDir ? '📁' : getFileIcon(item.name);
            
            // 文件操作按钮（仅文件显示）
            const fileActionsHtml = !isDir ? `
                <div class="file-actions">
                    <button class="file-action-btn edit-btn" title="编辑">✏️</button>
                    <button class="file-action-btn download-btn" title="下载">⬇️</button>
                    <button class="file-action-btn rename-btn" title="重命名">✍️</button>
                    <button class="file-action-btn delete-btn" title="删除">🗑️</button>
                </div>
            ` : '';
            
            itemDiv.innerHTML = `
                <span style="font-size: 14px;">${icon}</span>
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.name)}</span>
                ${fileActionsHtml}
            `;
            
            // 点击文件名：文件夹展开/折叠，文件打开编辑器
            itemDiv.addEventListener('click', async (e) => {
                // 如果点击的是操作按钮，不触发文件打开
                if (e.target.closest('.file-action-btn')) return;
                
                e.stopPropagation();
                if (isDir) {
                    // TODO: 展开/折叠子目录
                    console.log('展开子目录:', item.name);
                } else {
                    // 点击文件：在侧边栏编辑器中打开
                    openFileInEditor(item.handle, item.name);
                }
            });
            
            // 绑定文件操作按钮事件
            if (!isDir) {
                itemDiv.querySelector('.edit-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await openFileInEditor(item.handle, item.name);
                });
                
                itemDiv.querySelector('.download-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await StorageManager.downloadFile(item.handle, item.name);
                });
                
                itemDiv.querySelector('.rename-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const newName = prompt('新文件名:', item.name);
                    if (newName && newName !== item.name) {
                        await StorageManager.renameFileOrFolder(item.handle, item.name, newName);
                        loadWorkspaceList(); // 刷新文件树
                    }
                });
                
                itemDiv.querySelector('.delete-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`确定要删除 ${item.name} 吗？`)) {
                        await StorageManager.deleteFileOrFolder(item.handle, item.name, isDir);
                        loadWorkspaceList(); // 刷新文件树
                    }
                });
            }
            
            container.appendChild(itemDiv);
        });
    }
    
    /**
     * 在侧边栏编辑器中打开文件
     */
    async function openFileInEditor(fileHandle, fileName) {
        try {
            const fileBrowserView = document.getElementById('file-browser-view');
            const fileEditorPanel = document.getElementById('file-editor-panel');
            const editorFileName = document.getElementById('editor-file-name');
            const editorTextarea = document.getElementById('file-editor-textarea');
            
            // 切换到编辑器视图
            fileBrowserView.style.display = 'none';
            fileEditorPanel.classList.add('active');
            
            // 显示文件名
            editorFileName.textContent = fileName;
            editorTextarea.value = '加载中...';
            
            // 读取文件内容
            const content = await StorageManager.readFileContent(fileHandle);
            editorTextarea.value = content;
            
            // 保存文件名到编辑器（用于保存时重新获取句柄）
            fileEditorPanel.dataset.fileName = fileName;
            
            // 保存当前编辑的文件句柄（通过闭包）
            window._currentEditingFileHandle = fileHandle;
            
        } catch (error) {
            console.error('打开文件失败:', error);
            alert(`❌ 打开文件失败: ${error.message}`);
        }
    }
    
    /**
     * 关闭编辑器，返回文件浏览器
     */
    function closeFileEditor() {
        const fileBrowserView = document.getElementById('file-browser-view');
        const fileEditorPanel = document.getElementById('file-editor-panel');
        
        fileEditorPanel.classList.remove('active');
        fileBrowserView.style.display = 'flex';
        
        // 清除当前编辑的文件句柄
        window._currentEditingFileHandle = null;
    }
    
    /**
     * 获取文件图标
     */
    function getFileIcon(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const icons = {
            'js': '📜',
            'ts': '📘',
            'html': '🌐',
            'css': '🎨',
            'json': '📋',
            'md': '📝',
            'txt': '📄',
            'py': '🐍',
            'java': '☕',
            'xml': '📰'
        };
        return icons[ext] || '📄';
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
     * 设置聊天区域事件委托
     */
    function setupChatEventDelegation() {
        const chat = document.getElementById('agent-chat');
        if (!chat) return;

        // 使用事件委托处理代码块按钮点击
        chat.addEventListener('click', (e) => {
            const target = e.target.closest('button[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const assistantMessage = target.closest('.assistant-message');
            if (!assistantMessage) return;

            const codeBlock = assistantMessage.querySelector('.code-block');
            if (!codeBlock) return;

            // 从全局存储中获取代码（避免 HTML 转义问题）
            const blockId = codeBlock.dataset.codeId;
            const code = ChatManager.getCodeFromStore(blockId);
            
            if (!code) {
                console.error('未找到代码块:', blockId);
                return;
            }

            if (action === 'execute-code') {
                // 派发自定义事件,由 main.js 处理
                window.dispatchEvent(new CustomEvent('agent-execute-code', { detail: code }));
            } else if (action === 'copy-code') {
                // 复制代码
                navigator.clipboard.writeText(code).then(() => {
                    const originalText = target.textContent;
                    target.textContent = '✓ 已复制';
                    setTimeout(() => {
                        target.textContent = originalText;
                    }, 2000);
                });
            }
        });
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
            
            // 保存显示状态到当前域名
            if (typeof ConfigManager !== 'undefined' && ConfigManager.saveChatVisibility) {
                ConfigManager.saveChatVisibility(true);
            }
        }
    }

    /**
     * 隐藏助手
     */
    function hide() {
        if (assistant) {
            assistant.style.display = 'none';
            // 触发 Agent 关闭事件，显示启动按钮
            window.dispatchEvent(new CustomEvent('agent-closed'));
            
            // 保存隐藏状态到当前域名
            if (typeof ConfigManager !== 'undefined' && ConfigManager.saveChatVisibility) {
                ConfigManager.saveChatVisibility(false);
            }
        }
    }

    /**
     * HTML 转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        hide,
        loadWorkspaceList,  // 导出给 storage.js 调用，用于刷新侧边栏
        closeFileEditor     // 导出关闭编辑器功能
    };
})();
