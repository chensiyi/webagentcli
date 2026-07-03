<script lang="ts">
  import type { PageId, PageDef } from '../../lib/types.js';

  interface Props {
    activePage: PageId;
    navigateTo: (id: PageId) => void;
    PAGES: PageDef[];
  }

  let { activePage, navigateTo, PAGES }: Props = $props();

  // SVG 图标映射（16×16 24×24 均可，统一 viewBox 0 0 24 24）
  const iconMap: Record<string, string> = {
    chat: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    history: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    storage: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
    scripts: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    settings: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  };

  function getIcon(id: string): string {
    return iconMap[id] ?? '';
  }

  let hoveredPage = $state<PageId | null>(null);
  let tooltipTarget = $state<DOMRect | null>(null);
</script>

<aside class="sidebar" aria-label="主导航">
  <!-- 品牌区（暂时隐藏）
  <div class="sidebar-brand">
    <div class="brand-logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5"/>
        <circle cx="9" cy="12" r="1.5" fill="var(--color-primary)" stroke="none"/>
        <circle cx="15" cy="12" r="1.5" fill="var(--color-primary)" stroke="none"/>
        <line x1="9.5" y1="8" x2="14.5" y2="8"/>
      </svg>
    </div>
  </div>
  -->

  <!-- 导航图标 -->
  <div class="sidebar-group">
    {#each PAGES as page}
      <button
        class="sidebar-btn"
        class:active={activePage === page.id}
        title={page.label}
        onclick={() => navigateTo(page.id)}
        onmouseenter={(e) => { hoveredPage = page.id; tooltipTarget = (e.currentTarget as HTMLElement).getBoundingClientRect(); }}
        onmouseleave={() => { hoveredPage = null; tooltipTarget = null; }}
        aria-current={activePage === page.id ? 'page' : undefined}
        aria-label={page.label}
      >
        <span class="sidebar-btn-icon" aria-hidden="true">
          {@html getIcon(page.id)}
        </span>
      </button>

      <!-- Tooltip -->
      {#if hoveredPage === page.id && tooltipTarget}
        <div
          class="sidebar-tooltip"
          style="top: {tooltipTarget.top + tooltipTarget.height / 2}px; left: {tooltipTarget.left - 8}px;"
        >
          {page.label}
        </div>
      {/if}
    {/each}
  </div>

  <!-- 底部版本号 -->
  <div class="sidebar-footer">
    <span class="sidebar-version">v0.6.0</span>
  </div>
</aside>
