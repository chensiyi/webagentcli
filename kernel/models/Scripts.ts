export class ScriptsModel {
  scripts: Record<string, unknown>[];

  constructor() {
    this.scripts = [];
  }

  load(data: unknown): void {
    if (!Array.isArray(data)) return;
    this.scripts = data.map(s => ({ ...(s as Record<string, unknown>) }));
  }

  add(script: Record<string, unknown>): this { this.scripts.push({ ...script, id: script.id || `script_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` }); return this; }
  remove(id: string): this { const i = this.scripts.findIndex(s => s.id === id); if (i !== -1) this.scripts.splice(i, 1); return this; }
  get(id: string): Record<string, unknown> | null { return this.scripts.find(s => s.id === id) || null; }
  getAll(): Record<string, unknown>[] { return [...this.scripts]; }
  clear(): this { this.scripts = []; return this; }
}