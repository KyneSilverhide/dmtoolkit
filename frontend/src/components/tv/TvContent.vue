<script setup>
import ContentSheetView from '../ContentSheetView.vue'

defineProps({
  activeContent: { type: Object, default: null }, // { contentType, contentData }
})
</script>

<template>
  <div class="content-display" data-testid="tv-mode-content">
    <div v-if="activeContent" class="content-panel">
      <ContentSheetView
        :content-type="activeContent.contentType"
        :item="activeContent.contentData"
        variant="tv"
      />
    </div>
  </div>
</template>

<style scoped>
.content-display {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  padding: 3rem;
}
.content-panel {
  background: var(--tv-panel-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 16px;
  padding: 2.5rem 3.5rem;
  max-width: 1100px;
  max-height: 100%;
  overflow-y: auto;
}
</style>
