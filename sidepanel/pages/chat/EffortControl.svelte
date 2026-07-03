<script lang="ts">
  let { reasoningEffort, onchange } = $props();

  const reasoningEfforts = [
    { value: 'high', label: '高', icon: '🚀' },
    { value: 'medium', label: '中', icon: '🔥' },
    { value: 'low', label: '低', icon: '⚡' },
    { value: 'off', label: '关', icon: '⭕' },
  ];

  let effortDropdownOpen = $state(false);

  function handleEffortWheel(e: WheelEvent) {
    e.preventDefault();
    const currentIdx = reasoningEfforts.findIndex(r => r.value === reasoningEffort);
    let newIdx: number;
    if (e.deltaY < 0) {
      newIdx = Math.max(0, currentIdx - 1);
    } else {
      newIdx = Math.min(reasoningEfforts.length - 1, currentIdx + 1);
    }
    if (newIdx !== currentIdx) {
      onchange(reasoningEfforts[newIdx].value);
    }
  }

  function handleGlobalClick(e: MouseEvent) {
    if (effortDropdownOpen) {
      const target = e.target as HTMLElement;
      if (!target.closest('.effort-control')) {
        effortDropdownOpen = false;
      }
    }
  }

  $effect(() => {
    if (effortDropdownOpen) {
      document.addEventListener('click', handleGlobalClick);
      return () => document.removeEventListener('click', handleGlobalClick);
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="effort-control">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <button
    class="effort-btn effort-btn--{reasoningEffort !== 'off' ? 'primary' : 'secondary'}"
    onclick={() => (effortDropdownOpen = !effortDropdownOpen)}
    onwheel={handleEffortWheel}
    title="滚轮切换思考强度"
    type="button"
  >
    think{reasoningEffort !== 'off' ? reasoningEffort : 'off'}
  </button>
  {#if effortDropdownOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      class="effort-dropdown"
      role="listbox"
      onclick={(e) => e.stopPropagation()}
    >
      {#each reasoningEfforts as eff}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <button
          class="effort-option"
          class:active={reasoningEffort === eff.value}
          onclick={() => {
            onchange(eff.value);
            effortDropdownOpen = false;
          }}
          role="option"
          aria-selected={reasoningEffort === eff.value}
        >
          {eff.icon} {eff.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
