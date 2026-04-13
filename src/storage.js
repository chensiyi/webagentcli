// ==================== 存储管理工作空间模块 ====================

const StorageManager = (function() {
    const WORKSPACE_KEY = 'agent_workspaces';
    const HANDLE_STORE_KEY = 'agent_directory_handles';
    let currentWorkspace = null;
    let workspaces = [];

    /**
     * 从 IndexedDB 恢复 directory handle
     */
    async function restoreDirectoryHandle(workspaceId) {
        try {
            const db = await openHandleDB();
            const transaction = db.transaction(HANDLE_STORE_KEY, 'readonly');
            const store = transaction.objectStore(HANDLE_STORE_KEY);
            const handle = await new Promise((resolve, reject) => {
                const request = store.get(workspaceId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (handle) {
                console.log('✅ 从 IndexedDB 恢复了 folderHandle');
                // 检查权限是否仍然有效
                try {
                    const permission = await handle.queryPermission({ mode: 'readwrite' });
                    if (permission === 'granted') {
                        console.log('✅ folderHandle 权限有效，可直接使用');
                        return handle;
                    } else {
                        console.warn('⚠️ folderHandle 权限未授予，需要用户点击授权');
                        // 不自动调用 requestPermission，因为需要用户手势
                        // 返回 null，触发 promptReopenFolder 提示
                    }
                } catch (e) {
                    console.warn('⚠️ 查询权限失败，句柄可能已损坏:', e);
                }
            }
            
            return null;
        } catch (error) {
            console.error('恢复 folderHandle 失败:', error);
            return null;
        }
    }

    /**
     * 将 directory handle 保存到 IndexedDB
     */
    async function persistDirectoryHandle(workspaceId, dirHandle) {
        try {
            const db = await openHandleDB();
            const transaction = db.transaction(HANDLE_STORE_KEY, 'readwrite');
            const store = transaction.objectStore(HANDLE_STORE_KEY);
            
            await new Promise((resolve, reject) => {
                const request = store.put(dirHandle, workspaceId);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            console.log('✅ folderHandle 已保存到 IndexedDB');
        } catch (error) {
            console.error('保存 folderHandle 失败:', error);
        }
    }

    /**
     * 打开 IndexedDB
     */
    function openHandleDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('AgentDirectoryHandles', 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(HANDLE_STORE_KEY)) {
                    db.createObjectStore(HANDLE_STORE_KEY);
                }
            };
            
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * 初始化工作空间
     */
    async function init() {
        try {
            const saved = GM_getValue(WORKSPACE_KEY, null);
            if (saved) {
                workspaces = JSON.parse(saved);
            }
            
            // 如果没有工作空间,创建默认的
            if (workspaces.length === 0) {
                createWorkspace('Default Workspace', '默认工作空间');
            }
            
            // 加载最后一个使用的工作空间
            const lastUsed = GM_getValue('last_workspace', null);
            if (lastUsed) {
                await loadWorkspace(lastUsed);
            } else {
                await loadWorkspace(workspaces[0].id);
            }
            
            // 尝试恢复 folderHandle
            if (currentWorkspace && currentWorkspace.folderPath) {
                const restoredHandle = await restoreDirectoryHandle(currentWorkspace.id);
                if (restoredHandle) {
                    currentWorkspace.folderHandle = restoredHandle;
                    console.log('✅ 成功恢复 folderHandle');
                } else {
                    console.warn('⚠️ 无法恢复 folderHandle，需要用户重新授权');
                    // 延迟提示，等待 UI 初始化完成
                    setTimeout(() => {
                        promptReopenFolder();
                    }, 1500);
                }
            }
        } catch (error) {
            console.error('初始化工作空间失败:', error);
            workspaces = [];
            createWorkspace('Default Workspace', '默认工作空间');
        }
    }

    /**
     * 提示用户重新打开文件夹
     */
    function promptReopenFolder() {
        if (!currentWorkspace || !currentWorkspace.folderPath) return;
        
        const shouldReopen = confirm(
            `⚠️ 工作空间 "${currentWorkspace.name}" 关联了本地文件夹\n\n` +
            `文件夹路径: ${currentWorkspace.folderPath}\n\n` +
            `由于浏览器安全限制，需要重新授权访问。\n\n` +
            `是否现在重新打开该文件夹？`
        );
        
        if (shouldReopen) {
            // 调用 openFolder，但需要用户手动选择相同的文件夹
            openFolder();
        }
    }

    /**
     * 创建工作空间
     */
    function createWorkspace(name, description = '') {
        const workspace = {
            id: generateId(),
            name: name,
            description: description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            data: {
                conversations: [],
                settings: {},
                customData: {}
            }
        };
        
        workspaces.push(workspace);
        saveWorkspaces();
        
        return workspace;
    }

    /**
     * 删除工作空间
     */
    function deleteWorkspace(id) {
        const index = workspaces.findIndex(ws => ws.id === id);
        if (index > -1) {
            workspaces.splice(index, 1);
            saveWorkspaces();
            
            // 如果删除的是当前工作空间,切换到第一个
            if (currentWorkspace && currentWorkspace.id === id) {
                if (workspaces.length > 0) {
                    loadWorkspace(workspaces[0].id);
                } else {
                    currentWorkspace = null;
                }
            }
            
            return true;
        }
        return false;
    }

    /**
     * 重命名工作空间
     */
    function renameWorkspace(id, newName) {
        const workspace = workspaces.find(ws => ws.id === id);
        if (workspace) {
            workspace.name = newName;
            workspace.updatedAt = Date.now();
            saveWorkspaces();
            return true;
        }
        return false;
    }

    /**
     * 加载工作空间
     */
    async function loadWorkspace(id) {
        console.log('🔍 调试 loadWorkspace - 开始加载工作空间:', id);
        const workspace = workspaces.find(ws => ws.id === id);
        if (workspace) {
            currentWorkspace = workspace;
            GM_setValue('last_workspace', id);
            console.log('🔍 调试 loadWorkspace - 找到工作空间, folderHandle:', workspace.folderHandle);
            console.log('🔍 调试 loadWorkspace - currentWorkspace.folderHandle:', currentWorkspace.folderHandle);
            
            // 如果工作空间有关联的文件夹路径但没有 handle，尝试恢复
            if (workspace.folderPath && !workspace.folderHandle) {
                console.log('⚠️ loadWorkspace - 需要恢复 folderHandle');
                const restoredHandle = await restoreDirectoryHandle(workspace.id);
                if (restoredHandle) {
                    workspace.folderHandle = restoredHandle;
                    currentWorkspace.folderHandle = restoredHandle;
                    console.log('✅ loadWorkspace - 成功恢复 folderHandle');
                }
            }
            
            console.log('🔍 调试 loadWorkspace - 最终 folderHandle:', currentWorkspace.folderHandle);
            return workspace;
        }
        console.warn('🔍 调试 loadWorkspace - 未找到工作空间:', id);
        return null;
    }

    /**
     * 获取当前工作空间
     */
    function getCurrentWorkspace() {
        return currentWorkspace;
    }

    /**
     * 获取所有工作空间列表
     */
    function getAllWorkspaces() {
        return workspaces.map(ws => ({
            id: ws.id,
            name: ws.name,
            description: ws.description,
            createdAt: ws.createdAt,
            updatedAt: ws.updatedAt,
            isCurrent: currentWorkspace && currentWorkspace.id === ws.id
        }));
    }

    /**
     * 保存数据到当前工作空间
     */
    async function saveToWorkspace(key, value) {
        if (!currentWorkspace) {
            console.error('没有激活的工作空间');
            return false;
        }
        
        console.log('🔍 调试 saveToWorkspace - 保存前 currentWorkspace.folderHandle:', currentWorkspace.folderHandle);
        
        currentWorkspace.data[key] = value;
        currentWorkspace.updatedAt = Date.now();
        saveWorkspaces();
        
        console.log('🔍 调试 saveToWorkspace - 保存后 currentWorkspace.folderHandle:', currentWorkspace.folderHandle);
        
        // 同步到文件夹
        if (currentWorkspace.folderHandle && currentWorkspace.folderHandle.kind === 'directory') {
            try {
                console.log('📁 saveToWorkspace - 开始同步到文件夹...');
                await saveWorkspaceConfigToFolder(currentWorkspace, currentWorkspace.folderHandle);
                console.log('✅ saveToWorkspace - 已同步到文件夹');
            } catch (error) {
                console.error('❌ saveToWorkspace - 同步到文件夹失败:', error);
                
                // handle 失效了，清除它
                currentWorkspace.folderHandle = null;
                
                // 如果有 folderPath，提示用户重新授权
                if (currentWorkspace.folderPath) {
                    console.warn('⚠️ folderHandle 已失效，需要重新授权');
                    setTimeout(() => {
                        promptReopenFolder();
                    }, 500);
                }
            }
        } else if (currentWorkspace.folderPath && !currentWorkspace.folderHandle) {
            // 有关联的文件夹路径但没有 handle，提示用户重新授权
            console.warn('⚠️ 工作空间关联了文件夹但 handle 无效，提示重新授权');
            setTimeout(() => {
                promptReopenFolder();
            }, 500);
        }
        
        return true;
    }

    /**
     * 从当前工作空间读取数据
     */
    function loadFromWorkspace(key, defaultValue = null) {
        if (!currentWorkspace) {
            return defaultValue;
        }
        return currentWorkspace.data[key] !== undefined ? currentWorkspace.data[key] : defaultValue;
    }

    /**
     * 保存对话历史到工作空间
     */
    function saveConversations(conversations) {
        return saveToWorkspace('conversations', conversations);
    }

    /**
     * 加载对话历史
     */
    function loadConversations() {
        return loadFromWorkspace('conversations', []);
    }

    /**
     * 保存自定义设置
     */
    function saveCustomSettings(settings) {
        return saveToWorkspace('settings', settings);
    }

    /**
     * 加载自定义设置
     */
    function loadCustomSettings() {
        return loadFromWorkspace('settings', {});
    }

    /**
     * 导出工作空间为 JSON
     */
    function exportWorkspace(id) {
        const workspace = workspaces.find(ws => ws.id === id);
        if (workspace) {
            const exportData = {
                version: '1.0.0',
                exportedAt: new Date().toISOString(),
                workspace: workspace
            };
            return JSON.stringify(exportData, null, 2);
        }
        return null;
    }

    /**
     * 从 JSON 导入工作空间
     */
    function importWorkspace(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.workspace) {
                const workspace = data.workspace;
                
                // 生成新 ID 避免冲突
                workspace.id = generateId();
                workspace.importedAt = Date.now();
                
                workspaces.push(workspace);
                saveWorkspaces();
                
                return workspace;
            }
        } catch (error) {
            console.error('导入失败:', error);
        }
        return null;
    }

    /**
     * 显示工作空间管理对话框
     */
    function showWorkspaceManager() {
        // 添加样式
        GM_addStyle(`
            .workspace-manager {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 24px;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                z-index: 1000001;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
            }
            .workspace-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 12px;
                border-bottom: 2px solid #e5e7eb;
            }
            .workspace-title {
                font-size: 20px;
                font-weight: 600;
                color: #1f2937;
            }
            .workspace-list {
                margin-bottom: 20px;
            }
            .workspace-item {
                padding: 12px;
                margin-bottom: 8px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .workspace-item:hover {
                border-color: #667eea;
                background: #f9fafb;
            }
            .workspace-item.active {
                border-color: #667eea;
                background: #eef2ff;
            }
            .workspace-info {
                flex: 1;
            }
            .workspace-name {
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 4px;
            }
            .workspace-meta {
                font-size: 12px;
                color: #6b7280;
            }
            .workspace-actions {
                display: flex;
                gap: 8px;
            }
            .ws-btn {
                padding: 6px 12px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            }
            .ws-btn-primary {
                background: #667eea;
                color: white;
            }
            .ws-btn-secondary {
                background: #f3f4f6;
                color: #374151;
            }
            .ws-btn-danger {
                background: #fee2e2;
                color: #dc2626;
            }
            .ws-btn:hover {
                opacity: 0.8;
            }
            .create-workspace-form {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 2px solid #e5e7eb;
            }
            .form-input {
                width: 100%;
                padding: 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                margin-bottom: 12px;
                font-size: 14px;
            }
            .badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
                margin-left: 8px;
            }
            .badge-current {
                background: #d1fae5;
                color: #065f46;
            }
            .folder-section {
                margin-top: 20px;
                padding: 16px;
                background: #f9fafb;
                border-radius: 8px;
                border: 2px dashed #d1d5db;
            }
            .folder-info {
                font-size: 13px;
                color: #6b7280;
                margin-top: 8px;
            }
        `);

        const workspacesList = getAllWorkspaces();
        
        let html = `
            <div class="workspace-manager" id="workspace-manager-modal">
                <div class="workspace-header">
                    <div class="workspace-title">📁 工作空间管理</div>
                    <button class="ws-btn ws-btn-secondary" id="btn-close-ws">关闭</button>
                </div>
                
                <div class="workspace-list">
        `;

        workspacesList.forEach(ws => {
            html += `
                <div class="workspace-item ${ws.isCurrent ? 'active' : ''}" data-id="${ws.id}">
                    <div class="workspace-info">
                        <div class="workspace-name">
                            ${escapeHtml(ws.name)}
                            ${ws.isCurrent ? '<span class="badge badge-current">当前</span>' : ''}
                        </div>
                        <div class="workspace-meta">
                            创建于: ${new Date(ws.createdAt).toLocaleDateString()} | 
                            更新于: ${new Date(ws.updatedAt).toLocaleDateString()}
                        </div>
                    </div>
                    <div class="workspace-actions">
                        ${!ws.isCurrent ? `<button class="ws-btn ws-btn-primary ws-btn-switch" data-ws-id="${ws.id}">切换</button>` : ''}
                        <button class="ws-btn ws-btn-secondary ws-btn-rename" data-ws-id="${ws.id}" data-ws-name="${escapeHtml(ws.name)}">重命名</button>
                        <button class="ws-btn ws-btn-secondary ws-btn-export" data-ws-id="${ws.id}">导出</button>
                        ${workspacesList.length > 1 ? `<button class="ws-btn ws-btn-danger ws-btn-delete" data-ws-id="${ws.id}">删除</button>` : ''}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                
                <div class="create-workspace-form">
                    <h3 style="margin-bottom: 12px; color: #1f2937;">➕ 创建工作空间</h3>
                    <input type="text" class="form-input" id="new-workspace-name" placeholder="工作空间名称">
                    <input type="text" class="form-input" id="new-workspace-desc" placeholder="描述 (可选)">
                    <button class="ws-btn ws-btn-primary" id="btn-create-ws" style="width: 100%; padding: 10px;">
                        创建工作空间
                    </button>
                </div>
                
                <div class="folder-section">
                    <h3 style="margin-bottom: 12px; color: #1f2937;">📂 打开本地文件夹</h3>
                    <p style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
                        选择一个本地文件夹作为工作空间,数据将保存在该文件夹中
                    </p>
                    <button class="ws-btn ws-btn-primary" id="btn-open-folder" style="width: 100%; padding: 10px; margin-bottom: 8px;">
                        📁 选择文件夹
                    </button>
                    ${currentWorkspace && currentWorkspace.folderHandle ? `
                    <button class="ws-btn ws-btn-secondary" id="btn-file-manager" style="width: 100%; padding: 10px;">
                        🗂️ 打开文件管理器
                    </button>
                    ` : ''}
                    <div class="folder-info" id="folder-path"></div>
                </div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                    <h3 style="margin-bottom: 12px; color: #1f2937;">📥 导入工作空间</h3>
                    <input type="file" class="form-input" id="import-workspace-file" accept=".json">
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        
        // 绑定所有按钮事件
        bindWorkspaceEvents();
    }

    /**
     * 绑定工作空间管理器事件
     */
    function bindWorkspaceEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('btn-close-ws');
        if (closeBtn) closeBtn.addEventListener('click', closeWorkspaceManager);
        
        // 创建工作空间按钮
        const createBtn = document.getElementById('btn-create-ws');
        if (createBtn) createBtn.addEventListener('click', createNewWorkspace);
        
        // 打开文件夹按钮
        const openFolderBtn = document.getElementById('btn-open-folder');
        if (openFolderBtn) openFolderBtn.addEventListener('click', openFolder);
        
        // 打开文件管理器按钮
        const fileManagerBtn = document.getElementById('btn-file-manager');
        if (fileManagerBtn) fileManagerBtn.addEventListener('click', showFileManager);
        
        // 导入文件按钮
        const importFile = document.getElementById('import-workspace-file');
        if (importFile) importFile.addEventListener('change', (e) => handleImport(e.target));
        
        // 切换按钮
        document.querySelectorAll('.ws-btn-switch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wsId = e.target.dataset.wsId;
                switchWorkspace(wsId);
            });
        });
        
        // 重命名按钮
        document.querySelectorAll('.ws-btn-rename').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wsId = e.target.dataset.wsId;
                const wsName = e.target.dataset.wsName;
                renameWorkspacePrompt(wsId, wsName);
            });
        });
        
        // 导出按钮
        document.querySelectorAll('.ws-btn-export').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wsId = e.target.dataset.wsId;
                exportWorkspaceFile(wsId);
            });
        });
        
        // 删除按钮
        document.querySelectorAll('.ws-btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wsId = e.target.dataset.wsId;
                deleteWorkspaceConfirm(wsId);
            });
        });
    }

    /**
     * 关闭工作空间管理器
     */
    function closeWorkspaceManager() {
        const modal = document.getElementById('workspace-manager-modal');
        if (modal) modal.remove();
    }

    /**
     * 切换工作空间
     */
    function switchWorkspace(id) {
        loadWorkspace(id);
        closeWorkspaceManager();
        
        // 刷新页面或通知其他模块
        window.dispatchEvent(new CustomEvent('workspace-changed', { 
            detail: { workspaceId: id } 
        }));
        
        alert(`已切换到工作空间: ${currentWorkspace.name}`);
    }

    /**
     * 创建新工作空间
     */
    function createNewWorkspace() {
        const nameInput = document.getElementById('new-workspace-name');
        const descInput = document.getElementById('new-workspace-desc');
        
        const name = nameInput.value.trim();
        const description = descInput.value.trim();
        
        if (!name) {
            alert('请输入工作空间名称');
            return;
        }
        
        const workspace = createWorkspace(name, description);
        closeWorkspaceManager();
        showWorkspaceManager(); // 重新打开以显示新列表
        
        alert(`工作空间 "${name}" 创建成功!`);
    }

    /**
     * 重命名工作空间提示
     */
    function renameWorkspacePrompt(id, currentName) {
        const newName = prompt('输入新的工作空间名称:', currentName);
        if (newName && newName.trim()) {
            renameWorkspace(id, newName.trim());
            closeWorkspaceManager();
            showWorkspaceManager();
        }
    }

    /**
     * 删除工作空间确认
     */
    function deleteWorkspaceConfirm(id) {
        if (confirm('确定要删除这个工作空间吗?此操作不可恢复!')) {
            deleteWorkspace(id);
            closeWorkspaceManager();
            showWorkspaceManager();
        }
    }

    /**
     * 导出工作空间文件
     */
    function exportWorkspaceFile(id) {
        const jsonData = exportWorkspace(id);
        if (jsonData) {
            const workspace = workspaces.find(ws => ws.id === id);
            const filename = `workspace-${workspace.name}-${Date.now()}.json`;
            
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert('工作空间已导出!');
        }
    }

    /**
     * 处理导入文件
     */
    function handleImport(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const workspace = importWorkspace(e.target.result);
            if (workspace) {
                closeWorkspaceManager();
                showWorkspaceManager();
                alert(`工作空间 "${workspace.name}" 导入成功!`);
            } else {
                alert('导入失败,请检查文件格式');
            }
        };
        reader.readAsText(file);
    }

    /**
     * 打开本地文件夹 (使用 File System Access API)
     */
    async function openFolder() {
        try {
            // 检查浏览器支持
            if (!('showDirectoryPicker' in window)) {
                alert('❌ 您的浏览器不支持文件夹访问功能\n\n请使用 Chrome 86+ 或 Edge 86+ 浏览器');
                return;
            }

            // 打开文件夹选择对话框
            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            const folderName = dirHandle.name;
            
            // 检查工作空间配置文件
            let workspaceData = null;
            try {
                const configFile = await dirHandle.getFileHandle('.workspace.json', { create: false });
                const file = await configFile.getFile();
                const content = await file.text();
                workspaceData = JSON.parse(content);
                console.log('✅ 找到工作空间配置文件');
            } catch (error) {
                console.log('ℹ️ 未找到配置文件,将创建新的工作空间');
            }

            // 创建工作空间
            let workspace;
            if (workspaceData) {
                // 使用已有配置
                workspace = {
                    id: workspaceData.id || generateId(),
                    name: workspaceData.name || folderName,
                    description: workspaceData.description || `本地文件夹: ${folderName}`,
                    createdAt: workspaceData.createdAt || Date.now(),
                    updatedAt: Date.now(),
                    data: workspaceData.data || {
                        conversations: [],
                        settings: {},
                        customData: {}
                    },
                    folderPath: folderName,
                    folderHandle: dirHandle
                };
                
                // 检查工作空间是否已存在
                const existingIndex = workspaces.findIndex(ws => ws.id === workspace.id);
                if (existingIndex > -1) {
                    // 更新现有工作空间
                    workspaces[existingIndex] = workspace;
                } else {
                    workspaces.push(workspace);
                }
            } else {
                // 创建新工作空间
                workspace = createWorkspace(folderName, `本地文件夹: ${folderName}`);
                workspace.folderPath = folderName;
                workspace.folderHandle = dirHandle;
                
                // 保存初始配置到文件夹
                await saveWorkspaceConfigToFolder(workspace, dirHandle);
            }
            
            // 持久化 folderHandle 到 IndexedDB
            await persistDirectoryHandle(workspace.id, dirHandle);
            
            console.log('🔍 调试 openFolder - workspace.folderHandle:', workspace.folderHandle);
            console.log('🔍 调试 openFolder - workspace 完整对象:', JSON.stringify(workspace, (key, value) => {
                if (key === 'folderHandle') return '[FileSystemDirectoryHandle]';
                return value;
            }, 2));
            
            saveWorkspaces();
            await loadWorkspace(workspace.id);
            
            console.log('🔍 调试 openFolder - 调用 loadWorkspace 后');
            console.log('🔍 调试 openFolder - currentWorkspace:', currentWorkspace);
            console.log('🔍 调试 openFolder - currentWorkspace.folderHandle:', currentWorkspace?.folderHandle);

            // 显示路径
            const pathDiv = document.getElementById('folder-path');
            if (pathDiv) {
                pathDiv.innerHTML = `<span style="color: #10b981;">✅ 已打开: ${folderName}</span>`;
            }

            // 关闭并重新打开管理器
            setTimeout(() => {
                closeWorkspaceManager();
                showWorkspaceManager();
            }, 500);

            alert(`✅ 已成功打开文件夹: ${folderName}\n\n该文件夹将作为新的工作空间`);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('用户取消了选择');
            } else {
                console.error('打开文件夹失败:', error);
                alert(`❌ 打开文件夹失败: ${error.message}`);
            }
        }
    }

    /**
     * 保存工作空间配置到文件夹
     */
    async function saveWorkspaceConfigToFolder(workspace, dirHandle) {
        try {
            const configData = {
                version: '1.0.0',
                id: workspace.id,
                name: workspace.name,
                description: workspace.description,
                createdAt: workspace.createdAt,
                updatedAt: Date.now(),
                data: workspace.data
            };

            // 创建或更新配置文件
            const configFile = await dirHandle.getFileHandle('.workspace.json', { create: true });
            const writable = await configFile.createWritable();
            await writable.write(JSON.stringify(configData, null, 2));
            await writable.close();

            console.log('✅ 工作空间配置已保存到文件夹');
        } catch (error) {
            console.error('保存配置失败:', error);
        }
    }

    /**
     * 从文件夹加载工作空间配置
     */
    async function loadWorkspaceConfigFromFolder(dirHandle) {
        try {
            const configFile = await dirHandle.getFileHandle('.workspace.json', { create: false });
            const file = await configFile.getFile();
            const content = await file.text();
            return JSON.parse(content);
        } catch (error) {
            console.error('加载配置失败:', error);
            return null;
        }
    }

    // 文件句柄缓存（用于编辑器）
    const fileHandleCache = new Map();
    let currentEditFileName = '';

    /**
     * 列出文件夹中的所有文件和子目录
     */
    async function listFilesInFolder(dirHandle, path = '') {
        try {
            const files = [];
            
            for await (const entry of dirHandle.values()) {
                const entryPath = path ? `${path}/${entry.name}` : entry.name;
                
                if (entry.kind === 'file') {
                    // 跳过 .workspace.json 配置文件
                    if (entry.name !== '.workspace.json') {
                        files.push({
                            name: entry.name,
                            path: entryPath,
                            kind: 'file',
                            handle: entry
                        });
                    }
                } else if (entry.kind === 'directory') {
                    // 递归获取子目录内容（可选，暂时只显示第一层）
                    files.push({
                        name: entry.name,
                        path: entryPath,
                        kind: 'directory',
                        handle: entry
                    });
                }
            }
            
            // 按名称排序，目录在前
            files.sort((a, b) => {
                if (a.kind !== b.kind) {
                    return a.kind === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
            
            return files;
        } catch (error) {
            console.error('列出文件失败:', error);
            return [];
        }
    }

    /**
     * 读取文件内容
     */
    async function readFileContent(fileHandle) {
        try {
            const file = await fileHandle.getFile();
            const content = await file.text();
            return content;
        } catch (error) {
            console.error('读取文件失败:', error);
            throw error;
        }
    }

    /**
     * 写入文件内容
     */
    async function writeFileContent(fileHandle, content) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            console.log('✅ 文件已保存');
        } catch (error) {
            console.error('写入文件失败:', error);
            throw error;
        }
    }

    /**
     * 在文件夹中创建新文件
     */
    async function createFileInFolder(dirHandle, fileName, content = '') {
        try {
            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
            await writeFileContent(fileHandle, content);
            return fileHandle;
        } catch (error) {
            console.error('创建文件失败:', error);
            throw error;
        }
    }

    /**
     * 显示文件管理器 UI
     */
    async function showFileManager() {
        const currentWs = getCurrentWorkspace();
        if (!currentWs || !currentWs.folderHandle) {
            alert('⚠️ 请先打开一个文件夹作为工作空间');
            return;
        }

        // 检查权限
        try {
            const permission = await currentWs.folderHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                alert('⚠️ 需要重新授权访问文件夹\n\n请在工作空间中重新打开该文件夹');
                return;
            }
        } catch (e) {
            alert('⚠️ 文件夹句柄无效，请重新打开');
            return;
        }

        // 创建文件管理器面板
        const overlay = document.createElement('div');
        overlay.id = 'file-manager-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 99998;
        `;

        const panel = document.createElement('div');
        panel.id = 'file-manager-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 800px;
            height: 600px;
            background: #1e293b;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            z-index: 99999;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;

        // 标题栏
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid #334155;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #0f172a;
            border-radius: 12px 12px 0 0;
        `;
        header.innerHTML = `
            <div style="color: #f1f5f9; font-size: 16px; font-weight: 600;">
                📁 文件管理器 - ${escapeHtml(currentWs.name)}
            </div>
            <button id="close-file-manager" style="
                background: transparent;
                border: none;
                color: #94a3b8;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                line-height: 32px;
                text-align: center;
            ">&times;</button>
        `;

        // 工具栏
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
            padding: 12px 20px;
            border-bottom: 1px solid #334155;
            display: flex;
            gap: 10px;
            background: #1e293b;
        `;
        toolbar.innerHTML = `
            <button id="refresh-files" style="
                padding: 8px 16px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">🔄 刷新</button>
            <button id="new-file" style="
                padding: 8px 16px;
                background: #10b981;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">➕ 新建文件</button>
            <button id="new-folder" style="
                padding: 8px 16px;
                background: #f59e0b;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">📁 新建文件夹</button>
            <button id="upload-file" style="
                padding: 8px 16px;
                background: #8b5cf6;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">⬆️ 上传文件</button>
        `;

        // 文件列表区域
        const fileListContainer = document.createElement('div');
        fileListContainer.id = 'file-list-container';
        fileListContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            background: #0f172a;
        `;

        // 文件编辑器区域（默认隐藏）
        const editorContainer = document.createElement('div');
        editorContainer.id = 'file-editor-container';
        editorContainer.style.cssText = `
            flex: 1;
            display: none;
            flex-direction: column;
            background: #1e293b;
        `;
        editorContainer.innerHTML = `
            <div style="padding: 12px 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
                <span id="editing-file-name" style="color: #f1f5f9; font-weight: 600;"></span>
                <div style="display: flex; gap: 8px;">
                    <button id="save-file" style="
                        padding: 6px 16px;
                        background: #10b981;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                    ">💾 保存</button>
                    <button id="cancel-edit" style="
                        padding: 6px 16px;
                        background: #64748b;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                    ">✖ 取消</button>
                </div>
            </div>
            <textarea id="file-editor" style="
                flex: 1;
                padding: 16px;
                background: #0f172a;
                color: #e2e8f0;
                border: none;
                resize: none;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 14px;
                line-height: 1.6;
            "></textarea>
        `;

        panel.appendChild(header);
        panel.appendChild(toolbar);
        panel.appendChild(fileListContainer);
        panel.appendChild(editorContainer);
        document.body.appendChild(panel);
        document.body.appendChild(overlay);

        // 关闭按钮事件
        document.getElementById('close-file-manager').onclick = closeFileManager;
        overlay.onclick = closeFileManager;

        // 刷新按钮
        document.getElementById('refresh-files').onclick = () => loadFileList(fileListContainer, currentWs.folderHandle);

        // 新建文件按钮
        document.getElementById('new-file').onclick = () => createNewFile(currentWs.folderHandle, fileListContainer);
        
        // 新建文件夹按钮
        document.getElementById('new-folder').onclick = () => createNewFolder(currentWs.folderHandle, fileListContainer);
        
        // 上传文件按钮
        document.getElementById('upload-file').onclick = () => uploadFiles(currentWs.folderHandle, fileListContainer);

        // 保存文件按钮
        document.getElementById('save-file').onclick = () => saveEditedFile();

        // 取消编辑按钮
        document.getElementById('cancel-edit').onclick = () => {
            editorContainer.style.display = 'none';
            fileListContainer.style.display = 'block';
            toolbar.style.display = 'flex';
        };

        // 加载文件列表
        await loadFileList(fileListContainer, currentWs.folderHandle);
    }

    /**
     * 加载文件列表
     */
    async function loadFileList(container, dirHandle) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #94a3b8;">加载中...</div>';
        
        try {
            const files = await listFilesInFolder(dirHandle);
            
            if (files.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #64748b;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
                        <div style="font-size: 14px;">文件夹为空</div>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            files.forEach(file => {
                const item = document.createElement('div');
                item.style.cssText = `
                    padding: 12px 16px;
                    margin-bottom: 4px;
                    background: ${file.kind === 'directory' ? '#1e3a5f' : '#1e293b'};
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    transition: background 0.2s;
                `;
                item.onmouseover = () => item.style.background = file.kind === 'directory' ? '#254a75' : '#334155';
                item.onmouseout = () => item.style.background = file.kind === 'directory' ? '#1e3a5f' : '#1e293b';
                
                const icon = file.kind === 'directory' ? '📁' : getFileIcon(file.name);
                item.innerHTML = `
                    <span style="font-size: 20px;">${icon}</span>
                    <span style="color: #e2e8f0; font-size: 14px; flex: 1;">${escapeHtml(file.name)}</span>
                    <div style="display: flex; gap: 6px;" onclick="event.stopPropagation()">
                        ${file.kind === 'file' ? `
                        <button class="file-action-btn" data-action="edit" title="编辑" style="
                            padding: 4px 8px;
                            background: #3b82f6;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">✏️</button>
                        <button class="file-action-btn" data-action="download" title="下载" style="
                            padding: 4px 8px;
                            background: #8b5cf6;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">⬇️</button>
                        ` : ''}
                        <button class="file-action-btn" data-action="rename" title="重命名" style="
                            padding: 4px 8px;
                            background: #f59e0b;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">✍️</button>
                        <button class="file-action-btn" data-action="delete" title="删除" style="
                            padding: 4px 8px;
                            background: #ef4444;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">🗑️</button>
                    </div>
                `;
                
                // 点击文件名或图标打开编辑
                const nameSpan = item.querySelector('span:nth-child(2)');
                const iconSpan = item.querySelector('span:nth-child(1)');
                if (file.kind === 'file') {
                    nameSpan.onclick = () => openFileForEdit(file.handle, file.name);
                    iconSpan.onclick = () => openFileForEdit(file.handle, file.name);
                }
                
                // 绑定操作按钮事件
                item.querySelectorAll('.file-action-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const action = btn.dataset.action;
                        handleFileAction(action, file, dirHandle, fileListContainer);
                    };
                });
                
                container.appendChild(item);
            });
        } catch (error) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ef4444;">
                    ❌ 加载文件列表失败: ${escapeHtml(error.message)}
                </div>
            `;
        }
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
     * 打开文件进行编辑
     */
    async function openFileForEdit(fileHandle, fileName) {
        try {
            const content = await readFileContent(fileHandle);
            
            const fileListContainer = document.getElementById('file-list-container');
            const editorContainer = document.getElementById('file-editor-container');
            const editingFileName = document.getElementById('editing-file-name');
            const fileEditor = document.getElementById('file-editor');
            
            // 缓存 fileHandle（使用 Map 而不是 JSON 序列化）
            currentEditFileName = fileName;
            fileHandleCache.set(fileName, fileHandle);
            
            editingFileName.textContent = fileName;
            fileEditor.value = content;
            fileEditor.dataset.currentFileName = fileName; // 只存储文件名
            
            fileListContainer.style.display = 'none';
            document.getElementById('refresh-files').parentElement.style.display = 'none';
            editorContainer.style.display = 'flex';
        } catch (error) {
            alert(`❌ 打开文件失败: ${error.message}`);
        }
    }

    /**
     * 保存编辑的文件
     */
    async function saveEditedFile() {
        try {
            const fileEditor = document.getElementById('file-editor');
            const content = fileEditor.value;
            
            // 从缓存中获取 fileHandle
            const fileName = fileEditor.dataset.currentFileName;
            const fileHandle = fileHandleCache.get(fileName);
            
            if (!fileHandle) {
                throw new Error('文件句柄丢失，请重新打开文件');
            }
            
            await writeFileContent(fileHandle, content);
            
            alert('✅ 文件已保存');
            
            // 返回文件列表
            document.getElementById('cancel-edit').click();
            document.getElementById('refresh-files').parentElement.style.display = 'flex';
            
            // 刷新文件列表
            const currentWs = getCurrentWorkspace();
            if (currentWs && currentWs.folderHandle) {
                await loadFileList(document.getElementById('file-list-container'), currentWs.folderHandle);
            }
        } catch (error) {
            alert(`❌ 保存文件失败: ${error.message}`);
        }
    }

    /**
     * 创建新文件
     */
    async function createNewFile(dirHandle, fileListContainer) {
        const fileName = prompt('请输入文件名（包含扩展名）:');
        if (!fileName) return;
        
        try {
            await createFileInFolder(dirHandle, fileName, '');
            alert(`✅ 文件 "${fileName}" 已创建`);
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        } catch (error) {
            alert(`❌ 创建文件失败: ${error.message}`);
        }
    }

    /**
     * 创建新文件夹
     */
    async function createNewFolder(dirHandle, fileListContainer) {
        const folderName = prompt('请输入文件夹名称:');
        if (!folderName) return;
        
        try {
            const newFolderHandle = await dirHandle.getDirectoryHandle(folderName, { create: true });
            alert(`✅ 文件夹 "${folderName}" 已创建`);
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        } catch (error) {
            alert(`❌ 创建文件夹失败: ${error.message}`);
        }
    }

    /**
     * 上传文件
     */
    async function uploadFiles(dirHandle, fileListContainer) {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;
            
            let successCount = 0;
            let failCount = 0;
            
            for (const file of files) {
                try {
                    const content = await readFileAsText(file);
                    await createFileInFolder(dirHandle, file.name, content);
                    successCount++;
                } catch (error) {
                    console.error(`上传文件 ${file.name} 失败:`, error);
                    failCount++;
                }
            }
            
            if (successCount > 0) {
                alert(`✅ 成功上传 ${successCount} 个文件${failCount > 0 ? `, ${failCount} 个失败` : ''}`);
            } else {
                alert('❌ 所有文件上传失败');
            }
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        };
        
        input.click();
    }

    /**
     * 读取文件为文本
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    /**
     * 处理文件操作（编辑、下载、重命名、删除）
     */
    async function handleFileAction(action, file, dirHandle, fileListContainer) {
        switch (action) {
            case 'edit':
                if (file.kind === 'file') {
                    openFileForEdit(file.handle, file.name);
                }
                break;
                
            case 'download':
                if (file.kind === 'file') {
                    downloadFile(file.handle, file.name);
                }
                break;
                
            case 'rename':
                await renameFileOrFolder(file, dirHandle, fileListContainer);
                break;
                
            case 'delete':
                await deleteFileOrFolder(file, dirHandle, fileListContainer);
                break;
                
            default:
                console.warn('未知操作:', action);
        }
    }

    /**
     * 下载文件
     */
    async function downloadFile(fileHandle, fileName) {
        try {
            const content = await readFileContent(fileHandle);
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert(`❌ 下载文件失败: ${error.message}`);
        }
    }

    /**
     * 重命名文件或文件夹
     */
    async function renameFileOrFolder(file, dirHandle, fileListContainer) {
        const newName = prompt(`输入新的名称:`, file.name);
        if (!newName || newName === file.name) return;
        
        try {
            if (file.kind === 'file') {
                // 文件重命名：读取内容 -> 创建新文件 -> 删除旧文件
                const content = await readFileContent(file.handle);
                await createFileInFolder(dirHandle, newName, content);
                await dirHandle.removeEntry(file.name);
                
                // 更新缓存中的文件名
                if (fileHandleCache.has(file.name)) {
                    const handle = fileHandleCache.get(file.name);
                    fileHandleCache.delete(file.name);
                    fileHandleCache.set(newName, handle);
                }
                
                alert(`✅ 文件已重命名为 "${newName}"`);
            } else {
                // 文件夹重命名：File System Access API 不直接支持
                // 需要提示用户手动操作
                alert('⚠️ 文件夹重命名功能暂不支持\n\n请在文件资源管理器中手动重命名');
                return;
            }
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        } catch (error) {
            alert(`❌ 重命名失败: ${error.message}`);
        }
    }

    /**
     * 删除文件或文件夹
     */
    async function deleteFileOrFolder(file, dirHandle, fileListContainer) {
        const confirmMsg = file.kind === 'directory' 
            ? `确定要删除文件夹 "${file.name}" 及其所有内容吗？`
            : `确定要删除文件 "${file.name}" 吗？`;
            
        if (!confirm(confirmMsg)) return;
        
        try {
            await dirHandle.removeEntry(file.name, { recursive: true });
            alert(`✅ ${file.kind === 'directory' ? '文件夹' : '文件'} "${file.name}" 已删除`);
            
            // 刷新文件列表
            await loadFileList(fileListContainer, dirHandle);
        } catch (error) {
            alert(`❌ 删除失败: ${error.message}`);
        }
    }

    /**
     * 关闭文件管理器
     */
    function closeFileManager() {
        const panel = document.getElementById('file-manager-panel');
        const overlay = document.getElementById('file-manager-overlay');
        if (panel) panel.remove();
        if (overlay) overlay.remove();
        
        // 清理缓存
        fileHandleCache.clear();
        currentEditFileName = '';
    }

    /**
     * 生成唯一 ID
     */
    function generateId() {
        return 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
     * 保存到本地存储
     */
    function saveWorkspaces() {
        console.log('🔍 调试 saveWorkspaces - 保存前 workspaces 数组:');
        workspaces.forEach((ws, index) => {
            console.log(`  [${index}] id: ${ws.id}, folderHandle:`, ws.folderHandle);
        });
        
        // 注意: folderHandle 是 File System Access API 对象，不能 JSON 序列化
        // 保存到 GM 存储时需要排除，但保留在内存中的 workspaces 对象里
        const workspacesToSave = workspaces.map(ws => {
            const { folderHandle, ...rest } = ws;
            return rest;
        });
        GM_setValue(WORKSPACE_KEY, JSON.stringify(workspacesToSave));
        
        console.log('🔍 调试 saveWorkspaces - 保存后 workspaces 数组:');
        workspaces.forEach((ws, index) => {
            console.log(`  [${index}] id: ${ws.id}, folderHandle:`, ws.folderHandle);
        });
    }

    // 暴露全局函数 (供 HTML 中的 onclick 使用)
    window.StorageManager = {
        showWorkspaceManager,
        closeWorkspaceManager,
        switchWorkspace,
        createNewWorkspace,
        renameWorkspacePrompt,
        deleteWorkspaceConfirm,
        exportWorkspaceFile,
        handleImport,
        openFolder,
        showFileManager
    };

    return {
        init,
        createWorkspace,
        deleteWorkspace,
        renameWorkspace,
        loadWorkspace,
        getCurrentWorkspace,
        getAllWorkspaces,
        saveToWorkspace,
        loadFromWorkspace,
        saveConversations,
        loadConversations,
        saveCustomSettings,
        loadCustomSettings,
        exportWorkspace,
        importWorkspace,
        showWorkspaceManager,
        loadWorkspaceConfigFromFolder,
        showFileManager,
        listFilesInFolder,
        readFileContent,
        writeFileContent,
        createFileInFolder,
        createNewFolder,
        uploadFiles,
        downloadFile,
        renameFileOrFolder,
        deleteFileOrFolder
    };
})();
