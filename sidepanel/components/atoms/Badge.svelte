<script lang="ts">
  interface Props {
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
    children?: import('svelte').Snippet;
  }

  let { variant = 'default', children }: Props = $props();
</script>

<span class="badge badge--{variant}">
  {@render children?.()}
</span>
