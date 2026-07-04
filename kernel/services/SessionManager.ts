import { BaseSessionManager } from './ISessionManager.js';
import { Session } from '../models/Session.js';
import { Log } from './Log.js';
import { KernelEvents } from '../Events.js';

export class SessionManager extends BaseSessionManager {
  currentSessionId: string | null;
  sessions: Session[];

  constructor(obj = null) {
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
      try { await this.storage.set('currentSessionId', id); } catch (e) { /* ignore */ }
    }
  }

  getSession(id: string): Session | null {
    return this.sessions.find(s => s.id === id) || null;
  }

  getAllSessions(): Session[] { return [...this.sessions]; }

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
    await this._persistSessions();
    await this._persistCurrentSessionId();
    return s;
  }

  async deleteSession(id: string): Promise<void> {
    const i = this.sessions.findIndex(s => s.id === id);
    if (i !== -1) {
      this.sessions.splice(i, 1);
      if (this.currentSessionId === id) this.currentSessionId = null;
      await this._persistSessions();
      await this._persistCurrentSessionId();
      // 广播会话删除事件，让 shell 层（ChatEventHandler）决定是否取消进行中的请求
      this.ipc?.getOrCreateChannel('chat')?.emit(KernelEvents.CHAT.SESSION_DELETED, { sessionId: id });
    }
  }

  async updateSession(id: string, updater: ((s: Session) => void) | Record<string, unknown>): Promise<void> {
    const s = this.getSession(id);
    if (s) {
      if (typeof updater === 'function') updater(s);
      else Object.assign(s, updater);
      s.updatedAt = Date.now();
      await this._persistSessions();
      // 广播会话更新事件，让 UI 刷新标题等
      this.ipc?.getOrCreateChannel('chat')?.emit(KernelEvents.CHAT.SESSION_UPDATED, { sessionId: id });
    }
  }

  async clearMessages(sessionId: string): Promise<void> {
    const s = this.getSession(sessionId);
    if (s) {
      s.messages = [];
      s.title = '新对话'; // 清空消息时同步重置标题
      s.updatedAt = Date.now();
      await this._persistSessions();
    }
  }

  /** SessionManager 持有的消息增删改（原 Session 模型的集合方法迁移至此） */
  async addMessage(message: Record<string, unknown>, sessionId: string): Promise<void> {
    const s = this.getSession(sessionId);
    if (s) {
      s.messages.push(message);
      s.updatedAt = Date.now();
      await this._persistSessions();
    }
  }

  async deleteMessage(messageId: string, sessionId: string): Promise<boolean> {
    const s = this.getSession(sessionId);
    if (!s) return false;
    const i = s.messages.findIndex((m: Record<string, unknown>) => m.id === messageId);
    if (i !== -1) {
      s.messages.splice(i, 1);
      await this._persistSessions();
      return true;
    }
    return false;
  }

  async updateMessage(messageId: string, updater: ((msg: Record<string, unknown>) => Record<string, unknown>) | Record<string, unknown>, sessionId: string): Promise<boolean> {
    const s = this.getSession(sessionId);
    if (!s) return false;
    const idx = s.messages.findIndex((m: Record<string, unknown>) => m.id === messageId);
    if (idx !== -1) {
      const msg = s.messages[idx] as Record<string, unknown>;
      if (typeof updater === 'function') {
        const updated = updater(msg);
        // 防御：updater 未返回值时保留原消息，避免 undefined 写入数组
        s.messages[idx] = updated ?? msg;
      } else {
        s.messages[idx] = { ...msg, ...updater };
      }
      await this._persistSessions();
      return true;
    }
    return false;
  }

  streamChunkMessage(messageId: string, chunk: Record<string, unknown> | string, sessionId: string): Promise<boolean> {
    return this.updateMessage(messageId, (msg: Record<string, unknown>) => {
      if (chunk && typeof chunk === 'object') {
        if ((chunk as Record<string, unknown>).content != null)
          msg.content = (msg.content || '') + (chunk as Record<string, unknown>).content;
        if ((chunk as Record<string, unknown>).reasoning_content != null)
          msg.reasoning_content = (msg.reasoning_content || '') + (chunk as Record<string, unknown>).reasoning_content;
      } else {
        msg.content = (msg.content || '') + String(chunk);
      }
      return msg;
    }, sessionId);
  }

  async initialize(): Promise<void> {
    if (!this.storage) {
      Log.warn('SESSION', 'No storage, skipping init');
      return;
    }
    try {
      let sessions: Session[] = [];
      const stored = await this.storage.get('sessions');
      if (Array.isArray(stored)) {
        sessions = stored.filter((s: Record<string, unknown>) => s && s.id).map((d: Record<string, unknown>) => new Session(d));
        Log.info('SESSION', `Loaded ${sessions.length} sessions from storage`);
      } else {
        const raw = await this.storage.getAll();
        for (const [key, value] of raw) {
          if (key.startsWith('session_') && value && (value as Record<string, unknown>).id) {
            sessions.push(new Session(value as Record<string, unknown>));
          }
        }
        Log.info('SESSION', `Loaded ${sessions.length} sessions (fallback scan)`);
      }
      sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      this.sessions = sessions;
      if (this.storage) {
        try {
          const meta = await this.storage.get('currentSessionId');
          if (meta && sessions.some(s => s.id === meta)) {
            this.currentSessionId = meta as string;
            Log.info('SESSION', `Restored current session: ${meta}`);
          } else if (sessions.length > 0) {
            this.currentSessionId = sessions[0].id;
            Log.debug('SESSION', `First session set as current: ${this.currentSessionId}`);
          } else {
            Log.info('SESSION', 'No sessions found in storage');
          }
        } catch (e) {
          Log.warn('SESSION', `currentSessionId restore error: ${(e as Error)?.message}`);
        }
      }
    } catch (e) {
      Log.warn('SESSION', `initialize error: ${(e as Error)?.message}`);
    }
  }

  async _persistSessions(): Promise<void> {
    if (!this.storage) return;
    try {
      // 过滤掉 undefined 或 null 的会话，防止 toJSON 调用失败
      await this.storage.set('sessions', this.sessions.filter(s => s && s.id).map(s => s.toJSON()));
    } catch (e) {
      Log.warn('SESSION', `persistSessions error: ${(e as Error)?.message}`);
    }
  }

  async _persistCurrentSessionId(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.set('currentSessionId', this.currentSessionId);
    } catch (e) {
      Log.warn('SESSION', `persistCurrentSessionId error: ${(e as Error)?.message}`);
    }
  }

}
