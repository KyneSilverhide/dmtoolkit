<script setup>
import { ref, computed, onMounted } from 'vue'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { BACKEND_URL } from '@/config.js'
import AppIcon from '../AppIcon.vue'
import LinkedText from '../LinkedText.vue'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'
import { useDebouncedTabFilter } from '@/composables/useDebouncedTabFilter.js'
import { withGlossary } from '@/utils/textLinker.js'
import { stripAccents } from '@/utils/slugify.js'
import ContentActionButtons from './ContentActionButtons.vue'

// Écran joueur : endpoints publics + pas de boutons TV/Envoyer (voir SpellSearch.vue).
const props = defineProps({
  playerMode: { type: Boolean, default: false },
})

const tabQuery = useContentTabQuery('services')
// exactMatch (renommé exactSlugFilter) : slug exact ciblé depuis la palette de commande
// (Ctrl+K) — si renseigné, la liste est réduite à ce seul service plutôt qu'à tous ceux
// correspondant au texte recherché.
const { query, exactMatch: exactSlugFilter, clearExactMatch } = useDebouncedTabFilter(tabQuery)

const services = ref([])
const loading = ref(false)
const loadError = ref(false)

// Un service référence surtout des unités de mesure/monnaie, déjà couvertes par le
// glossaire — voir utils/glossary.js — jamais un sort ou un objet, donc pas besoin de
// candidats spécifiques ici au-delà de withGlossary([]) (même raisonnement que
// ConditionSearch.vue).
const refCandidates = computed(() => withGlossary([]))

async function loadServices() {
  loading.value = true
  loadError.value = false
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/services/public`)
      : await apiFetch('/api/services', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) {
      services.value = await res.json()
    } else {
      loadError.value = true
    }
  } catch (err) {
    console.error(err)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadServices)

function serviceMatches(service, q) {
  if (stripAccents(service.name.toLowerCase()).includes(q)) return true
  if (stripAccents((service.price || '').toLowerCase()).includes(q)) return true
  return stripAccents((service.description || '').toLowerCase()).includes(q)
}

const filteredServices = computed(() => {
  if (exactSlugFilter.value) return services.value.filter(service => service.slug === exactSlugFilter.value)
  const q = stripAccents(query.value.trim().toLowerCase())
  if (!q) return services.value
  return services.value.filter(service => serviceMatches(service, q))
})

// Regroupe par catégorie (champ `category` de dnd_services.json) en conservant l'ordre
// d'apparition dans les données plutôt qu'un tri alphabétique des groupes.
const groupedServices = computed(() => {
  const groups = []
  const byCategory = new Map()
  for (const service of filteredServices.value) {
    const category = service.category || 'Autre'
    let group = byCategory.get(category)
    if (!group) {
      group = { category, services: [] }
      byCategory.set(category, group)
      groups.push(group)
    }
    group.services.push(service)
  }
  return groups
})

</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon icon="lucide:hand-coins" size="0.9em" /> Services</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom, prix, description…"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les services.</p>
    </div>

    <div v-else-if="filteredServices.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucun service trouvé pour « {{ query }} »</p>
    </div>

    <template v-else>
      <div class="results-info">
        <template v-if="exactSlugFilter">
          Correspondance exacte
          <button class="clear-filter-btn" type="button" @click="clearExactMatch">
            <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
          </button>
        </template>
        <template v-else>{{ filteredServices.length }} service(s)</template>
      </div>

      <div class="category-groups">
        <div v-for="group in groupedServices" :key="group.category" class="category-group">
          <h3 class="category-title">{{ group.category }}</h3>
          <div class="results-grid">
            <div v-for="service in group.services" :key="service.slug" class="service-card">
              <div class="service-header">
                <h3 class="service-name">{{ service.name }}</h3>
                <span class="price-badge"><AppIcon icon="lucide:coins" size="0.7em" /> {{ service.price }}</span>
              </div>
              <p class="service-desc"><LinkedText :text="service.description" :candidates="refCandidates" /></p>
              <div class="service-footer">
                <a :href="service.detail_url" target="_blank" class="service-link">Voir sur AideDD ↗</a>
                <ContentActionButtons v-if="!playerMode" content-type="service" :item="service" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Squelette (barre de recherche, chargement, "aucun résultat", grille...) partagé par
 * les composants de recherche de contenu qui filtrent une liste en mémoire — voir
 * assets/content-search-shared.css. Regroupement par catégorie et rendu de la carte de
 * résultat, propres à ce type de contenu, restent définis ci-dessous.
 */
@import '@/assets/content-search-shared.css';

.category-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.category-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0 0 var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}

.service-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: border-color 0.2s;
}
.service-card:hover { border-color: var(--color-gold-dark); }

.service-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.service-name {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-md);
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.price-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem var(--space-2);
  white-space: nowrap;
}

.service-desc {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  line-height: 1.55;
  margin: 0;
}

.service-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.service-link {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.service-link:hover { color: var(--color-gold-bright); }
</style>
