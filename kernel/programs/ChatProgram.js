/**
 * ChatProgram - 聊天程序（Core 层）
 *
 * 职责：编排"用户发消息 → AI 流式回复 → 工具调用循环"的完整流程。
 * 只处理 core model + 存储逻辑。
 *
 * 输入：订阅 eventBus 事件
 *   CMD.SEND             → 发送消息
 *   CMD.STOP             → 停止生成
 *   CMD.DELETE_MESSAGE   → 删除消息
 *
 * 输出：发射 eventBus 事件
 *   STREAM_START              → 流式开始（UI 应显示停止按钮）
 *   STREAM_CHUNK_APPEND       → 流式分片（content/reasoning_content）
 *   STREAM_COMPLETE           → 流式结束（UI 应隐藏停止按钮）
 *   STREAM_STOP               → 用户停止
 *   STREAM_ERROR              → 流式错误
 *   TOOL.EXECUTING            → 工具开始执行
 *   TOOL.COMPLETED            → 工具执行完成
 *   TOOL.ALL_COMPLETED        → 本轮所有工具执行完毕
 *   MESSAGE_DELETED           → 消息已删除
 */
class ChatProgram {
  // ★ 指令接口：ChatProgram 只接受这些指令
  static CMD = Object.freeze({
    SEND: 'chat:cmd:send',                    // 发送消息 { content, sessionId?, model?, reasoningEffort? }
    STOP: 'chat:cmd:stop',                    // 停止生成
    DELETE_MESSAGE: 'chat:cmd:deleteMessage',  // 删除消息 { messageId }
  });

  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();

    this._session = null;
    this._assistantMsgId = null;
    this._destroyed = false;

    // ★ 订阅自己的指令（由 ChatEventHandler 鉴权后转发）
    // 保存回调引用以便 destroy() 时移除
    this._onSend = (data) => this.sendMessage(data);
    this._onStop = () => this.cancel();
    this._onDeleteMessage = (data) => {
      const sessionManager = this.serviceCenter.getSessionManager();
      const session = sessionManager.getCurrentSession();
      if (session && data.messageId) {
        const result = sessionManager.deleteMessage(data.messageId, session.id);
        if (result !== false) {
          this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, {
            messageId: data.messageId, sessionId: session.id,
          });
        }
      }
    };

    this.eventBus.on(ChatProgram.CMD.SEND, this._onSend);
    this.eventBus.on(ChatProgram.CMD.STOP, this._onStop);
    this.eventBus.on(ChatProgram.CMD.DELETE_MESSAGE, this._onDeleteMessage);

    // ★ 会话切换时：取消正在进行的交互，更新 session 引用
    this._onSessionChanged = () => {
      if (this._active) {
        console.log('[ChatProgram] Session changed during active stream, cancelling');
        this.cancel();
      }
      // session 已由 SessionManager 更新，下次 sendMessage 时会自动获取当前会话
    };
    this.eventBus.on(window.Events.CHAT.CURRENT_SESSION_CHANGED, this._onSessionChanged);
  }

  /**
   * 销毁实例，移除所有事件监听
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.eventBus.off(ChatProgram.CMD.SEND, this._onSend);
    this.eventBus.off(ChatProgram.CMD.STOP, this._onStop);
    this.eventBus.off(ChatProgram.CMD.DELETE_MESSAGE, this._onDeleteMessage);
    this.eventBus.off(window.Events.CHAT.CURRENT_SESSION_CHANGED, this._onSessionChanged);
    console.log('[ChatProgram] Destroyed');
  }

  /**
   * 发送消息（用户消息 → 流式回复 → 工具循环全流程）
   */
  async sendMessage({ content, sessionId = null, model = null, reasoningEffort = undefined, isToolContinuation = false } = {}) {
    if (!isToolContinuation && !content?.trim()) return;

    const sessionManager = this.serviceCenter.getSessionManager();
    let service;

    try {
      service = this.serviceCenter.getCurrentProviderService();
    } catch (e) {
      console.error('[ChatProgram] No provider configured');
      this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
        error: e, message: '请先在设置中配置 AI 服务',
      });
      return;
    }

    const settings = this.serviceCenter.getSettingsManager().getSettings();
    const defaultEffort = settings?.reasoningEffort || 'medium';

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

      // 3. 截断 → 构建请求
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

      // → 发射 STREAM_START（UI 应显示停止按钮）
      this.eventBus.emit(window.Events.CHAT.STREAM_START, {
        sessionId: this._session.id, messageId: this._assistantMsgId,
      });

      // 5. 流式请求
      const result = await service.chatStream(request, (chunk) => {
        const text = chunk.content || '';
        const reasoning = chunk.reasoning_content || '';

        // 持久化写入 session
        sessionManager.streamChunkMessage(this._assistantMsgId, {
          content: text, reasoning_content: reasoning,
        }, this._session.id);

        // UI 更新
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

      // → 发射 STREAM_COMPLETE（UI 应隐藏停止按钮）
      this.eventBus.emit(window.Events.CHAT.STREAM_COMPLETE, {
        sessionId: this._session.id, messageId: this._assistantMsgId,
      });

      // 7. 工具循环或结束
      if (result.toolCalls?.length > 0) {
        await this._executeToolCalls(result.toolCalls, this._session.id);
      }

      return result;

    } catch (error) {
      console.error('[ChatProgram] sendMessage failed:', error);
      this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
        error, message: error.message,
        sessionId: this._session?.id, messageId: this._assistantMsgId,
      });
    } finally {
      try { await sessionManager.flushAllStreamWrites(); } catch (e) { /* ignore */ }
    }
  }

  /**
   * 取消当前请求
   */
  cancel() {
    const service = this.serviceCenter.getCurrentProviderService();
    if (service?.cancel) service.cancel();
    this.eventBus.emit(window.Events.CHAT.STREAM_STOP, {
      sessionId: this._session?.id, messageId: this._assistantMsgId,
    });
    try { this.serviceCenter.getSessionManager().flushAllStreamWrites(); } catch (e) { /* ignore */ }
  }

  // ==================== 工具循环 ====================

  async _executeToolCalls(toolCalls, sessionId) {
    const sessionManager = this.serviceCenter.getSessionManager();

    // → 发射 TOOL.EXECUTING 第一个工具开始（UI 可显示执行指示器）
    if (toolCalls.length > 0) {
      this.eventBus.emit(window.Events.TOOL.EXECUTING, {
        toolName: toolCalls[0].toolName, toolCallId: toolCalls[0].id, sessionId,
      });
    }

    for (const tc of toolCalls) {
      const tool = this.serviceCenter.getTool(tc.toolName);

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

    // → 发射 TOOL.ALL_COMPLETED（UI 可隐藏执行指示器）
    this.eventBus.emit(window.Events.TOOL.ALL_COMPLETED, { toolResults: Array.from(toolCalls), sessionId });

    // 工具续发
    await this.sendMessage({ sessionId, isToolContinuation: true });
  }

  // ==================== 内部 ====================

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

window.webagent = window.webagent || {};
window.webagent.programs = window.webagent.programs || {};
window.webagent.programs.ChatProgram = ChatProgram;