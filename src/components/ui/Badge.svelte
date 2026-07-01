<script lang="ts">
  interface Props {
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
    children?: import('svelte').Snippet;
  }

  let { variant = 'default', children }: Props = $props();
</script>

<span class="badge badge--{variant}">
  {@render children?.()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 18px;
    padding: 0 6px;
    font-size: var(--text-xs);
    font-weight: 600;
    border-radius: var(--radius-pill);
    white-space: nowrap;
  }

  .badge--default {
    background: var(--color-surface-hover);
    color: var(--color-text-secondary);
  }

  .badge--primary {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  .badge--success {
    background: var(--color-success-light);
    color: var(--color-success);
  }

  .badge--warning {
    background: var(--color-warning-light);
    color: var(--color-warning);
  }

  .badge--error {
    background: var(--color-error-light);
    color: var(--color-error);
  }

  .badge--info {
    background: var(--color-info-light);
    color: var(--color-info);
  }
</style>
