<script lang="ts">
  interface Props {
    icon: string;
    title: string;
    subtitle: string;
    name: string;
    description: string;
  }

  let { icon, title, subtitle, name, description }: Props = $props();
</script>

<div class="placeholder-page">
  <header class="placeholder-page-header">
    <h2 class="placeholder-page-title"><span class="title-icon" aria-hidden="true">{icon}</span> {title}</h2>
    <p class="placeholder-page-subtitle">{subtitle}</p>
  </header>

  <div class="placeholder-page-body">
    <div class="placeholder-card">
      <div class="placeholder-icon" aria-hidden="true">{icon}</div>
      <div class="placeholder-content">
        <strong>{name}</strong>
        <p>{description}</p>
      </div>
      <div class="placeholder-progress" aria-hidden="true">
        <div class="placeholder-progress-bar"></div>
      </div>
    </div>
  </div>
</div>
