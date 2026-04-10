// ==================== 设置对话框模块 ====================

const SettingsManager = (function() {
    /**
     * 显示设置对话框
     */
    function showSettings() {
        const config = ConfigManager.getAll();
        
        // 添加设置对话框样式
        GM_addStyle(`
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
        `);

        const modalHTML = `
            <div class="modal-overlay" id="settings-modal">
                <div class="modal-content">
                    <div class="modal-title">⚙️ OpenRouter 设置</div>
                    
                    <div class="form-group">
                        <label class="form-label">API Key *</label>
                        <input type="password" class="form-input" id="setting-api-key" 
                               value="${config.apiKey}" 
                               placeholder="输入你的 OpenRouter API Key">
                        <div class="form-hint">
                            从 <a href="https://openrouter.ai/keys" target="_blank">OpenRouter Keys</a> 获取免费 API Key
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">模型选择 (免费)</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <select class="form-input" id="setting-model" style="flex: 1;">
                                <!-- 模型选项将由 ModelManager 动态填充 -->
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

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 初始化模型选择
        initializeModelSelect(config.model);

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
    async function saveSettings() {
        const apiKey = document.getElementById('setting-api-key').value.trim();
        const model = document.getElementById('setting-model').value;
        const temperature = parseFloat(document.getElementById('setting-temperature').value);
        const topP = parseFloat(document.getElementById('setting-top-p').value);
        const maxTokens = parseInt(document.getElementById('setting-max-tokens').value);
        const jsEnabled = document.getElementById('setting-js-enabled').checked;

        // 保存到配置管理器
        ConfigManager.set('apiKey', apiKey);
        ConfigManager.set('model', model);
        ConfigManager.set('temperature', temperature);
        ConfigManager.set('topP', topP);
        ConfigManager.set('maxTokens', maxTokens);
        ConfigManager.set('jsExecutionEnabled', jsEnabled);

        // 同步到工作空间 (如果是文件夹工作空间)
        await syncSettingsToWorkspace({
            apiKey: apiKey,
            model: model,
            temperature: temperature,
            topP: topP,
            maxTokens: maxTokens,
            jsExecutionEnabled: jsEnabled
        });

        closeModal();
        
        // 更新 UI 状态徽章
        UIManager.updateStatusBadge(apiKey.length > 0);
        
        // 显示成功消息
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content" style="color: #10b981;">
                    ✅ 设置已保存 - 开始免费使用!
                </div>
            </div>
        `);
    }

    /**
     * 同步设置到工作空间
     */
    async function syncSettingsToWorkspace(settings) {
        try {
            // 获取当前工作空间
            const currentWs = StorageManager.getCurrentWorkspace();
            if (!currentWs || !currentWs.folderHandle) {
                // 不是文件夹工作空间,只保存到浏览器
                return;
            }

            // 获取已有配置
            const wsData = await StorageManager.loadWorkspaceConfigFromFolder(currentWs.folderHandle);
            
            if (wsData) {
                // 更新配置
                wsData.data.settings = {
                    ...wsData.data.settings,
                    ...settings
                };
                wsData.updatedAt = Date.now();

                // 保存回文件夹
                const configFile = await currentWs.folderHandle.getFileHandle('.workspace.json', { create: true });
                const writable = await configFile.createWritable();
                await writable.write(JSON.stringify(wsData, null, 2));
                await writable.close();

                console.log('✅ 设置已同步到工作空间文件夹');
            }
        } catch (error) {
            console.error('同步设置到工作空间失败:', error);
        }
    }

    /**
     * 关闭模态框
     */
    function closeModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.remove();
    }

    return {
        showSettings,
        closeModal
    };
})();
