/**
 * Shell 本地数据缓存层（sidepanel 侧）
 *
 * 目标：在 Shell 侧为跨进程 RPC 只读查询加一层内存缓存，避免重复的全量拉取
 * （尤其 getCurrent / list 这类大 payload），并通过「失效 + 差量 patch」配合
 * Kernel 事件，将不必要的 IO 降到最低。
 *
 * 设计要点：
 * - 按作用域（scope）分别缓存：session（当前会话视图）、sessionList、settings、tools。
 * - 读方法在命中缓存且未失效时直接返回，零 RPC。
 * - 写穿透（核心原则）：任何更新都「先写主库（kernel/facade），再根据主库返回/回读的权威结果更新缓存」，
 *   绝不只 invalidate 等下次重拉。settings 提供 saveSettings() 写穿透（写主库后回读 getSettings 回填）；
 *   tools 的 toggle 写主库后标脏，下次读取自动从主库重拉；session 的 update 由调用方用返回结果 patch 缓存。
 * - 加载约定：每个页面（重新）打开时一律 force=true 全量获取并写回缓存（保证打开即权威最新态）；
 *   页内再次拉取（如打开工具面板）不传 force，走缓存。
 * - 应用级单例：通过 getShellCache(api) 获取，跨页面共享同一份缓存（api 本身由 Sidepanel 顶层创建一次）。
 *   页面重挂载（{#key activePage}）不会新建缓存实例，避免各页缓存态发散。
 * - 列表支持 patchSessionList(id, patch) 做差量更新（配合 Kernel SESSION_UPDATED 携带的
 *   index 视图），零 RPC。
 *
 * 统一契约（关键）：所有 get* 方法都「原样透传」对应 facade 的返回形态，不做任何拆包——
 *   - 单值类：getCurrentSession() 返回 sessionView { session, messages, reasoningEffort }；
 *             getSettings() 返回裸 settings 对象（facade 即返回裸对象）。
 *   - 列表类：getSessionList() 返回 { sessions }、getTools() 返回 { tools }。
 *   这样消费端（applyCurrentSession/applyToolList/sortSessions 等）可直接消费，无需二次拆包/重包，
 *   patch* 差量方法也返回与对应 get* 完全相同的最终形态，全层只有一种契约。
 *
 * 注意：本模块是纯 TS 设施（非 Svelte runes）。页面把取回的结果赋值给自己的 $state，
 * 因此缓存本身无需响应式——差量 patch 后由调用方同步刷新本地 $state 即可。
 */

import type { KernelAPIContract } from '../api-contract.js';
import { Log } from 'kernel/services/Log.js';

export type CacheScope = 'session' | 'sessionList' | 'settings' | 'tools';

interface Entry<T> {
  value: T;
  dirty: boolean;
}

export class ShellDataCache {
  private api: KernelAPIContract;
  /** Shell 端持有的「当前会话 id」。内核不再维护 currentSessionId，改由 Shell 临时持有。
   *  这是一个普通内存变量：切换会话时由 switch/create 显式赋值；每次 session 相关请求都把它当参数传入。 */
  private currentSessionId: string | null = null;
  private store: Record<CacheScope, Entry<any> | undefined> = {
    session: undefined,
    sessionList: undefined,
    settings: undefined,
    tools: undefined,
  };
  /**
   * 订阅者集合：UI（如 ChatPage）订阅「单例缓存自身的变更」，而非直接耦合其它页面 / IPC 消息。
   * - 广播全局最新值（saveSettings 写穿透）→ 缓存整体替换为最新值后通知，订阅者直接消费最新值；
   * - 差量更新（patchSettings）→ 缓存内先差量合并，再通知，订阅者拿到合并后的最新值。
   * 两种模式下订阅者都只「读取权威缓存」，不关心更新是广播还是差量。
   */
  private subscribers: Record<CacheScope, Set<(value: any) => void>> = {
    session: new Set(),
    sessionList: new Set(),
    settings: new Set(),
    tools: new Set(),
  };

  constructor(api: KernelAPIContract) {
    this.api = api;
  }

  /**
   * 订阅某作用域的缓存变更。返回退订函数（ChatPage 在 onDestroy 时调用，避免 {#key activePage} 重挂载叠加幽灵监听器）。
   */
  subscribe(scope: CacheScope, cb: (value: any) => void): () => void {
    this.subscribers[scope].add(cb);
    return () => { this.subscribers[scope].delete(cb); };
  }

  private _notify(scope: CacheScope, value?: any) {
    this.subscribers[scope].forEach((cb) => {
      try { cb(value); } catch (e) { Log.warn('ShellDataCache', 'subscriber error', { scope, err: (e as Error)?.message }); }
    });
  }

  private _entry<T>(scope: CacheScope): Entry<T> | undefined {
    return this.store[scope] as Entry<T> | undefined;
  }

  private async _read<T>(scope: CacheScope, loader: () => Promise<T>, force = false): Promise<T> {
    const entry = this._entry<T>(scope);
    if (!force && entry && !entry.dirty && entry.value !== undefined) {
      return entry.value;
    }
    const value = await loader();
    this.store[scope] = { value, dirty: false };
    return value;
  }

  // ---------- 当前会话视图 ----------
  /** Shell 持有的当前会话 id（内核不再维护 currentSessionId）。 */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /** 设定当前会话 id（普通内存变量，不做任何持久化）。 */
  setCurrentSessionId(id: string | null): void {
    this.currentSessionId = id;
  }

  /**
   * 启动引导：仅在会话 id 从未被显式确定（切换/新建）过时，做一次兜底初始化。
   * 无持久化：冷启动直接取「会话列表首个（最近更新）」；列表为空则新建一个临时会话。
   * 一旦被设置（非 null）即严格沿用，绝不在挂载时二次校验或回退——否则会表现为「切换无效、锁死在旧会话」。
   */
  async ensureCurrentSession(): Promise<void> {
    if (this.currentSessionId) {
      return; // 已确定（切换/新建维护）→ 直接沿用
    }
    const list: any = await this.api.session.list();
    const sessions: any[] = list?.sessions || [];
    let target: string | null = null;
    if (sessions.length > 0) target = sessions[0].id;
    else {
      const created: any = await this.api.session.create();
      target = created?.session?.id || null;
    }
    this.setCurrentSessionId(target);
  }

  getCurrentSession(force = false) {
    return this._read('session', () => this.api.session.getCurrent({ sessionId: this.currentSessionId }) as any, force);
  }
  /** 标记当前会话缓存失效（下次读取会触发一次 RPC）。不主动发起请求。 */
  invalidateSession() {
    const e = this.store.session;
    if (e) e.dirty = true;
  }
  /** 用已知新值差量更新当前会话缓存（如本标签页发起的 update 已本地改），零 RPC。 */
  patchCurrentSession(patch: Record<string, unknown>) {
    const e = this.store.session;
    if (e && e.value) {
      e.value = { ...e.value, ...patch };
      e.dirty = false;
    }
  }

  // ---------- 会话列表 ----------
  /** 透传 facade 形态：返回 { sessions }。 */
  getSessionList(force = false) {
    return this._read('sessionList', async () => {
      const data: any = await this.api.session.list();
      return { sessions: (data?.sessions as any[]) || [] };
    }, force);
  }
  invalidateSessionList() {
    const e = this.store.sessionList;
    if (e) e.dirty = true;
  }
  /**
   * 差量更新列表中的单个会话（配合 Kernel SESSION_UPDATED 携带的 index 视图），零 RPC。
   * 返回与 getSessionList 完全相同的最终形态 { sessions }，便于调用方直接刷新本地 $state。
   */
  patchSessionList(sessionId: string, patch: Record<string, unknown>): { sessions: any[] } {
    const e = this.store.sessionList;
    const current = (e?.value?.sessions as any[]) || [];
    if (!e || !Array.isArray(e.value?.sessions)) return { sessions: current };
    const next = (e.value.sessions as any[]).map((s) => (s && s.id === sessionId ? { ...s, ...patch } : s));
    e.value = { sessions: next };
    e.dirty = false;
    return { sessions: next };
  }

  // ---------- 设置 ----------
  getSettings(force = false) {
    return this._read('settings', () => this.api.settings.getSettings() as any, force);
  }
  invalidateSettings() {
    const e = this.store.settings;
    if (e) e.dirty = true;
  }
  /** 差量合并设置缓存（如本地已知的新值）。合并完成后通知订阅者（拿到差量合并后的最新值）。 */
  patchSettings(patch: Record<string, unknown>) {
    const e = this.store.settings;
    if (e && e.value) {
      e.value = { ...(e.value as object), ...patch };
      e.dirty = false;
      this._notify('settings', e.value);
    }
  }
  /**
   * 写穿透：先把设置写入主库（kernel），再回读主库权威结果并回填缓存。
   * 这是「更新必须击穿缓存」原则的实现——绝不只 invalidate 等下次重拉。
   * 回填后广播全局最新值给订阅者（UI 直接替换为最新值，无需回源 RPC）。
   * 返回回读的权威 settings（裸对象），供调用方同步 UI。
   */
  async saveSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.api.settings.saveSettings(settings);
    const fresh: any = await this.api.settings.getSettings();
    this.store.settings = { value: fresh, dirty: false };
    this._notify('settings', fresh);
    return fresh || {};
  }

  // ---------- 工具 ----------
  /** 透传 facade 形态：返回 { tools }（与 applyToolList 期望一致，可直接消费）。 */
  getTools(force = false) {
    return this._read('tools', async () => {
      const data: any = await this.api.tools.list();
      return { tools: (data?.tools as any[]) || [] };
    }, force);
  }
  invalidateTools() {
    const e = this.store.tools;
    if (e) e.dirty = true;
  }
  /**
   * 写穿透：切换工具启用状态。facade 不返回最新列表，故写主库后标脏，
   * 下次 getTools 自动从主库重拉（缓存最终仍反映主库权威态）。
   */
  async toggleTool(name: string, enabled: boolean) {
    await this.api.tools.toggle({ name, enabled });
    this.invalidateTools();
  }

  /** 全部作用域失效（如内核重启 / 用户登出等场景）。 */
  invalidateAll() {
    (Object.keys(this.store) as CacheScope[]).forEach((k) => {
      const e = this.store[k];
      if (e) e.dirty = true;
    });
  }
}

// 应用级单例（跨页面共享）。api 由 Sidepanel 顶层创建一次并注入 context，所有页面复用同一实例。
//
// 关键坑（切换会话失效的根因）：本模块若被打包进「多份」（如不同页面用不同 import 形式——
// 别名 `sidepanel/cache/shell-cache.js` 与相对 `../cache/shell-cache.js` 在部分打包配置下会解析成
// 两个模块记录），每个副本各自持有独立的模块级 `_instance`，于是「单例」实际有多个，
// 各页面拿到的 ShellDataCache 实例不同 → currentSessionId 互不连通 → 切换会话永远落到旧会话。
// 因此把唯一实例锚定在 globalThis 上：无论模块被求值几次，全局只有一份，彻底消除该问题。
const GLOBAL_CACHE_KEY = '__wac_shell_cache_instance__';
export function getShellCache(api: KernelAPIContract): ShellDataCache {
  const g = globalThis as unknown as Record<string, ShellDataCache>;
  if (!g[GLOBAL_CACHE_KEY]) g[GLOBAL_CACHE_KEY] = new ShellDataCache(api);
  return g[GLOBAL_CACHE_KEY];
}
