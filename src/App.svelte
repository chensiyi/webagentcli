<script lang="ts">
  import { provideKernel, provideNavigate } from './lib/kernel-context.js';
  import { PAGES, type PageId } from './lib/types.js';
  import Sidebar from './components/ui/Sidebar.svelte';
  import ToastContainer from './components/ui/ToastContainer.svelte';
  import ChatPage from './pages/ChatPage.svelte';
  import HistoryPage from './pages/HistoryPage.svelte';
  import StoragePage from './pages/StoragePage.svelte';
  import ScriptsPage from './pages/ScriptsPage.svelte';
  import SettingsPage from './pages/SettingsPage.svelte';

  let { kernel }: { kernel: unknown } = $props();

  // 注入 Kernel 到 Svelte context（子组件通过 useKernel() 访问）
  // 注意：setContext 必须在组件初始化阶段同步调用，不能放在 $effect 中
  // kernel prop 由 bootKernel() 完成后传入，生命周期内不会变化，因此只捕获初始值是预期行为
  // svelte-ignore state_referenced_locally
  provideKernel(kernel);
  provideNavigate(navigateTo);

  let activePage = $state<PageId>('chat');

  function navigateTo(pageId: PageId) {
    activePage = pageId;
  }
</script>

<div class="app-container">
  <div class="main-content">
    <div class="content-area">
      {#key activePage}
        <div class="page-wrapper">
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

<style>
  .app-container {
    height: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
  }

  .main-content {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .content-area {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    background: var(--color-bg);
  }

  .page-wrapper {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    animation: pageEnter 180ms ease;
  }

  @keyframes pageEnter {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
