<script lang="ts">
  import Toast from './Toast.svelte';
  import { useToast } from './toast-store.svelte';

  const toast = useToast();
</script>

<div class="toast-container" aria-live="polite" aria-atomic="true">
  {#each toast.toasts as item (item.id)}
    <Toast toast={item} ondismiss={toast.remove} />
  {/each}
</div>

<style>
  .toast-container > :global(*) {
    pointer-events: auto;
  }
</style>
