<script lang="ts">
  import ToolCallCard from './ToolCallCard.svelte';
  import MediaBlock from './MediaBlock.svelte';
  import { extractText, renderMarkdown } from '../../utils/text.js';

  let {
    msg,
    isUser,
    isAssistant,
    displayContent,
    displayReasoning,
    hasReasoning,
    hasContent,
    hasToolCalls,
    mediaBlocks = [],
    expandedReasoning,
    collapsedToolCalls,
    toggleReasoning,
    toggleToolCall,
    confirmDelete,
    findToolResult,
    findToolNameByCallId,
    messages
  } = $props();

  // 计算每个 toolCall 的派生状态（用 $derived 确保随 messages 变化而更新）
  let toolCallData = $derived.by(() => {
    if (!hasToolCalls || !msg.toolCalls) return [];
    return msg.toolCalls.map((tc: any) => {
      const tcId = tc.id || '';
      const tcResult = findToolResult(tcId);
      return {
        id: tcId,
        name: tc.toolName || tc.name || 'unknown',
        args: tc.input || tc.arguments || {},
        result: tcResult,
        resultText: tcResult ? extractText(tcResult.content) : '',
        status: tcResult ? 'completed' : (tc.status || 'pending'),
      };
    });
  });
</script>

<div
  class="message-bubble"
  class:message-user={isUser}
  class:message-assistant={isAssistant}
  data-message-id={msg.id}
>
  <div class="message-body">
    <!-- 思考过程（Assistant 专属） -->
    {#if hasReasoning}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="reasoning-section" class:reasoning-expanded={expandedReasoning[msg.id]}>
        <div
          class="reasoning-header"
          onclick={() => toggleReasoning(msg.id)}
        >
          <span>💭 思考过程</span>
          <span class="reasoning-toggle">▼</span>
        </div>
        <div class="reasoning-content">
          <pre>{displayReasoning}</pre>
        </div>
      </div>
    {/if}

    <!-- 工具调用卡片（Assistant 专属） -->
    {#if hasToolCalls}
      <div class="tool-calls-container">
        {#each toolCallData as tcd (tcd.id)}
          <ToolCallCard
            tcId={tcd.id}
            tcName={tcd.name}
            tcArgs={tcd.args}
            tcResult={tcd.result}
            tcResultText={tcd.resultText}
            tcStatus={tcd.status}
            collapsed={collapsedToolCalls[tcd.id] || false}
            {toggleToolCall}
          />
        {/each}
      </div>
    {/if}

    <!-- 消息内容 -->
    {#if hasContent}
      <div class="message-content markdown-body">{@html renderMarkdown(displayContent)}</div>
    {:else if hasReasoning && isAssistant}
      <div class="message-content reasoning-only-hint">
        <span>💭 思考完成</span>
        <span style="margin-left: 8px; font-size: 11px; color: var(--color-text-hint);">展开上方查看思考过程</span>
      </div>
    {:else if isUser && (!mediaBlocks || mediaBlocks.length === 0)}
      <div class="message-content empty-message-hint">空消息</div>
    {/if}

    <!-- 媒体内容（图片/音频/视频/文件） -->
    {#if mediaBlocks && mediaBlocks.length > 0}
      <div class="media-grid">
        {#each mediaBlocks as b, i (b.mediaId || b.url || b.source || i)}
          <MediaBlock block={b} />
        {/each}
      </div>
    {/if}
  </div>

  <!-- 删除按钮 -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <button
    class="msg-delete-btn"
    title="删除消息"
    onclick={() => confirmDelete(msg.id)}
  >×</button>
</div>
