<script lang="ts">
  let { src, alt = '', onclose }: { src: string; alt?: string; onclose: () => void } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="lightbox-overlay" onclick={onclose} role="presentation">
  <img class="lightbox-img" src={src} alt={alt} onclick={(e) => e.stopPropagation()} />
  <button class="lightbox-close" onclick={onclose} aria-label="关闭">×</button>
</div>
