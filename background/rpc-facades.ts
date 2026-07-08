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

export interface RpcChannel {
  emit(event: string, payload?: unknown): void;
}

function sessionView(sm: any): { session: any; messages: any[]; reasoningEffort: string } {
  const s = sm.getCurrentSession();
  return {
    session: s,
    messages: s?.messages || [],
    reasoningEffort: s?.reasoningEffort || 'medium',
  };
}

export function createSessionFacade(kernel: Kernel, chatChannel: RpcChannel) {
  return {
    getCurrent() {
      return sessionView(kernel.getSessionManager());
    },

    async create() {
      const sm = kernel.getSessionManager();
      const settings = kernel.getSettingsManager().getSettings() as any;
      await sm.createSession();
      const s = sm.getCurrentSession();
      chatChannel.emit(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, { sessionId: s?.id });
      return {
        session: s,
        messages: [],
        reasoningEffort: settings?.reasoningEffort || 'medium',
      };
    },

    async update(data: { sessionId: string; data: any }) {
      if (!data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      await sm.updateSession(data.sessionId, data.data);
      chatChannel.emit(KernelEvents.CHAT.SESSION_UPDATED, { sessionId: data.sessionId });
      return null;
    },

    async deleteMessage(data: { messageId: string; sessionId: string }) {
      if (!data?.messageId || !data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      const ok = await sm.deleteMessage(data.messageId, data.sessionId);
      if (ok) {
        chatChannel.emit(KernelEvents.CHAT.MESSAGE_DELETED, {
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
      const sm = kernel.getSessionManager();
      await sm.setCurrentSession(data.sessionId);
      const s = sm.getCurrentSession();
      chatChannel.emit(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, { sessionId: s?.id });
      return sessionView(sm);
    },

    async delete(data: { sessionId: string }) {
      if (!data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      await sm.deleteSession(data.sessionId);
      return { sessions: sm.getAllSessions() };
    },

    async clearMessages(data: { sessionId: string }) {
      if (!data?.sessionId) return null;
      const sm = kernel.getSessionManager();
      await sm.clearMessages(data.sessionId);
      chatChannel.emit(KernelEvents.CHAT.SESSION_UPDATED, { sessionId: data.sessionId });
      return null;
    },
  };
}

export function createToolsFacade(kernel: Kernel) {
  return {
    list() {
      const tools = (kernel.toolsManager?.getAll() || []).map((t: any) => t.toJSON());
      return { tools };
    },

    toggle(data: { name: string; enabled: boolean }) {
      if (!data?.name) return null;
      const tm = kernel.toolsManager;
      if (data.enabled) tm?.enable(data.name);
      else tm?.disable(data.name);
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

export function createScriptsFacade(kernel: Kernel) {
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
      return { scripts };
    },

    async edit(data: { id: string; code: string }) {
      if (!data?.id || !data?.code) return null;
      const sm = kernel.getScriptsManager();
      await sm.edit(data.id, data.code);
      const scripts = await sm.loadAll();
      return { scripts };
    },

    async toggle(data: { id: string; enabled: boolean }) {
      if (!data?.id) return null;
      const sm = kernel.getScriptsManager();
      await sm.toggle(data.id, !!data.enabled);
      const scripts = await sm.loadAll();
      return { scripts };
    },

    async uninstall(data: { id: string }) {
      if (!data?.id) return null;
      const sm = kernel.getScriptsManager();
      await sm.uninstall(data.id);
      const scripts = await sm.loadAll();
      return { scripts };
    },
  };
}
