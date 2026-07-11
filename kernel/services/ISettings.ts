import { IPC } from '../IPC.js';

export class BaseSettings {
  ipc: IPC | null;

  constructor(obj: { ipc?: IPC | null } | null = null) {
    this.ipc = obj?.ipc ?? null;
  }
  async loadSettings(): Promise<Record<string, unknown>> { return {}; }
  async saveSetting(_key: string, _value: unknown): Promise<this> { return this; }
  async saveSettings(_settings: Record<string, any>): Promise<void> {}
  getSetting(_key: string): unknown { return undefined; }
  getSettings(): Record<string, unknown> { return {}; }
  resetSettings(): void {}
}
