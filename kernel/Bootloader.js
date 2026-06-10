/**
 * Bootloader - 启动序列
 * 
 * 职责：
 * - 定义内核启动的标准化阶段
 * - 管理引导顺序：内核子系统 → 服务注册 → 服务初始化 → 就绪
 * - 每个阶段可注册钩子，精确控制启动流程
 * 
 * 启动阶段：
 *   1. CORE_INIT      - 初始化 IPC、KernelLog、CapabilityManager、ToolRegistry
 *   2. SERVICES_REGISTER - 注册所有 Service 工厂
 *   3. SERVICES_INIT   - 按依赖关系初始化所有 Service
 *   4. TOOLS_REGISTER  - 注册内置工具
 *   5. HANDLERS_INIT   - 应用层处理器初始化（由壳层实现）
 *   6. CONFIG_LOAD     - 加载配置/设置（由壳层实现）
 *   7. UI_RENDER       - 渲染 UI（由壳层实现）
 *   8. READY           - 就绪
 */

class Bootloader {
  static PHASES = Object.freeze({
    CORE_INIT: 'core_init',
    SERVICES_REGISTER: 'services_register',
    SERVICES_INIT: 'services_init',
    TOOLS_REGISTER: 'tools_register',
    HANDLERS_INIT: 'handlers_init',
    CONFIG_LOAD: 'config_load',
    UI_RENDER: 'ui_render',
    READY: 'ready'
  });

  static PHASE_ORDER = [
    Bootloader.PHASES.CORE_INIT,
    Bootloader.PHASES.SERVICES_REGISTER,
    Bootloader.PHASES.SERVICES_INIT,
    Bootloader.PHASES.TOOLS_REGISTER,
    Bootloader.PHASES.HANDLERS_INIT,
    Bootloader.PHASES.CONFIG_LOAD,
    Bootloader.PHASES.UI_RENDER,
    Bootloader.PHASES.READY
  ];

  /**
   * @param {Kernel} kernel - 内核实例
   */
  constructor(kernel) {
    this.kernel = kernel;
    this.currentPhase = null;
    this.phaseHooks = new Map(); // phase → Set<hook>
    this.phaseResults = new Map(); // phase → result
    this._phaseTimings = [];
  }

  /**
   * 注册指定阶段的钩子
   * @param {string} phase - Bootloader.PHASES.*
   * @param {Function} hook - async (bootloader) => void
   */
  on(phase, hook) {
    if (!this.phaseHooks.has(phase)) {
      this.phaseHooks.set(phase, []);
    }
    this.phaseHooks.get(phase).push(hook);
    return this;
  }

  /**
   * 执行启动流程
   * @returns {Promise<void>}
   */
  async boot() {
    const kernel = this.kernel;
    kernel.log && kernel.log.info('BOOT', 'Bootloader starting...');

    for (const phase of Bootloader.PHASE_ORDER) {
      this.currentPhase = phase;
      const startTime = Date.now();

      kernel.log && kernel.log.info('BOOT', `Phase: ${phase}`);

      try {
        // 执行当前阶段的所有钩子
        await this._runPhaseHooks(phase);

        const duration = Date.now() - startTime;
        this._phaseTimings.push({ phase, duration });
        this.phaseResults.set(phase, { status: 'completed', duration });

        kernel.log && kernel.log.info('BOOT', `Phase "${phase}" completed in ${duration}ms`);
      } catch (error) {
        const duration = Date.now() - startTime;
        this._phaseTimings.push({ phase, duration });
        this.phaseResults.set(phase, { status: 'failed', duration, error: error.message });

        kernel.log && kernel.log.error('BOOT', `Phase "${phase}" failed after ${duration}ms`, error);
        throw error;
      }
    }

    this.currentPhase = Bootloader.PHASES.READY;
    kernel.log && kernel.log.info('BOOT', 'Bootloader complete');
  }

  /**
   * 运行指定阶段的所有钩子
   * @private
   */
  async _runPhaseHooks(phase) {
    const hooks = this.phaseHooks.get(phase) || [];
    for (const hook of hooks) {
      await hook(this);
    }
  }

  /**
   * 获取启动计时
   * @returns {Array}
   */
  getTimings() {
    return [...this._phaseTimings];
  }

  /**
   * 获取启动结果
   * @returns {Object}
   */
  getResults() {
    const results = {};
    this.phaseResults.forEach((val, phase) => {
      results[phase] = val;
    });
    return results;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Bootloader;
}
if (typeof window !== 'undefined') {
  window.Bootloader = Bootloader;
}
