<script setup>
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'

const router = useRouter()
</script>

<template>
  <div class="home-wrapper">
    <header class="home-header">
      <h1 class="app-title">DM <span class="title-accent">Toolkit</span></h1>
      <p class="app-subtitle">Votre compagnon pour vos sessions de JDR !</p>
    </header>

    <main class="home-main">
      <div class="home-buttons">
        <button class="home-btn mj-btn" @click="router.push('/login')">
          <span class="btn-icon"><AppIcon icon="game-icons:dice-six-faces-five" size="2rem" /></span>
          <span class="btn-label">Je suis MJ</span>
          <span class="btn-sub">Accéder à l'administration</span>
        </button>
        <button class="home-btn player-btn" @click="router.push('/join')">
          <span class="btn-icon"><AppIcon icon="game-icons:crossed-swords" size="2rem" /></span>
          <span class="btn-label">Je suis Joueur</span>
          <span class="btn-sub">Rejoindre une session</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: 2rem;
}

.home-header {
  text-align: center;
  padding: 3rem 1.5rem 2rem;
}

@keyframes floatSkull {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.app-title {
  font-family: var(--font-title);
  font-size: 2.8rem;
  line-height: 1.15;
  color: var(--color-parchment);
  text-shadow: var(--text-shadow-emphasis);
  margin: 0.5rem 0 0.3rem;
}

.title-accent {
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
}

.app-subtitle {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.25em;
  color: var(--color-text-dim);
  text-transform: uppercase;
  margin: 0.5rem 0 0;
}

.home-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  gap: 2rem;
}

.home-prompt {
  font-family: var(--font-heading);
  font-size: 1rem;
  letter-spacing: 0.15em;
  color: var(--color-text-dim);
  text-transform: uppercase;
}

.home-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 340px;
}

.home-btn {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s ease;
  text-align: left;
  border: 1px solid var(--color-border);
  background: linear-gradient(160deg, var(--color-surface-soft), var(--color-surface));
  color: var(--color-parchment);
  font-family: var(--font-heading);
}

.mj-btn {
  border-color: var(--color-gold-dark);
  background: var(--gradient-accent-action);
}

.mj-btn:hover {
  border-color: var(--color-gold);
  box-shadow: var(--shadow-soft);
  transform: translateY(-2px);
}

.player-btn {
  border-color: var(--color-success-border);
  background: var(--gradient-success-action);
}

.player-btn:hover {
  border-color: var(--color-success);
  box-shadow: var(--shadow-soft);
  transform: translateY(-2px);
}

.btn-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.btn-label {
  font-size: 1.1rem;
  font-weight: 600;
  display: block;
}

.btn-sub {
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  display: block;
  margin-top: 0.2rem;
}

.app-footer {
  padding: 1.5rem;
  text-align: center;
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-border);
}
</style>
