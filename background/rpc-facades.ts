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
 * - 调用后的事件广播（如 CURRENT_SESSION_CHANGED）
 * - 入参基本校验
 * 纯数据访问与持久化仍由各自的 Manager 负责（Manager 基类为多态实现提供基础方法）。
 */

import type { Kernel } from 'kernel/Kernel.js';
import { KernelEvents } from 'kernel/Events.js';
import { syncRegisteredScripts } from './tools/ManageUserScriptsTool.js';
import { runConversation, cancelConversation } from 'kernel/orchestration/session.js';
import { Log } from 'kernel/services/Log.js';

export interface RpcChannel {
  emit(event: string, payload?: unknown): void;
}

function sessionView(kernel: any, sm: any): { session: any; messages: any[]; reasoningEffort: string } {
  const s = sm.getCurrentSession();
  const settingsEffort = kernel?.getSettingsManager?.()?.getSettings?.()?.reasoningEffort;
  return {
    session: s,
    messages: s?.messages || [],
    // 无当前会话时回退到全局默认档位，保证空态也显示正确默认（如“关”）
    reasoningEffort: s?.reasoningEffort || settingsEffort || 'medium',
  };
}

export function createSessionFacade(kernel: Kernel, sessionChannel: RpcChannel) {
  // SESSION 通道事件发射器：编排层 runConversation / cancelConversation 通过 onEvent / emit
  // 把流式与生命周期事件回灌到通道，Shell 侧监听。命令（send/stop）直接驱动编排，不再经 eventhandler 绕弯。
  const emit = (event: string, payload?: unknown) => sessionChannel.emit(event, payload);

  return {
    getCurrent() {
      return sessionView(kernel, kernel.getSessionManager());
    },

    async create() {
      // 离开旧会话前取消其进行中的轮次（原 eventhandler 通过 CURRENT_SESSION_CHANGED 实现，现内联）
      cancelConversation(kernel, emit);
      const sm = kernel.getSessionManager();
      const settings = kernel.getSettingsManager().getSettings() as any;
      // 新建会话沿用全局默认思考强度，但先不落盘——未发送前只是临时会话，
      // 避免留下空对话（首条消息发送时由 addMessage 正式落盘）
      await sm.createSession({ reasoningEffort: settings?.reasoningEffort || 'medium', persist: false });
      const s = sm.getCurrentSession();
      sessionChannel.emit(KernelEvents.SESSION.CURRENT_SESSION_CHANGED, { sessionId: s?.id });
      return {
        session: s,
        messages: [],
        reasoningEffort: s?.reasoningEffort || 'medium',
      };
    },

    async update(data: { sessionId: string; data: any }) {
      if (!data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      await sm.updateSession(data.sessionId, data.data);
      // 返回更新后的权威会话视图，供 Shell 侧「根据结果更新」缓存与 UI（差量，零额外 RPC）
      return sessionView(kernel, sm);
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

    async switch(data: { sessionId: string }) {
      if (!data?.sessionId) return null;
      // 离开旧会话前取消其进行中的轮次（原 eventhandler 通过 CURRENT_SESSION_CHANGED 实现，现内联）
      cancelConversation(kernel, emit);
      const sm = kernel.getSessionManager();
      // 切走前丢弃当前未发送即空的临时会话，避免内存堆积空对话
      sm.discardTransientCurrent();
      await sm.setCurrentSession(data.sessionId);
      const s = sm.getCurrentSession();
      sessionChannel.emit(KernelEvents.SESSION.CURRENT_SESSION_CHANGED, { sessionId: s?.id });
      return sessionView(kernel, sm);
    },

    async delete(data: { sessionId: string }) {
      if (!data?.sessionId) return null;
      // 删除会话前取消其进行中的轮次（原 eventhandler 订阅 SessionManager 的 SESSION_DELETED 实现，现内联）
      cancelConversation(kernel, emit, data.sessionId);
      const sm = kernel.getSessionManager();
      await sm.deleteSession(data.sessionId);
      return { sessions: sm.getAllSessions() };
    },

    async clearMessages(data: { sessionId: string }) {
      if (!data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      await sm.clearMessages(data.sessionId);
      const idx = sm.getSession(data.sessionId)?.toIndexJSON();
      sessionChannel.emit(KernelEvents.SESSION.SESSION_UPDATED, { sessionId: data.sessionId, session: idx });
      return null;
    },

    // 发送消息：Shell→Kernel 经 RPC 统一入口，直接驱动编排（fire-and-forget）。
    // 流式 STREAM_* / MESSAGE_* 事件由 runConversation 通过 onEvent 经 sessionChannel 回灌到 Shell。
    send(data: { content: string | any[]; reasoningEffort?: string }) {
      if (!data?.content) return null;
      void runConversation(kernel, data as any, { onEvent: emit }).catch((err: any) => {
        Log.error('SESSION_FACADE', 'runConversation error', err);
        emit(KernelEvents.SESSION.STREAM_ERROR, { error: err, message: err?.message || String(err) });
      });
      return null;
    },

    // 停止当前流式：直接取消进行中的轮次（fire-and-forget）
    stop() {
      cancelConversation(kernel, emit);
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
  menuCommands?: Map<string, { id: string; name: string }[]>,
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

    /** 读取已注册的用户脚本菜单命令（GM_registerMenuCommand 收集，按 scriptId 聚合） */
    getMenu() {
      const menu = menuCommands ? Object.fromEntries(menuCommands) : {};
      return { menu };
    },

    /** 在当前活动标签页触发某脚本的某个菜单命令（回发 __gmMenuInvoke 给页面 userScript） */
    async invokeMenu(data: { scriptId: string; id: string }) {
      if (!data?.scriptId || !data?.id) return null;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id != null) {
        try {
          chrome.tabs.sendMessage(tab.id, { __gmMenuInvoke: data.id });
        } catch (e) {
          Log.warn('SCRIPTS_FACADE', 'invokeMenu sendMessage failed', e);
        }
      }
      return null;
    },
  };
}

/**
 * confirm facade — 危险工具人工确认的专用 RPC 接口（UI 专用确认 RPC）。
 *
 * 这是 kernel→shell 确认闭环的「shell→kernel 半边」：
 * - 内核 ToolsManager.invoke 危险工具前，经 ToolConfirmation 广播 CONFIRM.REQUEST 事件；
 * - Shell 弹确认框，用户决策后调用 api.confirm.resolve({ requestId, approved })；
 * - 本 facade 把该调用转交 kernel.getToolConfirmation().resolve()，解除内核侧 await。
 * 仅暴露 resolve 一个方法（写穿透：Shell 是唯一决策方）。
 */
export function createConfirmFacade(kernel: Kernel) {
  return {
    resolve(data: { requestId: string; approved: boolean }) {
      if (!data?.requestId) return null;
      kernel.getToolsManager()?.resolveConfirm(data.requestId, !!data.approved);
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
