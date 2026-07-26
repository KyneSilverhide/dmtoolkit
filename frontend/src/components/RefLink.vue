<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { schoolColor, parseEcole, levelLabel } from '@/utils/spellSchool.js'
import { itemTypeStyle } from '@/utils/itemTypes.js'
import { contentBasePath } from '@/utils/contentRoutes.js'

const props = defineProps({
  type: { type: String, required: true }, // 'spell' | 'ability' | 'glossary' | 'item' | 'condition'
  label: { type: String, required: true },
  payload: { type: Object, required: true },
})

const router = useRouter()
const route = useRoute()

const visible = ref(false)
const triggerRef = ref(null)
const bubblePos = ref({ top: 0, left: 0, dir: 'right' })

const BUBBLE_WIDTH = 280
const BUBBLE_OFFSET = 10

function calcPos() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  const prefersRight = rect.right + BUBBLE_OFFSET + BUBBLE_WIDTH <= vw
  const prefersLeft = rect.left - BUBBLE_OFFSET - BUBBLE_WIDTH >= 0
  const dir = prefersRight ? 'right' : prefersLeft ? 'left' : 'bottom'

  let top, left
  if (dir === 'right') {
    left = rect.right + BUBBLE_OFFSET
    top = rect.top + rect.height / 2
  } else if (dir === 'left') {
    left = rect.left - BUBBLE_OFFSET - BUBBLE_WIDTH
    top = rect.top + rect.height / 2
  } else {
    left = Math.max(8, Math.min(vw - BUBBLE_WIDTH - 8, rect.left + rect.width / 2 - BUBBLE_WIDTH / 2))
    top = rect.bottom + BUBBLE_OFFSET
  }

  if (dir !== 'bottom' && top + 100 > vh) top = vh - 110
  if (top < 8) top = 8

  bubblePos.value = { top, left, dir }
}

function attachListeners() {
  document.addEventListener('scroll', onScroll, { passive: true, capture: true })
}
function detachListeners() {
  document.removeEventListener('scroll', onScroll, { capture: true })
}
function open() {
  calcPos()
  if (!visible.value) attachListeners()
  visible.value = true
}
function close() {
  if (visible.value) detachListeners()
  visible.value = false
}
function onScroll() { if (visible.value) close() }

onBeforeUnmount(() => { if (visible.value) detachListeners() })

const parsedEcole = computed(() =>
  props.type === 'spell' ? parseEcole(props.payload.attributes?.ecole) : null
)

const spellMeta = computed(() => {
  if (!parsedEcole.value) return ''
  return `${levelLabel(parsedEcole.value.level)} · ${parsedEcole.value.school}`
})

const bubbleColor = computed(() => {
  if (parsedEcole.value) return schoolColor(parsedEcole.value.school)
  if (props.type === 'item') return itemTypeStyle(props.payload.item_type).color
  if (props.type === 'condition') return 'var(--color-danger)'
  return null
})

const shortDescription = computed(() => {
  const d = props.payload.description || ''
  return d.length > 180 ? d.slice(0, 180).trimEnd() + '…' : d
})

function go() {
  if (props.type === 'glossary') return
  const base = contentBasePath(route)
  if (props.type === 'spell') {
    router.push({ path: `${base}/spells`, query: { q: props.payload.name, slug: props.payload.slug } })
  } else if (props.type === 'item') {
    router.push({ path: `${base}/equipment`, query: { q: props.payload.name, slug: props.payload.slug } })
  } else if (props.type === 'condition') {
    router.push({ path: `${base}/conditions`, query: { q: props.payload.name, slug: props.payload.slug } })
  } else {
    router.push({ path: `${base}/abilities`, query: { q: props.payload.name, slug: props.payload.id } })
  }
}

const bubbleStyle = computed(() => ({
  position: 'fixed',
  zIndex: 9999,
  top: bubblePos.value.top + 'px',
  left: bubblePos.value.left + 'px',
  transform: bubblePos.value.dir === 'bottom' ? 'none' : 'translateY(-50%)',
  width: BUBBLE_WIDTH + 'px',
  maxWidth: 'calc(100vw - 16px)',
}))
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="ref-link"
    :class="`ref-link-${type}`"
    @mouseenter="open"
    @mouseleave="close"
    @focus="open"
    @blur="close"
    @click.stop="go"
  >{{ label }}</button>

  <Teleport to="body">
    <Transition name="reflink">
      <div v-if="visible" class="reflink-bubble" :style="bubbleStyle" role="tooltip">
        <div class="reflink-head">
          <span class="reflink-name">{{ payload.name }}</span>
          <span v-if="type === 'spell'" class="reflink-badge" :style="{ color: bubbleColor }">{{ spellMeta }}</span>
          <span v-else-if="type === 'glossary'" class="reflink-badge">Règle</span>
          <span v-else-if="type === 'item'" class="reflink-badge" :style="{ color: bubbleColor }">{{ payload.item_type }}</span>
          <span v-else-if="type === 'condition'" class="reflink-badge" :style="{ color: bubbleColor }">État</span>
          <span v-else class="reflink-badge">{{ payload.className }}<template v-if="payload.subclassName"> · {{ payload.subclassName }}</template></span>
        </div>
        <p class="reflink-desc">{{ shortDescription }}</p>
        <p v-if="type !== 'glossary'" class="reflink-hint">Cliquer pour voir la fiche complète</p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ref-link {
  display: inline;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
.ref-link-spell {
  color: var(--color-gold-bright);
}
.ref-link-spell:hover, .ref-link-spell:focus-visible {
  color: var(--color-gold-dark);
}
.ref-link-ability {
  color: var(--color-info-bright, var(--color-parchment));
}
.ref-link-ability:hover, .ref-link-ability:focus-visible {
  text-decoration-style: solid;
}
.ref-link-glossary {
  color: var(--color-pending);
  cursor: help;
}
.ref-link-glossary:hover, .ref-link-glossary:focus-visible {
  text-decoration-style: solid;
}
.ref-link-item {
  color: var(--color-success);
}
.ref-link-item:hover, .ref-link-item:focus-visible {
  text-decoration-style: solid;
}
.ref-link-condition {
  color: var(--color-danger);
}
.ref-link-condition:hover, .ref-link-condition:focus-visible {
  text-decoration-style: solid;
}
</style>

<!-- Global styles for the Teleported bubble — cannot be scoped -->
<style>
.reflink-bubble {
  background: var(--helptip-bg);
  color: var(--helptip-text);
  border: 1px solid var(--helptip-border);
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
  box-shadow: var(--helptip-shadow);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.reflink-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.reflink-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
}
.reflink-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.8;
  white-space: nowrap;
}
.reflink-desc {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.45;
}
.reflink-hint {
  margin: 0;
  font-size: 0.6rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  opacity: 0.6;
}

.reflink-enter-active { transition: opacity 0.15s ease; }
.reflink-leave-active { transition: opacity 0.1s ease; }
.reflink-enter-from, .reflink-leave-to { opacity: 0; }
</style>
