/** ProcessManager 内部存储的进程数据 */
interface ProcessData {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'terminated';
  output: unknown[];
}

export class ProcessManager {
  processes: Map<string, ProcessData>;

  constructor() { this.processes = new Map(); }
  create(name: string): ProcessData {
    const p: ProcessData = { id: `proc_${Date.now()}`, name, status: 'pending', output: [] };
    this.processes.set(p.id, p);
    return p;
  }
  get(id: string): ProcessData | null { return this.processes.get(id) || null; }
  remove(id: string): boolean { this.processes.delete(id); return true; }
}