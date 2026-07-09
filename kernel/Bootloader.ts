/**
 * Bootloader — 内核启动引导器
 *
 * 职责：
 * - 按固定 4 阶段顺序启动内核
 * - 每个阶段可注册钩子（hook），由 Shell 层注入具体逻辑
 * - 阶段计时与结果追踪
 *
 * 启动阶段：
 *   INIT → REGISTER → START → READY
 *
 * 注：各阶段的具体逻辑由 background/main.ts 通过 bootloader.on(phase, ...) 注入，
 * Bootloader 本身不创建任何服务/基础设施（IPC 在 main.ts 模块作用域创建一次）。
 * 当前实际分工：
 * - INIT:      基础设施（IPC/Log）已就绪，仅标记
 * - REGISTER:  在 Kernel 上 register() 所有服务工厂（storageManager / toolsManager /
 *              capabilities / sessionManager / settingsManager / scriptsManager /
 *              processManager / providerFactory）；ToolsManager、CapabilityManager 也走此常规注册
 * - START:     kernel.boot() 按依赖序初始化各服务（自动调用服务的 init(kernel)），
 *              再注册内置工具、加载配置
 * - READY:     RPC 暴露 + 用户脚本注入（会话命令接线已内联进 session RPC facade，无独立 eventhandler 层）
 *
 * 使用方式：
 *   const bl = new Bootloader(kernel);
 *   bl.on(Bootloader.PHASES.REGISTER, async (bl) => { ... });
 *   await bl.boot();
 *
 * 设计原则：
 * - Bootloader 只管理启动流程，不执行业务逻辑
 * - 业务逻辑由 Shell 层通过 on() 注册的钩子注入
 * - 零外部依赖（仅依赖 Kernel 实例通过 constructor 注入）
 */
import { Kernel } from './Kernel.js';
import { Log } from './services/Log.js';

export class Bootloader {
  static PHASES = Object.freeze({
    INIT: 'init',
    REGISTER: 'register',
    START: 'start',
    READY: 'ready'
  });
  static PHASE_ORDER = [
    Bootloader.PHASES.INIT,
    Bootloader.PHASES.REGISTER,
    Bootloader.PHASES.START,
    Bootloader.PHASES.READY
  ];

  kernel: Kernel;
  currentPhase: string | null;
  phaseHooks: Map<string, unknown[]>;
  phaseResults: Map<string, unknown>;
  private _phaseTimings: { phase: string; dur: number }[];

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.currentPhase = null;
    this.phaseHooks = new Map();
    this.phaseResults = new Map();
    this._phaseTimings = [];
  }

  on(phase: string, hook: unknown): this {
    if (!this.phaseHooks.has(phase)) this.phaseHooks.set(phase, []);
    this.phaseHooks.get(phase)!.push(hook);
    return this;
  }

  async boot(): Promise<void> {
    Log.info('BOOT', 'Bootloader starting...');
    for (const phase of Bootloader.PHASE_ORDER) {
      this.currentPhase = phase;
      const start = Date.now();
      Log.info('BOOT', `Phase: ${phase}`);
      try {
        await this._runPhaseHooks(phase);
        const dur = Date.now() - start;
        this._phaseTimings.push({ phase, dur });
        this.phaseResults.set(phase, { status: 'completed', dur });
        Log.info('BOOT', `Phase "${phase}" completed in ${dur}ms`);
      } catch (err) {
        const dur = Date.now() - start;
        this._phaseTimings.push({ phase, dur });
        this.phaseResults.set(phase, { status: 'failed', dur, error: (err)?.message ?? String(err) });
        Log.error('BOOT', `Phase "${phase}" failed`, err);
        throw err;
      }
    }
    this.currentPhase = Bootloader.PHASES.READY;
    Log.info('BOOT', 'Bootloader complete');
  }

  async _runPhaseHooks(phase: string): Promise<void> {
    const hooks = this.phaseHooks.get(phase) || [];
    for (const hook of hooks) await (hook as (bootloader: Bootloader) => Promise<void>)(this);
  }

  getTimings(): { phase: string; dur: number }[] { return [...this._phaseTimings]; }
  getResults(): Record<string, unknown> { const r: Record<string, unknown> = {}; this.phaseResults.forEach((v, p) => r[p] = v); return r; }
}

export default Bootloader;
