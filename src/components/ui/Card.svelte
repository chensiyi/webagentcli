<script lang="ts">
  interface Props {
    padding?: 'none' | 'sm' | 'md' | 'lg';
    shadow?: 'none' | 'sm' | 'md';
    hover?: boolean;
    clickable?: boolean;
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    padding = 'md',
    shadow = 'sm',
    hover = false,
    clickable = false,
    onclick,
    children,
  }: Props = $props();

  const paddingMap: Record<string, string> = {
    none: '0',
    sm: 'var(--space-3)',
    md: 'var(--space-4)',
    lg: 'var(--space-5)',
  };

  const shadowMap: Record<string, string> = {
    none: 'none',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="card"
  class:card--hover={hover}
  class:card--clickable={clickable}
  role={clickable ? 'button' : undefined}
  tabindex={clickable ? 0 : undefined}
  style="padding: {paddingMap[padding]}; box-shadow: {shadowMap[shadow]};"
  onclick={clickable ? onclick : undefined}
>
  {@render children?.()}
</div>

<style>
  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    transition: all var(--transition-fast);
  }

  .card--hover:hover,
  .card--clickable:hover {
    border-color: var(--color-border-medium);
    box-shadow: var(--shadow-md);
  }

  .card--clickable {
    cursor: pointer;
  }

  .card--clickable:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
</style>
