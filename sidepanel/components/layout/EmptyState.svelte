<script lang="ts">
  import Button from '../atoms/Button.svelte';

  interface Props {
    icon: string;
    title: string;
    description?: string;
    actionLabel?: string;
    actionVariant?: 'primary' | 'secondary' | 'ghost';
    onclick?: () => void;
  }

  let {
    icon,
    title,
    description = '',
    actionLabel = '',
    actionVariant = 'primary',
    onclick,
  }: Props = $props();
</script>

<div class="empty-state">
  <div class="empty-icon" aria-hidden="true">{icon}</div>
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-desc">{description}</p>
  {/if}
  {#if actionLabel && onclick}
    <div class="empty-action">
      <Button variant={actionVariant} onclick={onclick}>{actionLabel}</Button>
    </div>
  {/if}
</div>
