<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { formatHours, kmToMiles } from '@/utils/hexcrawl.js'

// Couche TV du hexcrawl : piste, échelle et compteur. Ne reçoit que la projection publique
// (publicHexcrawl) : le journal et l'armée masquée n'arrivent jamais jusqu'ici.
const props = defineProps({
  hexcrawl: { type: Object, required: true },
  // Position de l'image dans le conteneur, en px : { x, y, w, h, viewW }.
  layout: { type: Object, required: true },
  // Largeur à l'écran d'un hex (d'un côté plat à l'autre), en px.
  hexPx: { type: Number, default: 0 },
})

const points = computed(() => (props.hexcrawl.trail || [])
  .map(p => `${props.layout.x + p.nx * props.layout.w},${props.layout.y + p.ny * props.layout.h}`)
  .join(' '))

const army = computed(() => {
  const a = props.hexcrawl.army
  if (!a) return null
  return { x: props.layout.x + a.nx * props.layout.w, y: props.layout.y + a.ny * props.layout.h, name: a.name }
})

// Le contact s'annonce en grand, puis reste en bandeau pour laisser voir la carte.
const CONTACT_ANNOUNCE_MS = 6000
const contactAnnounced = ref(false)
let contactTimer = null
watch(() => props.hexcrawl.contact, (contact) => {
  clearTimeout(contactTimer)
  contactAnnounced.value = !!contact
  if (contact) contactTimer = setTimeout(() => { contactAnnounced.value = false }, CONTACT_ANNOUNCE_MS)
}, { immediate: true })
onUnmounted(() => clearTimeout(contactTimer))

// Le compteur se place du côté opposé au groupe, pour ne jamais couvrir sa position.
const hudOnRight = computed(() => {
  const last = props.hexcrawl.trail?.at(-1)
  return !!last && props.layout.x + last.nx * props.layout.w < props.layout.viewW / 2
})

// La barre représente 1 hex, ou plus si la carte est très dézoomée, pour rester lisible.
const scale = computed(() => {
  const count = [1, 2, 5, 10, 20].find(n => n * props.hexPx >= 70) || 20
  const km = count * (props.hexcrawl.hexKm || 0)
  return { px: count * props.hexPx, km, miles: Math.round(kmToMiles(km)) }
})
</script>

<template>
  <div class="hexcrawl-overlay" data-testid="tv-hexcrawl">
    <svg class="trail" aria-hidden="true">
      <polyline v-if="hexcrawl.trail?.length > 1" class="trail-halo" :points="points" />
      <polyline v-if="hexcrawl.trail?.length > 1" class="trail-line" :points="points" />
      <g v-if="army">
        <circle class="army-dot" :cx="army.x" :cy="army.y" r="16" />
      </g>
    </svg>
    <span v-if="army" class="army-label" :style="{ left: `${army.x}px`, top: `${army.y + 20}px` }">{{ army.name }}</span>

    <div v-if="hexcrawl.contact" class="contact" :class="{ announced: contactAnnounced }" role="status" data-testid="tv-hexcrawl-contact">
      <AppIcon icon="lucide:swords" />
      <span>{{ hexcrawl.contact }} rejoint le groupe !</span>
    </div>

    <div class="hud" :class="{ right: hudOnRight }">
      <div v-if="hexPx" class="scale" data-testid="tv-hexcrawl-scale">
        <span class="scale-bar" :style="{ width: `${scale.px}px` }" />
        <span>{{ scale.km }} km <small>≈ {{ scale.miles }} miles</small></span>
      </div>
      <div class="clock" data-testid="tv-hexcrawl-clock">
        <strong>Jour {{ hexcrawl.day }}</strong>
        <span v-if="hexcrawl.hours != null">{{ formatHours(hexcrawl.hours) }} écoulée{{ hexcrawl.hours >= 2 ? 's' : '' }}</span>
        <span v-if="hexcrawl.fuel !== null && hexcrawl.fuel !== undefined" class="fuel" :aria-label="`Carburant : ${hexcrawl.fuel}`"><AppIcon icon="lucide:fuel" /> {{ hexcrawl.fuel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hexcrawl-overlay { position: absolute; inset: 0; pointer-events: none; }
.trail { position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; }
.trail-halo, .trail-line { fill: none; stroke-linejoin: round; stroke-linecap: round; }
.trail-halo { stroke: rgba(0, 0, 0, 0.75); stroke-width: 9; }
.trail-line { stroke: var(--color-gold-bright); stroke-width: 4; stroke-dasharray: 2 12; }
.army-dot { fill: rgba(190, 30, 30, 0.85); stroke: #fff; stroke-width: 3; }
.army-label { position: absolute; z-index: 3; transform: translateX(-50%); padding: 2px 8px; border-radius: 6px; background: rgba(0, 0, 0, 0.8); color: var(--color-overlay-danger-text); font-size: clamp(14px, 1.2vw, 24px); white-space: nowrap; }
.contact { position: absolute; z-index: 30; top: 1.5vw; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 0.5em; padding: 0.5em 1em; border: 2px solid var(--color-overlay-danger-text); border-radius: 12px; background: rgba(0, 0, 0, 0.85); color: var(--color-overlay-danger-text); font-family: var(--font-heading), sans-serif; font-size: clamp(16px, 1.6vw, 34px); white-space: nowrap; transition: top var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out), font-size var(--dur-slow) var(--ease-out); }
.contact.announced { top: 50%; transform: translate(-50%, -50%); font-size: clamp(28px, 4.5vw, 96px); white-space: normal; width: max-content; max-width: 90%; text-align: center; }
.hud { position: absolute; z-index: 30; left: 1.5vw; bottom: 1.5vw; display: flex; flex-direction: column; gap: 0.6vw; align-items: flex-start; padding: 0.8vw 1.2vw; border-radius: 12px; background: rgba(0, 0, 0, 0.72); color: var(--color-overlay-text); font-size: clamp(14px, 1.3vw, 28px); }
.hud.right { left: auto; right: 1.5vw; }
.scale { display: flex; flex-direction: column; gap: 0.3vw; }
.scale small { opacity: 0.75; font-size: 0.8em; }
.scale-bar { display: block; height: 8px; border: 2px solid currentColor; border-top: none; box-sizing: border-box; }
/* Lu de loin par toute la table : nettement plus grand que l'échelle. */
.clock { display: flex; align-items: baseline; gap: 0.7em; white-space: nowrap; font-size: clamp(26px, 3vw, 72px); font-weight: 600; line-height: 1.15; }
.clock strong { font-family: var(--font-heading), sans-serif; font-size: 1.2em; }
.fuel { opacity: 0.9; }
</style>
