/**
 * ChatProgram - 聊天程序定义
 *
 * 以 Program + 状态机模式重构 ChatController。
 *
 * 核心概念：
 * - Program：定义聊天程序需要的权限和资源
 * - Context（ctx）：过程中的共享上下文，保存所有运行时变量
 * - State Handler：每个状态对应一个处理函数，切换状态即切换处理过程
 *
 * 状态流：
 *   IDLE → (用户发消息) → WAITING → (流式接收) → THINKING ↔ GENERATING
 *     → (流结束) → COMPLETED → (有 toolCalls) → WAITING（工具续发）
 *     → (流结束) → COMPLETED → (无 toolCalls) → IDLE
 *   任何状态 → FAILED / STOPPED → IDLE
 *
 * 用法：
 *   const program = new ChatProgram(serviceCenter);
 *   const ctx = program.createContext({ content: '你好', sessionId: '...' });
 *   await program.run(ctx);
 */
class ChatProgram {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();

    /**
     * 状态处理器注册表
     * 每个状态对应一个 async handler(ctx) 函数
     * handler 执行完毕后应调用 ctx.transition(nextState) 切换到下一状态
     */
    this._handlers = {
      [ChatProgram.STATE.IDLE]:     (ctx) => this._handleIdle(ctx),
      [ChatProgram.STATE.WAITING]:  (ctx) => this._handleWaiting(ctx),
      [ChatProgram.STATE.THINKING]: (ctx) => this._handleThinking(ctx),
      [ChatProgram.STATE.GENERATING]: (ctx) => this._handleGenerating(ctx),
      [ChatProgram.STATE.COMPLETED]: (ctx) => this._handleCompleted(ctx),
      [ChatProgram.STATE.FAILED]:   (ctx) => this._handleFailed(ctx),
      [ChatProgram.STATE.STOPPED]:  (ctx) => this._handleStopped(ctx),
    };
  }

  // ==================== 状态定义 ====================

  static STATE = Object.freeze({
    IDLE: 'idle',
    WAITING: 'waiting',
    THINKING: 'thinking',
    GENERATING: 'generating',
    COMPLETED: 'completed',
    FAILED: 'failed',
    STOPPED: 'stopped',
  });

  // ==================== Context 工厂 ====================

  /**
   * 创建聊天上下文
   * ctx 是整个运行过程中的共享变量容器
   *
   * @param {Object} options
   * @param {string} [options.content] - 用户消息内容
   * @param {string} [options.sessionId] - 会话 ID
   * @param {string} [options.model] - 模型 ID
   * @param {string} [options.reasoningEffort] - 推理强度
   * @param {boolean} [options.isToolContinuation] - 是否为工具续发
   * @returns {Object} ctx
   */
  createContext({ content = null, sessionId = null, model = null, reasoningEffort = undefined, isToolContinuation = false } = {}) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const service = this.serviceCenter.getCurrentProviderService();
    const settings = this.serviceCenter.getSettingsManager().getSettings();

    return {
      // === 输入 ===
      content,
      sessionId,
      model,
      reasoningEffort,
      isToolContinuation,

      // === 运行时状态 ===
      state: ChatProgram.STATE.IDLE,
      session: null,
      assistantMsgId: null,
      currentRequest: null,
      service,
      settings,
      modelId: null,
      thinkingEffort: null,

      // === 输出 ===
      result: null,
      toolCalls: null,
      error: null,

      // === 状态转换方法 ===
      /**
       * 切换到目标状态，触发对应 handler
       * @param {string} newState
       */
      transition: async (newState) => {
        const oldState = ctx.state;
        ctx.state = newState;
        console.log(`[ChatProgram] State: ${oldState} → ${newState}`);

        this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, {
          state: newState,
          sessionId: ctx.session?.id || null,
          hasActive: newState !== ChatProgram.STATE.IDLE,
        });

        const handler = this._handlers[newState];
        if (handler) {
          await handler(ctx);
        }
      },
    };
  }

  // ==================== 主入口 ====================

  /**
   * 运行聊天程序
   * @param {Object} ctx - createContext() 返回的上下文
   */
  async run(ctx) {
    try {
      await ctx.transition(ChatProgram.STATE.WAITING);
    } catch (error) {
      ctx.error = error;
      await ctx.transition(ChatProgram.STATE.FAILED);
    } finally {
      try {
        await this.serviceCenter.getSessionManager().flushAllStreamWrites();
      } catch (e) { /* ignore */ }
    }
  }

  // ==================== 状态处理器 ====================

  /**
   * IDLE — 空闲状态，等待用户输入
   */
  async _handleIdle(ctx) {
    // 不做任何事，等待外部触发 transition(WAITING)
  }

  /**
   * WAITING — 准备请求并调用 Provider API
   */
  async _handleWaiting(ctx) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const service = ctx.service;
    const settings = ctx.settings;
    const defaultEffort = settings?.reasoningEffort || 'medium';

    // 验证输入
    if (!ctx.isToolContinuation) {
      if (!ctx.content || !ctx.content.trim()) {
        ctx.error = new Error('Message content is required');
        return ctx.transition(ChatProgram.STATE.FAILED);
      }
    }

    try {
      // 获取/创建会话
      ctx.session = ctx.sessionId
        ? sessionManager.getSession(ctx.sessionId)
        : sessionManager.getCurrentSession();

      if (!ctx.session) {
        if (ctx.isToolContinuation) {
          throw new Error('Session required for tool continuation');
        }
        ctx.session = sessionManager.createSession({
          title: '新对话',
          reasoningEffort: ctx.reasoningEffort || defaultEffort,
        });
      } else if (ctx.reasoningEffort && ctx.session.reasoningEffort !== ctx.reasoningEffort) {
        ctx.session.reasoningEffort = ctx.reasoningEffort;
      }

      ctx.modelId = ctx.model || service.config?.defaultModel;
      ctx.thinkingEffort = ctx.session.reasoningEffort || 'off';

      // 添加用户消息
      if (!ctx.isToolContinuation) {
        const userMsg = new window.Message({ role: 'user', content: ctx.content.trim() });
        await sessionManager.addMessage(userMsg, ctx.session.id);
      }

      // 准备请求
      const freshSession = sessionManager.getSession(ctx.session.id);
      const tools = this.serviceCenter.getToolDefinitionsForLLM();
      const messagesForRequest = this._truncateMessages(freshSession, settings, ctx.modelId);
      const { MessagesRequest } = window.MessageContent;

      const request = new MessagesRequest({
        model: ctx.modelId,
        messages: messagesForRequest,
        stream: true,
        thinking: new window.MessageContent.ThinkingConfig(ctx.thinkingEffort),
        tools: tools.length > 0 ? tools : null,
      });

      // 注入 Provider 缓存 key
      if (service && service.cacheOptions) {
        service.cacheOptions.sessionCacheKey = `webagentcli:session:${ctx.session.id}`;
      }

      // 创建 assistant 消息
      const assistantMsg = new window.Message({ role: 'assistant', content: '' });
      await sessionManager.addMessage(assistantMsg, ctx.session.id);
      ctx.assistantMsgId = assistantMsg.id;

      ctx.currentRequest = {
        sessionId: ctx.session.id,
        assistantMessageId: ctx.assistantMsgId,
        startedAt: Date.now(),
        lastActiveAt: Date.now(),
      };

      this.eventBus.emit(window.Events.CHAT.STREAM_START, {
        sessionId: ctx.session.id,
        messageId: ctx.assistantMsgId,
      });

      // 调用 Provider API（流式）
      const result = await service.chatStream(request, (chunk) => {
        if (ctx.currentRequest) ctx.currentRequest.lastActiveAt = Date.now();
        const text = chunk.content || '';
        const reasoning = chunk.reasoning_content || '';

        // 在流式回调中切换 THINKING / GENERATING 状态
        if (reasoning && ctx.state !== ChatProgram.STATE.THINKING) {
          ctx.state = ChatProgram.STATE.THINKING;
          this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, {
            state: ChatProgram.STATE.THINKING,
            sessionId: ctx.session.id,
            hasActive: true,
          });
        } else if (text && ctx.state !== ChatProgram.STATE.GENERATING) {
          ctx.state = ChatProgram.STATE.GENERATING;
          this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, {
            state: ChatProgram.STATE.GENERATING,
            sessionId: ctx.session.id,
            hasActive: true,
          });
        }

        sessionManager.streamChunkMessage(ctx.assistantMsgId, {
          content: text,
          reasoning_content: reasoning,
        }, ctx.session.id);

        this.eventBus.emit(window.Events.CHAT.STREAM_CHUNK_APPEND, {
          sessionId: ctx.session.id,
          messageId: ctx.assistantMsgId,
          content: text,
          reasoning_content: reasoning,
        });
      });

      if (!result) return; // 被取消

      // 保存结果
      ctx.result = result;
      ctx.toolCalls = result.toolCalls && result.toolCalls.length > 0 ? result.toolCalls : null;

      // 附加 toolCalls 到 assistant 消息
      if (ctx.toolCalls) {
        sessionManager.updateMessage(ctx.assistantMsgId, (msg) => {
          ctx.toolCalls.forEach(tc => msg.addToolCall(tc));
        }, ctx.session.id);
      }

      await ctx.transition(ChatProgram.STATE.COMPLETED);

    } catch (error) {
      ctx.error = error;
      await ctx.transition(ChatProgram.STATE.FAILED);
    }
  }

  /**
   * THINKING — 正在接收推理内容（由流式回调驱动，此处为空处理）
   */
  async _handleThinking(ctx) {
    // 状态由流式回调设置，handler 仅用于外部可扩展逻辑
    // 如 UI 需要在进入 THINKING 时做动画，可在此处理
  }

  /**
   * GENERATING — 正在接收文本内容（由流式回调驱动）
   */
  async _handleGenerating(ctx) {
    // 同 THINKING，由流式回调驱动
  }

  /**
   * COMPLETED — 响应完成，检查是否需要执行工具调用
   */
  async _handleCompleted(ctx) {
    const duration = ctx.currentRequest ? Date.now() - ctx.currentRequest.startedAt : 0;

    this.eventBus.emit(window.Events.CHAT.STREAM_COMPLETE, {
      sessionId: ctx.session.id,
      messageId: ctx.assistantMsgId,
      duration,
    });

    // 有工具调用 → 执行后回到 WAITING 续发
    if (ctx.toolCalls) {
      await this._executeToolCalls(ctx);
      return; // _executeToolCalls 内部会 transition(WAITING)
    }

    // 无工具调用 → 回到 IDLE
    ctx.currentRequest = null;
    await ctx.transition(ChatProgram.STATE.IDLE);
  }

  /**
   * FAILED — 处理错误
   */
  async _handleFailed(ctx) {
    const sessionManager = this.serviceCenter.getSessionManager();

    if (ctx.assistantMsgId && ctx.session) {
      sessionManager.updateMessage(ctx.assistantMsgId, (msg) => {
        msg.content = `❌ 发送失败: ${ctx.error?.message || String(ctx.error)}`;
      }, ctx.session.id);
    }

    this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
      error: ctx.error,
      message: ctx.error?.message || String(ctx.error),
      sessionId: ctx.session?.id,
      messageId: ctx.assistantMsgId,
    });

    ctx.currentRequest = null;

    // 延迟回到 IDLE
    setTimeout(() => {
      if (ctx.state === ChatProgram.STATE.FAILED) {
        ctx.state = ChatProgram.STATE.IDLE;
        this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, {
          state: ChatProgram.STATE.IDLE,
          sessionId: ctx.session?.id || null,
          hasActive: false,
        });
      }
    }, 50);
  }

  /**
   * STOPPED — 用户手动停止
   */
  async _handleStopped(ctx) {
    const chatService = ctx.service;
    if (chatService && typeof chatService.cancel === 'function') {
      chatService.cancel();
    }

    const stoppedRequest = ctx.currentRequest;
    ctx.currentRequest = null;

    this.eventBus.emit(window.Events.CHAT.STREAM_STOP, {
      sessionId: stoppedRequest?.sessionId,
      messageId: stoppedRequest?.assistantMessageId,
    });

    try {
      await this.serviceCenter.getSessionManager().flushAllStreamWrites();
    } catch (e) { /* ignore */ }

    // 延迟回到 IDLE
    setTimeout(() => {
      if (ctx.state === ChatProgram.STATE.STOPPED) {
        ctx.state = ChatProgram.STATE.IDLE;
        this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, {
          state: ChatProgram.STATE.IDLE,
          sessionId: ctx.session?.id || null,
          hasActive: false,
        });
      }
    }, 50);
  }

  // ==================== 工具调用 ====================

  /**
   * 执行工具调用，然后 transition(WAITING) 进行续发
   * @param {Object} ctx
   */
  async _executeToolCalls(ctx) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const toolResults = [];

    for (const tc of ctx.toolCalls) {
      const tool = this.serviceCenter.getTool(tc.toolName);

      this.eventBus.emit(window.Events.TOOL.EXECUTING, {
        toolName: tc.toolName,
        toolCallId: tc.id,
        sessionId: ctx.session.id,
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
          toolResult = await tool.invoke(tc, { sessionId: ctx.session.id, tabId });
        }
      } catch (invokeError) {
        toolResult = new window.ToolResult({
          toolCallId: tc.id,
          status: 'failed',
          error: invokeError.message || String(invokeError),
        });
      }

      toolResults.push(toolResult);
      this.eventBus.emit(window.Events.TOOL.COMPLETED, {
        toolName: tc.toolName,
        toolCallId: tc.id,
        status: toolResult.status,
        duration: toolResult.duration,
        sessionId: ctx.session.id,
      });

      const toolMsg = new window.Message({
        role: window.Role.TOOL,
        toolCallId: tc.id,
        content: toolResult.isSuccess()
          ? (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))
          : `⚠️ 执行失败: ${toolResult.error}`,
      });
      await sessionManager.addMessage(toolMsg, ctx.session.id);
    }

    this.eventBus.emit(window.Events.TOOL.ALL_COMPLETED, { toolResults, sessionId: ctx.session.id });

    // 工具续发：回到 WAITING 继续对话
    ctx.toolCalls = null;
    ctx.currentRequest = null;
    ctx.isToolContinuation = true;
    ctx.sessionId = ctx.session.id;
    await ctx.transition(ChatProgram.STATE.WAITING);
  }

  // ==================== 上下文截断 ====================

  /**
   * 截断消息列表以适应 token 预算
   * @private
   */
  _truncateMessages(session, settings, modelId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const totalMessages = session.messages.length;
    const autoTruncate = settings?.autoContextTruncation !== false;
    const hasCache = this._providerHasCache(
      this.serviceCenter.getCurrentProviderService(), modelId
    );

    let messages;

    if (hasCache) {
      const windowSize = settings?.contextWindowSize || 20;
      messages = sessionManager.getContextWindow(session, {
        autoContextTruncation: autoTruncate,
        contextWindowSize: windowSize,
      });
    } else {
      const modelObj = this.serviceCenter.getModelManager().getModel(modelId);
      const contextLength = modelObj?.contextLength || 8192;
      const maxTokens = settings?.maxTokens || 2000;
      const ratio = settings?.contextWindowRatio || 0.8;

      messages = sessionManager.getMessagesByTokenBudget(session, {
        contextLength,
        maxTokens,
        contextWindowRatio: ratio,
      });
    }

    if (messages.length < totalMessages) {
      console.log(
        `[ChatProgram] Truncated: ${totalMessages} → ${messages.length} messages`
      );
    }

    return messages;
  }

  /**
   * 判断 Provider 是否有 KV 缓存能力
   * @private
   */
  _providerHasCache(service, modelId) {
    if (!service || !service.cacheOptions || !service.cacheOptions.enabled) return false;

    switch (service.name) {
      case 'openai':
        return /^(o\d|gpt-4\.1|gpt-4o)/i.test(modelId || '');
      case 'openrouter':
        return !modelId?.includes('free');
      case 'lm-studio':
        return true;
      default:
        return false;
    }
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ChatProgram = ChatProgram;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatProgram;
}