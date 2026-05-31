<script setup>
import { ref, computed, watch } from 'vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import AppIcon from '../AppIcon.vue'
import {
  GENERATOR_TYPES,
  getGeneratorType,
  getDefaultOptions,
  formatQuotaDisplay,
  isQuotaLow,
  isQuotaEmpty,
  parseGeneratorResult,
} from '@/utils/generatorUtils.js'

import { BACKEND_URL } from '@/config.js'

const selectedType = ref(GENERATOR_TYPES[0].key)
const options = ref(getDefaultOptions(GENERATOR_TYPES[0].key))
const results = ref([])
const loading = ref(false)
const error = ref('')
const quota = ref(null)
const sessionRequestCount = ref(0)
const copiedIndex = ref(null)
const unavailable = ref(false)

const currentTypeDef = computed(() => getGeneratorType(selectedType.value))

watch(selectedType, (newType) => {
  options.value = getDefaultOptions(newType)
  results.value = []
  error.value = ''
})

const quotaDisplay = computed(() => formatQuotaDisplay(quota.value))
const quotaLow = computed(() => isQuotaLow(quota.value))
const quotaEmpty = computed(() => isQuotaEmpty(quota.value))

async function generate() {
  if (!sessionStore.activeSession?.id || loading.value) return
  loading.value = true
  error.value = ''
  results.value = []

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ type: selectedType.value, options: options.value }),
    })

    const data = await res.json()

    if (data.quota) quota.value = data.quota

    if (res.status === 503) {
      unavailable.value = true
      return
    }

    if (res.status === 429) {
      error.value = quota.value?.resetAt
        ? `Quota GitHub Models épuisé. Réinitialisation dans ${quota.value.resetAt}.`
        : 'Quota GitHub Models épuisé.'
      return
    }

    if (!res.ok) {
      error.value = data.error || 'Erreur lors de la génération.'
      return
    }

    results.value = parseGeneratorResult(data.result, selectedType.value)
    sessionRequestCount.value++
  } catch {
    error.value = 'Erreur de connexion au serveur.'
  } finally {
    loading.value = false
  }
}

async function copyResult(text, index) {
  try {
    await navigator.clipboard.writeText(text)
    copiedIndex.value = index
    setTimeout(() => { copiedIndex.value = null }, 2000)
  } catch {
    // clipboard non disponible (HTTP)
  }
}
</script>

<template>
  <div class="generator-tool">
    <h2 class="tool-title">
      <AppIcon icon="lucide:wand-2" size="1em" />
      Générateur D&D
    </h2>

    <!-- État : GITHUB_TOKEN absent côté serveur (détecté après premier appel 503) -->
    <div v-if="unavailable" class="unavailable-banner">
      <AppIcon icon="lucide:key" size="1.4rem" class="unavailable-icon" />
      <div class="unavailable-body">
        <p class="unavailable-title">Générateur IA non activé</p>
        <p class="unavailable-text">
          La variable d'environnement <code>GITHUB_TOKEN</code> n'est pas configurée sur le serveur.
          Ajoutez-la au fichier <code>.env</code> backend avec un token GitHub (aucun scope requis) pour activer ce générateur.
        </p>
      </div>
    </div>

    <template v-else>
      <div class="generator-form">
        <div class="form-row">
          <label class="form-label">Type</label>
          <select v-model="selectedType" class="form-select">
            <option v-for="t in GENERATOR_TYPES" :key="t.key" :value="t.key">
              {{ t.label }}
            </option>
          </select>
        </div>

        <template v-if="currentTypeDef?.options?.length">
          <div v-for="opt in currentTypeDef.options" :key="opt.key" class="form-row">
            <label class="form-label">{{ opt.label }}</label>
            <select v-model="options[opt.key]" class="form-select">
              <option v-for="choice in opt.choices" :key="choice" :value="choice">
                {{ choice }}
              </option>
            </select>
          </div>
        </template>

        <button
          class="generate-btn"
          :disabled="loading || !sessionStore.activeSession"
          @click="generate"
        >
          <AppIcon v-if="loading" icon="lucide:loader-circle" size="1em" class="spin" />
          <AppIcon v-else icon="lucide:sparkles" size="1em" />
          {{ loading ? 'Génération...' : 'Générer' }}
        </button>
      </div>

      <p v-if="error" class="form-error">{{ error }}</p>

      <div v-if="results.length" class="results-section">
        <template v-if="currentTypeDef?.multiResult">
          <ul class="results-list">
            <li
              v-for="(item, i) in results"
              :key="i"
              class="result-item"
              @click="copyResult(item, i)"
            >
              <span class="result-text">{{ item }}</span>
              <span class="copy-hint">
                <AppIcon :icon="copiedIndex === i ? 'lucide:check' : 'lucide:copy'" size="0.9em" />
              </span>
            </li>
          </ul>
          <p class="results-hint">Cliquer sur un résultat pour le copier.</p>
        </template>
        <template v-else>
          <div class="result-block" @click="copyResult(results[0], 0)">
            <p class="result-text-long">{{ results[0] }}</p>
            <span class="copy-hint-block">
              <AppIcon :icon="copiedIndex === 0 ? 'lucide:check' : 'lucide:copy'" size="0.9em" />
              {{ copiedIndex === 0 ? 'Copié !' : 'Copier' }}
            </span>
          </div>
        </template>
      </div>

      <div
        v-if="sessionRequestCount > 0 || quotaEmpty"
        class="quota-bar"
        :class="{ 'quota-low': quotaLow, 'quota-empty': quotaEmpty }"
      >
        <AppIcon icon="lucide:gauge" size="0.85em" />
        <span>{{ sessionRequestCount }} génération{{ sessionRequestCount > 1 ? 's' : '' }} cette session</span>
        <span v-if="quota?.limit" class="quota-api">
          — quota API : {{ quota.remaining }} / {{ quota.limit }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.generator-tool {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Bannière "générateur non disponible" */
.unavailable-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
  padding: 0.9rem 1rem;
  background: var(--admin-warning-bg, var(--color-warning-soft));
  border: 1px solid var(--admin-warning-border, var(--color-warning-border));
  border-radius: 10px;
}
.unavailable-icon {
  color: var(--color-warning, #f0a500);
  flex-shrink: 0;
  margin-top: 0.1rem;
}
.unavailable-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.unavailable-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--admin-warning-text, var(--color-warning));
  margin: 0;
}
.unavailable-text {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.55;
}
.unavailable-text code {
  font-family: monospace;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  font-size: 0.78rem;
  color: var(--color-gold-bright);
}

/* Matches `.section-title` from TvControls / VoteManager */
.tool-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.generator-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Matches form labels in VoteManager / TvControls */
.form-label {
  min-width: 4rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

/* Matches `.form-input` from TvControls */
.form-select {
  flex: 1;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg, var(--surface-raised));
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}
.form-select:focus { border-color: var(--color-gold-dark); }

/* Generate button — matches `.action-btn` from TvControls / VoteManager */
.generate-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.15s;
}
.generate-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.generate-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.form-error {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--admin-danger-text, var(--color-danger));
  margin: 0;
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg, var(--surface-raised));
  cursor: pointer;
  transition: border-color 0.15s;
}
.result-item:hover { border-color: var(--color-gold-dark); }

.result-text {
  font-family: var(--font-body), sans-serif;
  font-size: 0.875rem;
  color: var(--color-parchment);
}

.copy-hint {
  color: var(--color-text-dim);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.result-block {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg, var(--surface-raised));
  cursor: pointer;
  transition: border-color 0.15s;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.result-block:hover { border-color: var(--color-gold-dark); }

.result-text-long {
  font-family: var(--font-body), sans-serif;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--color-parchment);
  margin: 0;
}

.copy-hint-block {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  align-self: flex-end;
}

.results-hint {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  margin: 0;
}

.quota-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  background: var(--admin-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
}
.quota-bar.quota-low {
  color: var(--color-warning, #d97706);
  border-color: var(--color-warning, #d97706);
}
.quota-bar.quota-empty {
  color: var(--admin-danger-text, var(--color-danger));
  border-color: var(--admin-danger-border, var(--color-danger-border));
}

.quota-api {
  opacity: 0.65;
  font-size: 0.9em;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
