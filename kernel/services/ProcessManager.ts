/**
 * ProcessManager — 进程/任务生命周期管理器 + 外部看门狗
 *
 * 职责：
 * 1. 进程生命周期管理：create → start → (pause/resume) → complete/fail/cancel
 * 2. 外部看门狗：取消进程时先调用优雅终止回调(terminateFn)，
 *    同时启动 setTimeout 倒计时；超时后强制将进程状态置为 killed。
 * 3. IPC 事件响应：监听 task:cancelRequest，通过 IPC 广播状态变更。
 * 4. 内核关闭时安全清理：shutdown() 取消所有活跃进程。
 *
 * 看门狗流程：
 *   cancel(id)
 *     ├─ process.beginCancel()           // 状态 → cancelling
 *     ├─ process.setWatchdog(setTimeout( // 启动看门狗定时器
 *     │     () => forceKill(id), timeout
 *     │  ))
 *     ├─ await process.terminateFn()     // 优雅终止
 *     ├─ process.clearWatchdog()         // 清除定时器
 *     └─ process.finishCancel()          // 状态 → cancelled
 *
 *   若 terminateFn 在 timeout 内未完成：
 *     └─ 看门狗触发 → forceKill(id)      // 状态 → killed
 */

import { Process, TerminateFn } from '../models/Process.js';
import { KernelEvents, KernelChannels } from '../Events.js';
import { IPC } from '../IPC.js';
import { Log } from './Log.js';

/** 最小 Kernel 接口，避免与 Kernel.ts 产生循环引用 */
interface KernelRef {
  getIPC(): IPC | null;
}

export interface ProcessCreateOptions {
  name: string;
  timeout?: number;
  metadata?: Record<string, unknown>;
  terminateFn?: TerminateFn;
}

export class ProcessManager {
  kernel: KernelRef;
  ipc: IPC | null;
  taskChannel: IPC | null;
  processes: Map<string, Process>;
  defaultTimeout: number;
  /** init() 注册的 CANCEL_REQUEST 监听引用，shutdown() 时移除 */
  private _cancelListener: ((data: unknown) => void) | null = null;

  constructor(kernel: KernelRef) {
    this.kernel = kernel;
    this.ipc = kernel?.getIPC() || null;
    this.taskChannel = this.ipc?.getOrCreateChannel(KernelChannels.TASK) || null;
    this.processes = new Map();
    this.defaultTimeout = 10000; // 默认看门狗超时 10 秒
  }

  /**
   * 初始化 — 由 Kernel.boot() 自动调用
   * 注册 IPC 事件监听
   */
  async init(_kernel: KernelRef): Promise<void> {
    if (!this.taskChannel) {
      Log.warn('ProcessManager', 'IPC task channel not available, running in degraded mode');
      return;
    }

    // 监听外部取消请求（存引用以便 shutdown 时移除）
    this._cancelListener = (data: unknown) => {
      const { processId, reason } = (data || {}) as { processId?: string; reason?: string };
      if (processId) {
        this.cancel(processId, reason).catch(err => {
          Log.error('ProcessManager', `Cancel failed for ${processId}:`, err);
        });
      }
    };
    this.taskChannel.on(KernelEvents.TASK.CANCEL_REQUEST, this._cancelListener);

    Log.info('ProcessManager', `Initialized, watching ${this.processes.size} processes`);
  }

  /**
   * 创建进程
   */
  create(name: string, options: Omit<ProcessCreateOptions, 'name'> = {}): Process {
    const p = new Process({
      name,
      timeout: options.timeout ?? this.defaultTimeout,
      metadata: options.metadata || {},
    });
    if (options.terminateFn) {
      p.setTerminateFn(options.terminateFn);
    }
    this.processes.set(p.id, p);
    this._emit(KernelEvents.TASK.CREATED, { processId: p.id, name: p.name, status: p.status });
    Log.info('ProcessManager', `Process created: ${p.id} (${p.name})`);
    return p;
  }

  /**
   * 启动进程
   */
  start(id: string): Process | null {
    const p = this.processes.get(id);
    if (!p) { Log.warn('ProcessManager', `start: process not found: ${id}`); return null; }
    try {
      p.start();
      this._emit(KernelEvents.TASK.STARTED, { processId: p.id, name: p.name, startedAt: p.startedAt });
      Log.info('ProcessManager', `Process started: ${p.id} (${p.name})`);
      return p;
    } catch (err) {
      Log.error('ProcessManager', `start failed for ${id}:`, err);
      return null;
    }
  }

  /**
   * 暂停进程
   */
  pause(id: string): Process | null {
    const p = this.processes.get(id);
    if (!p) return null;
    try {
      p.pause();
      this._emit(KernelEvents.TASK.STATUS_CHANGED, { processId: p.id, status: p.status });
      return p;
    } catch (err) {
      Log.error('ProcessManager', `pause failed for ${id}:`, err);
      return null;
    }
  }

  /**
   * 恢复进程
   */
  resume(id: string): Process | null {
    const p = this.processes.get(id);
    if (!p) return null;
    try {
      p.resume();
      this._emit(KernelEvents.TASK.STATUS_CHANGED, { processId: p.id, status: p.status });
      return p;
    } catch (err) {
      Log.error('ProcessManager', `resume failed for ${id}:`, err);
      return null;
    }
  }

  /**
   * 标记进程完成
   */
  complete(id: string, output?: unknown): Process | null {
    const p = this.processes.get(id);
    if (!p) return null;
    if (output !== undefined) p.appendOutput(output);
    p.complete();
    this._emit(KernelEvents.TASK.COMPLETED, { processId: p.id, name: p.name, output: p.output, endedAt: p.endedAt });
    Log.info('ProcessManager', `Process completed: ${p.id} (${p.name})`);
    return p;
  }

  /**
   * 标记进程失败
   */
  fail(id: string, error: string): Process | null {
    const p = this.processes.get(id);
    if (!p) return null;
    p.fail(error);
    this._emit(KernelEvents.TASK.ERROR, { processId: p.id, error, endedAt: p.endedAt });
    Log.error('ProcessManager', `Process failed: ${p.id} (${p.name}): ${error}`);
    return p;
  }

  /**
   * 取消进程 — 看门狗入口
   *
   * 流程：
   * 1. 状态 → cancelling
   * 2. 启动看门狗定时器（timeout 后强制 kill）
   * 3. 执行 terminateFn（优雅终止）
   * 4a. terminateFn 在 timeout 内完成 → 清除定时器 → 状态 → cancelled
   * 4b. terminateFn 超时 → 看门狗触发 forceKill → 状态 → killed
   */
  async cancel(id: string, reason?: string): Promise<Process | null> {
    const p = this.processes.get(id);
    if (!p) { Log.warn('ProcessManager', `cancel: process not found: ${id}`); return null; }
    if (p.isFinished()) {
      Log.info('ProcessManager', `cancel: process already finished: ${id} (${p.status})`);
      return p;
    }

    try {
      p.beginCancel();
    } catch (err) {
      Log.error('ProcessManager', `cancel: cannot transition from ${p.status}:`, err);
      return null;
    }

    this._emit(KernelEvents.TASK.STATUS_CHANGED, { processId: p.id, status: 'cancelling', reason });
    Log.info('ProcessManager', `Cancelling process: ${p.id} (${p.name}), reason: ${reason || 'unspecified'}`);

    // 启动看门狗定时器
    const watchdogTimer = setTimeout(() => {
      this._forceKill(id, `Watchdog timeout after ${p.timeout}ms`);
    }, p.timeout);
    p.setWatchdog(watchdogTimer);

    // 执行优雅终止
    if (p.terminateFn) {
      try {
        await p.terminateFn();
        // 优雅终止成功 — 如果看门狗还没触发，清除定时器并标记为 cancelled
        if (p.status === 'cancelling') {
          p.clearWatchdog();
          p.finishCancel();
          this._emit(KernelEvents.TASK.CANCELLED, { processId: p.id, name: p.name, endedAt: p.endedAt, reason });
          Log.info('ProcessManager', `Process cancelled gracefully: ${p.id} (${p.name})`);
        }
        // 如果状态已经是 killed，说明看门狗已经触发，不做处理
      } catch (err) {
        Log.error('ProcessManager', `terminateFn error for ${id}:`, err);
        // terminateFn 抛错，如果看门狗还没触发，直接 forceKill
        if (p.status === 'cancelling') {
          p.clearWatchdog();
          this._forceKill(id, `terminateFn threw: ${(err)?.message || err}`);
        }
      }
    } else {
      // 没有 terminateFn — 立即完成取消
      p.clearWatchdog();
      p.finishCancel();
      this._emit(KernelEvents.TASK.CANCELLED, { processId: p.id, name: p.name, endedAt: p.endedAt, reason });
      Log.info('ProcessManager', `Process cancelled (no terminateFn): ${p.id} (${p.name})`);
    }

    return p;
  }

  /**
   * 强制终止进程 — 看门狗超时后调用
   */
  _forceKill(id: string, reason: string): void {
    const p = this.processes.get(id);
    if (!p) return;
    if (p.isFinished()) return;

    p.clearWatchdog();
    p.forceKill();
    this._emit(KernelEvents.TASK.FORCE_KILLED, { processId: p.id, name: p.name, reason, endedAt: p.endedAt });
    Log.warn('ProcessManager', `Process FORCE KILLED: ${p.id} (${p.name}), reason: ${reason}`);
  }

  /** 获取进程 */
  get(id: string): Process | null {
    return this.processes.get(id) || null;
  }

  /** 获取所有进程 */
  getAll(): Process[] {
    return Array.from(this.processes.values());
  }

  /** 获取活跃进程 */
  getRunning(): Process[] {
    return this.getAll().filter(p => p.isActive());
  }

  /** 获取已完成进程 */
  getFinished(): Process[] {
    return this.getAll().filter(p => p.isFinished());
  }

  /**
   * 清理已完成的进程
   * @param maxAge 最大保留时间（毫秒），默认 5 分钟
   */
  cleanup(maxAge: number = 5 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, p] of this.processes) {
      if (p.isFinished() && p.endedAt && (now - p.endedAt > maxAge)) {
        this.processes.delete(id);
        this._emit(KernelEvents.TASK.DELETED, { processId: id });
        cleaned++;
      }
    }
    if (cleaned > 0) {
      Log.info('ProcessManager', `Cleaned up ${cleaned} finished processes`);
    }
    return cleaned;
  }

  /**
   * 关闭 — 取消所有活跃进程，由 Kernel.shutdown() 调用
   */
  async shutdown(): Promise<void> {
    // 先移除初始化时注册的取消监听，避免 shutdown 后仍接收取消请求
    if (this._cancelListener && this.taskChannel) {
      this.taskChannel.off(KernelEvents.TASK.CANCEL_REQUEST, this._cancelListener);
      this._cancelListener = null;
    }

    const active = this.getRunning();
    if (active.length === 0) return;

    Log.info('ProcessManager', `Shutting down ${active.length} active processes...`);

    // 并发取消所有活跃进程
    const cancelPromises = active.map(p =>
      this.cancel(p.id, 'kernel shutdown').catch(err =>
        Log.error('ProcessManager', `Shutdown cancel error for ${p.id}:`, err)
      )
    );
    await Promise.all(cancelPromises);

    // 检查是否还有未终止的进程（看门狗可能还在等）
    const stillActive = this.getRunning();
    if (stillActive.length > 0) {
      Log.warn('ProcessManager', `${stillActive.length} processes still active after cancel, force killing...`);
      for (const p of stillActive) {
        this._forceKill(p.id, 'kernel shutdown force kill');
      }
    }

    Log.info('ProcessManager', 'Shutdown complete');
  }

  /** 移除指定进程 */
  remove(id: string): boolean {
    const p = this.processes.get(id);
    if (!p) return false;
    if (p.isActive()) {
      Log.warn('ProcessManager', `remove: process ${id} is still active, cancel first`);
      return false;
    }
    p.clearWatchdog();
    this.processes.delete(id);
    return true;
  }

  // ==================== IPC 辅助 ====================

  private _emit(event: string, data: unknown): void {
    if (!this.taskChannel) return;
    this.taskChannel.emit(event, data);
  }
}
