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
  background: linear-gradient(90deg, #92400e 0%, #b45309 50%, #92400e 100%);
  color: #fef3c7;
  font-family: var(--font-heading, sans-serif);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  position: sticky;
  top: 0;
  z-index: 1000;
  border-bottom: 1px solid #f59e0b;
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

