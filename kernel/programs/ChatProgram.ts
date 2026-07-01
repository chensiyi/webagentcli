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

    this.chatChannel.on(CMD.SEND, (data: unknown) => this.sendMessage(data as Record<string, unknown>));
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

    if (!isToolContinuation) {
      if (!content || !content.trim()) throw new Error('Message content is required');
      if (this._assistantMsgId) throw new Error('A message is already being generated');
    }

    try {
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

      const messagesForRequest = this._truncateMessagesForRequest(freshSession, settings, modelId);

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
        sm.updateMessage(assistantMsgId, (msg) => {
          result.toolCalls.forEach(tc => msg.addToolCall(tc));
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
        sm.updateMessage(assistantMsgId, (msg) => { msg.content = `❌ 发送失败: ${error.message}`; }, session.id);
      }
      this._emit(KernelEvents.CHAT.STREAM_ERROR, { error, message: error.message, sessionId: session?.id, messageId: assistantMsgId });
    } finally {
      this._currentRequest = null;
      this._assistantMsgId = null;
      try { await sm.flushAllStreamWrites(); } catch (e) { /* ignore */ }
      setTimeout(() => {
        if (!this._currentRequest && this._state !== STATE.IDLE) {
          this._setState(STATE.IDLE);
        }
      }, 50); // 50ms 延迟确保 flushAllStreamWrites 完成后再重置状态
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
    try { this.kernel.getSessionManager().flushAllStreamWrites(); } catch (e) { /* ignore */ }
    setTimeout(() => this._setState(STATE.IDLE), 50);
  }

  deleteMessage(messageId) {
    const sm = this.kernel.getSessionManager();
    const session = sm.getCurrentSession();
    const result = session ? sm.deleteMessage(messageId, session.id) : false;
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

  _providerHasCache(service, modelId) {
    if (!service || !service.cacheOptions || !service.cacheOptions.enabled) return false;
    switch (service.name) {
      case 'openai': return /^(o\d|gpt-4\.1|gpt-4o)/i.test(modelId || ''); // 启发式匹配已知支持缓存 Prompt Caching 的模型
      case 'openrouter': return !modelId?.includes('free');
      case 'lm-studio': return true;
      default: return false;
    }
  }

  _truncateMessagesForRequest(session, settings, modelId) {
    const sm = this.kernel.getSessionManager();
    const hasCache = this._providerHasCache(this.kernel.getProviderFactory()?.getCurrentProvider(), modelId);

    const base = hasCache
      ? sm.getContextWindow(session, {
          autoContextTruncation: settings?.autoContextTruncation !== false,
          contextWindowSize: settings?.contextWindowSize || 20,
        })
      : session.messages;

    return (base || []).map(m => {
      const src = (m && typeof m.toJSON === 'function') ? m.toJSON() : m;
      return MessageStructure.toAPIFormat(src);
    });
  }
}