import { BaseModel } from "./BaseModel";
import { KernelLog } from '../KernelLog.js';
import { IPC } from '../IPC.js';

export class Process extends BaseModel {
  name: string;
  status: string;
  log: KernelLog | null;
  ipc: IPC | null;
  output: unknown[];
  metadata: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    super(options)
    this.id = (options.id as string) || `proc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.name = (options.name as string) || '';
    this.status = (options.status as string) || 'pending';
    this.output = (options.output as unknown[]) || [];
    this.metadata = (options.metadata as Record<string, unknown>) || {};
  }

  setStatus(status: string): this { this.status = status; return this; }
  appendOutput(text: unknown): this { this.output.push(text); return this; }
  async shutdown(): Promise<void> { this.setStatus('terminated'); }
}
export default Process;
