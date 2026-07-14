import { BaseSessionManager } from './ISessionManager.js';
import { Session } from '../models/Session.js';
import { Message, Role } from '../models/Message.js';
import { collectMediaIdsFromMessages } from '../models/MessageContent.js';
import { Log } from './Log.js';
import { KernelEvents, KernelChannels } from '../Events.js';
import {
  StorageKeys,
  sessionMessagesKey,
  MSG_PERSIST_BATCH_MS,
  STORAGE_ERROR_COOLDOWN_MS,
} from '../Keys.js';

export class SessionManager extends BaseSessionManager {
  sessions: Session[];

  /** 每个会话的批量落盘定时器（sessionId → timer）。 */
  private _msgFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 存储错误上报冷却截止时间（避免流式期间配额超限刷屏）。 */
  private _storageErrorCooldownUntil = 0;
  /** 未发送即空的临时会话 id 集合（仅在首条消息落盘时转为正式会话）。 */
  private _transientIds = new Set<string>();
  /** 内核引用（init 阶段注入）：用于取出 mediaDeleter 回调做媒体二进制回收。 */
  private _kernel: any = null;

  constructor(obj: any = null) {
    super(obj);
    this.sessions = [];
  }

  getSession(id: string): Session | null {
    return this.sessions.find(s => s.id === id) || null;
  }

  getAllSessions(): Session[] {
    // 排除临时（未发送即空）会话，避免空对话泄漏到历史列表
    return [...this.sessions].filter((s) => s && s.id && !this._transientIds.has(s.id));
  }

  async createSession(opts: Record<string, unknown> = {}): Promise<Session> {
    const { persist = true, ...rest } = opts as Record<string, unknown> & { persist?: boolean };
    // 丢弃全部「未发送即空」的临时会话，避免内存里堆积空对话（transient 永不可见、永安全）
    this.discardAllTransient();
    const s = new Session({
      title: (rest.title as string) || '新对话',
      reasoningEffort: (rest.reasoningEffort as string) || 'medium',
      model: rest.model || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    this.sessions.push(s);
    Log.info('SESSION', `create id=${s.id} title="${(s.title || '').slice(0, 24)}"`);
    if (persist) {
      await this._persistMessages(s.id);
      await this._persistIndex();
    } else {
      this._transientIds.add(s.id);
    }
    return s;
  }

  /** 丢弃全部「未发送即空」的临时会话（切换/新建前清理，避免内存堆积空对话）。
   *  transient 永不可见、永未落盘，故直接全清，无需引用「当前会话」。 */
  discardAllTransient(): void {
    if (this._transientIds.size === 0) return;
    for (const id of this._transientIds) {
      const i = this.sessions.findIndex((s) => s.id === id);
      if (i !== -1) this.sessions.splice(i, 1);
    }
    this._transientIds.clear();
  }

  async deleteSession(id: string): Promise<void> {
    const i = this.sessions.findIndex(s => s.id === id);
    if (i !== -1) {
      const session = this.sessions[i];
      // 删除会话前先收集其中所有媒体引用，会话删掉后连带清理二进制，避免 IndexedDB/远端孤儿 blob
      const mediaIds = collectMediaIdsFromMessages(session.messages);
      this.sessions.splice(i, 1);
      Log.info('SESSION', `delete id=${id} (media=${mediaIds.length})`);
      this._transientIds.delete(id);
      await this._persistIndex();
      if (this.storage) {
        try { await this.storage.remove(sessionMessagesKey(id)); } catch (e) { /* ignore */ }
      }
      // 广播会话删除事件，让 session RPC facade 取消该会话进行中的轮次
      this.ipc?.getOrCreateChannel(KernelChannels.SESSION)?.emit(KernelEvents.SESSION.SESSION_DELETED, { sessionId: id });
      // 连带回收媒体二进制（best-effort，失败不影响删除主流程）
      await this._cleanupMedia(mediaIds);
    }
  }

  async updateSession(id: string, updater: ((s: Session) => void) | Record<string, unknown>): Promise<void> {
    const s = this.getSession(id);
    if (s) {
      Log.info('SESSION', `update id=${id}`);
      if (typeof updater === 'function') updater(s);
      else Object.assign(s, updater);
      s.updatedAt = Date.now();
      // 临时（未发送）会话仅更新内存、不落盘；发送首条消息时由 addMessage 落盘
      if (!this._transientIds.has(id)) {
        await this._persistIndex();
      }
      // 广播会话更新事件（携带 index 视图，供 Shell 侧差量 patch，零 RPC 刷新列表）
      this.ipc?.getOrCreateChannel(KernelChannels.SESSION)?.emit(KernelEvents.SESSION.SESSION_UPDATED, { sessionId: id, session: s.toIndexJSON() });
    }
  }

  async clearMessages(sessionId: string): Promise<void> {
    const s = this.getSession(sessionId);
    if (s) {
      // 清空前收集媒体引用，清空后连带回收，避免孤儿 blob
      const mediaIds = collectMediaIdsFromMessages(s.messages);
      Log.info('SESSION', `clearMessages id=${sessionId} (media=${mediaIds.length})`);
      s.messages = [];
      s.title = '新对话'; // 清空消息时同步重置标题
      s.updatedAt = Date.now();
      await this._persistMessages(sessionId);
      await this._persistIndex();
      await this._cleanupMedia(mediaIds);
    }
  }

  /** SessionManager 持有的消息增删改（原 Session 模型的集合方法迁移至此） */
  async addMessage(message: Message, sessionId: string): Promise<void> {
    const s = this.getSession(sessionId);
    if (s) {
      Log.info('SESSION', `addMessage id=${sessionId} role=${message.role} msg=${message.id}`);
      // 首条消息落盘时，把「未发送即空」的临时会话正式化为持久会话
      const wasTransient = this._transientIds.has(sessionId);
      if (wasTransient) this._transientIds.delete(sessionId);
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
      // 删除单条消息前收集其媒体引用，避免孤立 blob
      const mediaIds = collectMediaIdsFromMessages([s.messages[i]]);
      s.messages.splice(i, 1);
      Log.info('SESSION', `deleteMessage id=${sessionId} msg=${messageId}`);
      await this._persistMessages(sessionId);
      await this._persistIndex();
      await this._cleanupMedia(mediaIds);
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

  /** 从首条用户消息派生会话自动标题（纯函数，无副作用，不落盘）。 */
  deriveAutoTitle(content: string): string {
    const text = (content || '').trim().replace(/\n/g, ' ');
    return text.length > 24 ? text.slice(0, 24) + '…' : text;
  }

  /** 在当前会话末尾追加一条空白 assistant 占位消息（已落盘），返回该消息。 */
  async createAssistantPlaceholder(sessionId: string): Promise<Message> {
    const msg = new Message({ role: Role.ASSISTANT, content: '' });
    await this.addMessage(msg, sessionId);
    return msg;
  }

  /** 追加一条 tool 角色结果消息（成功/失败回写，已落盘），返回该消息。 */
  async appendToolResult(sessionId: string, toolCallId: string, content: string | any[], isError = false): Promise<Message> {
    const msg = new Message({
      role: Role.TOOL,
      toolCallId,
      content: isError ? `⚠️ 执行失败: ${content}` : content,
    });
    await this.addMessage(msg, sessionId);
    return msg;
  }

  /** 由 Kernel._initService 在 boot 阶段自动调用（init(kernel) 契约） */
  async init(_kernel?: unknown): Promise<void> {
    this._kernel = _kernel ?? null;
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
    } catch (e) {
      Log.warn('SESSION', `init error: ${(e as any)?.message}`);
    }
  }

  /** 清理：取消所有待执行的批量落盘定时器，避免 shutdown 后定时器空触发写入已置空的状态 */
  destroy(): void {
    for (const timer of this._msgFlushTimers.values()) {
      clearTimeout(timer);
    }
    this._msgFlushTimers.clear();
  }

  // ── 持久化（拆分存储：索引 + 按 sessionId 独立消息键）──

  /** 写入单个会话的消息体（按 sessionId 局部更新，不碰其他会话）。
   *  @param silent 高频率批量写（流式增量）置 true，存储层降为 debug 不刷屏。 */
  async _persistMessages(sessionId: string, silent = false): Promise<void> {
    const s = this.getSession(sessionId);
    if (!s || !this.storage) return;
    try {
      await this.storage.set(
        sessionMessagesKey(sessionId),
        s.messages.filter(m => m != null).map(m => m.toJSON()),
        { silent }
      );
    } catch (e) {
      this._emitStorageError(e);
    }
  }

  /** 写入会话索引（轻量数组，不含消息体；临时会话不写入）。
   *  @param silent 高频率批量写（流式增量）置 true，存储层降为 debug 不刷屏。 */
  async _persistIndex(silent = false): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.set(
        StorageKeys.SESSIONS,
        this.sessions.filter(s => s && s.id && !this._transientIds.has(s.id)).map(s => s.toIndexJSON()),
        { silent }
      );
    } catch (e) {
      this._emitStorageError(e);
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

  /** 落盘某会话的消息体 + 索引（合并写入，减少 IO）。流式增量批量写默认 silent，
   *  不刷 STORAGE info 日志；一次性收尾（flushSession）同样静默，事件已由上层 SESSION 日志覆盖。 */
  async _flushMessages(sessionId: string, silent = true): Promise<void> {
    await this._persistMessages(sessionId, silent);
    await this._persistIndex(silent);
  }

  /** 强制立即落盘（流式结束时调用，确保收尾内容不依赖定时器窗口）。 */
  async flushSession(sessionId: string): Promise<void> {
    const timer = this._msgFlushTimers.get(sessionId);
    if (timer) { clearTimeout(timer); this._msgFlushTimers.delete(sessionId); }
    await this._flushMessages(sessionId, true);
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

  /**
   * 媒体二进制回收（best-effort）：删除会话/清空消息/删除单条消息时，
   * 把其中引用的 mediaId 经内核 mediaDeleter 回调交给 background 的 mediaStore 删除。
   * 失败仅告警、不影响删除主流程——保证用户删会话永远成功。
   */
  private async _cleanupMedia(ids: string[]): Promise<void> {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (unique.length === 0) return;
    try {
      const deleter = this._kernel?.getMediaDeleter?.();
      if (typeof deleter === 'function') await deleter(unique);
    } catch (e) {
      Log.warn('SESSION', `media cleanup failed (best-effort, ignored): ${(e as any)?.message || e}`);
    }
  }
}
