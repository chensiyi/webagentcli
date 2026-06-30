import { Kernel } from './Kernel.js';

export class Bootloader {
  static PHASES = Object.freeze({
    CORE_INIT: 'core_init', SERVICES_REGISTER: 'services_register', SERVICES_INIT: 'services_init',
    TOOLS_REGISTER: 'tools_register', HANDLERS_INIT: 'handlers_init', CONFIG_LOAD: 'config_load', UI_RENDER: 'ui_render', READY: 'ready'
  });
  static PHASE_ORDER = [
    Bootloader.PHASES.CORE_INIT, Bootloader.PHASES.SERVICES_REGISTER, Bootloader.PHASES.SERVICES_INIT,
    Bootloader.PHASES.TOOLS_REGISTER, Bootloader.PHASES.HANDLERS_INIT, Bootloader.PHASES.CONFIG_LOAD,
    Bootloader.PHASES.UI_RENDER, Bootloader.PHASES.READY
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
    const k = this.kernel;
    k.log?.info('BOOT', 'Bootloader starting...');
    for (const phase of Bootloader.PHASE_ORDER) {
      this.currentPhase = phase;
      const start = Date.now();
      k.log?.info('BOOT', `Phase: ${phase}`);
      try {
        await this._runPhaseHooks(phase);
        const dur = Date.now() - start;
        this._phaseTimings.push({ phase, dur });
        this.phaseResults.set(phase, { status: 'completed', dur });
        k.log?.info('BOOT', `Phase "${phase}" completed in ${dur}ms`);
      } catch (err: unknown) {
        const dur = Date.now() - start;
        this._phaseTimings.push({ phase, dur });
        this.phaseResults.set(phase, { status: 'failed', dur, error: (err as Error)?.message ?? String(err) });
        k.log?.error('BOOT', `Phase "${phase}" failed`, err);
        throw err;
      }
    }
    this.currentPhase = Bootloader.PHASES.READY;
    k.log?.info('BOOT', 'Bootloader complete');
  }

  async _runPhaseHooks(phase: string): Promise<void> {
    const hooks = this.phaseHooks.get(phase) || [];
    for (const hook of hooks) await (hook as (bootloader: Bootloader) => Promise<void>)(this);
  }

  getTimings(): { phase: string; dur: number }[] { return [...this._phaseTimings]; }
  getResults(): Record<string, unknown> { const r: Record<string, unknown> = {}; this.phaseResults.forEach((v, p) => r[p] = v); return r; }
}

export default Bootloader;
