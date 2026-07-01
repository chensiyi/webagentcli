<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    children?: import('svelte').Snippet;
  }

  let { content, position = 'bottom', children }: Props = $props();

  let visible = $state(false);
  let triggerRef: HTMLElement | null = $state(null);
  let tooltipRef: HTMLElement | null = $state(null);

  function show() {
    visible = true;
  }

  function hide() {
    visible = false;
  }
</script>

<span
  class="tooltip-trigger"
  bind:this={triggerRef}
  onmouseenter={show}
  onmouseleave={hide}
  onfocus={show}
  onblur={hide}
  aria-describedby={visible ? 'tooltip' : undefined}
  role="tooltip"
>
  {@render children?.()}

  {#if visible}
    <span
      id="tooltip"
      class="tooltip tooltip--{position}"
      bind:this={tooltipRef}
    >
      {content}
    </span>
  {/if}
</span>

<style>
  .tooltip-trigger {
    position: relative;
    display: inline-flex;
  }

  .tooltip {
    position: absolute;
    z-index: 950;
    padding: 4px 8px;
    background: var(--color-text);
    color: var(--color-surface);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    pointer-events: none;
    animation: tooltipEnter 120ms ease;
  }

  .tooltip--top {
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip--bottom {
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip--left {
    right: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
  }

  .tooltip--right {
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
  }

  @keyframes tooltipEnter {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
