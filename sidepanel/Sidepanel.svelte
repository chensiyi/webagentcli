<script lang="ts">
  import { setContext, getContext } from 'svelte';
  import Sidebar from './components/layout/Sidebar.svelte';
  import ToastContainer from './components/overlays/ToastContainer.svelte';
  //避免在页面中硬编码css样式，使用style中定义的语义性质的风格，便于统一风格与切换样式。
  
  type PageId = 'chat' | 'history' | 'storage' | 'scripts' | 'settings';

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
    { id: 'settings', icon: '⚙️', label: '设置' },
  ];
  import ChatPage from './pages/ChatPage.svelte';
  import HistoryPage from './pages/HistoryPage.svelte';
  import StoragePage from './pages/StoragePage.svelte';
  import ScriptsPage from './pages/ScriptsPage.svelte';
  import SettingsPage from './pages/SettingsPage.svelte';

  let { ipc }: { ipc: unknown } = $props();

  // 注入 IPC 到 Svelte context（子组件通过 getContext('ipc') 访问）
  // ipc 是 IPC 事件总线实例，所有页面通过 IPC 通道与 Kernel 通信
  setContext('ipc', ipc);
  setContext('navigate', navigateTo);

  let activePage = $state<PageId>('chat');

  function navigateTo(pageId: PageId) {
    activePage = pageId;
  }
</script>

<div class="sidepanel-container">
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
