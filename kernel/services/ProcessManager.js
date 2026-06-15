/**
 * ProcessManager - 进程管理器
 *
 * 职责：
 * - 进程的生命周期管理（spawn / run / pause / resume / kill）
 * - 能力检查（集成 CapabilityManager）
 * - 进程状态追踪与事件分发
 * - 进程注册表（list / get / getBySession）
 *
 * 设计原则：
 * - ProcessManager 不包含具体的 AI 调用逻辑，由上层驱动
 * - 进程状态转换受 Process.TRANSITIONS 约束
 * - 所有状态变更通过 EventBus 广播
 */

class ProcessManager {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    this.capabilityManager = serviceCenter.capabilities;

    /** @type {Map<string, Process>} procId → Process */
    this._processes = new Map();
    /** @type {Map<string, string>} sessionId → procId（当前活跃进程） */
    this._sessionProcessMap = new Map();
  }

  // ==================== 进程创建与销毁 ====================

  /**
   * 创建进程（spawn）
   *
   * @param {Object} options
   * @param {Program} options.program - 程序定义
   * @param {string} [options.sessionId] - 绑定会话 ID
   * @param {string} [options.model] - 使用的模型 ID
   * @param {string} [options.parentProcessId] - 父进程 ID
   * @returns {Process}
   */
  spawn({ program, sessionId = null, model = null, parentProcessId = null } = {}) {
    if (!program) {
      throw new Error('[ProcessManager] program is required');
    }

    // 权限检查：程序声明的能力是否被允许
    this._checkCapabilities(program);

    const proc = new Process({ program, sessionId, model, parentProcessId });

    this._processes.set(proc.id, proc);
    if (sessionId) {
      this._sessionProcessMap.set(sessionId, proc.id);
    }

    // 状态转换：CREATED → READY
    this._transition(proc, Process.STATE.READY);

    console.log(`[ProcessManager] Spawned process ${proc.id} (program=${program.name})`);
    return proc;
  }

  /**
   * 终止进程（kill）
   * @param {string} procId
   * @returns {boolean}
   */
  kill(procId) {
    const proc = this.get(procId);
    if (!proc || proc.isTerminal) return false;

    this._transition(proc, Process.STATE.TERMINATED);

    if (proc.sessionId) {
      this._sessionProcessMap.delete(proc.sessionId);
    }

    console.log(`[ProcessManager] Terminated process ${procId}`);
    return true;
  }

  // ==================== 进程调度 ====================

  /**
   * 启动进程（run）
   * 将进程从 READY 转为 RUNNING
   * @param {string} procId
   * @returns {Process|null}
   */
  run(procId) {
    const proc = this.get(procId);
    if (!proc || !proc.canTransition(Process.STATE.RUNNING)) return null;

    this._transition(proc, Process.STATE.RUNNING);
    proc.startTime = Date.now();
    return proc;
  }

  /**
   * 暂停进程（pause）
   * @param {string} procId
   * @returns {boolean}
   */
  pause(procId) {
    const proc = this.get(procId);
    if (!proc || !proc.canTransition(Process.STATE.PAUSED)) return false;

    this._transition(proc, Process.STATE.PAUSED);
    return true;
  }

  /**
   * 恢复进程（resume）
   * @param {string} procId
   * @returns {boolean}
   */
  resume(procId) {
    const proc = this.get(procId);
    if (!proc || !proc.canTransition(Process.STATE.RUNNING)) return false;

    this._transition(proc, Process.STATE.RUNNING);
    return true;
  }

  /**
   * 标记进程完成
   * @param {string} procId
   * @param {*} [output]
   */
  complete(procId, output = null) {
    const proc = this.get(procId);
    if (!proc || !proc.canTransition(Process.STATE.COMPLETED)) return;

    proc.output = output;
    proc.endTime = Date.now();
    proc.duration = proc.endTime - proc.startTime;
    this._transition(proc, Process.STATE.COMPLETED);

    console.log(`[ProcessManager] Process ${procId} completed in ${proc.duration}ms`);
  }

  /**
   * 标记进程失败
   * @param {string} procId
   * @param {Error|string} error
   */
  fail(procId, error) {
    const proc = this.get(procId);
    if (!proc || !proc.canTransition(Process.STATE.FAILED)) return;

    proc.error = error instanceof Error ? error : new Error(String(error));
    proc.endTime = Date.now();
    proc.duration = proc.endTime - (proc.startTime || proc.createdAt);
    this._transition(proc, Process.STATE.FAILED);

    console.error(`[ProcessManager] Process ${procId} failed:`, error);
  }

  // ==================== 查询 ====================

  /**
   * 获取进程
   * @param {string} procId
   * @returns {Process|null}
   */
  get(procId) {
    return this._processes.get(procId) || null;
  }

  /**
   * 获取进程列表
   * @param {Object} [filters]
   * @param {string} [filters.state] - 按状态过滤
   * @param {string} [filters.sessionId] - 按会话过滤
   * @param {string} [filters.programId] - 按程序过滤
   * @returns {Process[]}
   */
  list(filters = {}) {
    let result = Array.from(this._processes.values());

    if (filters.state) {
      result = result.filter(p => p.state === filters.state);
    }
    if (filters.sessionId) {
      result = result.filter(p => p.sessionId === filters.sessionId);
    }
    if (filters.programId) {
      result = result.filter(p => p.programId === filters.programId);
    }

    return result;
  }

  /**
   * 获取指定会话的活跃进程
   * @param {string} sessionId
   * @returns {Process|null}
   */
  getBySession(sessionId) {
    const procId = this._sessionProcessMap.get(sessionId);
    return procId ? this.get(procId) : null;
  }

  /**
   * 获取所有运行中的进程
   * @returns {Process[]}
   */
  getRunning() {
    return this.list({ state: Process.STATE.RUNNING });
  }

  /**
   * 清理已完成的进程
   */
  cleanup() {
    for (const [id, proc] of this._processes) {
      if (proc.isTerminal) {
        this._processes.delete(id);
        if (proc.sessionId) {
          this._sessionProcessMap.delete(proc.sessionId);
        }
      }
    }
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const all = Array.from(this._processes.values());
    return {
      total: all.length,
      running: all.filter(p => p.state === Process.STATE.RUNNING).length,
      completed: all.filter(p => p.state === Process.STATE.COMPLETED).length,
      failed: all.filter(p => p.state === Process.STATE.FAILED).length,
      created: all.filter(p => p.state === Process.STATE.CREATED).length,
      ready: all.filter(p => p.state === Process.STATE.READY).length,
      paused: all.filter(p => p.state === Process.STATE.PAUSED).length,
      terminated: all.filter(p => p.state === Process.STATE.TERMINATED).length
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 检查程序声明的能力是否被允许
   * @private
   * @param {Program} program
   */
  _checkCapabilities(program) {
    if (!this.capabilityManager || !program.capabilities.length) return;

    for (const cap of program.capabilities) {
      if (!this.capabilityManager.check(program.name, cap, { programId: program.id })) {
        console.warn(
          `[ProcessManager] Program "${program.name}" requires capability "${cap}" which is not granted. ` +
          `Process will be created but capability checks may fail at runtime.`
        );
      }
    }
  }

  /**
   * 执行状态转换
   * @private
   * @param {Process} proc
   * @param {string} newState
   */
  _transition(proc, newState) {
    if (!proc.canTransition(newState)) {
      console.error(
        `[ProcessManager] Invalid transition: ${proc.state} → ${newState} for process ${proc.id}`
      );
      return;
    }

    const oldState = proc.state;
    proc.state = newState;

    this.eventBus.emit(window.Events.PROCESS.STATE_CHANGED, {
      processId: proc.id,
      programId: proc.programId,
      oldState,
      newState,
      timestamp: Date.now()
    });
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ProcessManager = ProcessManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProcessManager;
}