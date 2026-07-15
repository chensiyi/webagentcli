/**
 * rpc-facades.ts — 跨进程 RPC 控制器（标准外部访问接口的 service 实现）
 *
 * 把「Shell → Kernel」的 RPC 方法聚合成各 service 的 facade 对象，由 background/main.ts
 * 通过 RPCServer.expose('service', facade) 一次性注册为 `service.method` 形式的远程方法。
 * 客户端用 createApiClient 出的代理 `api.service.method(...)` 调用，类型与 kernel 侧一致。
 *
 * facade 负责：
 * - 组合 manager 的真实方法调用
 * - 跨进程边界的返回形状（如 { session, messages, reasoningEffort }）
 * - 入参基本校验
 * 纯数据访问与持久化仍由各自的 Manager 负责（Manager 基类为多态实现提供基础方法）。
 */

import type { Kernel } from 'kernel/Kernel.js';
import { KernelEvents } from 'kernel/Events.js';
import { syncRegisteredScripts } from './tools/ManageUserScriptsTool.js';
import { reconcileScriptTools } from './script-tools.js';
import { runConversation, cancelConversation } from 'kernel/orchestration/session.js';
import { Log } from 'kernel/services/Log.js';

export interface RpcChannel {
  emit(event: string, payload?: unknown): void;
}

function sessionView(kernel: any, session: any): { session: any; messages: any[]; reasoningEffort: string } {
  const settingsEffort = kernel?.getSettingsManager?.()?.getSettings?.()?.reasoningEffort;
  return {
    session,
    messages: session?.messages || [],
    reasoningEffort: session?.reasoningEffort || settingsEffort,
  };
}

export function createSessionFacade(kernel: Kernel, sessionChannel: RpcChannel) {
  // SESSION 通道事件发射器：编排层 runConversation / cancelConversation 通过 onEvent / emit
  // 把流式与生命周期事件回灌到通道，Shell 侧监听。命令（send/stop）直接驱动编排，不再经 eventhandler 绕弯。
  const emit = (event: string, payload?: unknown) => sessionChannel.emit(event, payload);

  return {
    getCurrent(data: { sessionId?: string | null }) {
      const sm = kernel.getSessionManager();
      const s = data?.sessionId ? sm.getSession(data.sessionId) : null;
      return sessionView(kernel, s);
    },

    async create() {
      // 多 session 并行：新建会话不得取消其他会话进行中的轮次（并行合法，非独占）。
      // 新会话此刻尚无本会话轮次可取消，故此处不再调用 cancelConversation。
      const sm = kernel.getSessionManager();
      const settings = kernel.getSettingsManager().getSettings() as any;
      // 新建会话沿用全局默认思考强度，但先不落盘——未发送前只是临时会话，
      // 避免留下空对话（首条消息发送时由 addMessage 正式落盘）
      const s = await sm.createSession({ reasoningEffort: settings?.reasoningEffort, persist: false });
      return sessionView(kernel, s);
    },

    async update(data: { sessionId: string; data: any }) {
      if (!data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      await sm.updateSession(data.sessionId, data.data);
      const s = sm.getSession(data.sessionId);
      // 返回更新后的权威会话视图，供 Shell 侧「根据结果更新」缓存与 UI（差量，零额外 RPC）
      return sessionView(kernel, s);
    },

    async deleteMessage(data: { messageId: string; sessionId: string }) {
      if (!data?.messageId || !data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      const ok = await sm.deleteMessage(data.messageId, data.sessionId);
      if (ok) {
        sessionChannel.emit(KernelEvents.SESSION.MESSAGE_DELETED, {
          messageId: data.messageId,
          sessionId: data.sessionId,
        });
      }
      return null;
    },

    list() {
      const sm = kernel.getSessionManager();
      return { sessions: sm.getAllSessions() };
    },

    async delete(data: { sessionId: string }) {
      if (!data?.sessionId) return null;
      // 删除会话前取消其进行中的轮次（原 eventhandler 订阅 SessionManager 的 SESSION_DELETED 实现，现内联）
      cancelConversation(kernel, emit, data.sessionId);
      // 回收该会话挂起的确认请求（confirm 随会话生命周期：会话没了，待确认也应一并清理）
      kernel.getToolsManager()?.cancelPendingConfirmsForSession(data.sessionId);
      const sm = kernel.getSessionManager();
      await sm.deleteSession(data.sessionId);
      return { sessions: sm.getAllSessions() };
    },

    async clearMessages(data: { sessionId: string }) {
      if (!data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      await sm.clearMessages(data.sessionId);
      // 清空消息后，原挂起的确认已无对应气泡/工具调用可落点，一并回收
      kernel.getToolsManager()?.cancelPendingConfirmsForSession(data.sessionId);
      const idx = sm.getSession(data.sessionId)?.toIndexJSON();
      sessionChannel.emit(KernelEvents.SESSION.SESSION_UPDATED, { sessionId: data.sessionId, session: idx });
      return null;
    },

    // 发送消息：Shell→Kernel 经 RPC 统一入口，直接驱动编排（fire-and-forget）。
    // 流式 STREAM_* / MESSAGE_* 事件由 runConversation 通过 onEvent 经 sessionChannel 回灌到 Shell。
    send(data: { sessionId: string; content: string | any[]; reasoningEffort?: string; tabId?: number | null }) {
      if (!data?.sessionId || !data?.content) return null;
      void runConversation(kernel, { sessionId: data.sessionId, content: data.content, reasoningEffort: data.reasoningEffort, tabId: data.tabId ?? null } as any, { onEvent: emit }).catch((err: any) => {
        Log.error('SESSION_FACADE', 'runConversation error', err);
        // 多 session 并行：兜底错误必须带 sessionId，否则消费端（shell / 脚本 Port）按会话过滤后会丢弃或错配
        emit(KernelEvents.SESSION.STREAM_ERROR, { error: err, message: err?.message || String(err), sessionId: data.sessionId });
      });
      return null;
    },

    // 停止流式：传 sessionId 仅取消该会话（多 session 并行下必须按 id 定向，勿误伤其他会话）。
    // ⚠️ 省略 sessionId 会取消全部进行中的轮次——仅限"全局停止"语义，普通停止按钮务必传 id。
    stop(data: { sessionId?: string | null }) {
      cancelConversation(kernel, emit, data?.sessionId);
      return null;
    },

    /**
     * 危险工具人工确认回写（confirm 作为会话管理子系统的一部分）。
     * Shell / 用户脚本在 SESSION.CONFIRM_REQUEST 后弹确认框，用户决策经此回写内核，
     * 解除 ToolsManager.requestConfirm() 的 await。仅暴露 resolve 半边（Shell 是唯一决策方）。
     */
    confirmResolve(data: { requestId: string; approved: boolean }) {
      if (!data?.requestId) return null;
      kernel.getToolsManager()?.resolveConfirm(data.requestId, !!data.approved);
      return null;
    },
  };
}

export function createToolsFacade(kernel: Kernel) {
  return {
    list() {
      const tools = (kernel.getToolsManager()?.getAll() || []).map((t: any) => t.toJSON());
      return { tools };
    },

    async toggle(data: { name: string; enabled: boolean }) {
      if (!data?.name) return null;
      const tm = kernel.getToolsManager();
      if (data.enabled) await tm?.enable(data.name);
      else await tm?.disable(data.name);
      return null;
    },
  };
}

export function createStorageFacade(kernel: Kernel) {
  return {
    async getAll() {
      const storage = kernel.getStorageManager();
      const items = storage ? await storage.getAll() : {};
      return { items: Object.entries(items) };
    },

    async set(data: { key: string; value: unknown }) {
      if (!data?.key) return null;
      const storage = kernel.getStorageManager();
      await storage?.set(data.key, data.value);
      const items = storage ? await storage.getAll() : {};
      return { items: Object.entries(items) };
    },

    async remove(data: { key: string }) {
      if (!data?.key) return null;
      const storage = kernel.getStorageManager();
      await storage?.remove(data.key);
      const items = storage ? await storage.getAll() : {};
      return { items: Object.entries(items) };
    },

    async clear() {
      const storage = kernel.getStorageManager();
      await storage?.clear();
      return { items: [] };
    },
  };
}

export function createScriptsFacade(
  kernel: Kernel,
) {
  return {
    async list() {
      const sm = kernel.getScriptsManager();
      const scripts = await sm.loadAll();
      return { scripts };
    },

    async install(data: { code: string }) {
      if (!data?.code) return null;
      const sm = kernel.getScriptsManager();
      await sm.install(data.code);
      const scripts = await sm.loadAll();
      // UI 路径安装后需重新注册到 chrome.userScripts，使脚本立即注入（与 AI 工具路径等价）
      await syncRegisteredScripts(sm);
      return { scripts };
    },

    async edit(data: { id: string; code: string }) {
      if (!data?.id || !data?.code) return null;
      const sm = kernel.getScriptsManager();
      await sm.edit(data.id, data.code);
      const scripts = await sm.loadAll();
      await syncRegisteredScripts(sm);
      return { scripts };
    },

    async toggle(data: { id: string; enabled: boolean }) {
      if (!data?.id) return null;
      const sm = kernel.getScriptsManager();
      await sm.toggle(data.id, !!data.enabled);
      const scripts = await sm.loadAll();
      await syncRegisteredScripts(sm);
      return { scripts };
    },

    async uninstall(data: { id: string }) {
      if (!data?.id) return null;
      const sm = kernel.getScriptsManager();
      await sm.uninstall(data.id);
      const scripts = await sm.loadAll();
      await syncRegisteredScripts(sm);
      return { scripts };
    },

    /**
     * 读取已注册的用户脚本菜单命令（GM_registerMenuCommand 收集）。
     * 菜单列表由页面侧经 GM_* 注入持久化到 chrome.storage.local（key: __gm_menu_<scriptId>），
     * 此处遍历读取组装返回。不再依赖页面 → background 的实时 push（MV3 SW 休眠时收不到）。
     */
    async getMenu() {
      const menu: Record<string, { id: string; name: string }[]> = {};
      try {
        const all = await chrome.storage.local.get(null);
        for (const [k, v] of Object.entries(all as Record<string, unknown>)) {
          if (k.startsWith('__gm_menu_') && Array.isArray(v)) {
            menu[k.slice('__gm_menu_'.length)] = v as { id: string; name: string }[];
          }
        }
      } catch {
        /* storage 不可用时返回空菜单 */
      }
      return { menu };
    },

    /** 在当前活动标签页触发某脚本的某个菜单命令回调 */
    async invokeMenu(data: { scriptId: string; id: string }) {
      if (!data?.scriptId || !data?.id) return null;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) return null;
      try {
        // 注意：chrome.userScripts.sendMessage 这个 API **不存在**（userScripts 仅
        // configureWorld/execute/getScripts/register/...）。背景向 user script 世界发消息的
        // 唯一正规手段是 chrome.userScripts.execute()：把一段代码注入 USER_SCRIPT 世界执行。
        // 注册脚本与 execute 注入共享同一 USER_SCRIPT 世界，故可直接访问
        // window.__gmMenuCommands 触发对应回调。
        const us = chrome.userScripts as any;
        if (typeof us?.execute === 'function') {
          const safeId = JSON.stringify(data.id);
          const code = `((mid)=>{try{var c=window.__gmMenuCommands&&window.__gmMenuCommands.get(mid);if(c&&c.fn)c.fn();}catch(e){}})(' + safeId + ')`;
          us.execute({ target: { tabId: tab.id }, js: [{ code }], world: 'USER_SCRIPT' as any });
        }
      } catch (e) {
        Log.warn('SCRIPTS_FACADE', 'invokeMenu execute failed', e);
      }
      return null;
    },
  };
}

/**
 * kernel facade — 内核控制面 RPC（如热重载脚本/工具注册表）。
 *
 * reload() 重跑内核启动末尾的「用户脚本 ↔ AI 工具」同步，等价于一次
 * 轻量重启内核的脚本/工具子系统，而不必 chrome.runtime.reload() 把 sidepanel 一起冲掉：
 *  - syncRegisteredScripts：按当前已安装脚本重注册 chrome.userScripts（卸载后停止注入）
 *  - reconcileScriptTools：把 @tool 脚本同步进 ToolsManager 注册表（卸载后移除孤儿工具）
 * 安装/卸载/启停用户脚本后调用，使改动立即生效。
 */
export function createKernelFacade(kernel: Kernel) {
  return {
    async reload() {
      const sm = kernel.getScriptsManager();
      const tm = kernel.getToolsManager();
      await syncRegisteredScripts(sm);
      reconcileScriptTools(sm, tm);
      return null;
    },
  };
}

/**
 * media facade — 媒体二进制存取的远程入口。
 * 媒体 blob 存于 background 的 IndexedDB（MediaStore），消息只持 mediaId 引用。
 * put 入参 dataUrl 直接存；blob 由 Shell 侧转 dataURL 后传入（保持 facade 简单、无浏览器依赖）。
 */
export function createMediaFacade(mediaStore: any) {
  return {
    async put(data: { dataUrl?: string; mimeType: string; filename?: string }) {
      if (!data?.mimeType || !data.dataUrl) {
        Log.warn('MEDIA_FACADE', 'put rejected: missing mimeType/dataUrl');
        return null;
      }
      Log.info('MEDIA_FACADE', 'put: calling mediaStore.put', { mimeType: data.mimeType, filename: data.filename });
      const id = await mediaStore.put(data.dataUrl, data.mimeType, data.filename);
      Log.info('MEDIA_FACADE', 'put: returning id', { id });
      return { id };
    },

    async get(data: { id: string }) {
      if (!data?.id) return null;
      const url = await mediaStore.get(data.id);
      return { url: url || null };
    },

    async getMany(data: { ids: string[] }) {
      if (!Array.isArray(data?.ids)) return { items: {} };
      const items = await mediaStore.getMany(data.ids);
      return { items };
    },

    async delete(data: { id: string }) {
      if (!data?.id) return null;
      await mediaStore.delete(data.id);
      return null;
    },
  };
}
