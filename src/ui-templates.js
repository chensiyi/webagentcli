// ==================== UI 模板模块 ====================
// 集中管理所有 HTML 模板

const UITemplates = (function() {
    'use strict';

    /**
     * 构建主界面 HTML
     * @param {Object} config - 配置对象
     * @returns {string} HTML 字符串
     */
    function buildMainHTML(config) {
        const statusBadge = config.apiKey 
            ? '<span class="status-badge status-active">已配置</span>' 
            : '<span class="status-badge status-inactive">未配置</span>';
        
        return `
            <div id="agent-main">
                <!-- ✅ v4.0.0: 调整大小手柄 -->
                <div class="resize-handle resize-n" data-resize="n"></div>
                <div class="resize-handle resize-e" data-resize="e"></div>
                <div class="resize-handle resize-s" data-resize="s"></div>
                <div class="resize-handle resize-w" data-resize="w"></div>
                <div class="resize-handle resize-ne" data-resize="ne"></div>
                <div class="resize-handle resize-nw" data-resize="nw"></div>
                <div class="resize-handle resize-se" data-resize="se"></div>
                <div class="resize-handle resize-sw" data-resize="sw"></div>
                
                <div id="agent-header">
                    <div id="agent-title">
                        <span>✨</span>
                        <span>AI 助手</span>
                        ${statusBadge}
                    </div>
                    <div id="agent-controls">
                        <button class="header-btn" id="agent-close" title="关闭">×</button>
                    </div>
                </div>
                
                <!-- v4.0.0: 模型选择器 -->
                <div id="model-selector-bar">
                    <select id="main-model-select" class="model-select">
                        <option value="auto">🔄 Auto (智能路由)</option>
                    </select>
                    <span id="model-status" class="model-status"></span>
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
    }

    /**
     * 构建打字指示器 HTML
     * @returns {string} HTML 字符串
     */
    function buildTypingIndicatorHTML() {
        return `
            <div class="typing" id="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
    }

    /**
     * 构建用户消息 HTML
     * @param {string} content - 消息内容
     * @returns {string} HTML 字符串
     */
    function buildUserMessageHTML(content) {
        return `
            <div class="user-message">
                <div class="message-content">${escapeHtml(content)}</div>
            </div>
        `;
    }

    /**
     * 构建助手消息 HTML
     * @param {string} content - 格式化后的内容
     * @returns {string} HTML 字符串
     */
    function buildAssistantMessageHTML(content) {
        return `
            <div class="assistant-message">
                <div class="message-content">${content}</div>
            </div>
        `;
    }

    /**
     * 构建代码块 HTML
     * @param {string} code - 代码内容
     * @param {string} language - 语言标识
     * @param {string} blockId - 代码块 ID
     * @returns {string} HTML 字符串
     */
    function buildCodeBlockHTML(code, language, blockId) {
        return `
            <div class="code-block" data-code-id="${blockId}">
                <div class="code-language">${language || 'text'}</div>
                <pre><code>${escapeHtml(code)}</code></pre>
                <div class="code-actions">
                    <button class="code-btn copy" data-action="copy-code">📋 复制</button>
                    <button class="code-btn execute" data-action="execute-code">▶️ 执行</button>
                </div>
            </div>
        `;
    }

    /**
     * 构建执行结果 HTML
     * @param {boolean} success - 是否成功
     * @param {string} content - 结果内容
     * @returns {string} HTML 字符串
     */
    function buildExecutionResultHTML(success, content) {
        const className = success ? 'execution-success' : 'execution-error';
        const icon = success ? '✅ 执行成功' : '❌ 执行失败';
        
        return `
            <div class="execution-result ${className}">
                <strong>${icon}</strong>
                <br>
                <pre style="margin-top: 8px; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(content)}</pre>
            </div>
        `;
    }

    /**
     * 构建高危代码警告 HTML
     * @param {string} code - 代码内容
     * @param {number} index - 代码块索引
     * @returns {string} HTML 字符串
     */
    function buildHighRiskWarningHTML(code, index) {
        return `
            <div class="assistant-message">
                <div class="execution-result execution-error">
                    <strong>⚠️ 检测到高危代码 (第 ${index} 个代码块)</strong>
                    <br><br>
                    <div style="background: #fee2e2; padding: 12px; border-radius: 6px; margin: 8px 0;">
                        <strong>该代码可能包含危险操作，请仔细检查：</strong>
                        <pre style="margin-top: 8px; background: #fef2f2; padding: 8px; border-radius: 4px;">${escapeHtml(code)}</pre>
                    </div>
                    <br>
                    <div style="display: flex; gap: 8px;">
                        <button class="code-btn execute" onclick="window.confirmAndExecute('${index}')">
                            ⚠️ 我已确认安全，执行代码
                        </button>
                        <button class="code-btn" onclick="window.cancelExecution('${index}')" style="background: #6b7280;">
                            ❌ 取消执行
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 构建欢迎消息 HTML
     * @returns {string} HTML 字符串
     */
    function buildWelcomeMessageHTML() {
        const welcomeMessage = `
<strong>👋 欢迎使用 AI Agent!</strong>

我可以帮你:
• 💬 智能对话 - 回答各种问题
• 🔧 执行 JavaScript 代码
• 🎨 操作当前页面
• 📊 提取页面信息

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行代码
• <code>/clear</code> - 清空历史
• <code>/help</code> - 显示帮助

试试对我说: "帮我修改页面背景色"
        `;
        
        return `
            <div class="assistant-message">
                <div class="message-content">${welcomeMessage}</div>
            </div>
        `;
    }

    /**
     * 构建设置对话框 HTML
     * @param {Object} config - 当前配置
     * @param {Array} models - 可用模型列表
     * @returns {string} HTML 字符串
     */
    function buildSettingsDialogHTML(config, models) {
        const modelOptions = models.map(model => 
            `<option value="${model.id}" ${config.model === model.id ? 'selected' : ''}>${model.name}</option>`
        ).join('');

        return `
            <div class="settings-overlay" id="settings-overlay"></div>
            <div id="agent-settings-dialog">
                <div class="settings-header">
                    <h2 class="settings-title">⚙️ 设置</h2>
                    <button class="settings-close" id="settings-close">×</button>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">API 配置</div>
                    
                    <div class="settings-field">
                        <label class="settings-label">API Key</label>
                        <input type="password" class="settings-input" id="setting-api-key" 
                               value="${escapeHtml(config.apiKey || '')}" 
                               placeholder="输入你的 API Key">
                    </div>
                    
                    <div class="settings-field">
                        <label class="settings-label">Endpoint</label>
                        <input type="text" class="settings-input" id="setting-endpoint" 
                               value="${escapeHtml(config.endpoint || '')}" 
                               placeholder="API 端点地址">
                    </div>
                    
                    <div class="settings-field">
                        <label class="settings-label">模型</label>
                        <select class="settings-select" id="setting-model">
                            ${modelOptions}
                        </select>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">生成参数</div>
                    
                    <div class="settings-field">
                        <label class="settings-label">
                            Temperature: <span class="settings-value" id="temp-value">${config.temperature}</span>
                        </label>
                        <input type="range" class="settings-slider" id="setting-temperature" 
                               min="0" max="2" step="0.1" value="${config.temperature}">
                    </div>
                    
                    <div class="settings-field">
                        <label class="settings-label">
                            Top P: <span class="settings-value" id="topp-value">${config.topP}</span>
                        </label>
                        <input type="range" class="settings-slider" id="setting-top-p" 
                               min="0" max="1" step="0.05" value="${config.topP}">
                    </div>
                    
                    <div class="settings-field">
                        <label class="settings-label">Max Tokens</label>
                        <input type="number" class="settings-input" id="setting-max-tokens" 
                               value="${config.maxTokens}" min="1" max="8192">
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">高级选项</div>
                    
                    <div class="settings-field">
                        <label class="settings-checkbox">
                            <input type="checkbox" id="setting-js-enabled" 
                                   ${config.jsExecutionEnabled ? 'checked' : ''}>
                            <span>允许自动执行 JavaScript 代码</span>
                        </label>
                    </div>
                </div>
                
                <div class="settings-actions">
                    <button class="settings-btn settings-btn-secondary" id="settings-cancel">取消</button>
                    <button class="settings-btn settings-btn-primary" id="settings-save">保存</button>
                </div>
            </div>
        `;
    }

    /**
     * HTML 转义工具函数
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') return String(text);
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 导出公共接口
    return {
        buildMainHTML,
        buildTypingIndicatorHTML,
        buildUserMessageHTML,
        buildAssistantMessageHTML,
        buildCodeBlockHTML,
        buildExecutionResultHTML,
        buildHighRiskWarningHTML,
        buildWelcomeMessageHTML,
        buildSettingsDialogHTML,
        escapeHtml
    };
})();
