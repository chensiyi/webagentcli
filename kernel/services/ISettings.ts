import { IPC } from '../IPC.js';

export class BaseSettings {
  ipc: IPC | null;

  constructor(obj = null) {
    this.ipc = obj?.ipc || null;
  }
  async loadSettings(): Promise<Record<string, unknown>> { return {}; }
  async saveSetting(key: string, value: unknown): Promise<this> { return this; }
  async saveSettings(settings: Record<string, any>): Promise<void> {}
  getSetting(key: string): unknown { return undefined; }
  getSettings(): Record<string, unknown> { return {}; }
  resetSettings(): void {}
}