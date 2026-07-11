<script lang="ts">
  import { getContext } from 'svelte';
  import type { KernelAPIContract } from '../../api-contract.js';
  import { normalizeMediaKind } from '../../utils/text.js';
  import Lightbox from './Lightbox.svelte';

  let { block }: { block: any } = $props();

  const api = getContext('api') as KernelAPIContract;

  let kind = $derived(normalizeMediaKind(block));
  let resolvedUrl = $state<string | null>(null);
  let loading = $state(false);
  let failed = $state(false);
  let lightboxOpen = $state(false);

  function formatSize(n: number): string {
    if (!n) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  // 解析展示 URL：优先直链 block.url / block.source，否则按 mediaId 经 api.media.get 懒加载
  $effect(() => {
    const b = block;
    const direct = b?.url || b?.source || null;
    if (direct) {
      resolvedUrl = direct;
      loading = false;
      failed = false;
      return;
    }
    const id = b?.mediaId;
    if (!id) {
      resolvedUrl = b?.dataUrl || null;
      failed = !resolvedUrl;
      loading = false;
      return;
    }
    loading = true;
    failed = false;
    api.media
      .get({ id })
      .then((r: any) => {
        const url = r && r.url ? r.url : null;
        resolvedUrl = url;
        failed = !url;
        loading = false;
      })
      .catch(() => {
        resolvedUrl = null;
        failed = true;
        loading = false;
      });
  });

  function openLightbox() {
    if (kind === 'image' && resolvedUrl) lightboxOpen = true;
  }
  function closeLightbox() {
    lightboxOpen = false;
  }
</script>

<div class="media-block media-{kind}">
  {#if loading}
    <div class="media-loading">⏳ 加载中…</div>
  {:else if failed || !resolvedUrl}
    <div class="media-failed">📭 媒体已失效或无法加载</div>
  {:else if kind === 'image'}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <img class="media-img" src={resolvedUrl} alt={block?.filename || 'image'} onclick={openLightbox} />
  {:else if kind === 'audio'}
    <audio class="media-audio" controls src={resolvedUrl}></audio>
  {:else if kind === 'video'}
    <video class="media-video" controls src={resolvedUrl}></video>
  {:else}
    <a class="media-file" href={resolvedUrl} download={block?.filename || 'file'} target="_blank" rel="noreferrer">
      <span class="media-file-icon">📄</span>
      <span class="media-file-meta">
        <span class="media-file-name">{block?.filename || '文件'}</span>
        {#if block?.size}<span class="media-file-size">{formatSize(block.size)}</span>{/if}
      </span>
      <span class="media-file-dl">⬇</span>
    </a>
  {/if}
</div>

{#if lightboxOpen && resolvedUrl}
  <Lightbox src={resolvedUrl} alt={block?.filename || 'image'} onclose={closeLightbox} />
{/if}
