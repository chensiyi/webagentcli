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
  {#if toast.actions?.length}
    <div class="toast-actions">
      {#each toast.actions as act (act.label)}
        <button
          class="toast-action toast-action--{act.variant ?? 'default'}"
          onclick={() => act.onClick()}
        >
          {act.label}
        </button>
      {/each}
    </div>
  {/if}
  <button
    class="toast-close"
    aria-label="关闭"
    onclick={() => ondismiss(toast.id)}
  >
    ✕
  </button>
</div>
