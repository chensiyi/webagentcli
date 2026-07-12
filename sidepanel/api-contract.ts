/**
 * api-contract.ts — Shell 侧「标准外部访问接口」契约（客户端视图）
 *
 * 仅描述 Shell 通过 createApiClient 代理可调用的服务面，类型与 kernel 侧
 * RPCServer.expose(service, impl) 注册的方法一致。这是客户端关注点，
 * 不再放在 kernel/api（旧的 KernelAPI.ts 死契约已删除）。
 */

export interface SettingsAPI {
  getSettings(): Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): Promise<void>;
  getSetting(key: string): unknown;
  saveSetting(key: string, value: unknown): Promise<unknown>;
  resetSettings(): void;
}

export interface SessionView {
  session: any;
  messages: any[];
  reasoningEffort: string;
}

export interface SessionAPI {
  getCurrent(data: { sessionId?: string | null }): Promise<SessionView>;
  create(): Promise<SessionView>;
  update(data: { sessionId: string; data: any }): Promise<null>;
  deleteMessage(data: { messageId: string; sessionId: string }): Promise<null>;
  list(): Promise<{ sessions: any[] }>;
  delete(data: { sessionId: string }): Promise<{ sessions: any[] }>;
  clearMessages(data: { sessionId: string }): Promise<null>;
  send(data: { sessionId: string; content: string | any[]; reasoningEffort?: string }): Promise<null>;
  stop(data: { sessionId?: string | null }): Promise<null>;
}

export interface ToolsAPI {
  list(): Promise<{ tools: any[] }>;
  toggle(data: { name: string; enabled: boolean }): Promise<null>;
}

export interface StorageAPI {
  getAll(): Promise<{ items: [string, unknown][] }>;
  set(data: { key: string; value: unknown }): Promise<{ items: [string, unknown][] }>;
  remove(data: { key: string }): Promise<{ items: [string, unknown][] }>;
  clear(): Promise<{ items: [] }>;
}

export interface ScriptsAPI {
  list(): Promise<{ scripts: any[] }>;
  install(data: { code: string }): Promise<{ scripts: any[] }>;
  edit(data: { id: string; code: string }): Promise<{ scripts: any[] }>;
  toggle(data: { id: string; enabled: boolean }): Promise<{ scripts: any[] }>;
  uninstall(data: { id: string }): Promise<{ scripts: any[] }>;
  /** 读取用户脚本菜单命令（GM_registerMenuCommand 收集，按 scriptId 聚合） */
  getMenu(): Promise<{ menu: Record<string, { id: string; name: string }[]> }>;
  /** 在当前活动标签页触发某脚本菜单命令 */
  invokeMenu(data: { scriptId: string; id: string }): Promise<null>;
}

export interface MediaAPI {
  put(data: { dataUrl: string; mimeType: string; filename?: string }): Promise<{ id: string } | null>;
  get(data: { id: string }): Promise<{ url: string | null } | null>;
  getMany(data: { ids: string[] }): Promise<{ items: Record<string, string> }>;
  delete(data: { id: string }): Promise<null>;
}

/** 危险工具人工确认专用 RPC 接口（UI 专用确认接口）。
 * Shell 收到内核 CONFIRM.REQUEST 事件后弹确认框，用户决策经 resolve 回写内核。 */
export interface ConfirmAPI {
  resolve(data: { requestId: string; approved: boolean }): Promise<null>;
}

export interface KernelAPIContract {
  settings: SettingsAPI;
  session: SessionAPI;
  tools: ToolsAPI;
  storage: StorageAPI;
  scripts: ScriptsAPI;
  media: MediaAPI;
  confirm: ConfirmAPI;
}
