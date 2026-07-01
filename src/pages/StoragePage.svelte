<script lang="ts">
  import Button from '../components/ui/Button.svelte';
  import Input from '../components/ui/Input.svelte';
  import Card from '../components/ui/Card.svelte';
  import Dialog from '../components/ui/Dialog.svelte';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import { useKernel } from '../lib/kernel-context.js';
  import { useToast } from '../lib/stores/toast.svelte.js';

  const kernel = useKernel<any>();
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
      const sm = kernel?.getStorageManager?.() || kernel?.get?.('storageManager');
      if (sm?.getAll) {
        const items = await sm.getAll();
        storageItems = items;
      }
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
      const sm = kernel?.getStorageManager?.() || kernel?.get?.('storageManager');
      if (deleteTargetIsAll) {
        await sm?.clearAll?.();
        toast.success('已清空');
      } else if (deleteTarget) {
        await sm?.delete?.({ key: deleteTarget });
        toast.success('已删除');
      }
      deleteTarget = null;
      deleteTargetIsAll = false;
      refreshList();
    } catch (e) {
      toast.error('操作失败');
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
      const sm = kernel?.getStorageManager?.() || kernel?.get?.('storageManager');
      await sm?.updateItem?.(editTarget, parsed);
      toast.success('已更新');
      editTarget = null;
      editValue = '';
      refreshList();
    } catch (e) {
      toast.error('JSON 格式错误');
    }
  }

  function getItemSize(value: any): string {
    const bytes = JSON.stringify(value).length;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }
</script>

<div class="storage-page">
  <div class="page-header-row">
    <h2 class="page-title">存储管理</h2>
    <Button variant="secondary" size="sm" loading={isLoading} onclick={refreshList}>刷新</Button>
  </div>

  <div class="search-area">
    <Input placeholder="搜索存储项…" value={searchKeyword} oninput={handleSearch} />
  </div>

  <!-- Stats -->
  <Card>
    <div class="stats-row">
      <span class="stats-text">共 {filteredItems.length} 项 · 总计 {totalSizeKB} KB</span>
      <Button variant="danger" size="sm" onclick={confirmClearAll}>清除所有</Button>
    </div>
  </Card>

  <!-- List -->
  <div class="list-area">
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
          <div class="storage-row">
            <div class="storage-info">
              <div class="storage-key">{key}</div>
              <div class="storage-meta">{getItemSize(value)}</div>
            </div>
            <div class="storage-actions">
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
  showCancel
  onclose={cancelEdit}
  onconfirm={saveEdit}
>
  <div class="edit-key">{editTarget}</div>
  <textarea
    class="edit-textarea"
    rows="10"
    value={editValue}
    oninput={(e) => editValue = (e.target as HTMLTextAreaElement).value}
  ></textarea>
</Dialog>

<style>
  .storage-page {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    height: 100%;
    overflow: hidden;
  }

  .page-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .page-title {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
  }

  .search-area {
    margin: 0;
  }

  /* Stats */
  .stats-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stats-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  /* List */
  .list-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .storage-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }

  .storage-info {
    flex: 1;
    min-width: 0;
  }

  .storage-key {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    font-family: var(--font-mono);
    word-break: break-all;
    margin-bottom: 2px;
  }

  .storage-meta {
    font-size: var(--text-xs);
    color: var(--color-text-hint);
  }

  .storage-actions {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-3);
    padding-top: var(--space-2);
  }

  .page-info {
    font-size: var(--text-sm);
    color: var(--color-text-hint);
  }

  /* Loading */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-16) var(--space-8);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .spinner-pulse {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Edit Dialog */
  .edit-key {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    font-family: var(--font-mono);
    margin-bottom: var(--space-3);
    word-break: break-all;
  }

  .edit-textarea {
    width: 100%;
    min-height: 180px;
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    outline: none;
    resize: vertical;
    line-height: 1.5;
  }

  .edit-textarea:focus {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-focus);
  }
</style>
