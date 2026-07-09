/**
 * RPC — 跨进程远程调用层（重设计版）
 *
 * 设计目标：
 * 1. 请求/响应通过【单一事件名 + 请求 ID 关联】，彻底消灭旧版「请求名 == 响应名」
 *    导致的无限递归爆栈问题（如 rpc:tool:list 既当请求又当响应）。
 * 2. Shell 端 RPCClient.call(method, params) 返回 Promise，自动关联响应、超时、错误回传。
 * 3. Kernel 端 RPCServer.register(method, handler) 集中分发，handler 抛错也会以错误响应回传，
 *    不再静默失败。
 * 4. 所有跨进程数据由 IPCTransport 在边界统一 sanitize（见 serialize.ts），永不出现
 *    "Could not serialize message"。
 *
 * 使用：
 *   // Shell 端（通过 Svelte context 拿 api 代理）
 *   const data = await api.settings.getSettings();            // → { ...settings }
 *   await api.settings.saveSettings(settings);                // 写入
 *
 *   // Kernel 端（background/main.ts READY 阶段）
 *   const rpcServer = new RPCServer(kernelIpc);
 *   rpcServer.expose('settings', kernel.getSettingsManager(), { methods: ['getSettings','saveSettings'] });
 */

import { IPC } from 'kernel/IPC.js';
import { Log } from 'kernel/services/Log.js';

// ─── Shell → Kernel 请求方法名 ───
// 方法名不再由枚举集中定义，而是由 RPCServer.expose(service, impl) 自动注册为
// `${service}.${method}`（如 'session.getCurrent'）。客户端用 createApiClient 出的代理
// api.service.method(...) 调用，服务面类型见 sidepanel/api-contract.ts。

// ─── 传输信封事件名（所有 RPC 共用，靠 id 区分请求） ───

export const RPC_REQUEST = 'rpc:request';
export const RPC_RESPONSE = 'rpc:response';

export interface RpcRequest {
  id: string;
  method: string;
  params: any;
}

export interface RpcError {
  message: string;
  stack?: string;
}

export interface RpcResponse {
  id: string;
  ok: boolean;
  result?: any;
  error?: RpcError;
}

// ─── 标准外部访问接口：按契约自动注册 / 自动代理 ───

/**
 * expose 的能力监测钩子：仅要求一个 audit 方法（结构类型，避免 bridge 反向依赖 kernel）。
 * 后期结合 CapabilityManager：在每个远程调用处审计「谁调了什么方法」，per-method 能力映射作为数据填充。
 */
export interface RpcCapabilityHook {
  audit(action: string, key: string, capabilities: string[], result: boolean, ctx?: Record<string, unknown>): void;
}

export interface ExposeOptions {
  /** 只允许暴露的方法名白名单；省略则自动收集 impl 上所有函数属性（排除内部/基础设施方法） */
  methods?: string[];
  /**
   * 能力监测钩子（CapabilityManager 实例即可），每次调用前触发 audit 审计。
   * ⚠️ 待开发：CapabilityManager 暂未落地鉴权，仅作预留能力管理接口；
   * TS 格式检查不强制全仓覆盖，故在传参时填写此钩子以辅助类型与属性检查。
   */
  capabilities?: RpcCapabilityHook | null;
}

/** expose 默认收集时排除的内部 / 基础设施方法（不应被远程调用） */
const RPC_EXPOSE_DENY = new Set([
  'constructor', 'init', 'shutdown', 'destroy', 'initialize', 'loadSettings',
  'ipc', 'storage', 'kernel', 'log', 'scriptsChannel', 'toolsManager', 'capabilities',
  'toJSON', 'emit', 'on', 'off', 'use', 'getOrCreateChannel', 'getLogger',
]);

/** 收集对象（含原型链）上的函数属性名，排除 RPC_EXPOSE_DENY */
function collectExposeMethods(impl: any): string[] {
  const out = new Set<string>();
  let proto = impl;
  while (proto && proto !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (RPC_EXPOSE_DENY.has(k)) continue;
      if (typeof impl[k] === 'function') out.add(k);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...out];
}

// ─── Shell 端：Promise 化的调用方 ───

export class RPCClient {
  private pending = new Map<
    string,
    { resolve: (v: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private seq = 0;
  private timeoutMs: number;

  constructor(private ipc: IPC, timeoutMs = 20000) {
    this.timeoutMs = timeoutMs;
    this.ipc.on(RPC_RESPONSE, this._onResponse);
  }

  /** 发起一次 RPC 调用，返回 Promise（响应到达或超时/出错时 settle）。 */
  call<T = any>(method: string, params?: any): Promise<T> {
    const id = `${Date.now().toString(36)}-${(++this.seq).toString(36)}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method} (${id})`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.ipc.emit(RPC_REQUEST, { id, method, params: params ?? null });
    });
  }

  private _onResponse = (payload: any) => {
    if (!payload || typeof payload.id !== 'string') return;
    const entry = this.pending.get(payload.id);
    if (!entry) return; // 迟到/未知响应，忽略
    clearTimeout(entry.timer);
    this.pending.delete(payload.id);
    if (payload.ok) entry.resolve(payload.result);
    else entry.reject(new Error(payload.error?.message || 'RPC error'));
  };

  destroy() {
    this.ipc.off(RPC_RESPONSE, this._onResponse);
    this.pending.forEach((e) => clearTimeout(e.timer));
    this.pending.clear();
  }
}

// ─── Shell 侧：按契约自动出代理（api.settings.getSettings() → rpc.call('settings.getSettings', args)） ───

export function createApiClient<T extends Record<string, any> = any>(rpc: RPCClient): T {
  return new Proxy({} as T, {
    get(_t, svc: any) {
      if (typeof svc !== 'string') return undefined;
      return new Proxy({}, {
        get(_s, m: any) {
          if (typeof m !== 'string') return undefined;
          // 避免被 await/thenable 协程误当成 Promise
          if (m === 'then' || m === 'catch' || m === 'finally') return undefined;
          return (...args: any[]) => rpc.call(`${svc}.${m}`, args);
        },
      });
    },
  }) as T;
}

// ─── Kernel 端：请求分发器 ───

export class RPCServer {
  private handlers = new Map<string, (params: any) => any | Promise<any>>();

  constructor(private ipc: IPC) {
    this.ipc.on(RPC_REQUEST, this._onRequest);
  }

  register(method: string, handler: (params: any) => any | Promise<any>): void {
    this.handlers.set(method, handler);
  }

  /**
   * 按「标准外部访问接口」一键注册：把 impl 的公共方法自动暴露为 `${service}.${method}` 的 RPC。
   *
   * @param service 服务名（对应契约里的键，如 'settings'）
   * @param impl    实现对象（manager 实例），其方法会被绑定后注册
   * @param opts    methods 白名单 + capabilities 监测钩子
   *
   * 例：rpcServer.expose('settings', kernel.getSettingsManager(), { methods: ['getSettings','saveSettings'] })
   *   → 注册 'settings.getSettings' / 'settings.saveSettings'，shell 侧 api.settings.getSettings() 即可调用。
   */
  expose(service: string, impl: any, opts: ExposeOptions = {}): void {
    const methods = opts.methods && opts.methods.length ? opts.methods : collectExposeMethods(impl);
    for (const m of methods) {
      if (typeof impl?.[m] !== 'function') {
        Log.warn('RPCServer', `expose skipped (not a function): ${service}.${m}`);
        continue;
      }
      const full = `${service}.${m}`;
      if (this.handlers.has(full)) {
        Log.warn('RPCServer', `expose overwrote existing handler: ${full}`);
      }
      const fn = impl[m].bind(impl);
      const capHook = opts.capabilities && typeof (opts.capabilities as any).audit === 'function'
        ? (opts.capabilities as any).audit.bind(opts.capabilities)
        : null;
      this.register(full, async (params: any) => {
        if (capHook) {
          try { capHook('invoke', service, [m], true, {}); }
          catch (e) { Log.debug('RPCServer', `capability audit hook failed: ${service}.${m}`, e); }
        }
        const args = Array.isArray(params) ? params : (params == null ? [] : [params]);
        return fn.apply(impl, args);
      });
    }
  }

  private _onRequest = async (req: any) => {
    const id = req?.id;
    const method = req?.method;
    const params = req?.params;

    try {
      const handler = this.handlers.get(method);
      if (!handler) throw new Error(`No RPC handler for method: ${method}`);
      const result = await handler(params);
      this.ipc.emit(RPC_RESPONSE, { id, ok: true, result: result ?? null });
    } catch (err) {
      Log.error('RPCServer', `Handler failed: ${method}`, err);
      this.ipc.emit(RPC_RESPONSE, {
        id,
        ok: false,
        error: { message: (err as Error)?.message || String(err), stack: (err as Error)?.stack },
      });
    }
  };

  destroy() {
    this.ipc.off(RPC_REQUEST, this._onRequest);
    this.handlers.clear();
  }
}
