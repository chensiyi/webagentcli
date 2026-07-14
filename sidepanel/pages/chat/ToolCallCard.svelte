<script lang="ts">
  import { extractText } from '../../utils/text.js';
  import { confirmStore } from '../../utils/confirm-store.svelte.js';

  let { tcId, tcName, tcArgs, tcResult, tcResultText, tcStatus, collapsed, toggleToolCall } = $props();

  let argsStr = $derived(JSON.stringify(tcArgs || {}, null, 2));

  // 该工具调用是否正在等待人工确认（气泡内确认，关联 toolCallId）
  let confirm = $derived(confirmStore.pending[tcId]);
  let isRejected = $derived(!!tcResult && typeof tcResult === 'object' && (tcResult as any).status === 'rejected');

  let statusIcon = $derived(
    confirm ? '⏳'
      : isRejected ? '⛔'
      : tcStatus === 'completed' ? '✅'
      : tcStatus === 'running' ? '🔄'
      : '🔧'
  );
  let statusBadge = $derived(
    confirm ? { text: '待确认', cls: 'badge-warn' }
      : isRejected ? { text: '已拒绝', cls: 'badge-error' }
      : tcStatus === 'completed' ? { text: '已完成', cls: 'badge-ok' }
      : tcStatus === 'running' ? { text: '执行中', cls: 'badge-info' }
      : { text: '等待中', cls: 'badge-muted' }
  );
</script>

<div class="tool-call-card" class:is-pending={!!confirm} data-tool-call-id={tcId}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="tool-call-header"
    onclick={() => toggleToolCall(tcId)}
  >
    <span class="tool-card-icon" class:spin={tcStatus === 'running' && !confirm}>{statusIcon}</span>
    <span class="tool-card-name">{tcName}</span>
    <span class="tool-card-badge {statusBadge.cls}">{statusBadge.text}</span>
    <span class="tool-card-args-summary"
      >({argsStr.slice(0, 60)}{argsStr.length > 60 ? '...' : ''})</span
    >
  </div>

  {#if confirm}
    <div class="tool-confirm-box">
      <div class="tool-confirm-reason">⚠️ {confirm.reason}</div>
      <div class="tool-confirm-actions">
        <button
          class="btn-danger-sm"
          onclick={() => void confirmStore.approve(tcId)}
        >允许执行</button>
        <button
          class="btn-ghost-sm"
          onclick={() => { void confirmStore.rememberAllow(tcId); void confirmStore.approve(tcId); }}
          title="本次执行并标记为本会话开启，以后不再询问"
        >始终允许</button>
        <button
          class="btn-ghost-sm"
          onclick={() => void confirmStore.reject(tcId)}
        >取消</button>
      </div>
      <div class="tool-confirm-hint">「允许执行」每次都会询问；「始终允许」后本会话不再确认</div>
    </div>
  {/if}

  {#if !collapsed}
    <div class="tool-call-body">
      <div class="tool-call-args-section">
        <span class="tool-call-section-label">参数</span>
        <pre>{argsStr}</pre>
      </div>
      {#if tcResultText}
        <div class="tool-call-result-section">
          <span class="tool-call-section-label">结果</span>
          <pre>{tcResultText.slice(0, 500)}{tcResultText.length > 500 ? '\n...' : ''}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>
