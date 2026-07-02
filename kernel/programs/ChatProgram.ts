import { KernelEvents } from '../Events.js';
import { Log } from '../services/Log.js';
import { MessagesRequest, ThinkingConfig, MessageStructure } from '../models/MessageContent.js';
import { Message, Role } from '../models/Message.js';
import { ToolResult } from '../models/ToolResult.js';
import { IPC } from '../IPC.js';
import { Kernel } from '../Kernel.js';

export const CMD = Object.freeze({
  SEND: 'chat:cmd:send',
  STOP: 'chat:cmd:stop',
  DELETE_MESSAGE: 'chat:cmd:deleteMessage',
});

const STATE = Object.freeze({
  IDLE: 'idle',
  WAITING: 'waiting',
  THINKING: 'thinking',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
});

export class ChatProgram {
  name: string;
  kernel: Kernel;
  ipc: IPC | null;
  chatChannel: IPC | null;
  _assistantMsgId: string | null;
  _state: string;
  _currentRequest: Record<string, unknown> | null;

  constructor(options: { kernel: Kernel; name?: string } = { kernel: null as unknown as Kernel, name: 'ChatProgram' }) {
    this.name = options.name || 'ChatProgram';
    this.kernel = options.kernel;
    this.ipc = this.kernel.getIPC();
    this.chatChannel = this.ipc?.getOrCreateChannel('chat');
    this._state = 'idle';
    this._currentRequest = null;

    this.chatChannel.on(CMD.SEND, (data: unknown) => {
      this.sendMessage(data as Record<string, unknown>).catch(err => {
        Log.error(this.name, 'Unhandled error in sendMessage:', err);
        this._setState(STATE.FAILED);
        this._emit(KernelEvents.CHAT.STREAM_ERROR, { error: err, message: err.message || String(err) });
        this._currentRequest = null;
        this._assistantMsgId = null;
      });
    });
    this.chatChannel.on(CMD.STOP, () => this.cancel());
    this.chatChannel.on(CMD.DELETE_MESSAGE, (data: unknown) => this.deleteMessage((data as { messageId: string }).messageId));
    // 会话切换时重置状态（暂无额外处理逻辑）
    this.chatChannel.on(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, () => { this._assistantMsgId = null; this._currentRequest = null; });
  }

  async sendMessage({ content = '', sessionId = null, model = null, reasoningEffort = undefined, isToolContinuation = false } = {}) {
    if (!isToolContinuation && !content?.trim()) return;
    const service = this.kernel.getProviderFactory()?.getCurrentProvider();
    if (!service) {
      const err = new Error('Provider service not initialized yet. Please wait for settings to load or configure a provider in Settings.');
      this._emit(KernelEvents.CHAT.STREAM_ERROR, { error: err, message: err.message });
      return;
    }
    const sm = this.kernel.getSessionManager();
    const settings = this.kernel.getSettingsManager().getSettings();
    const defaultEffort = settings?.reasoningEffort || 'medium';
    let assistantMsgId = null;
    let session = null;

    try {
      if (!isToolContinuation) {
        if (!content || !content.trim()) throw new Error('Message content is required');
        if (this._assistantMsgId) throw new Error('A message is already being generated');
      }
      if (!isToolContinuation) this._setState(STATE.WAITING);

      session = sessionId ? sm.getSession(sessionId) : sm.getCurrentSession();
      if (!session) {
        if (isToolContinuation) throw new Error('Session required for tool continuation');
        session = await sm.createSession({ title: '新对话', reasoningEffort: reasoningEffort || defaultEffort });
        this._emit(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, { sessionId: session.id });
      } else if (reasoningEffort && session.reasoningEffort !== reasoningEffort) {
        session.reasoningEffort = reasoningEffort;
      }

      const modelId = model ? model.id : (settings?.model || '');
      const thinkingEffort = session.reasoningEffort || 'off';
      // MessagesRequest imported from kernel.models

      if (!isToolContinuation) {
        const userMsg = new Message({ role: 'user', content: content.trim() });
        await sm.addMessage(userMsg, session.id);
        this._emit(KernelEvents.CHAT.MESSAGE_ADDED, { messageId: userMsg.id, sessionId: session.id });
      }

      const freshSession = sm.getSession(session.id);
      const tools = this.kernel.toolRegistry?.getDefinitionsForLLM();

      const messagesForRequest = await this._buildContext(freshSession, settings, tools);

      const request = new MessagesRequest({
        model: modelId,
        messages: messagesForRequest,
        stream: true,
        thinking: new ThinkingConfig(thinkingEffort),
        tools: tools.length > 0 ? tools : null
      });

      if (service && service.cacheOptions) {
        const cacheKey = `webagentcli:session:${session.id}`;
        service.cacheOptions.sessionCacheKey = cacheKey;
        Log.info('ChatProgram', `Provider cache key injected: ${cacheKey} (provider=${service.name}, cacheEnabled=${service.cacheOptions.enabled})`);
      } else {
        Log.warn('ChatProgram', 'No service.cacheOptions available — provider caching disabled');
      }

      const assistantMsg = new Message({ role: 'assistant', content: '' });
      await sm.addMessage(assistantMsg, session.id);
      assistantMsgId = assistantMsg.id;
      this._assistantMsgId = assistantMsgId;
      this._emit(KernelEvents.CHAT.MESSAGE_ADDED, { messageId: assistantMsgId, sessionId: session.id });

      this._currentRequest = {
        sessionId: session.id,
        assistantMessageId: assistantMsgId,
        startedAt: Date.now(),
        lastActiveAt: Date.now()
      };

      this._emit(KernelEvents.CHAT.STREAM_START, { sessionId: session.id, messageId: assistantMsgId });

      const result = await service.chatStream(request, (chunk) => {
        if (this._currentRequest) this._currentRequest.lastActiveAt = Date.now();
        const content = chunk.content || '';
        const reasoning = chunk.reasoning_content || '';

        if (reasoning && this._state !== STATE.THINKING) {
          this._setState(STATE.THINKING);
        } else if (content && this._state !== STATE.GENERATING) {
          this._setState(STATE.GENERATING);
        }

        sm.streamChunkMessage(assistantMsgId, { content, reasoning_content: reasoning }, session.id);
        this._emit(KernelEvents.CHAT.STREAM_CHUNK_APPEND, { sessionId: session.id, messageId: assistantMsgId, content, reasoning_content: reasoning });
      });

      if (!result) {
        this._assistantMsgId = null;
        return;
      }

      if (result.toolCalls && result.toolCalls.length > 0) {
        await sm.updateMessage(assistantMsgId, (msg) => {
          result.toolCalls.forEach(tc => msg.addToolCall(tc));
          return msg;
        }, session.id);
      }

      this._setState(STATE.COMPLETED);
      const duration = Date.now() - this._currentRequest.startedAt;
      this._emit(KernelEvents.CHAT.STREAM_COMPLETE, { sessionId: session.id, messageId: assistantMsgId, duration });

      if (result.toolCalls && result.toolCalls.length > 0) {
        await this._executeToolCalls(result.toolCalls, session.id);
      }
    } catch (error) {
      this._setState(STATE.FAILED);
      if (assistantMsgId && session) {
        sm.updateMessage(assistantMsgId, (msg) => { msg.content = `❌ 发送失败: ${error.message}`; return msg; }, session.id);
      }
      this._emit(KernelEvents.CHAT.STREAM_ERROR, { error, message: error.message, sessionId: session?.id, messageId: assistantMsgId });
    } finally {
      this._currentRequest = null;
      this._assistantMsgId = null;
      setTimeout(() => {
        if (!this._currentRequest && this._state !== STATE.IDLE) {
          this._setState(STATE.IDLE);
        }
      }, 50);
    }
  }

  async _executeToolCalls(toolCalls, sessionId) {
    const sm = this.kernel.getSessionManager();
    const toolResults = [];

    for (const tc of toolCalls) {
      const tool = this.kernel.toolRegistry?.getAll().find(t => t.definition && t.definition.name === tc.toolName);

      this._emit(KernelEvents.TOOL.EXECUTING, { toolName: tc.toolName, toolCallId: tc.id, sessionId });

      let toolResult;
      try {
        if (!tool) {
          toolResult = new ToolResult({ toolCallId: tc.id, status: 'failed', error: `Unknown tool: ${tc.toolName}` });
        } else {
          let tabId = null;
          // FIXME: chrome.tabs 依赖 — 已知浏览器环境耦合（参见 MEMORY.md）
          try { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); tabId = tabs[0]?.id; } catch (e) { /* ignore */ }
          toolResult = await tool.invoke(tc, { sessionId, tabId, kernel: this.kernel });
        }
      } catch (invokeError) {
        toolResult = new ToolResult({ toolCallId: tc.id, status: 'failed', error: invokeError.message || String(invokeError) });
      }

      toolResults.push(toolResult);
      this._emit(KernelEvents.TOOL.COMPLETED, { toolName: tc.toolName, toolCallId: tc.id, status: toolResult.status, duration: toolResult.duration, sessionId });

      const toolMsg = new Message({
        role: Role.TOOL,
        toolCallId: tc.id,
        content: toolResult.isSuccess()
          ? (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))
          : `⚠️ 执行失败: ${toolResult.error}`
      });
      await sm.addMessage(toolMsg, sessionId);
      this._emit(KernelEvents.CHAT.MESSAGE_ADDED, { messageId: toolMsg.id, sessionId });
    }

    this._emit(KernelEvents.TOOL.ALL_COMPLETED, { toolResults, sessionId });
    await this.sendMessage({ sessionId, isToolContinuation: true });
  }

  cancel() {
    this.kernel.getProviderFactory()?.getCurrentProvider()?.cancel?.();
    const stoppedRequest = this._currentRequest;
    this._currentRequest = null;
    this._assistantMsgId = null;
    this._setState(STATE.STOPPED);
    this._emit(KernelEvents.CHAT.STREAM_STOP, { sessionId: stoppedRequest?.sessionId, messageId: stoppedRequest?.assistantMessageId });
    setTimeout(() => this._setState(STATE.IDLE), 50);
  }

  async deleteMessage(messageId) {
    const sm = this.kernel.getSessionManager();
    const session = sm.getCurrentSession();
    if (!session) return false;
    const result = await sm.deleteMessage(messageId, session.id);
    if (result) {
      this._emit(KernelEvents.CHAT.MESSAGE_DELETED, { messageId, sessionId: session.id });
    }
    return result;
  }

  _setState(newState) {
    if (this._state === newState) return;
    this._state = newState;
    this._notifyActivityState();
  }

  _notifyActivityState() {
    this._emit(KernelEvents.CHAT.ACTIVITY_STATE_CHANGED, this.getQueueStatus());
  }

  getQueueStatus() {
    return { state: this._state, sessionId: this._currentRequest?.sessionId || null, hasActive: this._state !== STATE.IDLE };
  }

  _emit(event, data) {
    if (!this.chatChannel) return;
    this.chatChannel.emit(event, data);
  }

  /**
   * _buildContext — 上下文管理标准过程
   *
   * 组装发给 LLM 的完整消息序列：
   * 1. System prompt（身份 + 可用工具 + 当前页面环境）
   * 2. 会话消息（按 contextWindowSize 截断，保护 tool_call/tool_result 配对）
   * 3. 统一转 API 格式
   */
  async _buildContext(session, settings, tools) {
    // --- 1. System prompt ---
    const systemParts = [];

    systemParts.push('你是一个运行在 Chrome 扩展 Side Panel 中的 Web Agent。你可以通过工具与浏览器页面交互，完成用户指定的任务。');

    // 当前页面环境
    let pageContext = '';
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab) {
        pageContext = `当前页面: ${tab.title || '(无标题)'} — ${tab.url || '(无URL)'}`;
      }
    } catch (e) { /* 非浏览器环境，跳过 */ }
    if (pageContext) systemParts.push(pageContext);

    // 可用工具清单（简述，完整 schema 走 API tools 参数）
    if (tools && tools.length > 0) {
      const toolList = tools
        .map(t => t?.function?.name ? `- ${t.function.name}: ${t.function.description || ''}` : '')
        .filter(Boolean)
        .join('\n');
      if (toolList) {
        systemParts.push(`可用工具:\n${toolList}\n\n工具的完整参数定义通过 API tools 参数传递，请按 schema 调用。`);
      }
    }

    systemParts.push('原则: 优先使用工具完成页面操作。如果工具调用失败，分析错误并重试或换方案。不需要用户确认就可以连续调用工具。');

    const systemMsg = { role: 'system', content: systemParts.join('\n\n') };

    // --- 2. 截断会话消息 ---
    let sessionMessages = (session.messages || []).filter(m => m != null);
    const maxSize = settings?.contextWindowSize || 20;
    if (settings?.autoContextTruncation !== false && sessionMessages.length > maxSize) {
      sessionMessages = this._truncateMessages(sessionMessages, maxSize);
    }

    // --- 3. 组装 + 转 API 格式 ---
    const allMessages = [systemMsg, ...sessionMessages];
    return allMessages.map(m => {
      const src = (m && typeof m.toJSON === 'function') ? m.toJSON() : m;
      return MessageStructure.toAPIFormat(src);
    });
  }

  /**
   * 截断消息列表，保护 tool_call / tool_result 配对完整性。
   * 策略: 从末尾保留 maxSize 条，如果截断点恰好是 tool result 而没有对应的 tool call，
   * 向前回退直到配对完整。
   */
  _truncateMessages(messages, maxSize) {
    if (messages.length <= maxSize) return messages;

    let cut = messages.length - maxSize;
    // 如果截断点后方第一条是 tool 消息（tool result），向前多留直到找到对应的 assistant tool_call
    while (cut < messages.length) {
      const msg = messages[cut];
      const role = msg?.role || (msg && typeof msg.toJSON === 'function' ? msg.toJSON().role : '');
      if (role === 'tool') {
        cut--; // 向前回退
      } else if (role === 'assistant' && (msg?.toolCalls?.length || (msg && typeof msg.toJSON === 'function' && msg.toJSON().toolCalls?.length))) {
        break; // 这条 assistant 带 tool_calls，从这开始保留
      } else {
        break; // 普通消息，截断点 OK
      }
    }
    if (cut < 0) cut = 0;
    return messages.slice(cut);
  }
}