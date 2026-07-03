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
