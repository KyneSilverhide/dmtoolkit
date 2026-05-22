<template>
  <div class="audio-manager">
    <h2 class="section-title">Audio</h2>
    <p class="audio-placeholder">
      Gestion audio momentanément indisponible.
    </p>
  </div>
</template>

<style scoped>
.audio-manager {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

.section-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.audio-placeholder {
  margin: 0;
  color: var(--color-text-dim);
  font-size: 0.9rem;
}
</style>
