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

<div class="page">
  <header class="page-header">
    <h2 class="page-title"><span class="title-icon" aria-hidden="true">{icon}</span> {title}</h2>
    <p class="page-subtitle">{subtitle}</p>
  </header>

  <div class="page-body">
    <div class="placeholder-card">
      <div class="placeholder-icon" aria-hidden="true">{icon}</div>
      <div class="placeholder-content">
        <strong>{name}</strong>
        <p>{description}</p>
      </div>
      <div class="placeholder-progress" aria-hidden="true">
        <div class="progress-bar"></div>
      </div>
    </div>
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 100%;
  }

  .page-header {
    padding: var(--space-5) var(--space-5) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .page-title {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 var(--space-1) 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    letter-spacing: -0.01em;
  }

  .title-icon {
    font-size: 22px;
    line-height: 1;
  }

  .page-subtitle {
    font-size: var(--text-md);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .page-body {
    flex: 1;
    padding: var(--space-5);
    overflow-y: auto;
    min-height: 0;
  }

  .placeholder-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-10) var(--space-6);
    text-align: center;
    box-shadow: var(--shadow-sm);
    transition: all var(--transition-normal);
  }

  .placeholder-card:hover {
    border-color: var(--color-border-medium);
    box-shadow: var(--shadow-md);
  }

  .placeholder-icon {
    font-size: 56px;
    margin-bottom: var(--space-5);
    line-height: 1;
    filter: grayscale(0.2);
  }

  .placeholder-content strong {
    display: block;
    font-size: var(--text-lg);
    font-weight: 600;
    margin-bottom: var(--space-2);
    color: var(--color-text);
  }

  .placeholder-content p {
    font-size: var(--text-md);
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin: 0;
  }

  .placeholder-progress {
    margin-top: var(--space-6);
    height: 6px;
    background: var(--color-bg);
    border-radius: var(--radius-pill);
    overflow: hidden;
  }

  .progress-bar {
    width: 35%;
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    border-radius: var(--radius-pill);
    animation: progress 2s ease-in-out infinite;
  }

  @keyframes progress {
    0% { width: 25%; opacity: 0.7; }
    50% { width: 75%; opacity: 1; }
    100% { width: 25%; opacity: 0.7; }
  }
</style>
