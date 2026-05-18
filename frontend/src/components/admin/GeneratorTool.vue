<script setup>
import { ref, computed, watch } from 'vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'
import AppIcon from '../AppIcon.vue'
import {
  GENERATOR_TYPES,
  getGeneratorType,
  getDefaultOptions,
  formatQuotaDisplay,
  isQuotaLow,
  isQuotaEmpty,
  parseGeneratorResult,
} from '../../utils/generatorUtils.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const selectedType = ref(GENERATOR_TYPES[0].key)
const options = ref(getDefaultOptions(GENERATOR_TYPES[0].key))
const results = ref([])
const loading = ref(false)
const error = ref('')
const quota = ref(null)
const sessionRequestCount = ref(0)
const copiedIndex = ref(null)

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
  </div>
</template>

<style scoped>
.generator-tool {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.tool-title {
  font-size: 1.1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text);
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

.form-label {
  min-width: 5rem;
  font-size: 0.875rem;
  color: var(--color-text-muted, #888);
}

.form-select {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
}

.generate-btn {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  border: none;
  background: var(--color-primary, #7c5cbf);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-error {
  color: var(--color-danger, #e05555);
  font-size: 0.875rem;
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
  gap: 0.4rem;
}

.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  transition: background 0.12s;
}

.result-item:hover {
  background: var(--color-surface-hover, rgba(255,255,255,0.05));
}

.result-text {
  font-size: 0.95rem;
}

.copy-hint {
  color: var(--color-text-muted, #888);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
}

.result-block {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  transition: background 0.12s;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.result-block:hover {
  background: var(--color-surface-hover, rgba(255,255,255,0.05));
}

.result-text-long {
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0;
}

.copy-hint-block {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--color-text-muted, #888);
  font-size: 0.8rem;
  align-self: flex-end;
}

.results-hint {
  font-size: 0.78rem;
  color: var(--color-text-muted, #888);
  margin: 0;
}

.quota-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--color-text-muted, #888);
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.quota-bar.quota-low {
  color: #d97706;
  border-color: #d97706;
}

.quota-bar.quota-empty {
  color: var(--color-danger, #e05555);
  border-color: var(--color-danger, #e05555);
}

.quota-api {
  opacity: 0.6;
  font-size: 0.75em;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
