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

  .input {
    width: 100%;
    height: 34px;
    padding: 0 var(--space-3);
    font-family: var(--font-sans);
    font-size: var(--text-md);
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    outline: none;
    transition: all var(--transition-fast);
  }

  .input::placeholder {
    color: var(--color-text-hint);
  }

  .input:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .input:focus {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-focus);
  }

  .input:disabled {
    background: var(--color-bg);
    color: var(--color-text-hint);
    cursor: not-allowed;
  }

  .input--error {
    border-color: var(--color-error);
  }

  .input--error:focus {
    box-shadow: 0 0 0 3px rgba(var(--color-error-rgb), 0.15);
  }

  .field-error {
    font-size: var(--text-xs);
    color: var(--color-error);
    line-height: 1.4;
  }
</style>
