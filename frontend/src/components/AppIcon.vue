<script setup>
import { Icon } from '@iconify/vue'

defineProps({
  icon: { type: String, required: true },
  size: { type: [String, Number], default: '1em' },
  color: { type: String, default: 'currentColor' },
  inline: { type: Boolean, default: true },
})
</script>

<template>
  <Icon
    :icon="icon"
    :width="size"
    :height="size"
    :color="color"
    :inline="inline"
    aria-hidden="true"
  />
</template>

