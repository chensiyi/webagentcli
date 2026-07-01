/**
 * Kernel - 核心内核
 * 
 * 职责：
 * - 服务注册表：管理所有服务的注册、懒加载、生命周期
 * - 承载内核子系统引用（IPC / ToolRegistry / CapabilityManager）
 * - 提供统一的 boot() / shutdown() 生命周期
 * - 零外部依赖，可在任何 JS 环境运行
 * 
 * 设计原则：
 * - 内核最小化：只做服务注册、消息路由、生命周期
 * - 所有业务逻辑在 Service 层，Kernel 不执行业务
 * - Kernel 不持有 window、chrome.*、document 引用
 */
import { IStorageManager } from './services/IStorageManager.js';
import { IPC } from './IPC.js';
import { Log } from './services/Log.js';
import { ToolRegistry } from './ToolRegistry.js';
import { CapabilityManager } from './CapabilityManager.js';
import { ProviderFactory } from './services/ProviderFactory.js';
import { ProcessManager } from './services/ProcessManager.js';
import { ScriptsManager } from './services/ScriptsManager.js';
import { SessionManager } from './services/SessionManager.js';
import { SettingsManager } from './services/SettingsManager.js';

export class Kernel {
  static STATE = Object.freeze({ CREATED: 'created', BOOTING: 'booting', RUNNING: 'running', SHUTTING_DOWN: 'shutting_down', SHUTDOWN: 'shutdown', FAILED: 'failed' });

  name: string;
  state: string;
  origin: string;
  ipc: IPC | null;
  storage: IStorageManager | null;
  toolRegistry: ToolRegistry | null;
  capabilities: CapabilityManager | null;
  private _services: Map<string, { factory: unknown; instance: unknown; options: Record<string, unknown> }>;
  private _hooks: { beforeBoot: unknown[]; afterBoot: unknown[]; beforeShutdown: unknown[]; afterShutdown: unknown[] };
  private _bootOrder: string[];

  constructor(options: { name?: string; origin?: string; ipc?: IPC | null; storage?: IStorageManager | null; toolRegistry?: ToolRegistry | null; capabilities?: CapabilityManager | null } = {}) {
    this.name = options.name || 'kernel';
    this.state = Kernel.STATE.CREATED;
    this.origin = options.origin || 'kernel';
    this.ipc = options.ipc || null;
    this.storage = options.storage || null;
    this.toolRegistry = options.toolRegistry || null;
    this.capabilities = options.capabilities || null;
    this._services = new Map();
    this._hooks = { beforeBoot: [], afterBoot: [], beforeShutdown: [], afterShutdown: [] };
    this._bootOrder = [];
  }

  async boot() {
    if (this.state !== Kernel.STATE.CREATED) throw new Error(`[Kernel] Cannot boot: current state is "${this.state}"`);
    this.state = Kernel.STATE.BOOTING;
    Log.info('KERNEL', 'Booting kernel...');
    try {
      await this._runHooks('beforeBoot');
      for (const [name, entry] of this._services) {
        if (entry.options.autoInit !== false) {
          Log.debug('KERNEL', `Initializing service: ${name}`);
          await this._initService(name, entry);
          this._bootOrder.push(name);
        }
      }
      await this._runHooks('afterBoot');
      this.state = Kernel.STATE.RUNNING;
      Log.info('KERNEL', `Kernel booted. Services: ${this._services.size} registered, ${this._bootOrder.length} initialized`);
    } catch (error) {
      this.state = Kernel.STATE.FAILED;
      Log.error('KERNEL', 'Kernel boot failed', error);
      throw error;
    }
  }

  async shutdown() {
    if (this.state !== Kernel.STATE.RUNNING) return;
    this.state = Kernel.STATE.SHUTTING_DOWN;
    Log.info('KERNEL', 'Shutting down kernel...');
    try {
      await this._runHooks('beforeShutdown');
      const initialized = Array.from(this._services.entries()).filter(([, e]) => e.instance !== null);
      for (const [name, entry] of initialized.reverse()) {
        if (entry.instance && typeof entry.instance.shutdown === 'function') {
          Log.debug('KERNEL', `Shutting down service: ${name}`);
          try { await entry.instance.shutdown(); } catch (e) { Log.warn('KERNEL', `Service "${name}" shutdown error`, e); }
        }
        entry.instance = null;
      }
      await this._runHooks('afterShutdown');
      this.toolRegistry?.destroy(); this.capabilities?.destroy(); this.ipc?.destroy(); Log.getLogger()?.destroy();
      this.state = Kernel.STATE.SHUTDOWN;
      Log.info('KERNEL', 'Kernel shutdown complete');
    } catch (error) {
      this.state = Kernel.STATE.FAILED;
      Log.error('KERNEL', 'Kernel shutdown failed', error);
      throw error;
    }
  }

  register(name, factory, options = {}) {
    if (this._services.has(name)) throw new Error(`[Kernel] Service "${name}" already registered`);
    if (this.state !== Kernel.STATE.CREATED && this.state !== Kernel.STATE.BOOTING) throw new Error(`[Kernel] Cannot register service "${name}" after boot`);
    this._services.set(name, { factory, instance: null, options: { autoInit: true, singleton: true, dependsOn: [], ...options } });
    Log.debug('KERNEL', `Service registered: ${name}`);
    return this;
  }

  get(name) {
    const entry = this._services.get(name);
    if (!entry) throw new Error(`[Kernel] Service "${name}" not registered`);
    return entry.instance;
  }

  has(name) { return this._services.has(name); }
  getServiceNames() { return Array.from(this._services.keys()); }
  getAllServices() { const r = new Map(); this._services.forEach((e, n) => { if (e.instance !== null) r.set(n, e.instance); }); return r; }

  on(phase, hook) {
    if (!this._hooks[phase]) throw new Error(`[Kernel] Unknown phase: "${phase}"`);
    this._hooks[phase].push(hook);
    return this;
  }

  async _initService(name, entry) {
    if (entry.instance !== null) return;
    const { factory, options } = entry;
    if (options.dependsOn?.length) {
      for (const dep of options.dependsOn) {
        const depEntry = this._services.get(dep);
        if (!depEntry) throw new Error(`[Kernel] Service "${name}" depends on "${dep}"`);
        await this._initService(dep, depEntry);
      }
    }
    entry.instance = typeof factory === 'function' ? await factory(this) : factory;
    if (entry.instance && typeof entry.instance.init === 'function') await entry.instance.init(this);
  }

  async _runHooks(phase) {
    for (const hook of this._hooks[phase] || []) { try { await hook(this); } catch (e) { Log.error('KERNEL', `Hook error in "${phase}"`, e); throw e; } }
  }

  getInfo() {
    return {
      state: this.state, origin: this.origin,
      services: { total: this._services.size, initialized: Array.from(this._services.values()).filter(e => e.instance !== null).length, names: this.getServiceNames(), bootOrder: [...this._bootOrder] },
      subsystems: { hasIPC: this.ipc !== null, hasLog: true, hasToolRegistry: this.toolRegistry !== null, hasCapabilities: this.capabilities !== null }
    };
  }

  getSessionManager() : SessionManager { return this.get('sessionManager') as SessionManager; }
  getSettingsManager() : SettingsManager { return this.get('settingsManager') as SettingsManager; }
  getStorageManager() : IStorageManager { return this.get('storageManager') as IStorageManager; }
  getScriptsManager() : ScriptsManager { return this.get('scriptsManager') as ScriptsManager; }
  getProcessManager() : ProcessManager { return this.get('processManager') as ProcessManager; }
  getProviderFactory() : ProviderFactory { return this.get('providerFactory') as ProviderFactory; }
  getIPC() { return this.ipc; }
}