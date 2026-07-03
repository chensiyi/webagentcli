<script lang="ts">
  let { toolExecuting, toolExecutingName } = $props();
</script>

<div class="streaming-indicator">
  <span class="streaming-dot"></span>
  <span class="streaming-dot"></span>
  <span class="streaming-dot"></span>
  {#if toolExecuting}
    <span class="tool-executing-hint">{toolExecutingName} 执行中...</span>
  {/if}
</div>
