<script lang="ts">
  import Spinner from './Spinner.svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    onclick,
    children,
  }: Props = $props();

  const isDisabled = $derived(disabled || loading);
</script>

<button
  class="btn btn--{variant} btn--{size}"
  class:btn--full-width={fullWidth}
  {type}
  disabled={isDisabled}
  onclick={onclick}
>
  {#if loading}
    <span class="btn-spinner"><Spinner size={size === 'sm' ? 12 : 14} /></span>
  {/if}
  <span class="btn-content" class:btn-content--loading={loading}>
    {@render children?.()}
  </span>
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    font-family: var(--font-sans);
    font-weight: 600;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    user-select: none;
    white-space: nowrap;
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn--sm {
    height: 28px;
    padding: 0 10px;
    font-size: var(--text-xs);
  }

  .btn--md {
    height: 34px;
    padding: 0 14px;
    font-size: var(--text-sm);
  }

  .btn--lg {
    height: 40px;
    padding: 0 18px;
    font-size: var(--text-md);
  }

  .btn--full-width {
    width: 100%;
  }

  .btn--primary {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }

  .btn--primary:hover:not(:disabled) {
    background: var(--color-primary-dark);
    border-color: var(--color-primary-dark);
    box-shadow: var(--shadow-sm);
  }

  .btn--secondary {
    background: var(--color-surface);
    color: var(--color-text);
    border-color: var(--color-border-medium);
  }

  .btn--secondary:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-border-strong);
  }

  .btn--ghost {
    background: transparent;
    color: var(--color-text-secondary);
    border-color: transparent;
  }

  .btn--ghost:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .btn--danger {
    background: var(--color-error);
    color: #fff;
    border-color: var(--color-error);
  }

  .btn--danger:hover:not(:disabled) {
    background: #c0392b;
    border-color: #c0392b;
  }

  .btn-spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .btn-content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-content--loading {
    opacity: 0.85;
  }
</style>
