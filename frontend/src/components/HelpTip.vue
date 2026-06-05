<script setup>
import { ref, computed, useSlots, onBeforeUnmount } from 'vue'
import { helpContent } from '@/utils/helpContent.js'

const props = defineProps({
  id: { type: String, required: true },
  position: { type: String, default: 'right' },
})

const slots = useSlots()
const hasSlot = computed(() => !!slots.default)

const visible = ref(false)
const triggerRef = ref(null)
const bubblePos = ref({ top: 0, left: 0, dir: 'right' })

const BUBBLE_WIDTH = 260
const BUBBLE_OFFSET = 10

const content = computed(() => helpContent[props.id] ?? `[aide: ${props.id}]`)

function calcPos() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  const prefersRight = rect.right + BUBBLE_OFFSET + BUBBLE_WIDTH <= vw
  const prefersLeft  = rect.left  - BUBBLE_OFFSET - BUBBLE_WIDTH >= 0
  const dir =
    props.position === 'left' && prefersLeft ? 'left'
    : props.position === 'right' && prefersRight ? 'right'
    : prefersRight ? 'right'
    : prefersLeft ? 'left'
    : 'bottom'

  let top, left
  if (dir === 'right') {
    left = rect.right + BUBBLE_OFFSET
    top  = rect.top + rect.height / 2
  } else if (dir === 'left') {
    left = rect.left - BUBBLE_OFFSET - BUBBLE_WIDTH
    top  = rect.top + rect.height / 2
  } else {
    left = Math.max(8, Math.min(vw - BUBBLE_WIDTH - 8, rect.left + rect.width / 2 - BUBBLE_WIDTH / 2))
    top  = rect.bottom + BUBBLE_OFFSET
  }

  if (top + 80 > vh) top = vh - 90
  if (top < 8) top = 8

  bubblePos.value = { top, left, dir }
}

function attachListeners() {
  document.addEventListener('click', onDocClick, { passive: true })
  document.addEventListener('scroll', onScroll, { passive: true, capture: true })
}
function detachListeners() {
  document.removeEventListener('click', onDocClick)
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
function toggle(e) { e.stopPropagation(); visible.value ? close() : open() }

function onDocClick() { close() }
function onScroll() { if (visible.value) close() }

onBeforeUnmount(() => {
  if (visible.value) detachListeners()
})

const bubbleStyle = computed(() => ({
  position:  'fixed',
  zIndex:    9999,
  top:       bubblePos.value.top  + 'px',
  left:      bubblePos.value.left + 'px',
  transform: bubblePos.value.dir === 'bottom' ? 'none' : 'translateY(-50%)',
  width:     BUBBLE_WIDTH + 'px',
  maxWidth:  'calc(100vw - 16px)',
}))
</script>

<template>
  <!-- Slot mode: the provided content is the trigger, no ? button added -->
  <span
    v-if="hasSlot"
    ref="triggerRef"
    class="helptip-slot-trigger"
    @mouseenter="open"
    @mouseleave="close"
    @focusin="open"
    @focusout="close"
  ><slot /></span>

  <!-- Badge mode: renders a small ? circle next to inline content -->
  <button
    v-else
    ref="triggerRef"
    type="button"
    class="helptip-trigger"
    :aria-label="`Aide : ${id}`"
    :aria-describedby="visible ? `helptip-${id}` : undefined"
    @mouseenter="open"
    @mouseleave="close"
    @focus="open"
    @blur="close"
    @click.stop="toggle"
  >?</button>

  <Teleport to="body">
    <Transition name="helptip">
      <div
        v-if="visible"
        :id="`helptip-${id}`"
        class="helptip-bubble"
        :style="bubbleStyle"
        role="tooltip"
      >{{ content }}</div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.helptip-slot-trigger {
  display: inline-flex;
  align-items: stretch;
  cursor: default;
}

/* Touch-friendly target: visual circle kept small, padding absorbed via explicit dimensions */
.helptip-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  flex-shrink: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  vertical-align: middle;
  font-size: 0;
  line-height: 0;
  color: var(--color-text-dim, #888);
  transition: color 0.15s;
  border-radius: 50%;
  outline: none;
}

/* Visual circle */
.helptip-trigger::before {
  content: '?';
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
}

.helptip-trigger:hover,
.helptip-trigger:focus-visible {
  color: var(--color-gold-bright, #f5c842);
}

.helptip-trigger:focus-visible {
  outline: 2px solid var(--color-gold-bright, #f5c842);
  outline-offset: 2px;
  border-radius: 50%;
}
</style>

<!-- Global styles for the Teleported bubble — cannot be scoped -->
<style>
.helptip-bubble {
  /* Always dark regardless of app theme — standard tooltip convention */
  background: #1e1e2a;
  color: #e8e0d0;
  border: 1px solid #7a5c1e;
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
  font-size: 0.78rem;
  line-height: 1.45;
  box-shadow: 0 4px 16px rgba(0,0,0,0.45);
  pointer-events: none;
  white-space: normal;
  word-break: break-word;
}

/* noinspection CssUnusedSymbol */
.helptip-enter-active { transition: opacity 0.15s ease; }
.helptip-leave-active { transition: opacity 0.1s ease; }
.helptip-enter-from  { opacity: 0; }
.helptip-leave-to    { opacity: 0; }
</style>
