<script lang="ts">
  interface Option {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    value?: string;
    options?: Option[];
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(''),
    options = [],
    label = '',
    placeholder = '请选择...',
    disabled = false,
    onchange,
  }: Props = $props();

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    value = target.value;
    onchange?.(target.value);
  }
</script>

<div class="field">
  {#if label}
    <label class="field-label">{label}</label>
  {/if}
  <div class="select-wrapper">
    <select class="select" {disabled} onchange={handleChange} bind:value>
      {#if placeholder}
        <option value="" disabled selected={!value}>{placeholder}</option>
      {/if}
      {#each options as opt}
        <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
      {/each}
    </select>
    <span class="select-arrow" aria-hidden="true">▼</span>
  </div>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
  }

  .field-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  .select-wrapper {
    position: relative;
    width: 100%;
  }

  .select {
    width: 100%;
    height: 34px;
    padding: 0 28px 0 var(--space-3);
    font-family: var(--font-sans);
    font-size: var(--text-md);
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    outline: none;
    appearance: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .select:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .select:focus {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-focus);
  }

  .select:disabled {
    background: var(--color-bg);
    color: var(--color-text-hint);
    cursor: not-allowed;
  }

  .select-arrow {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 8px;
    color: var(--color-text-hint);
    pointer-events: none;
  }
</style>
