<script lang="ts">
  import Button from '../../components/atoms/Button.svelte';

  let { allTools, toolEnabledMap, toggleTool } = $props();
</script>

<div class="tool-panel" id="tool-panel">
  <div class="tool-panel-title">可用工具</div>
  {#if allTools.length === 0}
    <div class="tool-panel-empty">暂无可用工具</div>
  {:else}
    {#each allTools as tool (tool.definition?.name)}
      {@const def = tool.definition}
      {#if def}
        <div class="tool-panel-item">
          <div class="tool-panel-info">
            <span class="tool-panel-name">{def.name}</span>
            <span class="tool-panel-desc">{def.description || ''}</span>
          </div>
          <Button
            variant={toolEnabledMap[def.name] ? 'ghost' : 'secondary'}
            size="sm"
            onclick={() => toggleTool(tool)}
          >
            {toolEnabledMap[def.name] ? '已启用' : '已禁用'}
          </Button>
        </div>
      {/if}
    {/each}
  {/if}
</div>
