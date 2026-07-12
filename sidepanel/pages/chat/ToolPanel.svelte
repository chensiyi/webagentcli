<script lang="ts">
  import Badge from '../../components/atoms/Badge.svelte';

  // 会话级工具面板：显示与开关都走「全局为天花板 + 会话 toolEnabled 覆盖」合并逻辑。
  // 全局已禁用 → 置灰锁定（本会话无法开启）；其余由本会话 toolEnabled 决定本会话启用/禁用。
  let {
    allTools,
    sessionToolEnabled,
    toggleTool,
  }: {
    allTools: any[];
    sessionToolEnabled: Record<string, boolean> | null | undefined;
    toggleTool: (tool: any) => void;
  } = $props();
</script>

<div class="tool-panel" id="tool-panel">
  <div class="tool-panel-title">本会话工具（全局为上限）</div>
  {#if allTools.length === 0}
    <div class="tool-panel-empty">暂无可用工具</div>
  {:else}
    {#each allTools as tool (tool.name)}
      {@const def = tool}
      {#if def}
        {@const globalOn = !!def.enabled}
        {@const override = sessionToolEnabled ? sessionToolEnabled[def.name] : undefined}
        {@const locked = !globalOn}
        <!-- 三态：undefined=继承全局 / true=本会话开启 / false=本会话禁用 -->
        {@const state = locked ? 'locked' : override === true ? 'on' : override === false ? 'off' : 'inherit'}
        <div class="tool-panel-item" class:locked>
          <div class="tool-panel-info">
            <span class="tool-panel-name">{def.name}</span>
            <span class="tool-panel-desc">{def.description || ''}</span>
            {#if locked}
              <span class="tool-panel-lock">↳ 全局已禁用</span>
            {/if}
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="tool-toggle-btn"
            title={
              locked ? '已被全局禁用，无法在本会话启用'
                : state === 'inherit' ? '点击：在本会话开启'
                : state === 'on' ? '点击：在本会话禁用'
                : '点击：恢复继承全局'
            }
            onclick={() => { if (!locked) toggleTool(tool); }}
          >
            <Badge variant={locked ? 'default' : state === 'on' ? 'success' : state === 'off' ? 'error' : 'info'}>
              {locked ? '全局禁用' : state === 'on' ? '本会话开启' : state === 'off' ? '本会话禁用' : '继承全局'}
            </Badge>
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .tool-panel-item.locked .tool-panel-name { opacity: 0.55; }
  .tool-panel-item.locked .tool-toggle-btn { cursor: not-allowed; }
  .tool-panel-lock {
    display: inline-block;
    margin-left: 6px;
    font-size: 11px;
    color: #999;
  }
</style>
