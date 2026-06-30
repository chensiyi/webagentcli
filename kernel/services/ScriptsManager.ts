import { IScriptsManager } from './IScriptsManager.js';
import { KernelEvents } from '../Events.js';
export class ScriptsManager extends IScriptsManager {
  constructor(kernel) {
    super();
    this.kernel = kernel;
    this.ipc = kernel?.getIPC();
    this.scriptsChannel = this.ipc?.getOrCreateChannel('scripts') || null;
    this.scripts = [];
  }
  async loadAll() {
    // 触发 SCRIPTS.LOADED 事件让 ScriptsPage 跨域刷新
      this.scriptsChannel?.emit(KernelEvents.SCRIPTS.LOADED, { scripts: [...this.scripts] });
  }
  getScripts() { return this.scripts; }
  add(script) { this.scripts.push(script); }
  remove(id) { const i = this.scripts.findIndex(s => s.id === id); if (i !== -1) this.scripts.splice(i, 1); }
  get(id) { return this.scripts.find(s => s.id === id) || null; }
  clear() { this.scripts = []; }
  async install(code) { this.scripts.push({ id: Date.now().toString(), code, enabled: true, createdAt: Date.now(), updatedAt: Date.now() }); this.loadAll(); }
  async toggle(id, enabled) { const s = this.get(id); if (s) { s.enabled = enabled; this.loadAll(); } }
  async updateCode(id, code) { const s = this.get(id); if (s) { s.code = code; s.updatedAt = Date.now(); this.loadAll(); } }
}