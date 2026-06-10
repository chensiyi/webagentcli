/**
 * Kernel - 核心内核
 * 
 * 职责：
 * - 服务注册表：管理所有服务的注册、懒加载、生命周期
 * - 承载内核子系统引用（IPC / ToolRegistry / CapabilityManager / KernelLog）
 * - 提供统一的 boot() / shutdown() 生命周期
 * - 零外部依赖，可在任何 JS 环境运行
 * 
 * 设计原则：
 * - 内核最小化：只做服务注册、消息路由、生命周期
 * - 所有业务逻辑在 Service 层，Kernel 不执行业务
 * - Kernel 不持有 window、chrome.*、document 引用
 */

class Kernel {
  /**
   * @param {Object} [options]
   * @param {IPC} [options.ipc] - 可注入外部 IPC 实例
   * @param {KernelLog} [options.log] - 可注入外部日志实例
   * @param {string} [options.origin] - 内核来源标识
   */
  constructor(options = {}) {
    // 状态
    this.state = Kernel.STATE.CREATED;
    this.origin = options.origin || 'kernel';

    // 内核子系统（由 Kernel 或 Bootloader 初始化）
    this.log = options.log || null;
    this.ipc = options.ipc || null;
    this.toolRegistry = null;
    this.capabilities = null;

    // 服务注册表：name → { factory, instance, options }
    this._services = new Map();
    // 生命周期的钩子
    this._hooks = {
      beforeBoot: [],
      afterBoot: [],
      beforeShutdown: [],
      afterShutdown: []
    };
    // 存储每个阶段初始化的服务名
    this._bootOrder = [];
  }

  // ==================== 状态 ====================

  static STATE = Object.freeze({
    CREATED: 'created',
    BOOTING: 'booting',
    RUNNING: 'running',
    SHUTTING_DOWN: 'shutting_down',
    SHUTDOWN: 'shutdown',
    FAILED: 'failed'
  });

  // ==================== 生命周期 ====================

  /**
   * 启动内核
   * 按注册顺序执行服务的初始化
   * @returns {Promise<void>}
   */
  async boot() {
    if (this.state !== Kernel.STATE.CREATED) {
      throw new Error(`[Kernel] Cannot boot: current state is "${this.state}"`);
    }

    this.state = Kernel.STATE.BOOTING;
    this.log && this.log.info('KERNEL', 'Booting kernel...');

    try {
      // 1. 运行 beforeBoot 钩子
      await this._runHooks('beforeBoot');

      // 2. 初始化所有已注册的服务
      for (const [name, entry] of this._services) {
        if (entry.options.autoInit !== false) {
          this.log && this.log.debug('KERNEL', `Initializing service: ${name}`);
          await this._initService(name, entry);
          this._bootOrder.push(name);
        }
      }

      // 3. 运行 afterBoot 钩子
      await this._runHooks('afterBoot');

      this.state = Kernel.STATE.RUNNING;
      this.log && this.log.info('KERNEL', `Kernel booted. Services: ${this._services.size} registered, ${this._bootOrder.length} initialized`);
    } catch (error) {
      this.state = Kernel.STATE.FAILED;
      this.log && this.log.error('KERNEL', 'Kernel boot failed', error);
      throw error;
    }
  }

  /**
   * 关闭内核
   * 逆序关闭所有服务
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.state !== Kernel.STATE.RUNNING) return;

    this.state = Kernel.STATE.SHUTTING_DOWN;
    this.log && this.log.info('KERNEL', 'Shutting down kernel...');

    try {
      await this._runHooks('beforeShutdown');

      // 逆序关闭已初始化的服务
      const initialized = Array.from(this._services.entries())
        .filter(([, e]) => e.instance !== null);
      
      for (const [name, entry] of initialized.reverse()) {
        if (entry.instance && typeof entry.instance.shutdown === 'function') {
          this.log && this.log.debug('KERNEL', `Shutting down service: ${name}`);
          try {
            await entry.instance.shutdown();
          } catch (e) {
            this.log && this.log.warn('KERNEL', `Service "${name}" shutdown error`, e);
          }
        }
        entry.instance = null;
      }

      await this._runHooks('afterShutdown');

      // 销毁内核子系统
      if (this.toolRegistry) this.toolRegistry.destroy();
      if (this.capabilities) this.capabilities.destroy();
      if (this.ipc) this.ipc.destroy();
      if (this.log) this.log.destroy();

      this.state = Kernel.STATE.SHUTDOWN;
      this.log && this.log.info('KERNEL', 'Kernel shutdown complete');
    } catch (error) {
      this.state = Kernel.STATE.FAILED;
      this.log && this.log.error('KERNEL', 'Kernel shutdown failed', error);
      throw error;
    }
  }

  // ==================== 服务注册 ====================

  /**
   * 注册一个服务工厂
   * @param {string} name - 服务名称（唯一）
   * @param {Function|Object} factory - 工厂函数 (kernel) => instance，或直接是服务实例
   * @param {Object} [options]
   * @param {boolean} [options.autoInit=true] - 是否在 boot() 时自动初始化
   * @param {boolean} [options.singleton=true] - 是否为单例
   * @param {string[]} [options.dependsOn] - 依赖的服务名称列表
   */
  register(name, factory, options = {}) {
    if (this._services.has(name)) {
      throw new Error(`[Kernel] Service "${name}" already registered`);
    }
    if (this.state !== Kernel.STATE.CREATED && this.state !== Kernel.STATE.BOOTING) {
      throw new Error(`[Kernel] Cannot register service "${name}" after boot`);
    }

    this._services.set(name, {
      factory,
      instance: null,
      options: {
        autoInit: true,
        singleton: true,
        dependsOn: [],
        ...options
      }
    });

    this.log && this.log.debug('KERNEL', `Service registered: ${name}`);
    return this;
  }

  /**
   * 获取服务实例（懒加载）
   * @param {string} name - 服务名称
   * @returns {*} 服务实例
   */
  get(name) {
    const entry = this._services.get(name);
    if (!entry) {
      throw new Error(`[Kernel] Service "${name}" not registered`);
    }
    return entry.instance;
  }

  /**
   * 检查服务是否已注册
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this._services.has(name);
  }

  /**
   * 获取所有已注册服务的名称
   * @returns {string[]}
   */
  getServiceNames() {
    return Array.from(this._services.keys());
  }

  /**
   * 获取所有已初始化的服务实例
   * @returns {Map<string, *>}
   */
  getAllServices() {
    const result = new Map();
    this._services.forEach((entry, name) => {
      if (entry.instance !== null) {
        result.set(name, entry.instance);
      }
    });
    return result;
  }

  // ==================== 钩子管理 ====================

  /**
   * 注册生命周期钩子
   * @param {'beforeBoot'|'afterBoot'|'beforeShutdown'|'afterShutdown'} phase
   * @param {Function} hook - async function(kernel) => void
   */
  on(phase, hook) {
    if (!this._hooks[phase]) {
      throw new Error(`[Kernel] Unknown phase: "${phase}"`);
    }
    this._hooks[phase].push(hook);
    return this;
  }

  // ==================== 内部方法 ====================

  /**
   * 初始化单个服务
   * @private
   */
  async _initService(name, entry) {
    // 如果已初始化，跳过
    if (entry.instance !== null) return;

    const { factory, options } = entry;

    // 先初始化依赖
    if (options.dependsOn && options.dependsOn.length > 0) {
      for (const depName of options.dependsOn) {
        const depEntry = this._services.get(depName);
        if (!depEntry) {
          throw new Error(`[Kernel] Service "${name}" depends on "${depName}", but it's not registered`);
        }
        await this._initService(depName, depEntry);
      }
    }

    // 创建实例
    if (typeof factory === 'function') {
      entry.instance = await factory(this);
    } else {
      entry.instance = factory;
    }

    // 如果实例有 init 方法，调用它
    if (entry.instance && typeof entry.instance.init === 'function') {
      await entry.instance.init(this);
    }
  }

  /**
   * 运行指定阶段的所有钩子
   * @private
   */
  async _runHooks(phase) {
    const hooks = this._hooks[phase] || [];
    for (const hook of hooks) {
      try {
        await hook(this);
      } catch (error) {
        this.log && this.log.error('KERNEL', `Hook error in phase "${phase}"`, error);
        throw error;
      }
    }
  }

  /**
   * 获取内核信息
   * @returns {Object}
   */
  getInfo() {
    return {
      state: this.state,
      origin: this.origin,
      services: {
        total: this._services.size,
        initialized: Array.from(this._services.values()).filter(e => e.instance !== null).length,
        names: this.getServiceNames(),
        bootOrder: [...this._bootOrder]
      },
      subsystems: {
        hasIPC: this.ipc !== null,
        hasLog: this.log !== null,
        hasToolRegistry: this.toolRegistry !== null,
        hasCapabilities: this.capabilities !== null
      }
    };
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Kernel;
}
if (typeof window !== 'undefined') {
  window.Kernel = Kernel;
}
