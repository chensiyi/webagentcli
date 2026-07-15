<script lang="ts">
  import { setContext } from 'svelte';
  import Sidebar from './components/layout/Sidebar.svelte';
  import ToastContainer from './components/overlays/ToastContainer.svelte';
  import { useToast } from './components/overlays/toast-store.svelte';
  import { KernelEvents, KernelChannels } from 'kernel/Events.js';
  import type { PageId, PageDef } from './components/layout/Sidebar.svelte';
  //避免在页面中硬编码css样式，使用style中定义的语义性质的风格，便于统一风格与切换样式。

  const PAGES: PageDef[] = [
    { id: 'chat', icon: '💬', label: '对话' },
    { id: 'history', icon: '📋', label: '历史' },
    { id: 'storage', icon: '💾', label: '存储' },
    { id: 'scripts', icon: '📜', label: '脚本' },
    { id: 'tools', icon: '🧰', label: '工具' },
    { id: 'settings', icon: '⚙️', label: '设置' },
  ];
  import ChatPage from './pages/ChatPage.svelte';
  import HistoryPage from './pages/HistoryPage.svelte';
  import StoragePage from './pages/StoragePage.svelte';
  import ScriptsPage from './pages/ScriptsPage.svelte';
  import ToolsPage from './pages/ToolsPage.svelte';
  import SettingsPage from './pages/SettingsPage.svelte';
  import { RPCClient, createApiClient } from 'bridge/RPC.js';
  import type { KernelAPIContract } from './api-contract.js';
  import { confirmStore } from './utils/confirm-store.svelte.js';
  import { getShellCache } from './utils/shell-cache.js';

  let { ipc, bootError = null }: { ipc: unknown; bootError?: string | null } = $props();

  // 当前激活页面（导航状态）。必须在 setContext('navigate', navigateTo) 与传给 Sidebar 之前定义，
  // 否则依赖函数提升才能工作，脆弱且易踩时序坑（表现为「切换无效 / 锁死」）。
  let activePage = $state<PageId>('chat');

  function navigateTo(pageId: PageId) {
    activePage = pageId;
  }

  // 注入 IPC 到 Svelte context（子组件通过 getContext('ipc') 访问）
  // ipc 是 IPC 事件总线实例，所有页面通过 IPC 通道与 Kernel 通信
  setContext('ipc', ipc);
  // 注入 RPC 客户端（重设计后的请求/响应层，返回 Promise，自动关联请求 ID）
  const rpc = new RPCClient(ipc as any);
  setContext('rpc', rpc);
  // 注入按「标准外部访问接口契约」自动生成的代理客户端：
  // api.settings.getSettings() 等价于 rpc.call('settings.getSettings', [])，类型与 kernel 侧一致。
  const api = createApiClient<KernelAPIContract>(rpc);
  setContext('api', api);
  setContext('navigate', navigateTo);
  // 危险工具「气泡内确认」store：绑定 api（回写 session.confirmResolve）与 ipc
  confirmStore.bind(api, ipc);

  // session 通道：SESSION.CONFIRM_* 危险工具确认事件现经此广播（与 STREAM_* 同通道、随会话隔离）。
  const sessionChannel = (ipc as any)?.getOrCreateChannel?.(KernelChannels.SESSION) || ipc;
  // Shell 侧当前会话（全局缓存单例），用于把确认请求限定在「侧栏正在查看的会话」
  const cache = getShellCache(api as any);

  // 存储写入失败（如配额超限）由内核经 STORAGE.ERROR 上报，全局弹 toast 提示
  const toast = useToast();
  (ipc as any).on(KernelEvents.STORAGE.ERROR, (d: any) => {
    toast.error(`存储写入失败：${d?.message || '空间可能已满'}`);
  });

  // 危险工具人工确认：内核 invoke danger 工具前经 session 通道广播 SESSION.CONFIRM_REQUEST，改在聊天气泡内确认。
  // 按 toolCallId 关联到 ToolCallCard，在气泡里直接渲染「允许/取消」按钮。
  // 详细入参（如 run_user_script 的代码）随聊天消息展示，无需 toast。
  // 多 session 并行：仅处理「当前侧栏正在查看的会话」的确认请求；跨会话（如 pet 世界）的
  // 确认由各世界自行处理，避免侧栏误弹他人会话的确认框。
  sessionChannel.on(KernelEvents.SESSION.CONFIRM_REQUEST, (d: any) => {
    if (!d?.requestId) return;
    const cur = cache.getCurrentSessionId();
    if (cur && d.sessionId && d.sessionId !== cur) return;
    if (!d.toolCallId) {
      // 兜底：极少数无 toolCallId 的场景退回 toast 轻量确认
      const toolName = d.toolName || 'unknown';
      const reason = d.reason || '该工具被标记为危险操作';
      toast.action(
        `⚠️ 危险操作确认：「${toolName}」${reason}`,
        [
          { label: '允许执行', variant: 'danger', onClick: () => { void api.session.confirmResolve({ requestId: d.requestId, approved: true }).catch(() => {}); } },
          { label: '取消', variant: 'default', onClick: () => { void api.session.confirmResolve({ requestId: d.requestId, approved: false }).catch(() => {}); } },
        ],
        'warning',
        130_000,
      );
      return;
    }
    confirmStore.add({
      requestId: d.requestId,
      toolCallId: d.toolCallId,
      sessionId: d.sessionId || null,
      toolName: d.toolName || 'unknown',
      args: d.args,
      reason: d.reason || '该工具被标记为危险操作，执行前需人工确认',
      receivedAt: Date.now(),
    });
  });

  // 内核超时/已决策后广播 SESSION.CONFIRM_RESOLVED，移除气泡内残留的待确认态
  sessionChannel.on(KernelEvents.SESSION.CONFIRM_RESOLVED, (d: any) => {
    if (d?.toolCallId) confirmStore.remove(d.toolCallId);
  });

  // 内核经 ui:notification 推送的全局通知（如预装脚本安装进度），透传为 toast。
  // payload: { type: 'info'|'success'|'warning'|'error', message: string, duration?: number }
  // duration 缺省用 toast 默认（3s）；显式传 0 则常驻，需用户手动关闭。
  (ipc as any).on(KernelEvents.UI.NOTIFICATION, (d: any) => {
    const msg = d?.message || '';
    if (!msg) return;
    const type = d?.type || 'info';
    const duration = typeof d?.duration === 'number' ? d.duration : undefined;
    if (type === 'error') toast.error(msg, duration);
    else if (type === 'success') toast.success(msg, duration);
    else if (type === 'warning') toast.warning(msg, duration);
    else toast.info(msg, duration);
  });
</script>

<div class="sidepanel-container">
  {#if bootError}
    <div class="kernel-error-banner" role="alert">
      <strong>⚠️ 内核未就绪</strong>
      <span>{bootError}</span>
      <span class="kernel-error-hint">请在扩展管理页重新加载插件，并查看后台 Service Worker 控制台获取详细错误。</span>
    </div>
  {/if}
  <div class="sidepanel-main-content">
    <div class="sidepanel-content-area">
      {#key activePage}
        <div class="sidepanel-page-wrapper">
          {#if activePage === 'chat'}
            <ChatPage />
          {:else if activePage === 'history'}
            <HistoryPage />
          {:else if activePage === 'storage'}
            <StoragePage />
          {:else if activePage === 'scripts'}
            <ScriptsPage />
          {:else if activePage === 'tools'}
            <ToolsPage />
          {:else if activePage === 'settings'}
            <SettingsPage />
          {/if}
        </div>
      {/key}
    </div>

    <Sidebar {activePage} {navigateTo} {PAGES} />
  </div>
</div>

<ToastContainer />

<style>
  .kernel-error-banner {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 14px;
    background: #fff4f4;
    border-bottom: 1px solid #ffcccc;
    color: #b00020;
    font-size: 13px;
    line-height: 1.4;
  }
  .kernel-error-banner strong { font-size: 14px; }
  .kernel-error-hint { color: #8a6d6d; font-size: 12px; }
</style>
