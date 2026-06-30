export class ProcessManager {
  constructor() { this.processes = new Map(); }
  create(name) { const p = { id: `proc_${Date.now()}`, name, status: 'pending', output: [] }; this.processes.set(p.id, p); return p; }
  get(id) { return this.processes.get(id) || null; }
  remove(id) { this.processes.delete(id); return true; }
}