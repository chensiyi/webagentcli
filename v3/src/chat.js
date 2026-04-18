// ==================== 聊天逻辑模块 (重构版) ====================

const ChatManager = (function() {
    'use strict';
    
    // ========== 状态管理 ==========
    const MAX_CODE_BLOCKS = 100; // 最多保留 100 个代码块
    
    const state = {
        isProcessing: false,
        codeBlockStore: {},
        codeBlockIndex: 0,
        messageQueue: [],
        currentAbortController: null,  // 当前请求的 AbortController
        historyLoaded: false,  // 标记历史记录是否已加载
        executionQueue: []     // 本地代码执行任务队列
    };

    // ========== 工具函数 ==========
    
    /**
     * 安全地将对象转换为字符串（处理循环引用）
     */
    function safeStringify(result) {
        try {
            return typeof result === 'object' 
                ? JSON.stringify(result, null, 2) 
                : String(result);
        } catch (e) {
            if (typeof result === 'object' && result !== null) {
                try {
                    const simpleObj = {};
                    for (let key in result) {
                        if (result.hasOwnProperty(key)) {
                            const val = result[key];
                            const type = typeof val;
                            if (type === 'string' || type === 'number' || type === 'boolean') {
                                simpleObj[key] = val;
                            } else if (type === 'function') {
                                simpleObj[key] = '[Function]';
                            } else if (type === 'object' && val !== null) {
                                simpleObj[key] = '[Object]';
                            }
                        }
                        if (Object.keys(simpleObj).length >= 20) break;
                    }
                    return JSON.stringify(simpleObj, null, 2);
                } catch (e2) {
                    return `[${typeof result}] 对象类型（无法完整序列化）`;
                }
            } else {
                return String(result);
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

    /**
     * 从文本中提取所有代码块
     */
    function extractCodeBlocks(text) {
        const codeBlocks = [];
        const regex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            codeBlocks.push({
                lang: match[1] || 'text',
                code: match[2].trim()
            });
        }
        return codeBlocks;
    }

    /**
     * 检查代码是否为高危操作
     */
    function isHighRiskCode(code) {
        const highRiskPatterns = [
            // 导航/跳转类
            /window\.location\s*=/,
            /window\.location\.href\s*=/,
            /location\.href\s*=/,
            /location\.replace\s*\(/,
            /location\.assign\s*\(/,
            /window\.open\s*\(/,
            
            // 数据删除类
            /localStorage\.clear\s*\(/,
            /localStorage\.removeItem\s*\(/,
            /sessionStorage\.clear\s*\(/,
            /indexedDB\.deleteDatabase\s*\(/,
            
            // Cookie 操作
            /document\.cookie\s*=.*expires/,
            /document\.cookie\s*=.*max-age=0/,
            
            // 危险执行
            /eval\s*\(/,
            /Function\s*\(/,
            /setTimeout\s*\(.*eval/,
            /setInterval\s*\(.*eval/,
            
            // DOM 破坏性操作
            /document\.body\.innerHTML\s*=\s*['"`]/,
            /document\.documentElement\.innerHTML\s*=\s*['"`]/,
            
            // 弹窗轰炸
            /while\s*\(.*\)\s*\{\s*alert/,
            /for\s*\(.*\)\s*\{\s*alert/,
            
            // 无限循环
            /while\s*\(true\)/,
            /for\s*\(;;\)/,
            /while\s*\(1\)/,
        ];
        
        return highRiskPatterns.some(pattern => pattern.test(code));
    }

    /**
     * 停止当前请求并清空队列
     */
    function stopCurrentRequest() {
        // 1. 取消当前的 API 请求
        if (state.currentAbortController) {
            state.currentAbortController.abort();
            state.currentAbortController = null;
        }
        
        // 2. 清空消息队列
        state.messageQueue = [];
        
        // 3. 清空执行队列
        state.executionQueue = [];
        
        // 4. 重置处理状态
        state.isProcessing = false;
        
        // 5. 隐藏打字指示器
        UIManager.hideTypingIndicator();
        
        // 6. 更新按钮状态
        UIManager.updateSendButtonState(false);
        
        // 7. 添加系统提示
        addAssistantMessage('已停止');
    }

    // ========== 消息处理核心 ==========

    /**
     * 处理用户消息（主入口）
     */
    async function handleMessage(message) {
        // 如果正在处理，将消息加入队列
        if (state.isProcessing) {
            state.messageQueue.push(message);
            Utils.debugLog('⏳ 消息已加入队列，等待处理');
            return;
        }
        
        const trimmedMessage = message.trim();
        if (!trimmedMessage) return;

        // 添加用户消息到界面
        addUserMessage(trimmedMessage);

        // 检查是否是快捷命令
        if (trimmedMessage.startsWith('/')) {
            state.isProcessing = true;
            try {
                handleCommand(trimmedMessage);
            } finally {
                state.isProcessing = false;
                processNextMessage();
            }
            return;
        }

        // 正常对话处理
        await handleNormalMessage(trimmedMessage);
    }

    /**
     * 处理普通对话消息
     */
    async function handleNormalMessage(message) {
        state.isProcessing = true;
        
        try {
            UIManager.showTypingIndicator();
            UIManager.updateSendButtonState(true); // 更新按钮为停止状态

            const config = ConfigManager.getAll();
            console.log('[Chat] Current config model:', config.model);
            
            const history = HistoryManager.getHistory();
            
            // 创建 AbortController 用于取消请求
            state.currentAbortController = new AbortController();
            
            // 创建流式消息容器
            const messageId = UIManager.createStreamingMessage();
            let fullText = '';
            
            // 使用流式 API 调用（通过路由层）
            const response = await APIRouter.sendRequest(
                { userMessage: message, conversationHistory: history, config, abortController: state.currentAbortController },
                (chunk, accumulatedText) => {
                    // 实时更新消息内容
                    fullText = accumulatedText;
                    UIManager.updateStreamingMessage(messageId, accumulatedText);
                }
            );
            
            // 请求完成，清除 AbortController
            state.currentAbortController = null;
            
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false); // 恢复按钮状态
            
            // 完成流式消息
            UIManager.finalizeStreamingMessage(messageId);

            if (response.success) {
                // 保存完整消息到历史
                saveToHistory({ role: 'assistant', content: fullText });
                
                // 提取代码块加入本地执行队列（不立即执行）
                extractAndQueueCodeBlocks(fullText);
                
                // 交互完成后，尝试执行队列中的任务
                await processExecutionQueue();
            } else {
                // 检查是否是用户主动取消
                if (response.cancelled) {
                    Utils.debugLog('✅ 请求已被用户取消');
                    // 如果已有部分内容，仍然保存
                    if (fullText.length > 0) {
                        saveToHistory({ role: 'assistant', content: fullText });
                    }
                    return; // 不显示错误消息，因为已经显示了停止提示
                }
                addAssistantMessage(`❌ API 错误: ${response.error}`);
            }

        } catch (error) {
            Utils.debugError('❌ 消息处理失败:', error);
            UIManager.hideTypingIndicator();
            UIManager.updateSendButtonState(false); // 恢复按钮状态
            
            // 检查是否是中止错误
            if (error.name === 'AbortError') {
                Utils.debugLog('✅ 请求已中止');
                return; // 不显示错误消息
            }
            
            addAssistantMessage(`❌ 错误: ${error.message}`);
        } finally {
            state.isProcessing = false;
            state.currentAbortController = null;
            processNextMessage();
        }
    }

    /**
     * 处理队列中的下一条消息
     */
    function processNextMessage() {
        if (state.messageQueue.length > 0 && !state.isProcessing) {
            const nextMessage = state.messageQueue.shift();
            Utils.debugLog('📤 从队列取出消息处理');
            handleMessage(nextMessage);
        }
    }

    // ========== 消息显示 ==========

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
        saveToHistory({ role: 'user', content: text });
    }

    /**
     * 添加助手消息到界面
     */
    function addAssistantMessage(text) {
        const formattedText = formatMessage(text);
        UIManager.appendMessage(formattedText);
        
        // 保存到历史
        saveToHistory({ role: 'assistant', content: text });
    }

    /**
     * 保存消息到历史记录
     */
    function saveToHistory(message) {
        const history = HistoryManager.getHistory();
        history.push(message);
        HistoryManager.saveConversationHistory(history);
    }

    // ========== 代码执行 ==========

    /**
     * 执行 JavaScript 代码（手动触发）
     */
    function executeJavaScript(code) {
        try {
            const result = unsafeWindow.eval(code);
            const resultStr = safeStringify(result);
            
            // 生成唯一 ID 并存储到全局
            const blockId = 'result_' + Date.now();
            state.codeBlockStore[blockId] = resultStr;
            
            // 使用代码块形式显示执行结果（控制高度）
            UIManager.appendMessage(`
                <div class="assistant-message">
                    <div style="margin-bottom: 4px; font-size: 13px; color: #10b981;">
                        <strong>✅ 执行成功</strong>
                    </div>
                    <div class="code-block" data-code-id="${blockId}" data-lang="result" style="max-height: 200px; overflow-y: auto;">
                        <div class="code-language">RESULT</div>
                        <pre>${escapeHtml(resultStr)}</pre>
                    </div>
                </div>
            `);
            
            // 保存执行记录
            saveToHistory({ 
                role: 'system', 
                content: `[代码执行] ${code}\n结果: ${resultStr}` 
            });
            
        } catch (error) {
            displayExecutionError(error);
        }
    }

    /**
     * 显示代码执行错误
     */
    function displayExecutionError(error) {
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
        
        // 生成唯一 ID 并存储到全局
        const blockId = 'error_' + Date.now();
        state.codeBlockStore[blockId] = error.toString();
        
        // 使用代码块形式显示错误（控制高度）
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div style="margin-bottom: 4px; font-size: 13px; color: #ef4444;">
                    <strong>❌ 执行失败 (${errorType})</strong>
                </div>
                <div class="code-block" data-code-id="${blockId}" data-lang="error" style="max-height: 200px; overflow-y: auto; background: #fee2e2; border-left: 4px solid #ef4444;">
                    <div class="code-language">ERROR</div>
                    <pre>${escapeHtml(error.toString())}</pre>
                </div>
                ${suggestion}
            </div>
        `);
        
        console.error('❌ 代码执行失败:', error);
    }

    /**
     * 提取代码块并加入本地执行队列
     */
    function extractAndQueueCodeBlocks(text) {
        const codeBlocks = extractCodeBlocks(text);
        const jsCodeBlocks = codeBlocks.filter(block => block.lang === 'javascript' || block.lang === 'js');
        
        jsCodeBlocks.forEach(block => {
            state.executionQueue.push({
                code: block.code,
                status: 'pending'
            });
        });
        
        if (jsCodeBlocks.length > 0) {
            Utils.debugLog(`📥 已将 ${jsCodeBlocks.length} 个代码块加入执行队列`);
        }
    }

    /**
     * 处理本地执行队列
     */
    async function processExecutionQueue() {
        if (state.executionQueue.length === 0) return;
        
        Utils.debugLog(`🚀 开始处理执行队列 (${state.executionQueue.length} 个任务)`);
        
        const results = [];
        while (state.executionQueue.length > 0) {
            const task = state.executionQueue.shift();
            if (task.status === 'pending') {
                const result = await executeWithRetry(task.code, results.length + 1, 3);
                results.push(result);
            }
        }
        
        if (results.length > 0) {
            await sendCombinedResultsToAI(results);
        }
    }

    /**
     * 执行消息中的代码块（自动执行安全代码，高危代码需要确认）
     * @deprecated 此函数现在主要用于手动触发或高危代码检测，常规执行由队列处理
     */
    async function executeCodeBlocksFromMessage(message) {
        if (state.isProcessing) return;
        
        const codeBlocks = extractCodeBlocks(message);
        const jsCodeBlocks = codeBlocks.filter(block => block.lang === 'javascript' || block.lang === 'js');
        
        if (jsCodeBlocks.length === 0) return;
        
        state.isProcessing = true;
        
        try {
            // 依次执行所有代码块，收集结果
            const results = [];
            
            for (let i = 0; i < jsCodeBlocks.length; i++) {
                const block = jsCodeBlocks[i];
                const index = i + 1;
                
                // 检查是否为高危代码
                if (isHighRiskCode(block.code)) {
                    // 高危代码：显示警告，需要手动确认
                    showHighRiskWarning(block.code, index);
                    results.push({
                        index,
                        status: 'pending',
                        message: '⚠️ 等待用户确认'
                    });
                } else {
                    // 安全代码：执行并收集结果（最多尝试3次）
                    const result = await executeWithRetry(block.code, index, 3);
                    results.push(result);
                }
            }
            
            // 如果有需要执行的代码块，组合结果并反馈给 AI
            const executableResults = results.filter(r => r.status !== 'pending');
            if (executableResults.length > 0) {
                // sendCombinedResultsToAI -> callAPIForFeedback 会自己管理状态
                await sendCombinedResultsToAI(executableResults);
            }
            
        } catch (error) {
            Utils.debugError('❌ 代码块执行失败:', error);
        } finally {
            // 只有在没有进行 API 调用时才重置状态
            // 如果调用了 callAPIForFeedback，它会在完成后重置状态
            if (!state.currentAbortController) {
                state.isProcessing = false;
                UIManager.updateSendButtonState(false);
                processNextMessage();
            }
            // 如果正在进行 API 调用，processNextMessage 会在 callAPIForFeedback 结束后调用
        }
    }

    /**
     * 带重试的代码执行（最多尝试 maxRetries 次）
     */
    async function executeWithRetry(code, index, maxRetries = 3) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                Utils.debugLog(`🔄 执行代码块 ${index} (尝试 ${attempt}/${maxRetries})`);
                
                const result = unsafeWindow.eval(code);
                const resultStr = safeStringify(result);
                
                Utils.debugLog(`✅ 代码块 ${index} 执行成功 (尝试 ${attempt})`);
                
                return {
                    index,
                    status: 'success',
                    result: resultStr,
                    attempts: attempt
                };
                
            } catch (error) {
                lastError = error;
                Utils.debugWarn(`⚠️ 代码块 ${index} 执行失败 (尝试 ${attempt}/${maxRetries}):`, error.message);
                
                // 如果不是最后一次尝试，等待一小段时间再重试
                if (attempt < maxRetries) {
                    await sleep(500); // 等待 500ms 后重试
                }
            }
        }
        
        // 所有尝试都失败了
        Utils.debugError(`❌ 代码块 ${index} 执行失败，已重试 ${maxRetries} 次`);
        
        return {
            index,
            status: 'failed',
            error: lastError.toString(),
            attempts: maxRetries,
            errorType: getErrorType(lastError)
        };
    }

    /**
     * 发送组合结果给 AI
     */
    async function sendCombinedResultsToAI(results) {
        // 构建组合结果消息
        const combinedMessage = buildCombinedResultsMessage(results);
        
        // 显示执行结果摘要
        addAssistantMessage(combinedMessage.summary);
        
        // 添加简化的用户消息
        addUserMessage(combinedMessage.userMessage);
        
        // 构建详细的反馈消息发送给 AI
        const feedbackMessage = combinedMessage.feedbackMessage;
        
        // 调用 API 获取 AI 响应
        await callAPIForFeedback(feedbackMessage);
    }

    /**
     * 构建组合结果消息
     */
    function buildCombinedResultsMessage(results) {
        const successCount = results.filter(r => r.status === 'success').length;
        const failedCount = results.filter(r => r.status === 'failed').length;
        
        // 构建详细结果文本（压缩格式）
        let resultText = `代码执行结果: 总计 ${results.length} 个 | ✅ 成功 ${successCount} 个 | ❌ 失败 ${failedCount} 个\n`;
        resultText += `${'='.repeat(60)}\n\n`;
        
        results.forEach((result, idx) => {
            resultText += `[代码块 ${result.index}] `;
            
            if (result.status === 'success') {
                resultText += `✅ 成功 (尝试 ${result.attempts} 次)\n`;
                resultText += `结果: ${result.result}\n`;
            } else {
                resultText += `❌ 失败 (${result.errorType}, 尝试 ${result.attempts} 次)\n`;
                resultText += `错误: ${result.error}\n`;
            }
            
            resultText += `\n${'-'.repeat(60)}\n\n`;
        });
        
        if (failedCount > 0) {
            resultText += `\n请根据上述结果修正失败的代码或提供其他帮助。`;
        }
        
        // 生成唯一 ID 并存储到全局
        const blockId = 'exec_result_' + Date.now();
        state.codeBlockStore[blockId] = resultText;
        
        // 构建摘要消息（使用代码块形式）
        let summaryHTML = '<div class="assistant-message">';
        summaryHTML += `<div style="margin-bottom: 4px; font-size: 13px; color: #667eea;">`;
        summaryHTML += `<strong>⚡ 代码执行结果 (${results.length} 个代码块)</strong>`;
        summaryHTML += `</div>`;
        summaryHTML += `<div class="code-block" data-code-id="${blockId}" data-lang="execution-result" style="max-height: 200px; overflow-y: auto;">`;
        summaryHTML += `<div class="code-language">RESULT</div>`;
        summaryHTML += `<pre>${escapeHtml(resultText)}</pre>`;
        summaryHTML += `</div></div>`;
        
        // 构建用户消息
        let userMessage = '';
        if (failedCount === 0) {
            userMessage = `✅ 所有代码块执行成功 (${results.length} 个)`;
        } else {
            userMessage = `⚠️ 部分代码块执行失败 (${successCount}/${results.length} 成功)`;
        }
        
        // 构建详细反馈消息（发送给 AI）
        let feedbackMessage = resultText;
        
        return {
            summary: summaryHTML,
            userMessage,
            feedbackMessage
        };
    }

    /**
     * 获取错误类型
     */
    function getErrorType(error) {
        if (error instanceof SyntaxError) return '语法错误';
        if (error instanceof ReferenceError) return '引用错误';
        if (error instanceof TypeError) return '类型错误';
        if (error.message && (error.message.includes('network') || error.message.includes('Network'))) return '网络错误';
        return '未知错误';
    }

    /**
     * 延迟函数
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 为代码执行反馈调用 API（不显示用户消息）
     */
    async function callAPIForFeedback(feedbackMessage) {
        UIManager.showTypingIndicator();
        UIManager.updateSendButtonState(true); // 更新按钮为停止状态
        
        const config = ConfigManager.getAll();
        const history = HistoryManager.getHistory();
        
        // 创建 AbortController 用于取消请求
        state.currentAbortController = new AbortController();
        
        // 创建流式消息容器
        const messageId = UIManager.createStreamingMessage();
        let fullText = '';
        
        const response = await APIRouter.sendRequest(
            { userMessage: feedbackMessage, conversationHistory: history, config, abortController: state.currentAbortController },
            (chunk, accumulatedText) => {
                fullText = accumulatedText;
                UIManager.updateStreamingMessage(messageId, accumulatedText);
            }
        );
        
        // 请求完成，清除 AbortController
        state.currentAbortController = null;
        
        UIManager.hideTypingIndicator();
        UIManager.updateSendButtonState(false); // 恢复按钮状态
        
        // 完成流式消息
        UIManager.finalizeStreamingMessage(messageId);
        
        // 重置处理状态
        state.isProcessing = false;
        
        // 显示 AI 回复
        if (response.success) {
            // 保存完整消息到历史
            saveToHistory({ role: 'assistant', content: fullText });
            
            // 检查 AI 回复中是否有新的代码块需要执行
            setTimeout(() => executeCodeBlocksFromMessage(fullText), 100);
        } else {
            // 检查是否是用户主动取消
            if (response.cancelled) {
                Utils.debugLog('✅ 代码执行反馈请求已被用户取消');
                processNextMessage();
                return; // 不显示错误消息
            }
            addAssistantMessage(`❌ API 错误: ${response.error}`);
        }
        
        // 处理队列中的下一条消息
        processNextMessage();
    }

    /**
     * 显示高危代码警告（需要手动确认执行）
     */
    function showHighRiskWarning(code, index) {
        // 生成唯一 ID 用于手动执行
        const warningId = 'warning_' + Date.now() + '_' + index;
        state.codeBlockStore[warningId] = code;
        
        // 创建 HTML 元素（不使用 onclick，改用 data 属性）
        const warningHTML = `
            <div class="assistant-message">
                <div class="execution-result execution-error" style="margin-top: 4px;">
                    <strong>⚠️ 高危代码检测 (代码块 ${index})</strong>
                    <br>
                    <span style="font-size: 13px; margin-top: 4px; display: block;">
                        此代码包含潜在危险操作，需要手动确认后才能执行。
                    </span>
                    <div style="margin-top: 8px; display: flex; gap: 6px;">
                        <button class="code-btn execute warning-execute-btn" data-warning-id="${warningId}" style="background: #f59e0b;">
                            ⚠️ 确认执行
                        </button>
                        <button class="code-btn warning-ignore-btn" style="background: #6b7280;">
                            ✕ 忽略
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        UIManager.appendMessage(warningHTML);
        
        // 等待 DOM 更新后绑定事件
        setTimeout(() => {
            // 查找刚添加的按钮并绑定事件
            const buttons = document.querySelectorAll('.warning-execute-btn, .warning-ignore-btn');
            buttons.forEach(btn => {
                if (!btn.dataset.eventBound) {
                    btn.dataset.eventBound = 'true';
                    
                    if (btn.classList.contains('warning-execute-btn')) {
                        btn.addEventListener('click', () => {
                            const wid = btn.dataset.warningId;
                            Utils.debugLog('⚠️ 用户确认执行高危代码:', wid);
                            
                            if (typeof ChatManager !== 'undefined' && ChatManager.getCodeFromStore) {
                                const code = ChatManager.getCodeFromStore(wid);
                                if (code) {
                                    ChatManager.executeJavaScript(code);
                                    // 移除警告框
                                    const warningBox = btn.closest('.assistant-message');
                                    if (warningBox) warningBox.remove();
                                }
                            } else {
                                Utils.debugError('❌ ChatManager 未初始化');
                            }
                        });
                    } else if (btn.classList.contains('warning-ignore-btn')) {
                        btn.addEventListener('click', () => {
                            const warningBox = btn.closest('.assistant-message');
                            if (warningBox) warningBox.remove();
                        });
                    }
                }
            });
        }, 50);
    }

    // ========== 消息格式化 ==========

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
        
        // 恢复代码块 - 同时存储到全局和 HTML 中
        formatted = formatted.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
            const block = codeBlocks[parseInt(index)];
            
            // 生成唯一 ID 并存储到全局（用于执行/复制）
            // 使用纯数字索引，便于排序和清理
            state.codeBlockIndex++;
            const blockId = 'code_' + state.codeBlockIndex;
            state.codeBlockStore[blockId] = block.code;
            
            // 如果超过限制，删除最旧的 20 个
            const keys = Object.keys(state.codeBlockStore);
            if (keys.length > MAX_CODE_BLOCKS) {
                // 按数字索引排序（提取 code_ 后面的数字）
                keys.sort((a, b) => {
                    const numA = parseInt(a.split('_')[1]) || 0;
                    const numB = parseInt(b.split('_')[1]) || 0;
                    return numA - numB;
                });
                // 删除最旧的 20 个
                keys.slice(0, 20).forEach(key => {
                    delete state.codeBlockStore[key];
                });
            }
            
            const isJs = block.lang === 'javascript' || block.lang === 'js';
            
            // HTML 中显示代码（用于视觉展示）
            return [
                `<div class="code-block" data-code-id="${blockId}" data-lang="${block.lang}">`,
                `<div class="code-language">${block.lang}</div>`,
                `<pre>${escapeHtml(block.code)}</pre>`,
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

    // ========== 快捷命令 ==========

    /**
     * 处理快捷命令
     */
    function handleCommand(command) {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        switch (cmd) {
            case '/js':
                if (args) {
                    executeJavaScript(args);
                } else {
                    addAssistantMessage('❌ 请提供要执行的 JavaScript 代码\n\n示例: /js document.title');
                }
                break;
            case '/clear':
                clearChat();
                break;
            case '/help':
                showHelp();
                break;
            default:
                addAssistantMessage(`❌ 未知命令: ${cmd}\n\n输入 /help 查看可用命令`);
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
     * 清空聊天
     */
    function clearChat() {
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.innerHTML = '';
        }
        HistoryManager.clearHistory();
        
        // 重置历史记录加载标志
        state.historyLoaded = false;
        Utils.debugLog('🗑️ 聊天记录已清空，重置加载标志');
        
        showWelcomeMessage();
    }

    // ========== 历史记录 ==========

    /**
     * 渲染历史记录到界面
     */
    function renderHistory(history) {
        // 如果已经加载过历史记录，则不再重复加载
        if (state.historyLoaded) {
            console.log('⚠️ 历史记录已加载，跳过重复加载');
            return;
        }
        
        // 清空当前聊天区域
        const chat = document.getElementById('agent-chat');
        if (chat) {
            chat.innerHTML = '';
        }
        
        // 加载历史消息（不保存，不执行）
        history.forEach((msg) => {
            if (msg.role === 'user') {
                const messageHTML = `
                    <div class="user-message">
                        <div class="message-content">${escapeHtml(msg.content)}</div>
                    </div>
                `;
                UIManager.appendMessage(messageHTML);
            } else if (msg.role === 'assistant') {
                const formattedText = formatMessage(msg.content);
                UIManager.appendMessage(formattedText);
            }
        });
        
        // 标记为已加载
        state.historyLoaded = true;
        Utils.debugLog(`✅ 历史记录加载完成，共 ${history.length} 条消息`);
    }

    /**
     * 显示欢迎消息
     */
    function showWelcomeMessage() {
        const welcomeMessage = `
<strong>👋 欢迎使用 AI Agent!</strong>

我可以帮你:
• 💬 智能对话 - 回答各种问题
• 🔧 执行 JavaScript 代码
•  操作当前页面
•  提取页面信息

<strong>快捷命令:</strong>
• <code>/js [代码]</code> - 执行代码
• <code>/clear</code> - 清空历史
• <code>/help</code> - 显示帮助

试试对我说: "帮我修改页面背景色"
        `;
        
        UIManager.appendMessage(`
            <div class="assistant-message">
                <div class="message-content">${welcomeMessage}</div>
            </div>
        `);
    }

    /**
     * 导航到上一条用户消息（滚动定位）
     */
    function navigateToPreviousUserMessage() {
        const chat = document.getElementById('agent-chat');
        if (!chat) return false;
        
        // 获取所有用户消息元素
        const userMessages = Array.from(chat.querySelectorAll('.user-message'));
        
        if (userMessages.length === 0) {
            console.log('ℹ️ 没有用户消息');
            return false;
        }
        
        // 找到当前可见的用户消息索引
        const chatRect = chat.getBoundingClientRect();
        let currentIndex = -1;
        
        for (let i = userMessages.length - 1; i >= 0; i--) {
            const msgRect = userMessages[i].getBoundingClientRect();
            // 如果消息在可视区域内或接近顶部
            if (msgRect.top <= chatRect.top + 50) {
                currentIndex = i;
                break;
            }
        }
        
        // 如果没有找到当前消息，定位到最后一条
        if (currentIndex === -1) {
            currentIndex = userMessages.length;
        }
        
        // 定位到上一条消息
        const targetIndex = currentIndex - 1;
        if (targetIndex < 0) {
            console.log('ℹ️ 已经是第一条消息');
            // 滚动到顶部
            chat.scrollTo({ top: 0, behavior: 'smooth' });
            return false;
        }
        
        const targetMessage = userMessages[targetIndex];
        targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 添加高亮效果
        highlightMessage(targetMessage);
        
        console.log(`⬆️ 已定位到第 ${targetIndex + 1} 条用户消息`);
        return true;
    }
    
    /**
     * 导航到下一条用户消息（滚动定位）
     */
    function navigateToNextUserMessage() {
        const chat = document.getElementById('agent-chat');
        if (!chat) return false;
        
        // 获取所有用户消息元素
        const userMessages = Array.from(chat.querySelectorAll('.user-message'));
        
        if (userMessages.length === 0) {
            console.log('ℹ️ 没有用户消息');
            return false;
        }
        
        // 找到当前可见的用户消息索引
        const chatRect = chat.getBoundingClientRect();
        let currentIndex = -1;
        
        for (let i = 0; i < userMessages.length; i++) {
            const msgRect = userMessages[i].getBoundingClientRect();
            // 如果消息在可视区域内或接近底部
            if (msgRect.bottom >= chatRect.bottom - 50) {
                currentIndex = i;
                break;
            }
        }
        
        // 如果没有找到当前消息，定位到第一条
        if (currentIndex === -1) {
            currentIndex = -1;
        }
        
        // 定位到下一条消息
        const targetIndex = currentIndex + 1;
        if (targetIndex >= userMessages.length) {
            console.log('ℹ️ 已经是最后一条消息');
            // 滚动到底部
            chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
            return false;
        }
        
        const targetMessage = userMessages[targetIndex];
        targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 添加高亮效果
        highlightMessage(targetMessage);
        
        console.log(`⬇️ 已定位到第 ${targetIndex + 1} 条用户消息`);
        return true;
    }
    
    /**
     * 高亮显示消息（临时效果）
     */
    function highlightMessage(messageElement) {
        const chat = document.getElementById('agent-chat');
        if (!chat) return;
        
        // 移除之前的高亮
        const previousHighlight = chat.querySelector('.message-highlighted');
        if (previousHighlight) {
            previousHighlight.classList.remove('message-highlighted');
        }
        
        // 添加高亮类
        messageElement.classList.add('message-highlighted');
        
        // 2秒后移除高亮
        setTimeout(() => {
            messageElement.classList.remove('message-highlighted');
        }, 2000);
    }

    // ========== 公共接口 ==========

    return {
        handleMessage,
        executeJavaScript,
        clearChat,
        showHelp,
        showWelcomeMessage,
        renderHistory,
        stopCurrentRequest,  // 添加停止请求功能
        navigateToPreviousUserMessage,  // 导航到上一条用户消息
        navigateToNextUserMessage,  // 导航到下一条用户消息
        getCodeFromStore: (blockId) => state.codeBlockStore[blockId] || '',
        getMessageQueueLength: () => state.messageQueue.length
    };
})();
