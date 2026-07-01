<script lang="ts">
  interface Props {
    icon: string;
    label: string;
    variant?: 'default' | 'primary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
  }

  let {
    icon,
    label,
    variant = 'default',
    size = 'md',
    disabled = false,
    onclick,
  }: Props = $props();

  const sizeMap = {
    sm: 28,
    md: 32,
    lg: 38,
  };

  const iconSizeMap = {
    sm: 14,
    md: 16,
    lg: 18,
  };
</script>

<button
  class="icon-btn icon-btn--{variant} icon-btn--{size}"
  title={label}
  aria-label={label}
  {disabled}
  onclick={onclick}
  style="width: {sizeMap[size]}px; height: {sizeMap[size]}px;"
>
  <span class="icon" style="font-size: {iconSizeMap[size]}px;">{icon}</span>
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .icon-btn--primary {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .icon-btn--primary:hover:not(:disabled) {
    background: var(--color-primary-dark);
  }

  .icon-btn--danger:hover:not(:disabled) {
    background: var(--color-error-light);
    color: var(--color-error);
  }

  .icon-btn--default {
    border-color: var(--color-border-medium);
    background: var(--color-surface);
  }

  .icon {
    line-height: 1;
    user-select: none;
  }
</style>
