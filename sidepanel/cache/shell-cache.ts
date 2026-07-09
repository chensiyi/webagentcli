/**
 * Shell 本地数据缓存层（sidepanel 侧）
 *
 * 目标：在 Shell 侧为跨进程 RPC 只读查询加一层内存缓存，避免重复的全量拉取
 * （尤其 getCurrent / list 这类大 payload），并通过「失效 + 差量 patch」配合
 * Kernel 事件，将不必要的 IO 降到最低。
 *
 * 设计要点：
 * - 按作用域（scope）分别缓存：session（当前会话视图）、sessionList、settings、tools、scripts。
 * - 读方法在命中缓存且未失效时直接返回，零 RPC。
 * - 写操作后由调用方调用 invalidate(scope) 标记失效；需要立即反映的再 force 重拉。
 * - 加载约定：页面（重）加载入口一律 force=true 全量获取并把结果写回缓存（保证 reload 后是权威最新态）；
 *   页内再次拉取（如打开工具面板）不传 force，走缓存；标脏（invalidate）后下一次读取自动重拉。
 * - 列表支持 patchSessionList(id, patch) 做差量更新（配合 Kernel SESSION_UPDATED 携带的
 *   index 视图），零 RPC。
 *
 * 统一契约（关键）：所有 get* 方法都「原样透传」对应 facade 的返回形态，不做任何拆包——
 *   - 单值类：getCurrentSession() 返回 sessionView { session, messages, reasoningEffort }；
 *             getSettings() 返回裸 settings 对象（facade 即返回裸对象）。
 *   - 列表类：getSessionList() 返回 { sessions }、getTools() 返回 { tools }、
 *             getScripts() 返回 { scripts }（与 facade 的 { sessions }/{ tools }/{ scripts } 一致）。
 *   这样消费端（applyCurrentSession/applyToolList/sortSessions 等）可直接消费，无需二次拆包/重包，
 *   patch* 差量方法也返回与对应 get* 完全相同的最终形态，全层只有一种契约。
 *
 * 注意：本模块是纯 TS 设施（非 Svelte runes）。页面把取回的结果赋值给自己的 $state，
 * 因此缓存本身无需响应式——差量 patch 后由调用方同步刷新本地 $state 即可。
 */

import type { KernelAPIContract } from '../api-contract.js';

export type CacheScope = 'session' | 'sessionList' | 'settings' | 'tools' | 'scripts';

interface Entry<T> {
  value: T;
  dirty: boolean;
}

export class ShellDataCache {
  private api: KernelAPIContract;
  private store: Record<CacheScope, Entry<any> | undefined> = {
    session: undefined,
    sessionList: undefined,
    settings: undefined,
    tools: undefined,
    scripts: undefined,
  };

  constructor(api: KernelAPIContract) {
    this.api = api;
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
  getCurrentSession(force = false) {
    return this._read('session', () => this.api.session.getCurrent() as any, force);
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

  // ---------- 脚本 ----------
  /** 透传 facade 形态：返回 { scripts }。 */
  getScripts(force = false) {
    return this._read('scripts', async () => {
      const data: any = await this.api.scripts.list();
      return { scripts: (data?.scripts as any[]) || [] };
    }, force);
  }
  invalidateScripts() {
    const e = this.store.scripts;
    if (e) e.dirty = true;
  }

  /** 全部作用域失效（如内核重启 / 用户登出等场景）。 */
  invalidateAll() {
    (Object.keys(this.store) as CacheScope[]).forEach((k) => {
      const e = this.store[k];
      if (e) e.dirty = true;
    });
  }
}
