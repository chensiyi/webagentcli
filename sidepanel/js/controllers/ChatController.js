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

      // === 客户端上下文截断（按 sessionId 减少 IO）===
      // 含义：
      // 1. 网络 payload 只发送"安全窗口内"的消息（而不是整个 session 的全量历史）
      // 2. Provider 端前缀缓存结合 prompt_cache_key 可让被裁掉的部分仍被服务器记住
      // 3. autoContextTruncation=true 时生效；用户可在设置中关闭
      const messagesForRequest = this._truncateMessagesForRequest(freshSession, settings, modelId);

      const request = new MessagesRequest({
        model: modelId,
        messages: messagesForRequest,
        stream: true,
        thinking: new window.MessageContent.ThinkingConfig(thinkingEffort),
        tools: tools.length > 0 ? tools : null
      });

      // === 注入 Provider 端前缀缓存 key ===
      // 以 sessionId 作为 cache key，后同会话中可复用前缀 KV cache
      // 各 Provider 在 _shouldApplyCache() 决定是否采用
      if (service && service.cacheOptions) {
        const cacheKey = `webagentcli:session:${session.id}`;
        service.cacheOptions.sessionCacheKey = cacheKey;
        console.log(
          `[ChatController] Provider cache key injected: ${cacheKey} ` +
          `(provider=${service.name}, cacheEnabled=${service.cacheOptions.enabled})`
        );
      } else {
        console.warn('[ChatController] No service.cacheOptions available — provider caching disabled');
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
      // onChunk 接收 {content, reasoning_content} 用于 UI
      // 注意：即使 thinkingEffort='off'，后端也可能返回 reasoning_content（如 OpenRouter free 模型）
      // 必须始终传递，否则会丢失数据导致空气泡
      const result = await service.chatStream(request, (chunk) => {
        if (this.currentRequest) this.currentRequest.lastActiveAt = Date.now();
        const content = chunk.content || '';
        const reasoning = chunk.reasoning_content || '';

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

  /**
   * 判断当前 Provider 是否有 KV cache 能力
   * 有缓存 → 可以用固定窗口截断（Provider 记住被裁的前缀）
   * 无缓存 → 必须基于 token 预算截断（裁掉就真的丢了）
   * 
   * @private
   * @param {IProviderAPIService} service - Provider 服务实例
   * @param {string} modelId - 当前模型 ID
   * @returns {boolean}
   */
  _providerHasCache(service, modelId) {
    if (!service || !service.cacheOptions || !service.cacheOptions.enabled) {
      return false;
    }
    
    // 不同 Provider 的缓存能力判断
    switch (service.name) {
      case 'openai':
        // OpenAI 自动缓存只对特定模型有效
        return /^(o\d|gpt-4\.1|gpt-4o)/i.test(modelId || '');
      case 'openrouter':
        // OpenRouter 通过 cache_control 支持（仅付费模型）
        // free 模型不支持
        return !modelId?.includes('free');
      case 'lm-studio':
        // LM Studio 本地运行，缓存始终有效（零成本）
        return true;
      default:
        return false;
    }
  }

  _truncateMessagesForRequest(session, settings, modelId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const totalMessages = session.messages.length;
    const autoTruncate = settings?.autoContextTruncation !== false;
    const hasCache = this._providerHasCache(
      this.serviceCenter.getCurrentProviderService(), modelId
    );
    
    console.log(
      `[ChatController] Preparing request messages: ` +
      `total=${totalMessages}, autoTruncation=${autoTruncate}, ` +
      `providerCache=${hasCache}, model=${modelId}, session=${session.id}`
    );
    
    let messages;
    
    if (hasCache) {
      // === 有 Provider 缓存：固定窗口截断 ===
      // Provider 端会记住被裁掉的前缀，多轮中可以复用 KV cache
      const windowSize = settings?.contextWindowSize || 20;
      messages = sessionManager.getContextWindow(session, {
        autoContextTruncation: autoTruncate,
        contextWindowSize: windowSize
      });
      
      if (messages.length < totalMessages) {
        console.log(
          `[ChatController] ⚡ Window truncation (cache-enabled): ${totalMessages} → ${messages.length} messages ` +
          `(window=${windowSize}, model=${modelId}, session=${session.id})`
        );
      } else {
        console.log(
          `[ChatController] No truncation needed: ${messages.length}/${totalMessages} messages in payload`
        );
      }
    } else {
      // === 无 Provider 缓存：token 预算截断 ===
      // 基于模型 contextLength 计算输入预算，尽可能保留更多历史
      const modelObj = this.serviceCenter.getModelManager().getModel(modelId);
      const contextLength = modelObj?.contextLength || 8192;
      const maxTokens = settings?.maxTokens || 2000;
      const ratio = settings?.contextWindowRatio || 0.8;
      
      messages = sessionManager.getMessagesByTokenBudget(session, {
        contextLength,
        maxTokens,
        contextWindowRatio: ratio
      });
      
      if (messages.length < totalMessages) {
        console.log(
          `[ChatController] ⚡ Token-budget truncation (no cache): ${totalMessages} → ${messages.length} messages ` +
          `(contextLength=${contextLength}, maxTokens=${maxTokens}, ratio=${ratio}, model=${modelId})`
        );
      } else {
        console.log(
          `[ChatController] No truncation needed: ${messages.length}/${totalMessages} messages fit in token budget`
        );
      }
    }

    return messages;
  }
}

if (typeof window !== 'undefined') window.ChatController = ChatController;
if (typeof module !== 'undefined' && module.exports) module.exports = ChatController;