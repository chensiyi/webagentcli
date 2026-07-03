<script lang="ts">
  interface Props {
    icon: string;
    label: string;
    variant?: 'default' | 'primary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
  }

  let {
    icon,
    label,
    variant = 'default',
    size = 'md',
    disabled = false,
    onclick,
  }: Props = $props();

  const sizeMap = {
    sm: 28,
    md: 32,
    lg: 38,
  };

  const iconSizeMap = {
    sm: 14,
    md: 16,
    lg: 18,
  };
</script>

<button
  class="icon-btn icon-btn--{variant} icon-btn--{size}"
  title={label}
  aria-label={label}
  {disabled}
  onclick={onclick}
  style="width: {sizeMap[size]}px; height: {sizeMap[size]}px;"
>
  <span class="icon" style="font-size: {iconSizeMap[size]}px;">{icon}</span>
</button>
