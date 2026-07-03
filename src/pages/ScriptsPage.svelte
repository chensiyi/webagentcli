<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Button from '../components/ui/Button.svelte';
  import Card from '../components/ui/Card.svelte';
  import CodeEditor from '../components/ui/CodeEditor.svelte';
  import Badge from '../components/ui/Badge.svelte';
  import Dialog from '../components/ui/Dialog.svelte';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import { useKernel } from '../lib/kernel-context.js';
  import { useToast } from '../lib/stores/toast.svelte.js';
  import { KernelEvents } from '../../kernel/Events.js';

  const kernel = useKernel<any>();
  const toast = useToast();

  const ipc: any = kernel?.getIPC?.();
  const scriptsChannel = ipc?.getOrCreateChannel?.('scripts') || ipc;

  // ---------- State ----------
  let scripts = $state<any[]>([]);
  let isLoaded = $state(false);
  let isLoading = $state(false);
  let showInstallForm = $state(false);
  let editingScriptId = $state<string | null>(null);
  let editCode = $state('');
  let deleteTargetId = $state<string | null>(null);

  const scriptPlaceholder = `// ==UserScript==
// @name    My Script
// @match   *://*/*
// ==/UserScript==

(function() {
  'use strict';
  // code here...
})();`;

  // ---------- Init ----------
  $effect(() => {
    if (isLoaded) return;
    isLoaded = true;
    refreshList();
  });

  // ---------- IPC 事件监听 ----------
  onMount(() => {
    if (!scriptsChannel) return;

    // 脚本列表更新（来自 ScriptsManager 的 loadAll 事件，或 ManageUserScriptsTool 操作后）
    scriptsChannel.on(KernelEvents.SCRIPTS.LOADED, (data: any) => {
      const newScripts = data?.scripts;
      if (Array.isArray(newScripts)) {
        scripts = newScripts;
        isLoading = false;
      }
    });

    // 脚本错误
    scriptsChannel.on(KernelEvents.SCRIPTS.ERROR, (data: any) => {
      toast.error(data?.error || '脚本操作失败');
      isLoading = false;
    });
  });

  onDestroy(() => {
    // IPC 监听器清理交由 kernel 管理（随页面卸载自然销毁）
  });

  async function refreshList() {
    isLoading = true;
    try {
      const sm = kernel?.getScriptsManager?.();
      if (sm?.loadAll) {
        scripts = await sm.loadAll() || [];
      }
    } catch {
      scripts = [];
    } finally {
      isLoading = false;
    }
  }

  // ---------- Actions ----------
  function toggleInstallForm() {
    showInstallForm = !showInstallForm;
    editingScriptId = null;
    editCode = '';
  }

  async function handleInstall() {
    if (!editCode.trim()) {
      toast.warning('请输入脚本代码');
      return;
    }
    try {
      const sm = kernel?.getScriptsManager?.();
      await sm?.install?.(editCode);
      toast.success('脚本已安装');
      showInstallForm = false;
      editCode = '';
      refreshList();
    } catch (e) {
      toast.error('安装失败');
    }
  }

  function startEdit(id: string) {
    const script = scripts.find((s: any) => s.id === id);
    if (!script) return;
    editingScriptId = id;
    editCode = script.code || '';
    showInstallForm = false;
  }

  function cancelEdit() {
    editingScriptId = null;
    editCode = '';
  }

  async function saveEdit() {
    if (!editingScriptId || !editCode.trim()) {
      toast.warning('脚本代码不能为空');
      return;
    }
    try {
      const sm = kernel?.getScriptsManager?.();
      await sm?.edit?.(editingScriptId, editCode);
      toast.success('已保存');
      editingScriptId = null;
      editCode = '';
      refreshList();
    } catch (e) {
      toast.error('保存失败');
    }
  }

  async function toggleScript(id: string, enabled: boolean) {
    try {
      const sm = kernel?.getScriptsManager?.();
      await sm?.toggle?.(id, enabled);
      scripts = scripts.map((s: any) => s.id === id ? { ...s, enabled } : s);
      toast.success(enabled ? '已启用' : '已禁用');
    } catch {
      toast.error('操作失败');
    }
  }

  function confirmDelete(id: string) {
    deleteTargetId = id;
  }

  async function executeDelete() {
    if (!deleteTargetId) return;
    try {
      const sm = kernel?.getScriptsManager?.();
      await sm?.uninstall?.(deleteTargetId);
      toast.success('已删除');
      deleteTargetId = null;
      refreshList();
    } catch {
      toast.error('删除失败');
    }
  }

  function cancelDelete() {
    deleteTargetId = null;
  }
</script>

<div class="scripts-page">
  <div class="page-header-row">
    <h2 class="page-title">用户脚本</h2>
    <Button
      variant={showInstallForm ? 'secondary' : 'primary'}
      size="sm"
      onclick={toggleInstallForm}
    >
      {showInstallForm ? '取消' : '安装脚本'}
    </Button>
  </div>

  <div class="scripts-body">
    {#if isLoading}
      <div class="loading-state">
        <div class="spinner-pulse"></div>
        <span>加载中…</span>
      </div>
    {:else if showInstallForm}
      <!-- Install Form -->
      <Card>
        <div class="install-form">
          <div class="install-hint">粘贴 Tampermonkey 用户脚本代码：</div>
          <CodeEditor bind:value={editCode} rows={12} placeholder={scriptPlaceholder} />
          <Button variant="primary" fullWidth onclick={handleInstall}>安装</Button>
        </div>
      </Card>
    {:else if editingScriptId}
      <!-- Edit Form -->
      {@const script = scripts.find((s: any) => s.id === editingScriptId)}
      {#if script}
        <Card>
          <div class="edit-form">
            <div class="edit-header">编辑脚本: {script.name}</div>
            <CodeEditor bind:value={editCode} rows={12} />
            <div class="edit-actions">
              <Button variant="secondary" onclick={cancelEdit}>取消</Button>
              <Button variant="primary" onclick={saveEdit}>保存</Button>
            </div>
          </div>
        </Card>
      {/if}
    {:else if scripts.length === 0}
      <EmptyState
        icon="📜"
        title="暂无脚本"
        description="点击右上角安装脚本开始添加"
      />
    {:else}
      <!-- Script Cards -->
      <div class="script-list">
        {#each scripts as script (script.id)}
          <Card hover>
            <div class="script-card">
              <div class="script-info">
                <div class="script-name">{script.name}</div>
                {#if script.description}
                  <div class="script-desc">{script.description}</div>
                {/if}
                <div class="script-meta">
                  {#if script.version}
                    <Badge>v{script.version}</Badge>
                  {/if}
                  <Badge variant={script.enabled ? 'success' : 'error'}>
                    {script.enabled ? '已启用' : '已禁用'}
                  </Badge>
                  {#if script.match?.length > 0}
                    <Badge variant="info">{script.match.length} 匹配规则</Badge>
                  {/if}
                </div>
              </div>
              <div class="script-actions">
                <Button variant="ghost" size="sm" onclick={() => startEdit(script.id)}>编辑</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => toggleScript(script.id, !script.enabled)}
                >
                  {script.enabled ? '禁用' : '启用'}
                </Button>
                <Button variant="ghost" size="sm" onclick={() => confirmDelete(script.id)}>删除</Button>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Delete Dialog -->
<Dialog
  open={!!deleteTargetId}
  title="删除脚本"
  confirmLabel="删除"
  danger
  onclose={cancelDelete}
  onconfirm={executeDelete}
>
  确定删除此脚本？此操作不可恢复。
</Dialog>

<style>
  .scripts-page {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .page-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  .page-title {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
  }

  .scripts-body {
    flex: 1;
    overflow-y: auto;
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

  /* Script Cards */
  .script-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .script-card {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .script-info {
    flex: 1;
    min-width: 0;
  }

  .script-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 4px;
  }

  .script-desc {
    font-size: var(--text-xs);
    color: var(--color-text-hint);
    margin-bottom: var(--space-2);
    line-height: 1.4;
  }

  .script-meta {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .script-actions {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  /* Forms */
  .install-form, .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .install-hint {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .edit-header {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
