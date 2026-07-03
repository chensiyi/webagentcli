<script lang="ts">
  import Button from '../atoms/Button.svelte';

  interface Props {
    open?: boolean;
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    showCancel?: boolean;
    danger?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
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
    size = 'sm',
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
    <div class="dialog dialog-{size}" role="dialog" aria-modal="true" aria-labelledby={title ? 'dialog-title' : undefined}>
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
