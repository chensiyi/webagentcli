<script lang="ts">
  import { extractText } from '../../utils/text.js';

  let { tcId, tcName, tcArgs, tcResult, tcResultText, tcStatus, collapsed, toggleToolCall } = $props();

  let argsStr = $derived(JSON.stringify(tcArgs || {}, null, 2));
</script>

<div class="tool-call-card" data-tool-call-id={tcId}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="tool-call-header"
    onclick={() => toggleToolCall(tcId)}
  >
    <span class="tool-card-icon">{tcStatus === 'completed' ? '✅' : '🔧'}</span>
    <span class="tool-card-name">{tcName}</span>
    <span class="tool-card-args-summary"
      >({argsStr.slice(0, 60)}{argsStr.length > 60 ? '...' : ''})</span
    >
  </div>
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
