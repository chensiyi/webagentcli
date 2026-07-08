<script lang="ts">
  import { onMount, getContext } from 'svelte';
  import Button from '../components/atoms/Button.svelte';
  import Card from '../components/layout/Card.svelte';
  import CodeEditor from '../components/forms/CodeEditor.svelte';
  import Badge from '../components/atoms/Badge.svelte';
  import Dialog from '../components/overlays/Dialog.svelte';
  import EmptyState from '../components/layout/EmptyState.svelte';
  import { useToast } from '../components/overlays/toast-store.svelte';
  import { KernelEvents } from '../../kernel/Events.js';
  import type { KernelAPIContract } from '../api-contract.js';

  const ipc: any = getContext('ipc');
  const scriptsChannel = ipc?.getOrCreateChannel?.('scripts') || ipc;
  const api = getContext('api') as KernelAPIContract;
  const toast = useToast();

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

    // 脚本错误（Kernel 广播，非 RPC 响应）
    scriptsChannel.on(KernelEvents.SCRIPTS.ERROR, (data: any) => {
      toast.error(data?.error || '脚本操作失败');
      isLoading = false;
    });
  });

  async function refreshList() {
    isLoading = true;
    try {
      const data = await api.scripts.list();
      scripts = data?.scripts || [];
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
      const data = await api.scripts.install({ code: editCode });
      scripts = data?.scripts || [];
      toast.success('脚本已安装');
      showInstallForm = false;
      editCode = '';
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
      const data = await api.scripts.edit({ id: editingScriptId, code: editCode });
      scripts = data?.scripts || [];
      toast.success('已保存');
      editingScriptId = null;
      editCode = '';
    } catch (e) {
      toast.error('保存失败');
    }
  }

  async function toggleScript(id: string, enabled: boolean) {
    try {
      const data = await api.scripts.toggle({ id, enabled });
      scripts = data?.scripts || [];
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
      const data = await api.scripts.uninstall({ id: deleteTargetId });
      scripts = data?.scripts || [];
      toast.success('已删除');
    } catch {
      toast.error('删除失败');
    } finally {
      deleteTargetId = null;
    }
  }

  function cancelDelete() {
    deleteTargetId = null;
  }
</script>

<div class="list-page">
  <div class="list-page-header-row">
    <h2 class="list-page-title">用户脚本</h2>
      <Button
        variant="ghost"
        size="sm"
        onclick={() => window.open('https://www.tampermonkey.net/scripts.php', '_blank')}
      >
        🐵 脚本库
      </Button>
      <Button
        variant={showInstallForm ? 'secondary' : 'primary'}
        size="sm"
        onclick={toggleInstallForm}
      >
        {showInstallForm ? '取消' : '安装脚本'}
      </Button>
  </div>

  <div class="list-page-content">
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
            <div class="list-item list-item--top">
              <div class="list-item-info">
                <div class="list-item-title">{script.name}</div>
                {#if script.description}
                  <div class="list-item-desc">{script.description}</div>
                {/if}
                <div class="list-item-meta">
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
              <div class="list-item-actions">
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

