<script lang="ts">
  import { extractText, renderMarkdown, extractMediaBlocks } from '../../utils/text.js';
  import MediaBlock from './MediaBlock.svelte';

  let { msg, collapsed, toggleMsg, confirmDelete, findToolNameByCallId } = $props();

  let mediaBlocks = $derived(extractMediaBlocks(msg.content));
  let raw = $derived(extractText(msg.content));
  let isJson = $derived(raw.startsWith('{') || raw.startsWith('['));
  let mdSource = $derived(isJson ? '```json\n' + raw + '\n```' : raw);
  let rendered = $derived(renderMarkdown(mdSource));
  let toolName = $derived(findToolNameByCallId(msg.toolCallId || ''));
  let toolCallLabel = $derived(toolName ? '🔧 ' + toolName + ' → 结果' : '🔧 工具结果');
</script>

<div
  class="message-tool-card"
  data-message-id={msg.id}
  data-tool-call-id={msg.toolCallId || ''}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="tool-card-header" onclick={() => toggleMsg(msg.id)}>
    <span class="tool-result-label">{toolCallLabel}</span>
    <span
      class="tool-result-toggle"
      class:collapsed={collapsed}
    >▼</span>
  </div>
  {#if !collapsed}
    <div class="tool-card-body">
      <div class="message-content markdown-body">{@html rendered}</div>
      {#if mediaBlocks.length > 0}
        <div class="media-grid">
          {#each mediaBlocks as b, i (b.mediaId || b.url || b.source || i)}
            <MediaBlock block={b} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <button
    type="button"
    class="msg-delete-btn"
    title="删除结果"
    onclick={() => confirmDelete(msg.id)}
  >×</button>
</div>
