import IScriptsManager from './IScriptsManager.js';
export class ScriptsManager extends IScriptsManager {
  constructor(serviceCenter) { super(); this.serviceCenter = serviceCenter; this.scripts = []; }
  async loadAll() {}
  getScripts() { return this.scripts; }
  add(script) { this.scripts.push(script); }
  remove(id) { const i = this.scripts.findIndex(s => s.id === id); if (i !== -1) this.scripts.splice(i, 1); }
  get(id) { return this.scripts.find(s => s.id === id) || null; }
  clear() { this.scripts = []; }
}
export default ScriptsManager;