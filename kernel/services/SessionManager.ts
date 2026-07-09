import { BaseSessionManager } from './ISessionManager.js';
import { Session } from '../models/Session.js';
import { Message } from '../models/Message.js';
import { Log } from './Log.js';
import { KernelEvents, KernelChannels } from '../Events.js';
import {
  StorageKeys,
  sessionMessagesKey,
  MSG_PERSIST_BATCH_MS,
  STORAGE_ERROR_COOLDOWN_MS,
} from '../Keys.js';

export class SessionManager extends BaseSessionManager {
  currentSessionId: string | null;
  sessions: Session[];

  /** 每个会话的批量落盘定时器（sessionId → timer）。 */
  private _msgFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 存储错误上报冷却截止时间（避免流式期间配额超限刷屏）。 */
  private _storageErrorCooldownUntil = 0;

  constructor(obj: any = null) {
    super(obj);
    this.currentSessionId = null;
    this.sessions = [];
  }

  getCurrentSession(): Session | null {
    return this.sessions.find(s => s.id === this.currentSessionId) || null;
  }

  async setCurrentSession(id: string): Promise<void> {
    this.currentSessionId = id;
    if (this.storage) {
      try { await this.storage.set(StorageKeys.CURRENT_SESSION_ID, id); } catch (e) { /* ignore */ }
    }
  }

  getSession(id: string): Session | null {
    return this.sessions.find(s => s.id === id) || null;
  }

  getAllSessions(): Session[] { return [...this.sessions].filter((s) => s && s.id); }

  async createSession(opts: Record<string, unknown> = {}): Promise<Session> {
    const s = new Session({
      title: (opts.title as string) || '新对话',
      reasoningEffort: (opts.reasoningEffort as string) || 'medium',
      model: opts.model || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    this.sessions.push(s);
    this.currentSessionId = s.id;
    await this._persistMessages(s.id);
    await this._persistIndex();
    await this._persistCurrentSessionId();
    return s;
  }

  async deleteSession(id: string): Promise<void> {
    const i = this.sessions.findIndex(s => s.id === id);
    if (i !== -1) {
      this.sessions.splice(i, 1);
      if (this.currentSessionId === id) this.currentSessionId = null;
      await this._persistIndex();
      if (this.storage) {
        try { await this.storage.remove(sessionMessagesKey(id)); } catch (e) { /* ignore */ }
      }
      // 广播会话删除事件，让 shell 层（ChatEventHandler）决定是否取消进行中的请求
      this.ipc?.getOrCreateChannel(KernelChannels.CHAT)?.emit(KernelEvents.CHAT.SESSION_DELETED, { sessionId: id });
    }
  }

  async updateSession(id: string, updater: ((s: Session) => void) | Record<string, unknown>): Promise<void> {
    const s = this.getSession(id);
    if (s) {
      if (typeof updater === 'function') updater(s);
      else Object.assign(s, updater);
      s.updatedAt = Date.now();
      // 仅索引变更（标题等），消息体未动 → 只更新轻量索引
      await this._persistIndex();
      // 广播会话更新事件，让 UI 刷新标题等
      this.ipc?.getOrCreateChannel(KernelChannels.CHAT)?.emit(KernelEvents.CHAT.SESSION_UPDATED, { sessionId: id });
    }
  }

  async clearMessages(sessionId: string): Promise<void> {
    const s = this.getSession(sessionId);
    if (s) {
      s.messages = [];
      s.title = '新对话'; // 清空消息时同步重置标题
      s.updatedAt = Date.now();
      await this._persistMessages(sessionId);
      await this._persistIndex();
    }
  }

  /** SessionManager 持有的消息增删改（原 Session 模型的集合方法迁移至此） */
  async addMessage(message: Message, sessionId: string): Promise<void> {
    const s = this.getSession(sessionId);
    if (s) {
      s.messages.push(message);
      s.updatedAt = Date.now();
      // 新增消息是低频操作（每条一次，非 per-token）：直接落盘
      await this._persistMessages(sessionId);
      await this._persistIndex();
    }
  }

  async deleteMessage(messageId: string, sessionId: string): Promise<boolean> {
    const s = this.getSession(sessionId);
    if (!s) return false;
    const i = s.messages.findIndex((m: Message) => m.id === messageId);
    if (i !== -1) {
      s.messages.splice(i, 1);
      await this._persistMessages(sessionId);
      await this._persistIndex();
      return true;
    }
    return false;
  }

  async updateMessage(
    messageId: string,
    updater: ((msg: Message) => Message) | Message,
    sessionId: string,
    opts: { immediate?: boolean } = {}
  ): Promise<boolean> {
    const s = this.getSession(sessionId);
    if (!s) return false;
    const idx = s.messages.findIndex((m: Message) => m.id === messageId);
    if (idx !== -1) {
      const msg = s.messages[idx];
      if (typeof updater === 'function') {
        const updated = updater(msg);
        // 防御：updater 未返回值时保留原消息，避免 undefined 写入数组
        s.messages[idx] = updated ?? msg;
      } else {
        s.messages[idx] = Object.assign(msg, updater);
      }
      if (opts.immediate) {
        // 权威终态（工具调用 / 错误回写）：立即落盘，不等待批处理窗口
        await this.flushSession(sessionId);
      } else {
        // 流式增量：合并到同一会话的批处理窗口，避免每个 token 触发写盘
        this._scheduleMsgPersist(sessionId);
      }
      return true;
    }
    return false;
  }

  streamChunkMessage(messageId: string, chunk: Record<string, unknown> | string, sessionId: string): Promise<boolean> {
    return this.updateMessage(messageId, (msg: Message) => {
      if (chunk && typeof chunk === 'object') {
        if ((chunk as Record<string, unknown>).content != null)
          msg.content = String(msg.content || '') + String((chunk as Record<string, unknown>).content || '');
        if ((chunk as Record<string, unknown>).reasoning_content != null)
          msg.reasoning_content = String(msg.reasoning_content || '') + String((chunk as Record<string, unknown>).reasoning_content || '');
      } else {
        msg.content = String(msg.content || '') + String(chunk);
      }
      return msg;
    }, sessionId); // 默认非 immediate → 批量落盘
  }

  async initialize(): Promise<void> {
    if (!this.storage) {
      Log.warn('SESSION', 'No storage, skipping init');
      return;
    }
    try {
      let index: any[] = [];
      const stored = await this.storage.get(StorageKeys.SESSIONS);
      if (Array.isArray(stored)) {
        // 迁移：旧格式把 messages 内联在 sessions 里；新格式 sessions 仅存索引，
        // 消息独立存于 sessionMessagesKey(id)。检测到内联 messages 即一次性迁移。
        const needsMigration = stored.some((s: any) => s && Array.isArray(s.messages));
        if (needsMigration) {
          for (const raw of stored) {
            if (!raw || !raw.id) continue;
            const session = new Session(raw);
            await this.storage.set(sessionMessagesKey(raw.id), session.messages.map(m => m.toJSON()));
          }
          await this.storage.set(StorageKeys.SESSIONS, stored.map((s: any) => new Session(s).toIndexJSON()));
          Log.info('SESSION', `Migrated ${stored.length} sessions to split storage`);
        }
        index = stored;

        const sessions = await Promise.all(
          index.filter((s: any) => s && s.id).map(async (entry: any) => {
            const raw: any = { ...entry };
            try {
              const msgs = await this.storage!.get(sessionMessagesKey(entry.id));
              raw.messages = Array.isArray(msgs) ? msgs : [];
            } catch { raw.messages = []; }
            return new Session(raw);
          })
        );
        sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        this.sessions = sessions;
        Log.info('SESSION', `Loaded ${sessions.length} sessions`);
      } else {
        Log.info('SESSION', 'No sessions found in storage');
      }

      try {
        const meta = await this.storage.get(StorageKeys.CURRENT_SESSION_ID);
        if (meta && this.sessions.some(s => s.id === meta)) {
          this.currentSessionId = meta as string;
          Log.info('SESSION', `Restored current session: ${meta}`);
        } else if (this.sessions.length > 0) {
          this.currentSessionId = this.sessions[0].id;
          Log.debug('SESSION', `First session set as current: ${this.currentSessionId}`);
        } else {
          Log.info('SESSION', 'No sessions found in storage');
        }
      } catch (e) {
        Log.warn('SESSION', `currentSessionId restore error: ${(e as any)?.message}`);
      }
    } catch (e) {
      Log.warn('SESSION', `initialize error: ${(e as any)?.message}`);
    }
  }

  // ── 持久化（拆分存储：索引 + 按 sessionId 独立消息键）──

  /** 写入单个会话的消息体（按 sessionId 局部更新，不碰其他会话）。 */
  async _persistMessages(sessionId: string): Promise<void> {
    const s = this.getSession(sessionId);
    if (!s || !this.storage) return;
    try {
      await this.storage.set(
        sessionMessagesKey(sessionId),
        s.messages.filter(m => m != null).map(m => m.toJSON())
      );
    } catch (e) {
      this._emitStorageError(e);
    }
  }

  /** 写入会话索引（轻量数组，不含消息体）。 */
  async _persistIndex(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.set(
        StorageKeys.SESSIONS,
        this.sessions.filter(s => s && s.id).map(s => s.toIndexJSON())
      );
    } catch (e) {
      this._emitStorageError(e);
    }
  }

  async _persistCurrentSessionId(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.set(StorageKeys.CURRENT_SESSION_ID, this.currentSessionId);
    } catch (e) {
      Log.warn('SESSION', `persistCurrentSessionId error: ${(e as any)?.message}`);
    }
  }

  // ── 流式批量落盘 ──

  private _scheduleMsgPersist(sessionId: string): void {
    if (this._msgFlushTimers.has(sessionId)) return; // 已排程，合并进同一批次
    const timer = setTimeout(() => {
      this._msgFlushTimers.delete(sessionId);
      this._flushMessages(sessionId);
    }, MSG_PERSIST_BATCH_MS);
    this._msgFlushTimers.set(sessionId, timer);
  }

  /** 落盘某会话的消息体 + 索引（合并写入，减少 IO）。 */
  async _flushMessages(sessionId: string): Promise<void> {
    await this._persistMessages(sessionId);
    await this._persistIndex();
  }

  /** 强制立即落盘（流式结束时调用，确保收尾内容不依赖定时器窗口）。 */
  async flushSession(sessionId: string): Promise<void> {
    const timer = this._msgFlushTimers.get(sessionId);
    if (timer) { clearTimeout(timer); this._msgFlushTimers.delete(sessionId); }
    await this._flushMessages(sessionId);
  }

  /** 存储写入失败（如配额超限）时上报：带冷却，避免刷屏式弹 toast。 */
  private _emitStorageError(e: unknown): void {
    Log.warn('SESSION', `persist error: ${(e as any)?.message || e}`);
    const now = Date.now();
    if (now < this._storageErrorCooldownUntil) return;
    this._storageErrorCooldownUntil = now + STORAGE_ERROR_COOLDOWN_MS;
    try {
      this.ipc?.getOrCreateChannel(KernelChannels.STORAGE)?.emit(KernelEvents.STORAGE.ERROR, {
        message: (e as any)?.message || String(e),
      });
    } catch { /* ignore */ }
  }
}
