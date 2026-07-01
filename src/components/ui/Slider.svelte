<script lang="ts">
  interface Props {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    format?: (v: number) => string;
    disabled?: boolean;
    onchange?: (value: number) => void;
  }

  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    label = '',
    format = (v) => String(v),
    disabled = false,
    onchange,
  }: Props = $props();

  const percentage = $derived(((value - min) / (max - min)) * 100);

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    value = Number(target.value);
    onchange?.(value);
  }
</script>

<div class="field">
  {#if label}
    <div class="field-header">
      <label class="field-label">{label}</label>
      <span class="field-value">{format(value)}</span>
    </div>
  {/if}
  <div class="slider-wrapper">
    <input
      class="slider"
      type="range"
      {min}
      {max}
      {step}
      {disabled}
      value={value}
      oninput={handleInput}
      style="--value-percent: {percentage}%"
    />
  </div>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
  }

  .field-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .field-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  .field-value {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-primary);
    font-variant-numeric: tabular-nums;
  }

  .slider-wrapper {
    width: 100%;
  }

  .slider {
    width: 100%;
    height: 16px;
    margin: 0;
    padding: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;
  }

  .slider:focus {
    outline: none;
  }

  .slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: var(--radius-pill);
    background: linear-gradient(
      to right,
      var(--color-primary) 0%,
      var(--color-primary) var(--value-percent),
      var(--color-border-strong) var(--value-percent),
      var(--color-border-strong) 100%
    );
  }

  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border-radius: 50%;
    background: var(--color-surface);
    border: 2px solid var(--color-primary);
    box-shadow: var(--shadow-sm);
    transition: transform var(--transition-fast);
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  .slider:focus::-webkit-slider-thumb {
    box-shadow: var(--shadow-focus);
  }

  .slider:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
</style>
