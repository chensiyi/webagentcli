<script lang="ts">
  import { onMount, onDestroy, getContext } from 'svelte';
  import { waitKernelReady } from '../utils/kernel-ready.js';
  import Button from 'sidepanel/components/atoms/Button.svelte';
  import Card from 'sidepanel/components/layout/Card.svelte';
  import Badge from 'sidepanel/components/atoms/Badge.svelte';
  import EmptyState from 'sidepanel/components/layout/EmptyState.svelte';
  import { useToast } from 'sidepanel/components/overlays/toast-store.svelte';
  import { KernelEvents, KernelChannels } from 'kernel/Events.js';
  import type { KernelAPIContract } from '../api-contract.js';

  const ipc: any = getContext('ipc');
  const toolsChannel = ipc?.getOrCreateChannel?.(KernelChannels.TOOL) || ipc;
  const api = getContext('api') as KernelAPIContract;
  const toast = useToast();

  // 来源中文映射（与 ToolSource 对应）
  const SOURCE_LABEL: Record<string, string> = {
    builtin: '内置',
    script: '脚本',
    page: '页内',
    mcp: 'MCP',
  };

  // ---------- State ----------
  let tools = $state<any[]>([]);
  let isLoading = $state(false);

  // ---------- IPC 事件监听 ----------
  let unsubChanged: (() => void) | undefined;

  onMount(() => {
    waitKernelReady(ipc).then(() => refreshList());
    if (!toolsChannel) return;
    // 注册表变更（内核 register/unregister/enable/disable/update 均广播）时实时刷新
    unsubChanged = toolsChannel.on(KernelEvents.TOOL.CHANGED, () => refreshList());
  });

  onDestroy(() => {
    unsubChanged?.();
  });

  async function refreshList() {
    isLoading = true;
    try {
      const data = await api.tools.list();
      tools = data?.tools || [];
    } catch {
      tools = [];
    } finally {
      isLoading = false;
    }
  }

  // ---------- Actions ----------
  async function toggleTool(name: string, enabled: boolean) {
    try {
      await api.tools.toggle({ name, enabled });
      // facade 返回 null，直接重拉权威列表（写穿透：以主库为准）
      await refreshList();
      toast.success(enabled ? '已启用' : '已禁用');
    } catch {
      toast.error('操作失败');
    }
  }
</script>

<div class="list-page">
  <div class="list-page-header-row">
    <h2 class="list-page-title">工具</h2>
    <Button variant="ghost" size="sm" onclick={refreshList}>刷新</Button>
  </div>

  <div class="list-page-content">
    {#if isLoading}
      <div class="loading-state">
        <div class="spinner-pulse"></div>
        <span>加载中…</span>
      </div>
    {:else if tools.length === 0}
      <EmptyState
        icon="🧰"
        title="暂无工具"
        description="内置工具会在内核启动时自动注册"
      />
    {:else}
      <div class="tool-list">
        {#each tools as tool (tool.name)}
          <Card hover>
            <div class="list-item list-item--top">
              <div class="list-item-info">
                <div class="list-item-title">
                  {tool.name}
                  {#if tool.danger}
                    <Badge variant="error">危险</Badge>
                  {/if}
                </div>
                {#if tool.description}
                  <div class="list-item-desc">{tool.description}</div>
                {/if}
                <div class="list-item-meta">
                  <Badge variant="info">{SOURCE_LABEL[tool.source] || tool.source || '内置'}</Badge>
                  {#if tool.category && tool.category !== 'general'}
                    <Badge>{tool.category}</Badge>
                  {/if}
                  <Badge variant={tool.enabled ? 'success' : 'error'}>
                    {tool.enabled ? '已启用' : '已禁用'}
                  </Badge>
                  {#if tool.version}
                    <Badge>v{tool.version}</Badge>
                  {/if}
                </div>
              </div>
              <div class="list-item-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => toggleTool(tool.name, !tool.enabled)}
                >
                  {tool.enabled ? '禁用' : '启用'}
                </Button>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>
