<script lang="ts">
  import Spinner from './Spinner.svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    onclick,
    children,
  }: Props = $props();

  const isDisabled = $derived(disabled || loading);
</script>

<button
  class="btn btn--{variant} btn--{size}"
  class:btn--full-width={fullWidth}
  {type}
  disabled={isDisabled}
  onclick={onclick}
>
  {#if loading}
    <span class="btn-spinner"><Spinner size={size === 'sm' ? 12 : 14} /></span>
  {/if}
  <span class="btn-content" class:btn-content--loading={loading}>
    {@render children?.()}
  </span>
</button>
