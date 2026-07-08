/**
 * KernelAPI — kernel 对外「标准访问接口契约」（纯 interface）
 *
 * 用途：
 * - kernel 侧：各 manager 实现对应契约（如 SettingsManager 实现 SettingsServiceContract），
 *   通过 RPCServer.expose(service, impl) 一键注册为 RPC 方法。
 * - shell 侧：createApiClient<KernelAPIContract>(rpc) 按同一份契约自动出代理，
 *   直接用 api.settings.getSettings() 调用，类型与 kernel 侧完全一致。
 *
 * 这是「标准外部访问接口定义」的单一真相源。方法名约定为 service.method（camelCase），
 * 与旧 RPC.SETTINGS_GET = 'settings.get' 同一命名空间，但更贴近对象方法名、且不再需要手写枚举。
 *
 * 设计要点：
 * - 契约方法名必须与 manager 的真实公共方法名一致（expose 按方法名直接绑定）。
 * - 仅声明「对外可访问」的方法，内部方法（initialize / addMessage / streamChunk / 事件发射等）
 *   不进入契约，避免被远程误调。
 * - 后期结合能力监测模块：RPCServer.expose 在每个调用外包一层 capabilities.audit 钩子，
 *   per-method 能力映射作为数据后期填充（见 RPCServer.expose 的 capabilities 选项）。
 */

import type { Settings } from '../models/Settings.js';
import type { Session } from '../models/Session.js';
import type { UserScript } from '../models/Scripts.js';

/** 设置服务：对外暴露的访问接口 */
export interface SettingsServiceContract {
  getSettings(): Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): Promise<void>;
  getSetting(key: string): unknown;
  saveSetting(key: string, value: unknown): Promise<unknown>;
  resetSettings(): void;
}

/** 会话服务：对外暴露的访问接口（内部消息增删改由 ChatProgram 直接走 manager，不在此暴露） */
export interface SessionServiceContract {
  getCurrentSession(): Session | null;
  getSession(id: string): Session | null;
  getAllSessions(): Session[];
  createSession(opts?: Record<string, unknown>): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  setCurrentSession(id: string): Promise<void>;
  updateSession(id: string, updater: ((s: Session) => void) | Record<string, unknown>): Promise<void>;
  deleteMessage(messageId: string, sessionId: string): Promise<boolean>;
  clearMessages(sessionId: string): Promise<void>;
}

/** 用户脚本服务：对外暴露的访问接口 */
export interface ScriptsServiceContract {
  loadAll(): Promise<UserScript[]>;
  install(code: string): Promise<UserScript>;
  edit(id: string, code: string): Promise<void>;
  toggle(id: string, enabled: boolean): Promise<void>;
  uninstall(id: string): Promise<void>;
}

/** 存储服务：对外暴露的访问接口 */
export interface StorageServiceContract {
  getAll(): Promise<Array<[string, unknown]>>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

/** 聚合契约：kernel 对外暴露的全部服务面 */
export interface KernelAPIContract {
  settings: SettingsServiceContract;
  session: SessionServiceContract;
  scripts: ScriptsServiceContract;
  storage: StorageServiceContract;
}
