<script setup>
// Page interactive rendue en 1920 × 1080 puis réduite (ou agrandie) pour tenir dans son
// cadre : le MJ voit exactement ce que montre la TV. Parle le pont dmt-bridge avec la page
// (voir utils/interactiveBridge.js) ; côté TV l'iframe n'est jamais cliquable.
import { ref, watch, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'
import { connectBridge } from '@/utils/interactiveBridge.js'

const BASE_W = 1920
const BASE_H = 1080
// Délai laissé à la page pour s'annoncer (`dmt:ready`) après son `load` avant le repli.
const READY_GRACE_MS = 150

const props = defineProps({
  src: { type: String, required: true },
  role: { type: String, required: true, validator: v => v === 'gm' || v === 'tv' },
  players: { type: Array, default: () => [] },
  state: { default: null },
  // Clics déjà joués (pages sans pont) : rejoués au chargement.
  clicks: { type: Array, default: () => [] },
  // Remplit son parent (TV) au lieu d'un cadre 16:9 (aperçu MJ).
  fill: { type: Boolean, default: false },
})

const emit = defineEmits(['state', 'click'])

const stageRef = ref(null)
const frameRef = ref(null)
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const isFullscreen = ref(false)

const bridge = connectBridge({
  getFrame: () => frameRef.value,
  role: props.role,
  getInit: () => ({ players: props.players, state: props.state }),
  onState: state => emit('state', state),
  onClick: path => emit('click', path),
})

// TV : chaque état reçu du MJ est poussé à la page.
watch(() => props.state, state => {
  if (props.role === 'tv') bridge.sendState(state)
})

function onLoad() {
  setTimeout(() => {
    if (!bridge.consumeReady()) bridge.replayClicks(props.clicks)
  }, READY_GRACE_MS)
}

function replayClick(path) {
  bridge.replayClicks([path])
}

defineExpose({ replayClick })

function fit() {
  const el = stageRef.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  const k = Math.min(w / BASE_W, h / BASE_H) || 1
  scale.value = k
  offset.value = { x: (w - BASE_W * k) / 2, y: (h - BASE_H * k) / 2 }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else stageRef.value?.requestFullscreen?.()
}

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === stageRef.value
}

let observer = null
onMounted(() => {
  observer = new ResizeObserver(fit)
  if (stageRef.value) observer.observe(stageRef.value)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  fit()
})

onUnmounted(() => {
  observer?.disconnect()
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  bridge.dispose()
})
</script>

<template>
  <div
    ref="stageRef"
    class="interactive-stage"
    :class="{ fill, fullscreen: isFullscreen }"
    data-testid="interactive-stage"
  >
    <iframe
      ref="frameRef"
      :src="src"
      class="interactive-frame"
      :class="{ passive: role === 'tv' }"
      sandbox="allow-scripts"
      :title="role === 'gm' ? 'Page interactive (MJ)' : 'Page interactive'"
      :tabindex="role === 'tv' ? -1 : 0"
      :style="{
        width: `${BASE_W}px`,
        height: `${BASE_H}px`,
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
      }"
      @load="onLoad"
    />
    <button
      v-if="role === 'gm'"
      class="fullscreen-btn"
      :title="isFullscreen ? 'Quitter le plein écran' : 'Plein écran'"
      @click="toggleFullscreen"
    >
      <AppIcon :icon="isFullscreen ? 'lucide:minimize' : 'lucide:maximize'" size="1em" />
    </button>
  </div>
</template>

<style scoped>
.interactive-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--color-media-letterbox);
}
.interactive-stage.fill {
  aspect-ratio: auto;
  flex: 1;
  height: 100%;
}
.interactive-stage.fullscreen {
  aspect-ratio: auto;
  width: 100vw;
  height: 100vh;
}

.interactive-frame {
  position: absolute;
  top: 0;
  left: 0;
  border: none;
  transform-origin: 0 0;
  background: var(--color-media-letterbox);
}
.interactive-frame.passive { pointer-events: none; }

.fullscreen-btn {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: grid;
  place-items: center;
  width: var(--touch-min);
  height: var(--touch-min);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-gold-dark);
  background: var(--overlay-scrim);
  color: var(--color-gold-bright);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.fullscreen-btn:hover,
.fullscreen-btn:focus-visible { opacity: 1; }
</style>
