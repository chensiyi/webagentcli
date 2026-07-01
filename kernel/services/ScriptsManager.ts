import { BaseScriptsManager } from './IScriptsManager.js';
import { KernelEvents } from '../Events.js';
import { IPC } from '../IPC.js';
import { UserScript } from '../models/Scripts.js';

/** 最小 Kernel 接口，避免与 Kernel.ts 产生循环引用 */
interface KernelRef { getIPC(): IPC | null; }

export class ScriptsManager extends BaseScriptsManager {
  kernel: KernelRef;
  ipc: IPC | null;
  scriptsChannel: IPC | null;
  scripts: UserScript[];

  constructor(kernel: KernelRef) {
    super();
    this.kernel = kernel;
    this.ipc = kernel?.getIPC();
    this.scriptsChannel = this.ipc?.getOrCreateChannel('scripts') || null;
    this.scripts = [];
  }

  async loadAll(): Promise<void> {
    this.scriptsChannel?.emit(KernelEvents.SCRIPTS.LOADED, { scripts: [...this.scripts] });
  }

  getScripts(): UserScript[] { return this.scripts; }

  add(script: UserScript): void { this.scripts.push(script); }

  remove(id: string): void {
    const i = this.scripts.findIndex(s => s.id === id);
    if (i !== -1) this.scripts.splice(i, 1);
  }

  get(id: string): UserScript | null {
    return this.scripts.find(s => s.id === id) || null;
  }

  clear(): void { this.scripts = []; }

  async install(code: string): Promise<void> {
    this.scripts.push({
      id: Date.now().toString(),
      code,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    await this.loadAll();
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    const s = this.get(id);
    if (s) { s.enabled = enabled; await this.loadAll(); }
  }

  async updateCode(id: string, code: string): Promise<void> {
    const s = this.get(id);
    if (s) { s.code = code; s.updatedAt = Date.now(); await this.loadAll(); }
  }
}
