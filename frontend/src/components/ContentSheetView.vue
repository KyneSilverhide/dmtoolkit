<script setup>
// Rendu générique d'une fiche de contenu (sort/objet/race/origine/aptitude/service/état —
// jamais une classe, trop volumineuse) — partagé entre l'écran TV (TvContent.vue, variant
// "tv", grande taille de police) et le message joueur (MessageCard.vue, variant "compact").
// L'objet `item` est la donnée brute telle que renvoyée par les endpoints /api/* déjà
// utilisés par les composants de recherche admin (SpellSearch, ItemSearch, etc.) — voir
// backend/src/socket.js `show-content` : l'admin envoie l'objet qu'il a déjà côté client,
// le serveur ne le résout jamais lui-même.
defineProps({
  contentType: { type: String, required: true }, // spell | item | race | background | ability | service | condition
  item: { type: Object, required: true },
  variant: { type: String, default: 'tv' }, // 'tv' | 'compact'
})
</script>

<template>
  <div class="content-sheet" :class="`variant-${variant}`">
    <template v-if="contentType === 'spell'">
      <h2 class="cs-title">{{ item.name }}</h2>
      <p class="cs-subtitle">{{ item.attributes?.ecole }}</p>
      <div class="cs-attrs">
        <span v-if="item.attributes?.temps_incantation" class="cs-attr">⏱ {{ item.attributes.temps_incantation }}</span>
        <span v-if="item.attributes?.portee" class="cs-attr">🎯 {{ item.attributes.portee }}</span>
        <span v-if="item.attributes?.duree" class="cs-attr">⌛ {{ item.attributes.duree }}</span>
        <span v-if="item.attributes?.composantes" class="cs-attr">🧪 {{ item.attributes.composantes }}</span>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html — HTML statique de nos données, pas de saisie utilisateur -->
      <div class="cs-desc" v-html="item.description_html || item.description"></div>
      <div v-if="item.classes?.length" class="cs-badges">
        <span v-for="c in item.classes" :key="c" class="cs-badge">{{ c }}</span>
      </div>
    </template>

    <template v-else-if="contentType === 'item'">
      <h2 class="cs-title">{{ item.name }}</h2>
      <p class="cs-subtitle">
        {{ item.item_type }}<template v-if="item.rarity"> · {{ item.rarity }}</template>
      </p>
      <p v-if="item.requires_attunement" class="cs-note">
        Nécessite un lien<template v-if="item.attunement_detail"> — {{ item.attunement_detail }}</template>
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="cs-desc" v-html="item.description_html || item.description"></div>
      <p v-if="item.list_data?.prix" class="cs-price">{{ item.list_data.prix }}</p>
    </template>

    <template v-else-if="contentType === 'race'">
      <h2 class="cs-title">{{ item.name }}</h2>
      <p class="cs-subtitle">{{ [item.size, item.speed].filter(Boolean).join(' · ') }}</p>
      <p v-if="item.ability_bonus" class="cs-note">{{ item.ability_bonus }}</p>
      <ul class="cs-trait-list">
        <li v-for="t in item.traits" :key="t.name"><strong>{{ t.name }}</strong> — {{ t.description }}</li>
      </ul>
    </template>

    <template v-else-if="contentType === 'background'">
      <h2 class="cs-title">{{ item.name }}</h2>
      <p v-if="item.skill_proficiencies?.length" class="cs-subtitle">{{ item.skill_proficiencies.join(', ') }}</p>
      <p class="cs-desc">{{ item.description }}</p>
      <p v-if="item.feature" class="cs-note"><strong>{{ item.feature.name }}</strong> — {{ item.feature.description }}</p>
    </template>

    <template v-else-if="contentType === 'ability'">
      <h2 class="cs-title">{{ item.name }}</h2>
      <p class="cs-subtitle">
        {{ item.className }}<template v-if="item.subclassName"> · {{ item.subclassName }}</template>
        <template v-if="item.level"> — niv. {{ item.level }}</template>
      </p>
      <p class="cs-desc">{{ item.description }}</p>
    </template>

    <template v-else-if="contentType === 'service'">
      <h2 class="cs-title">{{ item.name }}</h2>
      <p class="cs-price">{{ item.price }}</p>
      <p class="cs-desc">{{ item.description }}</p>
    </template>

    <template v-else-if="contentType === 'condition'">
      <h2 class="cs-title">{{ item.name }}<span v-if="item.name_vo" class="cs-vo"> ({{ item.name_vo }})</span></h2>
      <p class="cs-desc">{{ item.description }}</p>
    </template>
  </div>
</template>

<style scoped>
.content-sheet {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.cs-title {
  font-family: var(--font-heading), sans-serif;
  color: var(--color-gold-bright);
  margin: 0;
}
.cs-subtitle {
  font-family: var(--font-heading), sans-serif;
  letter-spacing: 0.06em;
  color: var(--color-text-dim);
  margin: 0;
}
.cs-attrs, .cs-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.cs-attr {
  font-family: var(--font-body), sans-serif;
  color: var(--color-text-dim);
}
.cs-badge {
  font-family: var(--font-heading), sans-serif;
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  color: var(--color-gold-bright);
  padding: 0.1rem 0.6rem;
}
.cs-note {
  font-family: var(--font-body), sans-serif;
  font-style: italic;
  color: var(--color-text-dim);
  margin: 0;
}
.cs-price {
  font-family: var(--font-heading), sans-serif;
  color: var(--color-gold-bright);
  margin: 0;
}
.cs-desc {
  font-family: var(--font-body), sans-serif;
  color: var(--color-text);
  line-height: 1.5;
  margin: 0;
}
.cs-trait-list {
  font-family: var(--font-body), sans-serif;
  color: var(--color-text);
  line-height: 1.5;
  margin: 0;
  padding-left: 1.2em;
}
.cs-vo {
  font-family: var(--font-body), sans-serif;
  font-style: italic;
  color: var(--color-text-dim);
}

/* ── Variant: TV (grande taille, lisible à distance) ─────────────────────── */
.variant-tv {
  gap: 1.2rem;
}
.variant-tv .cs-title { font-size: 3rem; }
.variant-tv .cs-subtitle { font-size: 1.4rem; }
.variant-tv .cs-attr, .variant-tv .cs-badge { font-size: 1.2rem; }
.variant-tv .cs-note, .variant-tv .cs-price { font-size: 1.4rem; }
.variant-tv .cs-desc, .variant-tv .cs-trait-list { font-size: 1.5rem; }
.variant-tv .cs-vo { font-size: 1rem; }

/* ── Variant: compact (message joueur) ───────────────────────────────────── */
.variant-compact { gap: 0.4rem; }
.variant-compact .cs-title { font-size: 0.95rem; }
.variant-compact .cs-subtitle { font-size: 0.68rem; }
.variant-compact .cs-attr, .variant-compact .cs-badge { font-size: 0.65rem; }
.variant-compact .cs-note, .variant-compact .cs-price { font-size: 0.72rem; }
.variant-compact .cs-desc, .variant-compact .cs-trait-list { font-size: 0.78rem; }
.variant-compact .cs-vo { font-size: 0.68rem; }
</style>
