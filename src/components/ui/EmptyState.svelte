<script lang="ts">
  import Button from './Button.svelte';

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

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-10) var(--space-5);
    color: var(--color-text-secondary);
  }

  .empty-icon {
    font-size: 48px;
    line-height: 1;
    margin-bottom: var(--space-4);
    opacity: 0.8;
  }

  .empty-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 var(--space-1) 0;
  }

  .empty-desc {
    font-size: var(--text-md);
    color: var(--color-text-secondary);
    line-height: 1.6;
    max-width: 240px;
    margin: 0 0 var(--space-4) 0;
  }

  .empty-action {
    margin-top: var(--space-1);
  }
</style>
