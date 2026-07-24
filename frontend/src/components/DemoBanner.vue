<script setup>
// No props needed — the parent decides whether to render this component.
</script>

<template>
  <div class="demo-banner" role="alert">
    <span class="demo-banner-icon">⚠️</span>
    <span class="demo-banner-text">
      <strong>Mode démonstration</strong> — Le contenu de ce compte est effacé et réinitialisé automatiquement chaque nuit à minuit.
    </span>
  </div>
</template>

<style scoped>
.demo-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.45rem 1rem;
  background: var(--demo-banner-gradient);
  color: var(--demo-banner-text);
  font-family: var(--font-heading, sans-serif);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  position: sticky;
  top: 0;
  z-index: 1000;
  border-bottom: 1px solid var(--color-demo-accent);
  text-align: center;
}

.demo-banner-icon {
  flex-shrink: 0;
  font-size: 0.9rem;
}

.demo-banner-text {
  line-height: 1.4;
}
</style>

