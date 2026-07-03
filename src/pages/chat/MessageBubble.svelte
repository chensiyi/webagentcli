<script lang="ts">
  import ToolCallCard from './ToolCallCard.svelte';
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
    expandedReasoning,
    collapsedToolCalls,
    toggleReasoning,
    toggleToolCall,
    confirmDelete,
    findToolResult,
    findToolNameByCallId,
    messages
  } = $props();
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
        {#each msg.toolCalls as tc (tc.id)}
          {@const tcId = tc.id || ''}
          {@const tcName = tc.toolName || tc.name || 'unknown'}
          {@const tcArgs = tc.input || tc.arguments || {}}
          {@const tcResult = findToolResult(tcId)}
          {@const tcResultText = tcResult ? extractText(tcResult.content) : ''}
          {@const tcStatus = tc.status || (tcResult ? 'completed' : 'pending')}
          <ToolCallCard
            {tcId}
            {tcName}
            {tcArgs}
            {tcResult}
            {tcResultText}
            {tcStatus}
            collapsed={collapsedToolCalls[tcId] || false}
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
    {:else if isUser}
      <div class="message-content empty-message-hint">空消息</div>
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
