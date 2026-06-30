import { IPC } from 'kernel/IPC';
import { IStorageManager } from './IStorageManager.js';

export class ISessionManager {
  ipc: IPC | null;
  storage: IStorageManager | null;

  constructor(obj = null) {
    this.ipc = obj?.ipc || null;
    this.storage = obj?.storage || null;
  }
  async initialize() {}
  getCurrentSession() { return null; }
  setCurrentSession(id) {}
  getSession(id) { return null; }
  getAllSessions() { return []; }
  createSession(opts) { return null; }
  deleteSession(id) {}
  async addMessage(message, sessionId) {}
  deleteMessage(messageId, sessionId) {}
  updateMessage(messageId, updater, sessionId) {}
  streamChunkMessage(messageId, chunk, sessionId) {}
  getContextWindow(session, opts) { return []; }
  getMessagesByTokenBudget(session, opts) { return []; }
  async flushAllStreamWrites() {}
}