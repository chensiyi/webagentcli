<script lang="ts">
  import { getContext } from 'svelte';
  import Button from '../components/atoms/Button.svelte';
  import Input from '../components/forms/Input.svelte';
  import Card from '../components/layout/Card.svelte';
  import CodeEditor from '../components/forms/CodeEditor.svelte';
  import Dialog from '../components/overlays/Dialog.svelte';
  import EmptyState from '../components/layout/EmptyState.svelte';
  import { useToast } from '../components/overlays/toast-store.svelte';
  import { RPC } from '../../bridge/RPC.js';

  const ipc: any = getContext('ipc');
  const storageChannel = ipc?.getOrCreateChannel?.('storage') || ipc;
  const rpc: any = getContext('rpc');
  const toast = useToast();

  // ---------- State ----------
  let storageItems = $state<[string, any][]>([]);
  let searchKeyword = $state('');
  let currentPage = $state(1);
  let isLoaded = $state(false);
  let isLoading = $state(false);

  // Dialogs
  let deleteTarget = $state<string | null>(null);
  let deleteTargetIsAll = $state(false);
  let editTarget = $state<string | null>(null);
  let editValue = $state('');

  const pageSize = 20;

  // ---------- Computed ----------
  const filteredItems = $derived(
    searchKeyword
      ? storageItems.filter(([k]) => k.toLowerCase().includes(searchKeyword.toLowerCase()))
      : storageItems
  );
  const totalPages = $derived(Math.ceil(filteredItems.length / pageSize));
  const pageItems = $derived(
    filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );
  const totalSizeKB = $derived(
    Math.round(
      storageItems.reduce((sum, [, v]) => sum + JSON.stringify(v).length, 0) / 1024
    )
  );

  // ---------- Init ----------
  $effect(() => {
    if (isLoaded) return;
    isLoaded = true;
    refreshList();
  });

  async function refreshList() {
    isLoading = true;
    try {
      const data = await rpc.call(RPC.STORAGE_GET_ALL);
      storageItems = data?.items || [];
    } catch (e) {
      toast.error('加载失败');
    } finally {
      isLoading = false;
    }
  }

  // ---------- Actions ----------
  function handleSearch(e: Event) {
    searchKeyword = (e.target as HTMLInputElement).value;
    currentPage = 1;
  }

  function goToPage(page: number) {
    currentPage = page;
  }

  function confirmDelete(key: string) {
    deleteTarget = key;
    deleteTargetIsAll = false;
  }

  function confirmClearAll() {
    deleteTarget = null;
    deleteTargetIsAll = true;
  }

  async function executeDelete() {
    try {
      if (deleteTargetIsAll) {
        const data = await rpc.call(RPC.STORAGE_CLEAR);
        storageItems = data?.items || [];
        toast.success('已清空');
      } else if (deleteTarget) {
        const data = await rpc.call(RPC.STORAGE_DELETE, { key: deleteTarget });
        storageItems = data?.items || [];
        toast.success('已删除');
      }
    } catch (e) {
      console.error('[StoragePage] delete failed:', e);
      toast.error(`操作失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      deleteTarget = null;
      deleteTargetIsAll = false;
    }
  }

  function cancelDelete() {
    deleteTarget = null;
    deleteTargetIsAll = false;
  }

  function openEdit(key: string, value: any) {
    editTarget = key;
    editValue = JSON.stringify(value, null, 2);
  }

  function cancelEdit() {
    editTarget = null;
    editValue = '';
  }

  async function saveEdit() {
    if (!editTarget) return;
    try {
      const parsed = JSON.parse(editValue);
      const data = await rpc.call(RPC.STORAGE_SET, { key: editTarget, value: parsed });
      storageItems = data?.items || [];
      toast.success('已更新');
      editTarget = null;
      editValue = '';
    } catch (e) {
      console.error('[StoragePage] edit failed:', e);
      toast.error(e instanceof SyntaxError ? 'JSON 格式错误' : `操作失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function getItemSize(value: any): string {
    const bytes = JSON.stringify(value).length;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }
</script>

<div class="list-page">
  <div class="list-page-header-row">
    <h2 class="list-page-title">存储管理</h2>
    <Button variant="secondary" size="sm" loading={isLoading} onclick={refreshList}>刷新</Button>
  </div>

  <div class="list-page-search-area">
    <Input placeholder="搜索存储项…" value={searchKeyword} oninput={handleSearch} />
  </div>

  <!-- Stats -->
  <Card>
    <div class="list-page-stats-row">
      <span class="list-page-stats-text">共 {filteredItems.length} 项 · 总计 {totalSizeKB} KB</span>
      <Button variant="danger" size="sm" onclick={confirmClearAll}>清除所有</Button>
    </div>
  </Card>

  <!-- List -->
  <div class="list-page-content">
    {#if isLoading}
      <div class="loading-state">
        <div class="spinner-pulse"></div>
        <span>加载中…</span>
      </div>
    {:else if pageItems.length === 0}
      <EmptyState
        icon="💾"
        title={searchKeyword ? '未找到匹配的存储项' : '暂无存储数据'}
        description={searchKeyword ? '尝试其他关键词' : '存储为空'}
      />
    {:else}
      {#each pageItems as [key, value]}
        <Card hover>
          <div class="list-item">
            <div class="list-item-info">
              <div class="list-item-title list-item-title--key">{key}</div>
              <div class="list-item-meta">{getItemSize(value)}</div>
            </div>
            <div class="list-item-actions">
              <Button variant="ghost" size="sm" onclick={() => openEdit(key, value)}>编辑</Button>
              <Button variant="ghost" size="sm" onclick={() => confirmDelete(key)}>删除</Button>
            </div>
          </div>
        </Card>
      {/each}
    {/if}
  </div>

  <!-- Pagination -->
  {#if totalPages > 1}
    <div class="pagination">
      <Button variant="secondary" size="sm" disabled={currentPage === 1} onclick={() => goToPage(currentPage - 1)}>
        上一页
      </Button>
      <span class="page-info">第 {currentPage} / {totalPages} 页</span>
      <Button variant="secondary" size="sm" disabled={currentPage === totalPages} onclick={() => goToPage(currentPage + 1)}>
        下一页
      </Button>
    </div>
  {/if}
</div>

<!-- Delete Dialog -->
<Dialog
  open={!!deleteTarget || deleteTargetIsAll}
  title={deleteTargetIsAll ? '清除所有存储' : '删除存储项'}
  confirmLabel={deleteTargetIsAll ? '确定清除' : '删除'}
  danger
  onclose={cancelDelete}
  onconfirm={executeDelete}
>
  {deleteTargetIsAll ? '确定要清除所有存储数据吗？此操作不可撤销。' : `确定删除 "${deleteTarget}"？`}
</Dialog>

<!-- Edit Dialog -->
<Dialog
  open={!!editTarget}
  title="编辑存储项"
  confirmLabel="保存"
  size="lg"
  showCancel
  onclose={cancelEdit}
  onconfirm={saveEdit}
>
  <div class="edit-key">{editTarget}</div>
  <CodeEditor bind:value={editValue} rows={14} language="json" />
</Dialog>

