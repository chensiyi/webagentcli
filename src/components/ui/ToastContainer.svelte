<script lang="ts">
  import Toast from './Toast.svelte';
  import { useToast } from '../../lib/stores/toast.svelte';

  const toast = useToast();
</script>

<div class="toast-container" aria-live="polite" aria-atomic="true">
  {#each toast.toasts as item (item.id)}
    <Toast toast={item} ondismiss={toast.remove} />
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    z-index: 1000;
    pointer-events: none;
  }

  .toast-container > :global(*) {
    pointer-events: auto;
  }
</style>
