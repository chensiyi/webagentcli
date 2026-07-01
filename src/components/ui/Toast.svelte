<script lang="ts">
  import type { ToastItem } from '../../lib/stores/toast.js';

  interface Props {
    toast: ToastItem;
    ondismiss: (id: string) => void;
  }

  let { toast, ondismiss }: Props = $props();

  const iconMap = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };
</script>

<div class="toast toast--{toast.type}" role="status">
  <span class="toast-icon" aria-hidden="true">{iconMap[toast.type]}</span>
  <span class="toast-message">{toast.message}</span>
  <button
    class="toast-close"
    aria-label="关闭"
    onclick={() => ondismiss(toast.id)}
  >
    ✕
  </button>
</div>

<style>
  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 200px;
    max-width: 320px;
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    font-size: var(--text-md);
    color: var(--color-text);
    animation: toastEnter 200ms ease;
  }

  .toast--success {
    border-left: 3px solid var(--color-success);
  }

  .toast--error {
    border-left: 3px solid var(--color-error);
  }

  .toast--warning {
    border-left: 3px solid var(--color-warning);
  }

  .toast--info {
    border-left: 3px solid var(--color-info);
  }

  .toast-icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .toast-message {
    flex: 1;
    line-height: 1.5;
  }

  .toast-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-hint);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .toast-close:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  @keyframes toastEnter {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
