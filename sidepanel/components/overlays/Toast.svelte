<script lang="ts">
  import type { ToastItem } from './toast-store.svelte';

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
