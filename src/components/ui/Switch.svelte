<script lang="ts">
  interface Props {
    checked?: boolean;
    label?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    label = '',
    disabled = false,
    onchange,
  }: Props = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<label class="switch" class:disabled>
  <button
    type="button"
    class="switch-track"
    class:checked
    role="switch"
    aria-checked={checked}
    aria-label={label || 'Toggle'}
    {disabled}
    onclick={toggle}
  >
    <span class="switch-thumb"></span>
  </button>
  {#if label}
    <span class="switch-label">{label}</span>
  {/if}
</label>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    user-select: none;
  }

  .switch.disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .switch-track {
    position: relative;
    width: 36px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: var(--radius-pill);
    background: var(--color-border-strong);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .switch-track:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .switch-track.checked {
    background: var(--color-primary);
  }

  .switch-track:disabled {
    cursor: not-allowed;
  }

  .switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: var(--shadow-sm);
    transition: transform var(--transition-fast);
  }

  .switch-track.checked .switch-thumb {
    transform: translateX(16px);
  }

  .switch-label {
    font-size: var(--text-md);
    color: var(--color-text);
  }
</style>
