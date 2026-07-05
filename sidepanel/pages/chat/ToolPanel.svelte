<script lang="ts">
  import Badge from '../../components/atoms/Badge.svelte';

  let { allTools, toolEnabledMap, toggleTool } = $props();
</script>

<div class="tool-panel" id="tool-panel">
  <div class="tool-panel-title">可用工具</div>
  {#if allTools.length === 0}
    <div class="tool-panel-empty">暂无可用工具</div>
  {:else}
    {#each allTools as tool (tool.name)}
      {@const def = tool}
      {#if def}
        <div class="tool-panel-item">
          <div class="tool-panel-info">
            <span class="tool-panel-name">{def.name}</span>
            <span class="tool-panel-desc">{def.description || ''}</span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="tool-toggle-btn" onclick={() => toggleTool(tool)}>
            <Badge variant={toolEnabledMap[def.name] ? 'success' : 'error'}>
              {toolEnabledMap[def.name] ? '已启用' : '已禁用'}
            </Badge>
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>
