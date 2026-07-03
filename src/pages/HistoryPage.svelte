<script lang="ts">
  import Button from '../components/ui/Button.svelte';
  import Input from '../components/ui/Input.svelte';
  import Badge from '../components/ui/Badge.svelte';
  import Dialog from '../components/ui/Dialog.svelte';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import { useKernel, useNavigate } from '../lib/kernel-context.js';

  const kernel = useKernel<any>();
  const navigateTo = useNavigate();

  // ---------- Reactive State ----------
  let searchKeyword = $state('');
  let sessions = $state<any[]>([]);
  let deleteTargetId = $state<string | null>(null);
  let isLoaded = $state(false);

  // ---------- Computed ----------
  const groupedSessions = $derived(groupAndFilter(sessions, searchKeyword));

  // ---------- Init ----------
  $effect(() => {
    const sm = kernel?.getSessionManager?.();
    if (!sm || isLoaded) return;
    isLoaded = true;
    refreshList();

    // Listen for session changes
    const ipc = kernel?.getIPC?.();
    if (ipc) {
      ipc.on('session:changed', refreshList);
    }
  });

  function refreshList() {
    const sm = kernel?.getSessionManager?.();
    if (!sm) return;
    const all = sm.getAllSessions?.() || [];
    sessions = [...all].sort(
      (a: any, b: any) => (b.updated_at || b.updatedAt || 0) - (a.updated_at || a.updatedAt || 0)
    );
  }

  // ---------- Helpers ----------
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
      ? all.filter((s: any) => generateTitle(s.messages).toLowerCase().includes(keyword.toLowerCase()))
      : all;

    const today: any[] = [];
    const yesterday: any[] = [];
    const earlier: any[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;

    for (const s of filtered) {
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

  function getMessageCount(messages: any[]): number {
    return messages?.filter((m: any) => m?.role === 'user').length || 0;
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
    const sm = kernel?.getSessionManager?.();
    sm?.setCurrentSession?.(id);
    navigateTo('chat');
  }

  function confirmDelete(id: string, e: MouseEvent) {
    e.stopPropagation();
    deleteTargetId = id;
  }

  async function executeDelete() {
    if (!deleteTargetId) return;
    const sm = kernel?.getSessionManager?.();
    await sm?.deleteSession?.(deleteTargetId);
    deleteTargetId = null;
    refreshList();
  }

  function cancelDelete() {
    deleteTargetId = null;
  }
</script>

<div class="history-page">
  <h2 class="page-title">历史对话</h2>

  <div class="search-area">
    <Input
      placeholder="搜索对话…"
      value={searchKeyword}
      oninput={handleSearchInput}
    />
  </div>

  <div class="list-area">
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
              class="session-card"
              onclick={() => loadConversation(session.id)}
              onkeydown={(e) => { if (e.key === 'Enter') loadConversation(session.id); }}
              role="button"
              tabindex="0"
            >
              <div class="session-body">
                <div class="session-title">{generateTitle(session.messages)}</div>
                <div class="session-meta">
                  <span class="session-time">{formatTime(session.updated_at || session.updatedAt || 0)}</span>
                  <Badge>{getMessageCount(session.messages)} 消息</Badge>
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

<style>
  .history-page {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .page-title {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 var(--space-3) 0;
  }

  .search-area {
    margin-bottom: var(--space-3);
  }

  .list-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* ---- Loading ---- */
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

  /* ---- Time Groups ---- */
  .time-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .time-label {
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--color-text-hint);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: var(--space-2) 2px var(--space-1);
  }

  /* ---- Session Card ---- */
  .session-card {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .session-card:hover {
    border-color: var(--color-border-medium);
    box-shadow: var(--shadow-sm);
  }

  .session-card:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .session-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .session-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .session-time {
    font-size: var(--text-xs);
    color: var(--color-text-hint);
  }

</style>
