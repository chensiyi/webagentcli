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

  // 生成唯一 id 用于 label->select 关联（a11y）
  // 始终生成 id（无 label 时 id 无用但不会有害）
  let selectId: string = $state('select-' + crypto.randomUUID().slice(0, 8));

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    value = target.value;
    onchange?.(target.value);
  }
</script>

<div class="field">
  {#if label}
    <label class="field-label" for={selectId}>{label}</label>
  {/if}
  <div class="select-wrapper">
    <select class="select" {disabled} onchange={handleChange} bind:value id={selectId}>
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
