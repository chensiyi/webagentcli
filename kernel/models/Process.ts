/**
 * Process — 进程数据模型
 *
 * 支持完整生命周期状态机和看门狗终止机制：
 *
 * 生命周期：
 *   created → running → completed
 *           ↘ paused → running
 *           ↘ cancelling → cancelled
 *                        ↘ killed (看门狗超时后强制终止)
 *           ↘ failed
 *
 * 看门狗机制：
 *   当调用 cancel() 时，先执行 terminateFn（优雅终止），
 *   同时启动 watchdogTimer。若 terminateFn 在 timeout 内未完成，
 *   ProcessManager 将强制将状态置为 killed。
 *
 * 纯数据模型，不含 infra 依赖（log/ipc 在使用方自行持有）。
 */

import { BaseModel } from "./BaseModel.js";

export type ProcessStatus =
  | 'created'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelling'
  | 'cancelled'
  | 'killed';

/** 合法的状态流转 */
const VALID_TRANSITIONS: Record<ProcessStatus, ProcessStatus[]> = {
  created:     ['running', 'failed', 'cancelled'],
  running:     ['paused', 'completed', 'failed', 'cancelling'],
  paused:      ['running', 'cancelling', 'failed'],
  completed:   [],
  failed:      [],
  cancelling:  ['cancelled', 'killed'],
  cancelled:   [],
  killed:      [],
};

/** 终止回调签名 — 优雅终止逻辑由创建者注入 */
export type TerminateFn = () => Promise<void> | void;

export class Process extends BaseModel {
  name: string;
  status: ProcessStatus;
  output: unknown[];
  metadata: Record<string, unknown>;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
  timeout: number;
  terminateFn: TerminateFn | null;
  watchdogTimer: ReturnType<typeof setTimeout> | null;

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    this.id = (options.id as string) || `proc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.name = (options.name as string) || '';
    this.status = (options.status as ProcessStatus) || 'created';
    this.output = (options.output as unknown[]) || [];
    this.metadata = (options.metadata as Record<string, unknown>) || {};
    this.startedAt = (options.startedAt as number) || null;
    this.endedAt = (options.endedAt as number) || null;
    this.error = (options.error as string) || null;
    this.timeout = (options.timeout as number) || 5000;
    this.terminateFn = null;
    this.watchdogTimer = null;
  }

  /** 状态流转（带合法性校验） */
  setStatus(status: ProcessStatus): this {
    if (this.status === status) return this;
    const allowed = VALID_TRANSITIONS[this.status];
    if (!allowed || !allowed.includes(status)) {
      throw new Error(`[Process] Invalid transition: ${this.status} → ${status}`);
    }
    this.status = status;
    this.touch();
    return this;
  }

  /** 安全设置状态（跳过校验，仅用于看门狗强制终止） */
  _forceStatus(status: ProcessStatus): this {
    this.status = status;
    this.touch();
    return this;
  }

  /** 标记为运行中 */
  start(): this {
    this.setStatus('running');
    this.startedAt = Date.now();
    this.endedAt = null;
    this.error = null;
    return this;
  }

  /** 标记为已完成 */
  complete(): this {
    this.setStatus('completed');
    this.endedAt = Date.now();
    this.clearWatchdog();
    return this;
  }

  /** 标记为失败 */
  fail(error: string): this {
    this.setStatus('failed');
    this.endedAt = Date.now();
    this.error = error;
    this.clearWatchdog();
    return this;
  }

  /** 暂停 */
  pause(): this {
    this.setStatus('paused');
    return this;
  }

  /** 恢复 */
  resume(): this {
    this.setStatus('running');
    return this;
  }

  /** 进入取消中状态，注入终止回调 */
  beginCancel(terminateFn?: TerminateFn): this {
    if (terminateFn) this.terminateFn = terminateFn;
    this.setStatus('cancelling');
    return this;
  }

  /** 标记为已取消（优雅终止成功） */
  finishCancel(): this {
    this._forceStatus('cancelled');
    this.endedAt = Date.now();
    this.clearWatchdog();
    return this;
  }

  /** 看门狗强制终止 */
  forceKill(): this {
    this._forceStatus('killed');
    this.endedAt = Date.now();
    this.clearWatchdog();
    return this;
  }

  /** 设置看门狗定时器 */
  setWatchdog(timer: ReturnType<typeof setTimeout>): this {
    this.watchdogTimer = timer;
    return this;
  }

  /** 清除看门狗定时器 */
  clearWatchdog(): this {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    return this;
  }

  /** 注入终止回调 */
  setTerminateFn(fn: TerminateFn): this {
    this.terminateFn = fn;
    return this;
  }

  /** 是否处于终态（不可再流转） */
  isFinished(): boolean {
    return ['completed', 'failed', 'cancelled', 'killed'].includes(this.status);
  }

  /** 是否正在运行（含 cancelling） */
  isActive(): boolean {
    return ['created', 'running', 'paused', 'cancelling'].includes(this.status);
  }

  appendOutput(text: unknown): this { this.output.push(text); return this; }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      name: this.name,
      status: this.status,
      output: this.output,
      metadata: this.metadata,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      error: this.error,
      timeout: this.timeout,
    };
  }
}

export default Process;
