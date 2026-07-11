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
    open = false,
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

  // open 为纯单向受控 prop：关闭完全由父组件的 onclose/onconfirm 回调驱动
  // （各调用方均会在回调中将源状态重置为 null）。若此处写入 open，在 Svelte 5 中
  // 子组件会"劫持" bindable prop，导致父组件后续 open 更新失效、弹窗无法再次打开。
  function close() {
    onclose?.();
  }

  function confirm() {
    onconfirm?.();
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
