/**
 * Process — 进程数据原型
 *
 * 纯数据模型，不含 infra 依赖（log/ipc 已移入各自使用方）：
 * - Kernel 自行持有 log/ipc
 * - ChatProgram 自行持有 log/ipc
 */

import { BaseModel } from "./BaseModel.js";

export class Process extends BaseModel {
  name: string;
  status: string;
  output: unknown[];
  metadata: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    this.id = (options.id as string) || `proc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.name = (options.name as string) || '';
    this.status = (options.status as string) || 'pending';
    this.output = (options.output as unknown[]) || [];
    this.metadata = (options.metadata as Record<string, unknown>) || {};
  }

  setStatus(status: string): this { this.status = status; return this; }
  appendOutput(text: unknown): this { this.output.push(text); return this; }
}

export default Process;
