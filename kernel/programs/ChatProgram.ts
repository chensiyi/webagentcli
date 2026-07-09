/**
 * ChatProgram — 聊天编排器
 *
 * 职责：命令路由 + 发送管线编排 + 取消/删除操作
 *
 * 模块拆分：
 * - ContextBuilder    → System Prompt 构建 + 消息截断 + API 格式转换
 * - ToolExecutor      → 工具调用循环（执行/结果收集/消息写入/事件发射）
 *
 * 公共 API：sendMessage / cancel / deleteMessage
 */

import { KernelEvents, KernelChannels } from '../Events.js';
import { Log } from '../services/Log.js';
import { MessagesRequest, ThinkingConfig } from '../models/MessageContent.js';
import { Message } from '../models/Message.js';
import { Session } from '../models/Session.js';
import { IPC } from '../IPC.js';
import { Kernel } from '../Kernel.js';
import { ContextBuilder, ToolExecutor } from './chat/index.js';

// ─── 命令常量（保持向后兼容，ChatPage.svelte 依赖此导出） ───

export const CMD = Object.freeze({
  SEND: 'chat:cmd:send',
  STOP: 'chat:cmd:stop',
  DELETE_MESSAGE: 'chat:cmd:deleteMessage',
});

/** 当前进行中的请求上下文 */
export interface CurrentRequest {
  sessionId: string;
  assistantMessageId: string;
  startedAt: number;
  lastActiveAt: number;
}

// ─── ChatProgram ──────────────────────────────────────────────

export class ChatProgram {
  name: string;
  kernel: Kernel;

  // 通信
  ipc: IPC | null;
  chatChannel: IPC | null;

  // 子模块
  private _context: ContextBuilder;
  private _toolExecutor: ToolExecutor;

  // 编排状态
  _active: boolean;
  _assistantMsgId: string | null;
  _currentRequest: CurrentRequest | null;

  constructor(options: { kernel: Kernel; name?: string }) {
    this.name = options.name || 'ChatProgram';
    this.kernel = options.kernel;
    this.ipc = this.kernel.getIPC();
    this.chatChannel = this.ipc?.getOrCreateChannel(KernelChannels.CHAT);

    this._context = new ContextBuilder();
    this._toolExecutor = new ToolExecutor(this.kernel, (event, data) => this.chatChannel?.emit(event, data));

    this._active = false;
    this._assistantMsgId = null;
    this._currentRequest = null;

    // 注册命令处理器
    this.chatChannel?.on(CMD.SEND, (data: unknown) => {
      this.sendMessage(data as Record<string, unknown>).catch(err => {
        Log.error(this.name, 'Unhandled error in sendMessage:', err);
        this._active = false;
        this.chatChannel?.emit(KernelEvents.CHAT.STREAM_ERROR, { error: err, message: err.message || String(err) });
        this._currentRequest = null;
        this._assistantMsgId = null;
      });
    });
    this.chatChannel?.on(CMD.STOP, () => this.cancel());
    this.chatChannel?.on(CMD.DELETE_MESSAGE, (data: unknown) =>
      this.deleteMessage((data as { messageId: string }).messageId)
    );
    this.chatChannel?.on(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, () => {
      if (this._currentRequest) {
        Log.info(this.name, 'Session switched while active, auto-cancelling');
        this.cancel();
      }
      this._assistantMsgId = null;
      this._currentRequest = null;
    });

    // 如果删除的会话是当前进行中的，自动取消
    this.chatChannel?.on(KernelEvents.CHAT.SESSION_DELETED, (data: unknown) => {
      const { sessionId } = (data || {}) as Record<string, unknown>;
      if (sessionId && this._currentRequest?.sessionId === sessionId) {
        Log.info(this.name, `Session ${sessionId} deleted while active, auto-cancelling`);
        this.cancel();
      }
    });
  }

  // ─── 主发送管线 ─────────────────────────────────────────────

  async sendMessage(options: Record<string, unknown> = {}): Promise<void> {
    const {
      content = '',
      sessionId = null,
      model = null,
      reasoningEffort = 'off',
      isToolContinuation = false,
    } = options;

    if (!isToolContinuation && !(content as string)?.trim()) return;

    const service = this.kernel.getProviderFactory()?.getCurrentProvider();
    if (!service) {
      const err = new Error('Provider service not initialized yet. Please wait for settings to load or configure a provider in Settings.');
      this.chatChannel?.emit(KernelEvents.CHAT.STREAM_ERROR, { error: err, message: err.message });
      return;
    }

    const sm = this.kernel.getSessionManager();
    const settings = this.kernel.getSettingsManager().getSettings();
    const defaultEffort = settings?.reasoningEffort || 'medium';

    let assistantMsgId: string | null = null;
    let session: Session | null = null;

    try {
      // ── 前置校验 ──
      if (!isToolContinuation) {
        if (!content || !(content as string).trim()) throw new Error('Message content is required');
        if (this._assistantMsgId) throw new Error('A message is already being generated');
        this._active = true;
      }

      // ── 会话管理 ──
      session = sessionId ? sm.getSession(sessionId as string) : sm.getCurrentSession();
      if (!session) {
        if (isToolContinuation) throw new Error('Session required for tool continuation');
        session = await sm.createSession({
          title: '新对话',
          reasoningEffort: reasoningEffort || defaultEffort,
        });
        this.chatChannel?.emit(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, { sessionId: session.id });
      } else if (reasoningEffort && session.reasoningEffort !== (reasoningEffort as string)) {
        session.reasoningEffort = reasoningEffort as string;
      }

      const sid = session.id;
      const modelId = model ? (model as any).id : (settings?.model || '');
      const thinkingEffort = session.reasoningEffort || 'off';

      // ── 用户消息 ──
      if (!isToolContinuation) {
        const userMsg = new Message({ role: 'user', content: (content as string).trim() });
        await sm.addMessage(userMsg, sid);
        this.chatChannel?.emit(KernelEvents.CHAT.MESSAGE_ADDED, { messageId: userMsg.id, sessionId: sid });

        // 会话中仅此一条消息 → 首次发送，自动生成标题
        if (session.messages.length === 1) {
          const titleText = (content as string).trim().replace(/\n/g, ' ');
          const autoTitle = titleText.length > 24 ? titleText.slice(0, 24) + '…' : titleText;
          await sm.updateSession(sid, { title: autoTitle });
        }
      }

      // ── 上下文构建（委托 ContextBuilder） ──
      const freshSession = sm.getSession(sid);
      const tools = this.kernel.toolsManager?.getDefinitionsForLLM();
      const messagesForRequest = await this._context.buildMessages(freshSession, settings, tools);

      // ── API 请求 ──
      const request = new MessagesRequest({
        model: modelId,
        messages: messagesForRequest,
        stream: true,
        thinking: new ThinkingConfig(thinkingEffort),
        tools: Array.isArray(tools) && tools.length > 0 ? tools : null,
      });

      // Provider 缓存注入
      if (service.cacheOptions) {
        const cacheKey = `webagentcli:session:${sid}`;
        service.cacheOptions.sessionCacheKey = cacheKey;
        Log.info(this.name, `Provider cache key injected: ${cacheKey} (provider=${service.name}, cacheEnabled=${service.cacheOptions.enabled})`);
      }

      // ── Assistant 消息占位 ──
      const assistantMsg = new Message({ role: 'assistant', content: '' });
      await sm.addMessage(assistantMsg, sid);
      assistantMsgId = assistantMsg.id;
      this._assistantMsgId = assistantMsgId;
      this.chatChannel?.emit(KernelEvents.CHAT.MESSAGE_ADDED, { messageId: assistantMsgId, sessionId: sid });

      this._currentRequest = {
        sessionId: sid,
        assistantMessageId: assistantMsgId,
        startedAt: Date.now(),
        lastActiveAt: Date.now(),
      } satisfies CurrentRequest;

      this.chatChannel?.emit(KernelEvents.CHAT.STREAM_START, { sessionId: sid, messageId: assistantMsgId });

      // ── 流式响应 ──
      const result = await service.chatStream(request, (chunk: Record<string, unknown>) => {
        if (this._currentRequest) this._currentRequest.lastActiveAt = Date.now();

        const c = chunk.content as string || '';
        const r = chunk.reasoning_content as string || '';

        sm.streamChunkMessage(assistantMsgId, { content: c, reasoning_content: r }, sid);
        this.chatChannel?.emit(KernelEvents.CHAT.STREAM_CHUNK_APPEND, {
          sessionId: sid, messageId: assistantMsgId, content: c, reasoning_content: r,
        });
      });

      if (!result) {
        this._assistantMsgId = null;
        return;
      }

      // ── 工具调用（委托 ToolExecutor 做执行循环） ──
      if (result.toolCalls && result.toolCalls.length > 0) {
        await sm.updateMessage(assistantMsgId, (msg: any) => {
          result.toolCalls.forEach((tc: any) => msg.addToolCall(tc));
          return msg;
        }, sid);

        const duration = Date.now() - this._currentRequest!.startedAt;
        this.chatChannel?.emit(KernelEvents.CHAT.STREAM_COMPLETE, { sessionId: sid, messageId: assistantMsgId, duration });

        await this._toolExecutor.execute(result.toolCalls, sid);
        // 工具执行完成后，继续下一轮（ReAct 循环）
        await this.sendMessage({ sessionId: sid, isToolContinuation: true });
        return;
      }

      const duration = Date.now() - this._currentRequest!.startedAt;
      this.chatChannel?.emit(KernelEvents.CHAT.STREAM_COMPLETE, { sessionId: sid, messageId: assistantMsgId, duration });
    } catch (error: any) {
      this._active = false;
      if (assistantMsgId && session) {
        sm.updateMessage(assistantMsgId, (msg: any) => {
          msg.content = `❌ 发送失败: ${error.message}`;
          return msg;
        }, session.id);
      }
      this.chatChannel?.emit(KernelEvents.CHAT.STREAM_ERROR, {
        error, message: error.message,
        sessionId: session?.id, messageId: assistantMsgId,
      });
    } finally {
      this._currentRequest = null;
      this._assistantMsgId = null;
      this._active = false;
    }
  }

  // ─── 取消 ──────────────────────────────────────────────────

  cancel(): void {
    this.kernel.getProviderFactory()?.getCurrentProvider()?.cancel?.();
    const stoppedRequest = this._currentRequest;
    this._currentRequest = null;
    this._assistantMsgId = null;
    this._active = false;
    this.chatChannel?.emit(KernelEvents.CHAT.STREAM_STOP, {
      sessionId: stoppedRequest?.sessionId,
      messageId: stoppedRequest?.assistantMessageId,
    });
  }

  // ─── 删除消息 ──────────────────────────────────────────────

  async deleteMessage(messageId: string): Promise<boolean> {
    const sm = this.kernel.getSessionManager();
    const session = sm.getCurrentSession();
    if (!session) return false;
    const result = await sm.deleteMessage(messageId, session.id);
    if (result) {
      this.chatChannel?.emit(KernelEvents.CHAT.MESSAGE_DELETED, { messageId, sessionId: session.id });
    }
    return result;
  }

  // ─── 内部 ──────────────────────────────────────────────────

}