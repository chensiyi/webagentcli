/**
 * ChatController - 聊天控制器
 *
 * 职责：
 * 1. 管理最小运行时状态（当前请求、流式状态）
 * 2. 协调 SessionManager 和 ProviderService
 * 3. 处理 Tool Call 循环：检测 → 执行 → 回填 → 继续对话
 * 4. 通过 EventBus 与 UI 层通信
 *
 * 设计原则：
 * - 单一实例，由 ServiceCenter 管理
 * - 从 SessionManager 获取最新会话和配置
 * - tool call 循环完全在 Controller 内，不侵入 Service/View
 */
class ChatController {
  /**
   * @param {ServiceCenter} serviceCenter - 服务中心
   */
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();

    // 运行时状态（不持久化）
    this.currentRequest = null;
    this.state = window.Events.CHAT.STATE.IDLE;

    console.log('[ChatController] Initialized');
  }

  /**
   * 更新并广播状态
   * @private
   */
  _setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    this._notifyActivityState();
  }

  /**
   * 发送消息
   * @param {Object} params
   * @param {string} [params.content] - 用户消息（无内容时表示 tool 循环续发）
   * @param {string} [params.sessionId] - 会话 ID（续发时必填）
   * @param {Object} [params.chatService] - Provider 服务实例
   * @param {Object} [params.model] - 模型对象
   * @param {string} [params.reasoningEffort] - 思考强度
   * @param {boolean} [params.isToolContinuation=false] - 是否是工具循环续发
   */
  async sendMessage({ content, sessionId = null, chatService = null, model = null, reasoningEffort = undefined, isToolContinuation = false } = {}) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const service = chatService || this.serviceCenter.getCurrentProviderService();
    const settings = this.serviceCenter.getSettingsManager().getSettings();
    const defaultEffort = settings?.reasoningEffort || 'medium';
    let assistantMsgId = null;
    let session = null;

    // 工具续发不需要 content，复用已有 session
    if (!isToolContinuation) {
      if (!content || !content.trim()) {
        throw new Error('Message content is required for normal send');
      }
      if (this.currentRequest) {
        throw new Error('A message is already being generated');
      }
    }

    // 工具续发也可能有 active request 残留（finally 的 timeout），检查并等待
    if (!isToolContinuation && this.currentRequest) {
      throw new Error('A message is already being generated');
    }

    try {
      if (!isToolContinuation) {
        this._setState(window.Events.CHAT.STATE.WAITING);
      }

      // 获取或创建当前会话
      session = sessionId ? sessionManager.getSession(sessionId) : sessionManager.getCurrentSession();
      if (!session) {
        if (isToolContinuation) {
          throw new Error('Session required for tool continuation');
        }
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

      // 1. 用户消息（首次发送时）
      if (!isToolContinuation) {
        const userMsg = new window.Message({ role: 'user', content: content.trim() });
        await sessionManager.addMessage(userMsg, session.id);
      }

      // 获取最新的消息列表到 MessagesRequest
      const freshSession = sessionManager.getSession(session.id);
      const tools = this.serviceCenter.getToolDefinitionsForLLM();

      // 2. 构造请求（带上 tools 定义）
      const request = new MessagesRequest({
        model: modelId,
        messages: freshSession.messages,
        stream: true,
        thinking: thinkingEffort !== 'off' ? new window.MessageContent.ThinkingConfig(thinkingEffort) : null,
        tools: tools.length > 0 ? tools : null
      });

      // 3. 持久化助手消息
      const assistantMsg = new window.Message({ role: 'assistant', content: '' });
      await sessionManager.addMessage(assistantMsg, session.id);
      assistantMsgId = assistantMsg.id;

      // 4. 设置运行时状态
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

      // 5. 执行流式请求
      const isThinkingEnabled = thinkingEffort !== 'off';

      await service.chatStream(
        request,
        (chunk) => {
          if (this.currentRequest) this.currentRequest.lastActiveAt = Date.now();

          const content = chunk.content || '';
          const reasoning = isThinkingEnabled ? (chunk.reasoning_content || '') : '';

          if (reasoning && this.state !== window.Events.CHAT.STATE.THINKING) {
            this._setState(window.Events.CHAT.STATE.THINKING);
          } else if (content && this.state !== window.Events.CHAT.STATE.GENERATING) {
            this._setState(window.Events.CHAT.STATE.GENERATING);
          }

          sessionManager.streamChunkMessage(assistantMsgId, {
            content,
            reasoning_content: reasoning
          }, session.id);

          this.eventBus.emit(window.Events.CHAT.STREAM_CHUNK_APPEND, {
            sessionId: session.id,
            messageId: assistantMsgId,
            content,
            reasoning_content: reasoning
          });
        },
        (result) => {
          // 流结束：检查是否有 tool_calls
          const openAIToolCalls = result?.toolCalls;
          if (openAIToolCalls && openAIToolCalls.length > 0) {
            // 把 OpenAI tool_calls 转为内部 ToolCall 并附加到 assistant 消息
            const toolCalls = window.MessageContent.MessageStructure.parseToolCallsFromOpenAI(openAIToolCalls);
            if (toolCalls.length > 0) {
              sessionManager.updateMessage(assistantMsgId, (msg) => {
                toolCalls.forEach(tc => msg.addToolCall(tc));
              }, session.id);

              // 当前流结束，但后面还有 tool 执行
              this._setState(window.Events.CHAT.STATE.COMPLETED);
              this.eventBus.emit(window.Events.CHAT.STREAM_COMPLETE, {
                sessionId: session.id,
                messageId: assistantMsgId,
                duration: this.currentRequest ? Date.now() - this.currentRequest.startedAt : null
              });

              // 执行工具并触发下一轮
              this._executeToolCalls(toolCalls, session.id);
              return;
            }
          }

          // 正常结束（无 tool_calls）
          this._setState(window.Events.CHAT.STATE.COMPLETED);
          const duration = this.currentRequest ? Date.now() - this.currentRequest.startedAt : null;
          this.eventBus.emit(window.Events.CHAT.STREAM_COMPLETE, {
            sessionId: session.id,
            messageId: assistantMsgId,
            duration
          });
        }
      );
    } catch (error) {
      this._setState(window.Events.CHAT.STATE.FAILED);

      if (assistantMsgId && session) {
        sessionManager.updateMessage(assistantMsgId, (msg) => {
          msg.content = `❌ 发送失败: ${error.message}`;
        }, session.id);
      }

      this.eventBus.emit(window.Events.CHAT.STREAM_ERROR, {
        error,
        message: error.message,
        sessionId: session?.id,
        messageId: assistantMsgId
      });
    } finally {
      this.currentRequest = null;
      setTimeout(() => {
        if (!this.currentRequest) {
          // 只在非 tool 循环中重置 IDLE，tool 循环由 _executeToolCalls 管理
          if (this.state !== window.Events.CHAT.STATE.IDLE) {
            this._setState(window.Events.CHAT.STATE.IDLE);
          }
        }
      }, 50);
    }
  }

  /**
   * 执行工具调用，创建 tool 消息，触发下一轮对话
   * @private
   * @param {ToolCall[]} toolCalls
   * @param {string} sessionId
   */
  async _executeToolCalls(toolCalls, sessionId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const toolResults = [];

    for (const tc of toolCalls) {
      const tool = this.serviceCenter.getTool(tc.toolName);

      this.eventBus.emit(window.Events.TOOL.EXECUTING, {
        toolName: tc.toolName,
        toolCallId: tc.id,
        sessionId
      });

      let toolResult;
      if (!tool) {
        toolResult = new window.ToolResult({
          toolCallId: tc.id,
          status: 'failed',
          error: `Unknown tool: ${tc.toolName}`
        });
      } else {
        // 获取当前 active tab 作为 context
        let tabId = null;
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tabs[0]?.id;
        } catch (e) { /* 没有活跃标签页时忽略 */ }

        toolResult = await tool.invoke(tc, { sessionId, tabId });
      }

      toolResults.push(toolResult);

      this.eventBus.emit(window.Events.TOOL.COMPLETED, {
        toolName: tc.toolName,
        toolCallId: tc.id,
        status: toolResult.status,
        duration: toolResult.duration,
        sessionId
      });

      // 创建 tool role 消息追加到会话
      const toolMsg = new window.Message({
        role: window.Role.TOOL,
        toolCallId: tc.id,
        content: toolResult.isSuccess()
          ? (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))
          : `⚠️ 执行失败: ${toolResult.error}`
      });
      await sessionManager.addMessage(toolMsg, sessionId);
    }

    this.eventBus.emit(window.Events.TOOL.ALL_COMPLETED, {
      toolResults,
      sessionId
    });

    // 触发下一轮对话：复用当前会话，无用户内容
    await this.sendMessage({
      sessionId,
      isToolContinuation: true
    });
  }

  /**
   * 停止生成
   */
  stopGeneration() {
    if (!this.currentRequest) {
      console.warn('[ChatController] No active stream to stop');
      return;
    }

    const chatService = this.serviceCenter.getCurrentProviderService();
    if (chatService && typeof chatService.cancel === 'function') {
      chatService.cancel();
    }

    const stoppedRequest = this.currentRequest;
    this.currentRequest = null;
    this._setState(window.Events.CHAT.STATE.STOPPED);

    this.eventBus.emit(window.Events.CHAT.STREAM_STOP, {
      sessionId: stoppedRequest?.sessionId,
      messageId: stoppedRequest?.assistantMessageId
    });

    setTimeout(() => this._setState(window.Events.CHAT.STATE.IDLE), 50);
  }

  /**
   * 清空当前会话消息
   */
  clearMessages() {
    const sessionManager = this.serviceCenter.getSessionManager();
    const session = sessionManager.getCurrentSession();
    if (!session) return false;
    sessionManager.clearMessages(session.id);

    this.currentRequest = null;
    this._setState(window.Events.CHAT.STATE.IDLE);
    return true;
  }

  /**
   * 删除指定消息
   * @param {string} messageId
   */
  deleteMessage(messageId) {
    const sessionManager = this.serviceCenter.getSessionManager();
    const session = sessionManager.getCurrentSession();
    const result = session ? sessionManager.deleteMessage(messageId, session.id) : false;

    if (result) {
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, {
        messageId,
        sessionId: session.id
      });
    }

    return result;
  }

  /**
   * 是否有活跃活动
   */
  hasActiveActivities() {
    return this.state !== window.Events.CHAT.STATE.IDLE;
  }

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return {
      state: this.state,
      sessionId: this.currentRequest?.sessionId || null,
      hasActive: this.hasActiveActivities()
    };
  }

  /**
   * 通知活动状态变更
   * @private
   */
  _notifyActivityState() {
    this.eventBus.emit(window.Events.CHAT.ACTIVITY_STATE_CHANGED, this.getQueueStatus());
  }
}

if (typeof window !== 'undefined') {
  window.ChatController = ChatController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatController;
}