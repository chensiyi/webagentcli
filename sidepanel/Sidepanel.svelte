<script lang="ts">
  import { setContext } from 'svelte';
  import Sidebar from './components/layout/Sidebar.svelte';
  import ToastContainer from './components/overlays/ToastContainer.svelte';
  import { useToast } from './components/overlays/toast-store.svelte';
  import { KernelEvents } from 'kernel/Events.js';
  //避免在页面中硬编码css样式，使用style中定义的语义性质的风格，便于统一风格与切换样式。

  type PageId = 'chat' | 'history' | 'storage' | 'scripts' | 'tools' | 'settings';

  interface PageDef {
    id: PageId;
    icon: string;
    label: string;
  }

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

  let { ipc, bootError = null }: { ipc: unknown; bootError?: string | null } = $props();

  // 注入 IPC 到 Svelte context（子组件通过 getContext('ipc') 访问）
  // ipc 是 IPC 事件总线实例，所有页面通过 IPC 通道与 Kernel 通信
  setContext('ipc', ipc);
  // 注入 RPC 客户端（重设计后的请求/响应层，返回 Promise，自动关联请求 ID）
  const rpc = new RPCClient(ipc as any);
  setContext('rpc', rpc);
  // 注入按「标准外部访问接口契约」自动生成的代理客户端：
  // api.settings.getSettings() 等价于 rpc.call('settings.getSettings', [])，类型与 kernel 侧一致。
  setContext('api', createApiClient<KernelAPIContract>(rpc));
  setContext('navigate', navigateTo);

  // 存储写入失败（如配额超限）由内核经 STORAGE.ERROR 上报，全局弹 toast 提示
  const toast = useToast();
  (ipc as any).on(KernelEvents.STORAGE.ERROR, (d: any) => {
    toast.error(`存储写入失败：${d?.message || '空间可能已满'}`);
  });

  let activePage = $state<PageId>('chat');

  function navigateTo(pageId: PageId) {
    activePage = pageId;
  }
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
