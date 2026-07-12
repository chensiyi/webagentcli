/**
 * 危险工具「气泡内确认」store（Svelte 5 runes 单例）
 *
 * 内核 invoke 危险工具（Tool.danger===true）前，经 ToolsManager.requestConfirm()
 * 广播 CONFIRM.REQUEST。Shell 不再用 toast，而是把请求按 toolCallId 关联到
 * 对应聊天气泡（ToolCallCard），在气泡内直接渲染「允许/取消」按钮。
 *
 * 设计要点：
 * - pending 以 toolCallId 为键（toolCallId 全局唯一，跨会话不会冲突）。
 * - bind(api, ipc) 注入 api（回写 confirm.resolve）与 ipc（可选日志）。
 * - approve/reject 先从本地移除（按钮即时消失），再回写内核；内核超时也会
 *   经 CONFIRM.RESOLVED 通知本 store 清除残留。
 */
export interface ConfirmRequest {
  requestId: string;
  toolCallId: string | null;
  sessionId: string | null;
  toolName: string;
  args: unknown;
  reason: string;
  receivedAt: number;
}

class ConfirmStore {
  /** toolCallId -> 待确认请求（响应式，ToolCallCard 直接派生读取） */
  pending = $state<Record<string, ConfirmRequest>>({});
  private api: any = null;
  private ipc: any = null;

  bind(api: any, ipc: any): void {
    this.api = api;
    this.ipc = ipc;
  }

  add(req: ConfirmRequest): void {
    if (!req?.toolCallId) return; // 必须是气泡内确认（按 toolCallId 关联卡片）
    this.pending = { ...this.pending, [req.toolCallId]: req };
  }

  remove(toolCallId: string): void {
    if (!toolCallId || !this.pending[toolCallId]) return;
    const next = { ...this.pending };
    delete next[toolCallId];
    this.pending = next;
  }

  async approve(toolCallId: string): Promise<void> {
    const req = this.pending[toolCallId];
    if (!req) return;
    this.remove(toolCallId);
    if (this.api?.confirm?.resolve) {
      try {
        await this.api.confirm.resolve({ requestId: req.requestId, approved: true });
      } catch {
        /* 内核侧已超时回收则忽略 */
      }
    }
  }

  async reject(toolCallId: string): Promise<void> {
    const req = this.pending[toolCallId];
    if (!req) return;
    this.remove(toolCallId);
    if (this.api?.confirm?.resolve) {
      try {
        await this.api.confirm.resolve({ requestId: req.requestId, approved: false });
      } catch {
        /* 内核侧已超时回收则忽略 */
      }
    }
  }

  /**
   * 「始终允许」：在批准本次执行的同时，把该工具在本会话标记为显式开启
   * （toolEnabled[name]=true），使后续调用跳过确认。
   * 经 api.session 读写（取最新 toolEnabled 合并后回写）。持久化失败不影响本次执行。
   */
  async rememberAllow(toolCallId: string): Promise<void> {
    const req = this.pending[toolCallId];
    if (!req || !this.api?.session?.update) return;
    // 直接用请求携带的 sessionId（CONFIRM.REQUEST 事件必然带 sessionId），不再依赖内核「当前会话」
    const sid = req.sessionId;
    if (!sid) return;
    try {
      const view: any = await this.api.session.getCurrent({ sessionId: sid });
      const base: Record<string, boolean> = view?.session?.toolEnabled || {};
      const newMap = { ...base, [req.toolName]: true };
      await this.api.session.update({ sessionId: sid, data: { toolEnabled: newMap } });
    } catch {
      /* 持久化失败不影响本次执行（内核侧已 approve） */
    }
  }

  /** 切换会话 / 组件卸载时清空残留 */
  clearAll(): void {
    this.pending = {};
  }
}

export const confirmStore = new ConfirmStore();
