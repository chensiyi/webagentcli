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

  constructor(kernel) {
    this.kernel = kernel;
    this.currentPhase = null;
    this.phaseHooks = new Map();
    this.phaseResults = new Map();
    this._phaseTimings = [];
  }

  on(phase, hook) {
    if (!this.phaseHooks.has(phase)) this.phaseHooks.set(phase, []);
    this.phaseHooks.get(phase).push(hook);
    return this;
  }

  async boot() {
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
      } catch (err) {
        const dur = Date.now() - start;
        this._phaseTimings.push({ phase, dur });
        this.phaseResults.set(phase, { status: 'failed', dur, error: err.message });
        k.log?.error('BOOT', `Phase "${phase}" failed`, err);
        throw err;
      }
    }
    this.currentPhase = Bootloader.PHASES.READY;
    k.log?.info('BOOT', 'Bootloader complete');
  }

  async _runPhaseHooks(phase) {
    for (const hook of this.phaseHooks.get(phase) || []) await hook(this);
  }

  getTimings() { return [...this._phaseTimings]; }
  getResults() { const r = {}; this.phaseResults.forEach((v, p) => r[p] = v); return r; }
}

export default Bootloader;