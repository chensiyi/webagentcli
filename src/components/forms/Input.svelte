<script lang="ts">
  interface Props {
    value?: string;
    type?: 'text' | 'password' | 'email' | 'number' | 'url';
    placeholder?: string;
    label?: string;
    error?: string;
    disabled?: boolean;
    autofocus?: boolean;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
    onkeydown?: (e: KeyboardEvent) => void;
    onfocus?: (e: FocusEvent) => void;
  }

  let {
    value = $bindable(''),
    type = 'text',
    placeholder = '',
    label = '',
    error = '',
    disabled = false,
    autofocus = false,
    oninput,
    onchange,
    onkeydown,
    onfocus,
  }: Props = $props();

  // 生成唯一 id 用于 label->input 关联（a11y）
  // 始终生成 id（无 label 时 id 无用但不会有害）
  let inputId: string = $state('input-' + crypto.randomUUID().slice(0, 8));
</script>

<div class="field">
  {#if label}
    <label class="field-label" for={inputId}>{label}</label>
  {/if}
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="input"
    class:input--error={!!error}
    {type}
    {placeholder}
    {disabled}
    id={inputId}
    bind:value
    oninput={oninput}
    onchange={onchange}
    onkeydown={onkeydown}
    onfocus={onfocus}
    autofocus={autofocus}
  />
  {#if error}
    <span class="field-error">{error}</span>
  {/if}
</div>
