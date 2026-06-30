import { ISessionManager } from './ISessionManager.js';
import { KernelLog } from '../KernelLog.js';

/** 用于类型约束的轻量消息视图 */
interface MessageSummary {
  id: string;
  toJSON?: () => Record<string, unknown>;
  [key: string]: unknown;
}

/** SessionManager 内部存储的会话数据（可序列化，非 Session 类实例） */
interface SessionData {
  id: string;
  title: string;
  messages: MessageSummary[];
  reasoningEffort: string;
  model: unknown;
  createdAt: number;
  updatedAt: number;
}

export class SessionManager extends ISessionManager {
  log: KernelLog | null;
  currentSessionId: string | null;
  sessions: SessionData[];

  constructor(obj = null) {
    super(obj);
    this.log = obj?.log || null;
    this.currentSessionId = null;
    this.sessions = [];
  }
  getCurrentSession() { return this.sessions.find(s => s.id === this.currentSessionId) || null; }
  async setCurrentSession(id) {
    this.currentSessionId = id;
    if (this.storage) {
      try { await this.storage.set('currentSessionId', id); } catch (e) { /* ignore */ }
    }
  }
  getSession(id) { return this.sessions.find(s => s.id === id) || null; }
  getAllSessions() { return [...this.sessions]; }
  async createSession(opts) {
    const s = { id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, title: opts.title || '新对话', messages: [], reasoningEffort: opts.reasoningEffort || 'medium', model: opts.model || null, createdAt: Date.now(), updatedAt: Date.now() };
    this.sessions.push(s);
    this.currentSessionId = s.id;
    await this._persistSessions();
    await this._persistCurrentSessionId();
    return s;
  }
  async deleteSession(id) {
    const i = this.sessions.findIndex(s => s.id === id);
    if (i !== -1) {
      this.sessions.splice(i, 1);
      if (this.currentSessionId === id) this.currentSessionId = null;
      await this._persistSessions();
      await this._persistCurrentSessionId();
    }
  }
  async updateSession(id, updater) {
    const s = this.getSession(id);
    if (s) {
      if (typeof updater === 'function') updater(s); else Object.assign(s, updater);
      s.updatedAt = Date.now();
      await this._persistSessions();
    }
  }
  async clearMessages(sessionId) {
    const s = this.getSession(sessionId);
    if (s) {
      s.messages = [];
      s.updatedAt = Date.now();
      await this._persistSessions();
    }
  }
  async addMessage(message, sessionId) {
    const s = this.getSession(sessionId);
    if (s) {
      s.messages.push(message);
      s.updatedAt = Date.now();
      await this._persistSessions();
    }
  }
  async initialize() {
    if (!this.storage) {
      this.log?.warn('SESSION', 'No storage, skipping init');
      return;
    }
    try {
      let sessions = [];
      const stored = await this.storage.get('sessions');
      if (Array.isArray(stored)) {
        sessions = stored.filter(s => s && s.id);
        this.log?.info('SESSION', `Loaded ${sessions.length} sessions from storage`);
      } else {
        const raw = await this.storage.getAll();
        for (const [key, value] of raw) {
          if (key.startsWith('session_') && value && (value as Record<string, unknown>).id) {
            sessions.push(value);
          }
        }
        this.log?.info('SESSION', `Loaded ${sessions.length} sessions (fallback scan)`);
      }
      sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      this.sessions = sessions;
      if (this.storage) {
        try {
          const meta = await this.storage.get('currentSessionId');
          if (meta && sessions.some(s => s.id === meta)) {
            this.currentSessionId = meta as string;
            this.log?.info('SESSION', `Restored current session: ${meta}`);
          } else if (sessions.length > 0) {
            this.currentSessionId = sessions[0].id;
            this.log?.debug('SESSION', `First session set as current: ${this.currentSessionId}`);
          } else {
            this.log?.info('SESSION', 'No sessions found in storage');
          }
        } catch (e) {
          this.log?.warn('SESSION', `currentSessionId restore error: ${e?.message}`);
        }
      }
    } catch (e) {
      this.log?.warn('SESSION', `initialize error: ${e?.message}`);
    }
  }

  async _persistSessions() {
    if (!this.storage) return;
    try {
      await this.storage.set('sessions', this.sessions);
    } catch (e) {
      this.log?.warn('SESSION', `persistSessions error: ${e?.message}`);
    }
  }

  async _persistCurrentSessionId() {
    if (!this.storage) return;
    try {
      await this.storage.set('currentSessionId', this.currentSessionId);
    } catch (e) {
      this.log?.warn('SESSION', `persistCurrentSessionId error: ${e?.message}`);
    }
  }
  async deleteMessage(messageId, sessionId) {
    const s = this.getSession(sessionId);
    if (!s) return false;
    const i = s.messages.findIndex(m => m.id === messageId);
    if (i !== -1) {
      s.messages.splice(i, 1);
      await this._persistSessions();
      return true;
    }
    return false;
  }
  async updateMessage(messageId, updater, sessionId) {
    const s = this.getSession(sessionId);
    if (!s) return false;
    const idx = s.messages.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      const msg = s.messages[idx];
      if (typeof updater === 'function') {
        updater(msg);
        if (typeof msg.toJSON === 'function') {
          s.messages[idx] = msg.toJSON() as MessageSummary;
        }
      } else {
        s.messages[idx] = { ...msg, ...updater };
      }
      await this._persistSessions();
      return true;
    }
    return false;
  }
  streamChunkMessage(messageId, chunk, sessionId) {
    return this.updateMessage(messageId, (msg) => {
      if (chunk && typeof chunk === 'object') {
        if (chunk.content != null) msg.content = (msg.content || '') + chunk.content;
        if (chunk.reasoning_content != null) msg.reasoning_content = (msg.reasoning_content || '') + chunk.reasoning_content;
      } else {
        msg.content = (msg.content || '') + String(chunk);
      }
      return msg;
    }, sessionId);
  }
  getContextWindow(session, opts) { return []; }
  getMessagesByTokenBudget(session, opts) { return []; }
  async flushAllStreamWrites() {}
}