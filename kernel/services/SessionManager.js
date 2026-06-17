import ISessionManager from './ISessionManager.js';
export class SessionManager extends ISessionManager {
  constructor(serviceCenter) { super(); this.storage = serviceCenter?.storageAdapter; this.currentSessionId = null; this.sessions = []; }
  getCurrentSession() { return this.sessions.find(s => s.id === this.currentSessionId) || null; }
  setCurrentSession(id) { this.currentSessionId = id; }
  getSession(id) { return this.sessions.find(s => s.id === id) || null; }
  getAllSessions() { return [...this.sessions]; }
  createSession(opts) {
    const s = { id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, title: opts.title || '新对话', messages: [], reasoningEffort: opts.reasoningEffort || 'medium', model: opts.model || null, createdAt: Date.now(), updatedAt: Date.now() };
    this.sessions.push(s); this.currentSessionId = s.id; return s;
  }
  deleteSession(id) { const i = this.sessions.findIndex(s => s.id === id); if (i !== -1) { this.sessions.splice(i, 1); if (this.currentSessionId === id) this.currentSessionId = null; } }
  addMessage(message, sessionId) { const s = this.getSession(sessionId); if (s) { s.messages.push(message); s.updatedAt = Date.now(); } }
  async initialize() {}
  deleteMessage(messageId, sessionId) { const s = this.getSession(sessionId); if (!s) return false; const i = s.messages.findIndex(m => m.id === messageId); if (i !== -1) { s.messages.splice(i, 1); return true; } return false; }
  updateMessage(messageId, updater, sessionId) {
    const s = this.getSession(sessionId);
    if (!s) return false;
    const idx = s.messages.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      const updated = typeof updater === 'function' ? updater(s.messages[idx]) : updater;
      s.messages[idx] = { ...s.messages[idx], ...updated };
      return true;
    }
    return false;
  }
  streamChunkMessage(messageId, chunk, sessionId) { return this.updateMessage(messageId, { content: chunk }, sessionId); }
  getContextWindow(session, opts) { return []; }
  getMessagesByTokenBudget(session, opts) { return []; }
  async flushAllStreamWrites() {}
}
export default SessionManager;