/**
 * ChatController - 聊天控制器
 *
 * 职责：
 * 1. 管理最小运行时状态（当前请求、流式状态）
 * 2. 协调 SessionManager 和 ProviderService
 * 3. 处理 Tool Call 循环：检测 → 执行 → 回填 → 继续对话
 * 4. chatStream 返回 StandardResponse，内部已经是 ToolCall[] 对象
 */
class ChatController {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    this.currentRequest = null;
    this.state = window.Events.CHAT.STATE.IDLE;
  }

  _setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    this._notifyActivityState();
  }

  async sendMessage({ content, sessionId = null, chatService = null, model = null, reasoningEffort = undefined, isToolContinuation = false } = {}) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const service = chatService || this.serviceCenter.getCurrentProviderService();
    const settings = this.serviceCenter.getSettingsManager().getSettings();
    const defaultEffort = settings?.reasoningEffort || 'medium';
    let assistantMsgId = null;
    let session = null;

    // === Provider 端前缀缓存：以 sessionId 作为 cache key ===
    // 多轮会话中，Provider 端可以复用前面的前缀，避免重复推理
    // - OpenAI o-series / gpt-4.1 / gpt-4o: prompt_cache_key 字段
    // - OpenRouter: cache_control: { type: 'ephemeral' }
    // - LM Studio: cache_prompt=true
    // 设置为在创建 session / 加载 session 之后注入，从而保证 session 一定存在

    if (!isToolContinuation) {
      if (!content || !content.trim()) throw new Error('Message content is required');
      if (this.currentRequest) throw new Error('A message is already being generated');
    }

    try {
      if (!isToolContinuation) this._setState(window.Events.CHAT.STATE.WAITING);

      session = sessionId ? sessionManager.getSession(sessionId) : sessionManager.getCurrentSession();
      if (!session) {
        if (isToolContinuation) throw new Error('Session required for tool continuation');
        session = sessionManager.createSession({
          title: '新对话',
          reasoningEffort: reasoningEffort || defaultEffort
        });
      } else if (reasoningEffort && session.reasoningEffort !== reasoningEffort) {
        session.reasoningEffort = reasoningEffort;
      }

      const modelId = model ? model.id : service.config?.defaultModel;
      const thinkingEffort = session.reasoningEffort || 'off';
      const { MessagesRequest } = window.MessageContent;

      if (!isToolContinuation) {
        const userMsg = new window.Message({ role: 'user', content: content.trim() });
        await sessionManager.addMessage(userMsg, session.id);
      }

      const freshSession = sessionManager.getSession(session.id);
      const tools = this.serviceCenter.getToolDefinitionsForLLM();

      const request = new MessagesRequest({
        model: modelId,
        messages: freshSession.messages,
        stream: true,
        thinking: thinkingEffort !== 'off' ? new window.MessageContent.ThinkingConfig(thinkingEffort) : null,
        tools: tools.length > 0 ? tools : null
      });

      // === 注入 Provider 端前缀缓存 key ===
      // 以 sessionId 作为 cache key，后同会话中可复用前缀 KV cache
      // 各 Provider 在 _shouldApplyCache() 决定是否采用
      if (service && service.cacheOptions) {
        service.cacheOptions.sessionCacheKey = `webagentcli:session:${session.id}`;
      }

      const assistantMsg = new window.Message({ role: 'assistant', content: '' });
      await sessionManager.addMessage(assistantMsg, session.id);
      assistantMsgId = assistantMsg.id;

      this.currentRequest = {
        sessionId: session.id,
        assistantMessageId: assistantMsgId,
        startedAt: Date.now(),
        lastActiveAt: Date.now()
      };

      this.eventBus.emit(window.Events.CHAT.STREAM_START, {
        sessionId: session.id,
        messageId: assistantMsgId
      });

      // chatStream 返回 Promise<StandardResponse>
      // onChunk 只接收 {content, reasoning_content} 用于 UI
      const result = await service.chatStream(request, (chunk) => {
        if (this.currentRequest) this.currentRequest.lastActiveAt = Date.now();
        const content = chunk.content || '';
        const reasoning = (thinkingEffort !== 'off') ? (chunk.reasoning_content || '') : '';

        if (reasoning && this.state !== window.Events.CHAT.STATE.THINKING) {
          this._setState(window.Events.CHAT.STATE.THINKING);
        } else if (content && this.state !== window.Events.CHAT.STATE.GENERATING) {
          this._setState(window.Events.CHAT.STATE.GENERATING);
        }

        sessionManager.streamChunkMessage(assistantMsgId, { content, reasoning_content: reasoning }, session.id);
        this.eventBus.emit(window.Events.CHAT.STREAM_CHUNK_APPEND, {
          sessionId: session.id, messageId: assistantMsgId, content, reasoning_content: reasoning
        });
      });

      // result = StandardResponse: { content, toolCalls: ToolCall[], reasoning_content, finishReason, ... }
      if (!result) return; // 被取消

      // 把 toolCalls 附加到 assistant 消息
      if (result.toolCalls && result.toolCalls.length > 0) {
        sessionManager.updateMessage(assistantMsgId, (msg) => {
          result.toolCalls.forEach(tc => msg.addToolCall(tc));
        }, session.id);
      }

      this._setState(window.Events.CHAT.STATE.COMPLETED);
      const duration = Date.now() - this.currentRequest.startedAt;
      this.eventBus.emit(window.Events.CHAT.STREAM_COMPLETE, {
        sessionId: session.id, messageId: assistantMsgId, duration
      });

      // 有 toolCalls 时执行并续发
      if (result.toolCalls && result.toolCalls.length > 0) {
        await this._executeToolCalls(result.toolCalls, session.id);
      }
    } catch (error) {
      this._setState(window.Events.CHAT.STATE.FAILED);
      if (assistantMsgId && session) {
        // 注意：这里不使用流式防抖，手动 updateMessage 已直接落盘
        sessionManager.updateMessage(assistantMsgId, (msg) => { msg.content = `❌ 发送失败: ${error.message}`; }, session.id);
      }
      this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
        error, message: error.message, sessionId: session?.id, messageId: assistantMsgId
      });
    } finally {
      this.currentRequest = null;
      // 强制刷新所有待写入的流式分片，保证错误状态下也不丢数据
      try { await sessionManager.flushAllStreamWrites(); } catch (e) { /* ignore */ }
      setTimeout(() => {
        if (!this.currentRequest && this.state !== window.Events.CHAT.STATE.IDLE) {
          this._setState(window.Events.CHAT.STATE.IDLE);
        }
      }, 50);
    }
  }

  async _executeToolCalls(toolCalls, sessionId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const toolResults = [];

    for (const tc of toolCalls) {
      const tool = this.serviceCenter.getTool(tc.toolName);

      this.eventBus.emit(window.Events.TOOL.EXECUTING, {
        toolName: tc.toolName, toolCallId: tc.id, sessionId
      });

      let toolResult;
      try {
        if (!tool) {
          toolResult = new window.ToolResult({ toolCallId: tc.id, status: 'failed', error: `Unknown tool: ${tc.toolName}` });
        } else {
          let tabId = null;
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = tabs[0]?.id;
          } catch (e) { /* 忽略 */ }
          toolResult = await tool.invoke(tc, { sessionId, tabId });
        }
      } catch (invokeError) {
        toolResult = new window.ToolResult({ toolCallId: tc.id, status: 'failed', error: invokeError.message || String(invokeError) });
      }

      toolResults.push(toolResult);
      this.eventBus.emit(window.Events.TOOL.COMPLETED, {
        toolName: tc.toolName, toolCallId: tc.id, status: toolResult.status, duration: toolResult.duration, sessionId
      });

      const toolMsg = new window.Message({
        role: window.Role.TOOL,
        toolCallId: tc.id,
        content: toolResult.isSuccess()
          ? (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))
          : `⚠️ 执行失败: ${toolResult.error}`
      });
      await sessionManager.addMessage(toolMsg, sessionId);
    }

    this.eventBus.emit(window.Events.TOOL.ALL_COMPLETED, { toolResults, sessionId });
    await this.sendMessage({ sessionId, isToolContinuation: true });
  }

  stopGeneration() {
    if (!this.currentRequest) return;
    const chatService = this.serviceCenter.getCurrentProviderService();
    if (chatService && typeof chatService.cancel === 'function') chatService.cancel();
    const stoppedRequest = this.currentRequest;
    this.currentRequest = null;
    this._setState(window.Events.CHAT.STATE.STOPPED);
    this.eventBus.emit(window.Events.CHAT.STREAM_STOP, {
      sessionId: stoppedRequest?.sessionId, messageId: stoppedRequest?.assistantMessageId
    });
    // 停止时也刷新待写入的流式分片
    try { this.serviceCenter.getSessionManager().flushAllStreamWrites(); } catch (e) { /* ignore */ }
    setTimeout(() => this._setState(window.Events.CHAT.STATE.IDLE), 50);
  }

  clearMessages() {
    const sessionManager = this.serviceCenter.getSessionManager();
    const session = sessionManager.getCurrentSession();
    if (!session) return false;
    sessionManager.clearMessages(session.id);
    this.currentRequest = null;
    this._setState(window.Events.CHAT.STATE.IDLE);
    return true;
  }

  deleteMessage(messageId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const session = sessionManager.getCurrentSession();
    const result = session ? sessionManager.deleteMessage(messageId, session.id) : false;
    if (result) {
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, { messageId, sessionId: session.id });
    }
    return result;
  }

  hasActiveActivities() { return this.state !== window.Events.CHAT.STATE.IDLE; }

  getQueueStatus() {
    return {
      state: this.state,
      sessionId: this.currentRequest?.sessionId || null,
      hasActive: this.hasActiveActivities()
    };
  }

  _notifyActivityState() {
    this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, this.getQueueStatus());
  }
}

if (typeof window !== 'undefined') window.ChatController = ChatController;
if (typeof module !== 'undefined' && module.exports) module.exports = ChatController;