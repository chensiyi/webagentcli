/**
 * Process - 进程实例
 *
 * 类似操作系统中的"运行中的进程"，是 Program 的运行实例。
 * 每个 Process 绑定一个会话，拥有独立的状态和资源上下文。
 *
 * 职责：
 * - 承载运行时状态（CREATED → RUNNING → COMPLETED / FAILED / TERMINATED）
 * - 管理能力上下文（从 Program 继承，运行时可追加）
 * - 追踪执行时间与错误
 * - 支持父子关系（子任务）
 *
 * 设计原则：
 * - Process 持有运行时状态，但不包含业务逻辑
 * - 业务逻辑由 ProcessManager 驱动
 * - 状态转换由 ProcessManager 统一管理
 */

class Process {
  // ==================== 状态定义 ====================

  static STATE = Object.freeze({
    CREATED: 'created',       // 已创建，未开始
    READY: 'ready',           // 就绪，等待调度
    RUNNING: 'running',       // 执行中
    PAUSED: 'paused',         // 暂停（等待用户确认等）
    COMPLETED: 'completed',   // 正常完成
    FAILED: 'failed',         // 失败
    TERMINATED: 'terminated'  // 手动终止
  });

  // 合法的状态转换
  static TRANSITIONS = Object.freeze({
    [Process.STATE.CREATED]: [Process.STATE.READY, Process.STATE.TERMINATED],
    [Process.STATE.READY]: [Process.STATE.RUNNING, Process.STATE.TERMINATED],
    [Process.STATE.RUNNING]: [Process.STATE.PAUSED, Process.STATE.COMPLETED, Process.STATE.FAILED, Process.STATE.TERMINATED],
    [Process.STATE.PAUSED]: [Process.STATE.RUNNING, Process.STATE.TERMINATED],
    [Process.STATE.COMPLETED]: [],
    [Process.STATE.FAILED]: [Process.STATE.READY],
    [Process.STATE.TERMINATED]: []
  });

  /**
   * @param {Object} options
   * @param {Program} options.program - 关联的程序定义
   * @param {string} [options.sessionId] - 绑定的会话 ID
   * @param {string} [options.model] - 使用的模型 ID
   * @param {string} [options.parentProcessId] - 父进程 ID（子任务时）
   */
  constructor({ program, sessionId = null, model = null, parentProcessId = null } = {}) {
    if (!program) {
      throw new Error('[Process] program is required');
    }

    this.id = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.programId = program.id;
    this.program = program;
    this.sessionId = sessionId;
    this.model = model;
    this.parentProcessId = parentProcessId;

    // 运行时状态
    this.state = Process.STATE.CREATED;
    this.capabilities = [...program.capabilities];
    this.startTime = null;
    this.endTime = null;
    this.duration = null;
    this.error = null;
    this.output = null;

    this.createdAt = Date.now();
  }

  /**
   * 检查是否可以转换到目标状态
   * @param {string} targetState
   * @returns {boolean}
   */
  canTransition(targetState) {
    const allowed = Process.TRANSITIONS[this.state];
    return allowed ? allowed.includes(targetState) : false;
  }

  /**
   * 检查进程是否处于终态
   * @returns {boolean}
   */
  get isTerminal() {
    return this.state === Process.STATE.COMPLETED ||
           this.state === Process.STATE.FAILED ||
           this.state === Process.STATE.TERMINATED;
  }

  /**
   * 检查进程是否正在运行
   * @returns {boolean}
   */
  get isRunning() {
    return this.state === Process.STATE.RUNNING;
  }

  /**
   * 获取运行时长（ms）
   * @returns {number|null}
   */
  get elapsed() {
    if (!this.startTime) return null;
    if (this.endTime) return this.duration;
    return Date.now() - this.startTime;
  }

  /**
   * 授予额外能力
   * @param {string} capability
   */
  grantCapability(capability) {
    if (!this.capabilities.includes(capability)) {
      this.capabilities.push(capability);
    }
  }

  /**
   * 撤销能力
   * @param {string} capability
   */
  revokeCapability(capability) {
    this.capabilities = this.capabilities.filter(c => c !== capability);
  }

  /**
   * 检查是否拥有指定能力
   * @param {string} capability
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }

  /**
   * 序列化为 JSON（用于持久化）
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      programId: this.programId,
      sessionId: this.sessionId,
      model: this.model,
      parentProcessId: this.parentProcessId,
      state: this.state,
      capabilities: this.capabilities,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      error: this.error,
      output: this.output,
      createdAt: this.createdAt
    };
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.Process = Process;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Process;
}