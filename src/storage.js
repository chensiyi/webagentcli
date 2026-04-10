// ==================== 存储管理工作空间模块 ====================

const StorageManager = (function() {
    const WORKSPACE_KEY = 'agent_workspaces';
    let currentWorkspace = null;
    let workspaces = [];

    /**
     * 初始化工作空间
     */
    function init() {
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
                loadWorkspace(lastUsed);
            } else {
                loadWorkspace(workspaces[0].id);
            }
        } catch (error) {
            console.error('初始化工作空间失败:', error);
            workspaces = [];
            createWorkspace('Default Workspace', '默认工作空间');
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
    function loadWorkspace(id) {
        const workspace = workspaces.find(ws => ws.id === id);
        if (workspace) {
            currentWorkspace = workspace;
            GM_setValue('last_workspace', id);
            return workspace;
        }
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
    function saveToWorkspace(key, value) {
        if (!currentWorkspace) {
            console.error('没有激活的工作空间');
            return false;
        }
        
        currentWorkspace.data[key] = value;
        currentWorkspace.updatedAt = Date.now();
        saveWorkspaces();
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
                    <button class="ws-btn ws-btn-secondary" onclick="StorageManager.closeWorkspaceManager()">关闭</button>
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
                        ${!ws.isCurrent ? `<button class="ws-btn ws-btn-primary" onclick="StorageManager.switchWorkspace('${ws.id}')">切换</button>` : ''}
                        <button class="ws-btn ws-btn-secondary" onclick="StorageManager.renameWorkspacePrompt('${ws.id}', '${escapeHtml(ws.name)}')">重命名</button>
                        <button class="ws-btn ws-btn-secondary" onclick="StorageManager.exportWorkspaceFile('${ws.id}')">导出</button>
                        ${workspacesList.length > 1 ? `<button class="ws-btn ws-btn-danger" onclick="StorageManager.deleteWorkspaceConfirm('${ws.id}')">删除</button>` : ''}
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
                    <button class="ws-btn ws-btn-primary" onclick="StorageManager.createNewWorkspace()" style="width: 100%; padding: 10px;">
                        创建工作空间
                    </button>
                </div>
                
                <div class="folder-section">
                    <h3 style="margin-bottom: 12px; color: #1f2937;">📂 打开本地文件夹</h3>
                    <p style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
                        选择一个本地文件夹作为工作空间,数据将保存在该文件夹中
                    </p>
                    <button class="ws-btn ws-btn-primary" onclick="StorageManager.openFolder()" style="width: 100%; padding: 10px;">
                        📁 选择文件夹
                    </button>
                    <div class="folder-info" id="folder-path"></div>
                </div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                    <h3 style="margin-bottom: 12px; color: #1f2937;">📥 导入工作空间</h3>
                    <input type="file" class="form-input" id="import-workspace-file" accept=".json" onchange="StorageManager.handleImport(this)">
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
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

            // 保存文件夹句柄
            const folderName = dirHandle.name;
            GM_setValue('workspace_folder_handle', dirHandle);
            
            // 创建工作空间
            const workspace = createWorkspace(folderName, `本地文件夹: ${folderName}`);
            
            // 保存文件夹信息到工作空间
            workspace.data.folderPath = folderName;
            workspace.data.folderHandle = dirHandle;
            saveWorkspaces();

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
        GM_setValue(WORKSPACE_KEY, JSON.stringify(workspaces));
    }

    // 暴露全局函数
    window.StorageManager = {
        showWorkspaceManager,
        closeWorkspaceManager,
        switchWorkspace,
        createNewWorkspace,
        renameWorkspacePrompt,
        deleteWorkspaceConfirm,
        exportWorkspaceFile,
        handleImport,
        openFolder
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
        showWorkspaceManager
    };
})();
