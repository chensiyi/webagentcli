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

  // 生成唯一 id 用于 label->input 关联（a11y）
  // 始终生成 id（无 label 时 id 无用但不会有害）
  let sliderId: string = $state('slider-' + crypto.randomUUID().slice(0, 8));

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
      <label class="field-label" for={sliderId}>{label}</label>
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
      id={sliderId}
    />
  </div>
</div>
