/**
 * ChatProgram - 聊天程序（Core 层）
 *
 * 职责：编排一次"用户发消息 → AI 流式回复 → 工具调用循环"的完整流程。
 * 只处理 core model + 存储逻辑，不直接操作任何 UI。
 *
 * 输入：订阅 eventBus 事件
 *   USER_MESSAGE_SENT   → 用户发送消息
 *   STOP_REQUESTED      → 用户停止生成
 *
 * 输出：发射 eventBus 事件（ChatEventHandler / ChatPage 监听后做 UI 更新）
 *   ACTIVITY_STATE_CHANGED   → 活动状态变更（waiting/thinking/generating/idle）
 *   STREAM_START             → 流式开始
 *   STREAM_CHUNK_APPEND      → 流式分片（content/reasoning_content）
 *   STREAM_COMPLETE          → 流式结束
 *   STREAM_STOP              → 用户停止
 *   STREAM_ERROR             → 流式错误
 *   TOOL.*                   → 工具执行进度
 */
class ChatProgram {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();

    this._active = false;
    this._session = null;
    this._assistantMsgId = null;

    // 订阅事件
    this.eventBus.on(window.Events.CHAT.USER_MESSAGE_SENT, (data) => {
      this.sendMessage(data);
    });
  }

  get isActive() { return this._active; }

  /**
   * 发送消息（用户消息 + 流式回复 + 工具循环全流程）
   */
  async sendMessage({ content, sessionId = null, model = null, reasoningEffort = undefined, isToolContinuation = false } = {}) {
    if (!isToolContinuation && !content?.trim()) return;

    const sessionManager = this.serviceCenter.getSessionManager();
    let service;

    try {
      service = this.serviceCenter.getCurrentProviderService();
    } catch (e) {
      console.error('[ChatProgram] No provider configured');
      // 通知 UI 层显示错误
      this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
        error: e,
        message: '请先在设置中配置 AI 服务',
      });
      return;
    }

    const settings = this.serviceCenter.getSettingsManager().getSettings();
    const defaultEffort = settings?.reasoningEffort || 'medium';

    this._active = true;
    this._emitState('waiting');

    try {
      // 1. 获取/创建会话
      this._session = sessionId
        ? sessionManager.getSession(sessionId)
        : sessionManager.getCurrentSession();

      if (!this._session) {
        this._session = sessionManager.createSession({
          title: '新对话',
          reasoningEffort: reasoningEffort || defaultEffort,
        });
      } else if (reasoningEffort && this._session.reasoningEffort !== reasoningEffort) {
        this._session.reasoningEffort = reasoningEffort;
      }

      const modelId = model || service.config?.defaultModel;
      const thinkingEffort = this._session.reasoningEffort || 'off';

      // 2. 添加用户消息
      if (!isToolContinuation) {
        const userMsg = new window.Message({ role: 'user', content: content.trim() });
        await sessionManager.addMessage(userMsg, this._session.id);
      }

      // 3. 截断消息 → 构建请求
      const freshSession = sessionManager.getSession(this._session.id);
      const messages = this._truncateMessages(freshSession, settings, modelId);
      const tools = this.serviceCenter.getToolDefinitionsForLLM();
      const { MessagesRequest } = window.MessageContent;

      const request = new MessagesRequest({
        model: modelId,
        messages,
        stream: true,
        thinking: new window.MessageContent.ThinkingConfig(thinkingEffort),
        tools: tools.length > 0 ? tools : null,
      });

      if (service?.cacheOptions) {
        service.cacheOptions.sessionCacheKey = `webagentcli:session:${this._session.id}`;
      }

      // 4. 创建 assistant 空消息
      const assistantMsg = new window.Message({ role: 'assistant', content: '' });
      await sessionManager.addMessage(assistantMsg, this._session.id);
      this._assistantMsgId = assistantMsg.id;

      this.eventBus.emit(window.Events.CHAT.STREAM_START, {
        sessionId: this._session.id, messageId: this._assistantMsgId,
      });

      // 5. 流式请求
      const result = await service.chatStream(request, (chunk) => {
        const text = chunk.content || '';
        const reasoning = chunk.reasoning_content || '';

        if (reasoning) this._emitState('thinking');
        else if (text) this._emitState('generating');

        // 持久化：写入 session
        sessionManager.streamChunkMessage(this._assistantMsgId, {
          content: text, reasoning_content: reasoning,
        }, this._session.id);

        // 通知 UI 层更新
        this.eventBus.emit(window.Events.CHAT.STREAM_CHUNK_APPEND, {
          sessionId: this._session.id,
          messageId: this._assistantMsgId,
          content: text,
          reasoning_content: reasoning,
        });
      });

      if (!result) return; // 被 cancel

      // 6. 附加 toolCalls
      if (result.toolCalls?.length > 0) {
        sessionManager.updateMessage(this._assistantMsgId, (msg) => {
          result.toolCalls.forEach(tc => msg.addToolCall(tc));
        }, this._session.id);
      }

      this.eventBus.emit(window.Events.CHAT.STREAM_COMPLETE, {
        sessionId: this._session.id, messageId: this._assistantMsgId,
      });

      // 7. 工具循环或结束
      if (result.toolCalls?.length > 0) {
        await this._executeToolCalls(result.toolCalls, this._session.id);
      } else {
        this._done();
      }

    } catch (error) {
      console.error('[ChatProgram] sendMessage failed:', error);
      this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
        error, message: error.message,
        sessionId: this._session?.id, messageId: this._assistantMsgId,
      });
      this._done();
    } finally {
      try { await sessionManager.flushAllStreamWrites(); } catch (e) { /* ignore */ }
    }
  }

  /**
   * 取消当前请求
   */
  cancel() {
    if (!this._active) return;
    const service = this.serviceCenter.getCurrentProviderService();
    if (service?.cancel) service.cancel();
    this.eventBus.emit(window.Events.CHAT.STREAM_STOP, {
      sessionId: this._session?.id, messageId: this._assistantMsgId,
    });
    try { this.serviceCenter.getSessionManager().flushAllStreamWrites(); } catch (e) { /* ignore */ }
    this._done();
  }

  // ==================== 工具循环 ====================

  async _executeToolCalls(toolCalls, sessionId) {
    const sessionManager = this.serviceCenter.getSessionManager();

    for (const tc of toolCalls) {
      const tool = this.serviceCenter.getTool(tc.toolName);

      this.eventBus.emit(window.Events.TOOL.EXECUTING, {
        toolName: tc.toolName, toolCallId: tc.id, sessionId,
      });

      let toolResult;
      try {
        if (!tool) {
          toolResult = new window.ToolResult({ toolCallId: tc.id, status: 'failed', error: `Unknown: ${tc.toolName}` });
        } else {
          toolResult = await tool.invoke(tc, { sessionId });
        }
      } catch (e) {
        toolResult = new window.ToolResult({ toolCallId: tc.id, status: 'failed', error: e.message || String(e) });
      }

      this.eventBus.emit(window.Events.TOOL.COMPLETED, {
        toolName: tc.toolName, toolCallId: tc.id, status: toolResult.status, duration: toolResult.duration, sessionId,
      });

      const toolMsg = new window.Message({
        role: window.Role.TOOL,
        toolCallId: tc.id,
        content: toolResult.isSuccess()
          ? (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))
          : `⚠️ 失败: ${toolResult.error}`,
      });
      await sessionManager.addMessage(toolMsg, sessionId);
    }

    this.eventBus.emit(window.Events.TOOL.ALL_COMPLETED, { toolResults: Array.from(toolCalls), sessionId });
    await this.sendMessage({ sessionId, isToolContinuation: true });
  }

  // ==================== 内部 ====================

  _emitState(state) {
    this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, {
      state, hasActive: state !== 'idle', sessionId: this._session?.id,
    });
  }

  _done() {
    this._active = false;
    this._emitState('idle');
    this._session = null;
    this._assistantMsgId = null;
  }

  _truncateMessages(session, settings, modelId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const totalMessages = session.messages.length;
    const autoTruncate = settings?.autoContextTruncation !== false;
    const hasCache = this._providerHasCache(this.serviceCenter.getCurrentProviderService(), modelId);

    let messages;
    if (hasCache) {
      messages = sessionManager.getContextWindow(session, {
        autoContextTruncation: autoTruncate,
        contextWindowSize: settings?.contextWindowSize || 20,
      });
    } else {
      const modelObj = this.serviceCenter.getModelManager().getModel(modelId);
      messages = sessionManager.getMessagesByTokenBudget(session, {
        contextLength: modelObj?.contextLength || 8192,
        maxTokens: settings?.maxTokens || 2000,
        contextWindowRatio: settings?.contextWindowRatio || 0.8,
      });
    }
    if (messages.length < totalMessages) console.log(`[ChatProgram] Truncated: ${totalMessages} → ${messages.length}`);
    return messages;
  }

  _providerHasCache(service, modelId) {
    if (!service?.cacheOptions?.enabled) return false;
    switch (service.name) {
      case 'openai':  return /^(o\d|gpt-4\.1|gpt-4o)/i.test(modelId || '');
      case 'openrouter': return !modelId?.includes('free');
      case 'lm-studio': return true;
      default: return false;
    }
  }
}

window.ChatProgram = ChatProgram;