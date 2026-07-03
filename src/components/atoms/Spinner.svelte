<script lang="ts">
  interface Props {
    size?: number;
    color?: string;
  }

  let { size = 16, color = 'currentColor' }: Props = $props();
</script>

<svg
  class="spinner"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  aria-hidden="true"
>
  <circle
    class="spinner-track"
    cx="8"
    cy="8"
    r="6"
    stroke="currentColor"
    stroke-width="2"
    opacity="0.2"
  />
  <circle
    class="spinner-head"
    cx="8"
    cy="8"
    r="6"
    stroke={color}
    stroke-width="2"
    stroke-linecap="round"
    stroke-dasharray="28"
    stroke-dashoffset="10"
  />
</svg>
