<script lang="ts">
  import Button from './Button.svelte';

  interface Props {
    open?: boolean;
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    showCancel?: boolean;
    danger?: boolean;
    children?: import('svelte').Snippet;
    onclose?: () => void;
    onconfirm?: () => void;
  }

  let {
    open = $bindable(false),
    title = '',
    confirmLabel = '确认',
    cancelLabel = '取消',
    showCancel = true,
    danger = false,
    children,
    onclose,
    onconfirm,
  }: Props = $props();

  function close() {
    open = false;
    onclose?.();
  }

  function confirm() {
    onconfirm?.();
    open = false;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }
</script>

{#if open}
  <div
    class="dialog-backdrop"
    role="presentation"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    tabindex="-1"
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby={title ? 'dialog-title' : undefined}>
      {#if title}
        <h3 id="dialog-title" class="dialog-title">{title}</h3>
      {/if}
      <div class="dialog-body">
        {@render children?.()}
      </div>
      <div class="dialog-actions">
        {#if showCancel}
          <Button variant="ghost" onclick={close}>{cancelLabel}</Button>
        {/if}
        <Button variant={danger ? 'danger' : 'primary'} onclick={confirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(2px);
    z-index: 900;
    animation: fadeIn 150ms ease;
  }

  .dialog {
    width: min(320px, calc(100% - var(--space-6)));
    max-height: calc(100% - var(--space-6));
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    animation: dialogEnter 200ms ease;
  }

  .dialog-title {
    margin: 0;
    padding: var(--space-4) var(--space-4) 0;
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text);
  }

  .dialog-body {
    padding: var(--space-3) var(--space-4) var(--space-4);
    font-size: var(--text-md);
    color: var(--color-text-secondary);
    line-height: 1.6;
    overflow-y: auto;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: 0 var(--space-4) var(--space-4);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes dialogEnter {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
