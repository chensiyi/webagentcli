import { IPC } from '../IPC.js';
import { IStorageManager } from './IStorageManager.js';
import { Session } from '../models/Session.js';

export class BaseSessionManager {
  ipc: IPC | null;
  storage: IStorageManager | null;

  constructor(obj: { ipc?: IPC | null; storage?: IStorageManager | null } | null = null) {
    this.ipc = obj?.ipc ?? null;
    this.storage = obj?.storage ?? null;
  }
  async initialize(): Promise<void> {}
  getCurrentSession(): Session | null { return null; }
  setCurrentSession(_id: string): void {}
  getSession(_id: string): Session | null { return null; }
  getAllSessions(): Session[] { return []; }
  async createSession(_opts?: Record<string, unknown>): Promise<Session> { throw new Error('Not implemented'); }
  deleteSession(_id: string): void {}
  async addMessage(_message: unknown, _sessionId: string): Promise<void> {}
  deleteMessage(_messageId: string, _sessionId: string): void {}
  updateMessage(_messageId: string, _updater: any, _sessionId: string): void {}
  streamChunkMessage(_messageId: string, _chunk: unknown, _sessionId: string): void {}
}
