import { Process } from '../models/Process.js';

export class ProcessManager {
  processes: Map<string, Process>;

  constructor() { this.processes = new Map(); }

  create(name: string): Process {
    const p = new Process({ name, status: 'pending' });
    this.processes.set(p.id, p);
    return p;
  }

  get(id: string): Process | null { return this.processes.get(id) || null; }
  remove(id: string): boolean { return this.processes.delete(id); }
}
