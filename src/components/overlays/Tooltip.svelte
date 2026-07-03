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
