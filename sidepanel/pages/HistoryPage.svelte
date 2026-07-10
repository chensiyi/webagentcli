<script lang="ts">
  import { getContext, onMount, onDestroy } from 'svelte';
  import { waitKernelReady } from '../utils/kernel-ready.js';
  import Button from '../components/atoms/Button.svelte';
  import Input from '../components/forms/Input.svelte';
  import Badge from '../components/atoms/Badge.svelte';
  import Dialog from '../components/overlays/Dialog.svelte';
  import EmptyState from '../components/layout/EmptyState.svelte';
  import { KernelEvents, KernelChannels } from 'kernel/Events.js';
  import type { KernelAPIContract } from '../api-contract.js';
  import { getShellCache } from '../cache/shell-cache.js';
  import { useToast } from '../components/overlays/toast-store.svelte';
  import { Log } from 'kernel/services/Log.js';

  const toast = useToast();

  const ipc: any = getContext('ipc');
  const sessionChannel = ipc?.getOrCreateChannel?.(KernelChannels.SESSION) || ipc;
  const api = getContext('api') as KernelAPIContract;
  const cache = getShellCache(api);
  const navigateTo = getContext<any>('navigate');

  // ---------- Reactive State ----------
  let searchKeyword = $state('');
  let sessions = $state<any[]>([]);
  let deleteTargetId = $state<string | null>(null);
  let isLoaded = $state(false);

  // ---------- Computed ----------
  const groupedSessions = $derived(groupAndFilter(sessions, searchKeyword));

  // ---------- Init ----------
  let unsubSessionUpdated: (() => void) | undefined;

  onMount(() => {
    // 订阅会话更新广播；组件销毁时必须退订（{#key activePage} 会重挂载，否则叠加幽灵监听器）
    unsubSessionUpdated = sessionChannel?.on(KernelEvents.SESSION.SESSION_UPDATED, handleSessionUpdated);
    // 内核就绪后再加载（等待 bootComplete 消息，时序门控）
    waitKernelReady(ipc).then(() => {
      refreshList(true).finally(() => { isLoaded = true; }); // 页面（重）加载：强制全量获取并刷新缓存
    });
  });

  onDestroy(() => {
    unsubSessionUpdated?.();
  });

  function sortSessions(all: any[]): any[] {
    // 防御：序列化边界可能把个别 toJSON 异常的会话变成 null，必须过滤掉，
    // 否则比较器访问 a.updated_at 会抛 "Cannot read properties of null"。
    return (all || [])
      .filter((s: any) => s && s.id)
      .sort(
        (a: any, b: any) => (b.updated_at || b.updatedAt || 0) - (a.updated_at || a.updatedAt || 0)
      );
  }

  async function refreshList(force = false) {
    try {
      // 页面（重）加载入口传 force=true：全量获取并把结果写回缓存；删除后走 invalidate+refreshList()（标脏自动重拉）
      const list = await cache.getSessionList(force);
      sessions = sortSessions(list.sessions);
    } catch (e) {
      Log.error('HistoryPage', 'load sessions failed', e);
    }
  }

  /**
   * SESSION_UPDATED 事件处理：优先用 Kernel 携带的 index 视图做差量 patch（零 RPC）；
   * 旧版 Kernel 不带 session 字段时降级为全量刷新。
   */
  function handleSessionUpdated(payload: any) {
    const id = payload?.sessionId;
    if (id && payload?.session) {
      const updated = cache.patchSessionList(id, payload.session as Record<string, unknown>);
      sessions = sortSessions(updated.sessions);
    } else {
      cache.invalidateSessionList();
      refreshList();
    }
  }

  // ---------- Helpers ----------
  /** 从首条用户消息生成标题（仅用于 session.title 为空的旧会话兜底） */
  function generateTitle(messages: any[]): string {
    if (!messages?.length) return '新对话';
    const firstUser = messages.find((m: any) => m?.role === 'user');
    if (!firstUser) return '新对话';
    let content = '';
    if (typeof firstUser.content === 'string') {
      content = firstUser.content;
    } else if (Array.isArray(firstUser.content)) {
      content = firstUser.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text || '')
        .join(' ');
    }
    content = content.replace(/\n/g, ' ').trim();
    return content ? (content.length > 24 ? content.slice(0, 24) + '…' : content) : '新对话';
  }

  /** 优先用 session.title，旧会话无标题时兜底 */
  function getSessionTitle(session: any): string {
    return session?.title || session?.preview || generateTitle(session?.messages);
  }

  function formatTime(ts: number): string {
    const now = new Date();
    const date = new Date(ts);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 0) return `今天 ${time}`;
    if (diffDays === 1) return `昨天 ${time}`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  function groupAndFilter(all: any[], keyword: string) {
    const filtered = keyword
      ? all.filter((s: any) => getSessionTitle(s).toLowerCase().includes(keyword.toLowerCase()))
      : all;

    const today: any[] = [];
    const yesterday: any[] = [];
    const earlier: any[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;

    for (const s of filtered) {
      if (!s || !s.id) continue; // 防御：跳过 null / 非法条目，避免读 updated_at 崩溃
      const ts = s.updated_at || s.updatedAt || 0;
      if (ts >= todayStart) today.push(s);
      else if (ts >= yesterdayStart) yesterday.push(s);
      else earlier.push(s);
    }

    const result: { label: string; items: any[] }[] = [];
    if (today.length) result.push({ label: '今天', items: today });
    if (yesterday.length) result.push({ label: '昨天', items: yesterday });
    if (earlier.length) result.push({ label: '更早', items: earlier });
    return result;
  }

  function getMessageCount(session: any): number {
    if (typeof session?.messageCount === 'number') return session.messageCount;
    return session?.messages?.filter((m: any) => m?.role === 'user').length || 0;
  }

  function getProviderLabel(session: any): string {
    const apiStandard = session.settings?.apiStandard || session.apiStandard || '';
    const labels: Record<string, string> = {
      openai: 'OpenAI',
      openrouter: 'OpenRouter',
      'lm-studio': 'LM Studio',
    };
    return labels[apiStandard] || apiStandard || '';
  }

  // ---------- Actions ----------
  function handleSearchInput(e: Event) {
    searchKeyword = (e.target as HTMLInputElement).value;
  }

  function loadConversation(id: string) {
    api.session.switch({ sessionId: id })
      .then(() => navigateTo('chat'))
      .catch((e) => {
        Log.error('HistoryPage', 'switch session failed', e);
        toast.error('切换会话失败：' + ((e as Error)?.message || String(e)));
      });
  }

  function confirmDelete(id: string, e: MouseEvent) {
    e.stopPropagation();
    deleteTargetId = id;
  }

  async function executeDelete() {
    if (!deleteTargetId) return;
    try {
      await api.session.delete({ sessionId: deleteTargetId });
      cache.invalidateSessionList();
      await refreshList();
      toast.success('会话已删除');
    } catch (e) {
      Log.error('HistoryPage', 'delete session failed', e);
      toast.error('删除会话失败：' + ((e as Error)?.message || String(e)));
    } finally {
      deleteTargetId = null;
    }
  }

  function cancelDelete() {
    deleteTargetId = null;
  }
</script>

<div class="list-page">
  <h2 class="list-page-title">历史对话</h2>

  <div class="list-page-search-area">
    <Input
      placeholder="搜索对话…"
      value={searchKeyword}
      oninput={handleSearchInput}
    />
  </div>

  <div class="list-page-content">
    {#if !isLoaded}
      <div class="loading-state">
        <div class="spinner-pulse"></div>
        <span>加载中…</span>
      </div>
    {:else if groupedSessions.length === 0}
      <EmptyState
        icon="📋"
        title={searchKeyword ? '没有找到匹配的对话' : '暂无历史对话'}
        description={searchKeyword ? '尝试其他关键词' : '开始新对话后这里会显示历史记录'}
      />
    {:else}
      {#each groupedSessions as group}
        <div class="time-group">
          <div class="time-label">{group.label}</div>
          {#each group.items as session (session.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="list-item"
              onclick={() => loadConversation(session.id)}
              onkeydown={(e) => { if (e.key === 'Enter') loadConversation(session.id); }}
              role="button"
              tabindex="0"
            >
              <div class="list-item-info">
                <div class="list-item-title">{getSessionTitle(session)}</div>
                <div class="list-item-meta">
                  <span class="list-item-time">{formatTime(session.updated_at || session.updatedAt || 0)}</span>
                  <Badge>{getMessageCount(session)} 消息</Badge>
                  {#if getProviderLabel(session)}
                    <Badge variant="primary">{getProviderLabel(session)}</Badge>
                  {/if}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onclick={(e: MouseEvent) => confirmDelete(session.id, e)}
              >
                🗑
              </Button>
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- Delete Confirmation Dialog -->
<Dialog
  open={!!deleteTargetId}
  title="删除对话"
  confirmLabel="删除"
  danger
  onclose={cancelDelete}
  onconfirm={executeDelete}
>
  确定删除此对话？此操作不可恢复。
</Dialog>

