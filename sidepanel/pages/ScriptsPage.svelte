<script lang="ts">
  import { onMount, onDestroy, getContext } from 'svelte';
  import { waitKernelReady } from '../utils/kernel-ready.js';
  import Button from '../components/atoms/Button.svelte';
  import Card from '../components/layout/Card.svelte';
  import CodeEditor from '../components/forms/CodeEditor.svelte';
  import Badge from '../components/atoms/Badge.svelte';
  import Dialog from '../components/overlays/Dialog.svelte';
  import EmptyState from '../components/layout/EmptyState.svelte';
  import { useToast } from '../components/overlays/toast-store.svelte';
  import { KernelEvents, KernelChannels } from 'kernel/Events.js';
  import type { KernelAPIContract } from '../api-contract.js';
  import { getShellCache } from 'sidepanel/utils/shell-cache.js';

  const ipc: any = getContext('ipc');
  const scriptsChannel = ipc?.getOrCreateChannel?.(KernelChannels.SCRIPTS) || ipc;
  const api = getContext('api') as KernelAPIContract;
  const toast = useToast();
  const cache = getShellCache(api);

  // ---------- State ----------
  let scripts = $state<any[]>([]);
  let menu = $state<Record<string, { id: string; name: string }[]>>({});
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

  // ---------- IPC 事件监听 ----------
  let unsubScriptError: (() => void) | undefined;

  onMount(() => {
    // 内核就绪后再加载列表（等待 bootComplete 消息，时序门控）
    waitKernelReady(ipc).then(() => refreshList());

    if (!scriptsChannel) return;

    // 脚本错误（Kernel 广播，非 RPC 响应）；组件销毁时必须退订
    unsubScriptError = scriptsChannel.on(KernelEvents.SCRIPTS.ERROR, (data: any) => {
      toast.error(data?.error || '脚本操作失败');
      isLoading = false;
    });
    // 用户脚本菜单命令现由 scripts.getMenu() RPC 在打开列表时主动拉取，
    // 不再依赖 SCRIPTS.MENU_CHANGED 实时广播（见 gm-api.js / rpc-facades.ts）。
  });

  onDestroy(() => {
    unsubScriptError?.();
  });

  async function refreshList() {
    isLoading = true;
    try {
      const data = await api.scripts.list();
      scripts = data?.scripts || [];
      await refreshMenu();
    } catch {
      scripts = [];
    } finally {
      isLoading = false;
    }
  }

  /** 拉取用户脚本菜单命令（按 scriptId 聚合） */
  async function refreshMenu() {
    try {
      const data = await api.scripts.getMenu();
      menu = data?.menu || {};
    } catch {
      menu = {};
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
      showInstallForm = false;
      editCode = '';
      promptRestartKernel('脚本已安装');
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
      editingScriptId = null;
      editCode = '';
      promptRestartKernel('脚本已更新');
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
    const id = deleteTargetId;
    deleteTargetId = null;
    try {
      const data = await api.scripts.uninstall({ id });
      scripts = data?.scripts || [];
      promptRestartKernel('脚本已删除');
    } catch {
      toast.error('删除失败');
    }
  }

  /**
   * 脚本安装/更新/卸载后，内核侧的 @tool 工具投影与注册脚本不会自动重新同步
   * （syncRegisteredScripts / reconcileScriptTools 仅在启动期跑一次），
   * 故询问是否立即重启内核，让 ToolsManager 移除/新增工具、改动彻底生效。
   */
  function promptRestartKernel(label: string) {
    toast.action(
      `${label}。是否立即重启内核使改动生效？`,
      [
        {
          label: '立即重启',
          variant: 'primary',
          onClick: async () => {
            try {
              await api.kernel.reload();
              cache.invalidateTools();
              toast.success('内核已重启，改动已生效');
            } catch {
              toast.error('内核重启失败，请手动重载扩展');
            }
          },
        },
        { label: '稍后', variant: 'default', onClick: () => {} },
      ],
      'info',
    );
  }

  function cancelDelete() {
    deleteTargetId = null;
  }

  async function invokeMenu(scriptId: string, id: string) {
    try {
      await api.scripts.invokeMenu({ scriptId, id });
    } catch {
      toast.error('触发失败');
    }
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
                <div class="list-item-title">
                  {#if script.icon}
                    <img class="script-icon" src={script.icon} alt="" loading="lazy" onerror={(e: any) => (e.currentTarget.style.display = 'none')} />
                  {/if}
                  {script.name}
                </div>
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
                  {#if script.include?.length > 0}
                    <Badge variant="info">{script.include.length} 包含规则</Badge>
                  {/if}
                  {#if script.exclude?.length > 0}
                    <Badge variant="warning">{script.exclude.length} 排除规则</Badge>
                  {/if}
                  {#if script.resource?.length > 0}
                    <Badge variant="info">{script.resource.length} 资源</Badge>
                  {/if}
                </div>
                {#if menu[script.id]?.length > 0}
                  <div class="script-menu">
                    <div class="script-menu-label">菜单命令</div>
                    <div class="script-menu-list">
                      {#each menu[script.id] as cmd (cmd.id)}
                        <Button variant="ghost" size="sm" onclick={() => invokeMenu(script.id, cmd.id)}>{cmd.name}</Button>
                      {/each}
                    </div>
                  </div>
                {/if}
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

<style>
  .script-icon {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    object-fit: contain;
    vertical-align: -3px;
    margin-right: 6px;
    background: #f1f5f9;
  }
  .script-menu {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #e5e7eb;
  }
  .script-menu-label {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 4px;
  }
  .script-menu-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>

