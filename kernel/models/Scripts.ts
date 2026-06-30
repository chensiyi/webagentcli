export class ScriptsModel {
  scripts: Array<{ id: string; [key: string]: unknown }>;

  constructor() {
    this.scripts = [];
  }

  load(data) {
    if (!Array.isArray(data)) return;
    this.scripts = data.map(s => ({ ...s }));
  }

  add(script) { this.scripts.push({ ...script, id: script.id || `script_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` }); return this; }
  remove(id) { const i = this.scripts.findIndex(s => s.id === id); if (i !== -1) this.scripts.splice(i, 1); return this; }
  get(id) { return this.scripts.find(s => s.id === id) || null; }
  getAll() { return [...this.scripts]; }
  clear() { this.scripts = []; return this; }
}

export default ScriptsModel;