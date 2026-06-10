<script setup>
import AppIcon from '@/components/AppIcon.vue'
import MessageCard from '@/components/player/MessageCard.vue'

const props = defineProps({
  messages:             { type: Array, default: () => [] },
  playerMessageText:    { type: String, default: '' },
  playerMessageSending: { type: Boolean, default: false },
  playerMessageSent:    { type: Boolean, default: false },
  replyContext:         { default: null },
})

const emit = defineEmits([
  'update:playerMessageText',
  'send-message',
  'set-reply-context',
  'clear-reply',
])
</script>

<template>
  <div>
    <div v-if="messages.length === 0" class="panel empty-panel">
      <p class="empty-icon"><AppIcon icon="lucide:inbox" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="empty-text">En attente de messages…</p>
      <p class="empty-sub">Restez vigilant, aventurier.</p>
    </div>
    <div v-else class="messages-list">
      <MessageCard
        v-for="(msg, idx) in messages"
        :key="idx"
        :message="msg"
        :allow-reply="msg.kind === 'message'"
        @reply="emit('set-reply-context', msg)"
      />
    </div>

    <!-- Compose area -->
    <div class="player-compose">
      <div v-if="replyContext" class="reply-context">
        <span class="reply-context-label">↩ En réponse à {{ replyContext.fromName }}</span>
        <button class="reply-context-clear" @click="emit('clear-reply')">✕</button>
      </div>
      <div class="compose-row">
        <textarea
          :value="playerMessageText"
          class="compose-textarea"
          placeholder="Message secret au MJ…"
          rows="2"
          @input="emit('update:playerMessageText', $event.target.value)"
          @keydown.ctrl.enter.prevent="emit('send-message')"
        />
        <button
          class="compose-send-btn"
          :disabled="!playerMessageText.trim() || playerMessageSending"
          @click="emit('send-message')"
          title="Envoyer (Ctrl+Entrée)"
        >
          <AppIcon v-if="!playerMessageSending && !playerMessageSent" icon="lucide:send" size="1.1rem" />
          <AppIcon v-else-if="playerMessageSent" icon="lucide:check" size="1.1rem" color="var(--color-success)" />
          <AppIcon v-else icon="lucide:loader" size="1.1rem" />
        </button>
      </div>
      <p v-if="playerMessageSent" class="compose-feedback">Message envoyé au MJ.</p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: var(--player-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: var(--shadow-soft);
}

.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 0.5rem;
  border-style: dashed;
}
.empty-icon { font-size: 2.5rem; opacity: 0.4; }
.empty-text { font-family: var(--font-heading), sans-serif; font-size: 0.9rem; letter-spacing: 0.1em; color: var(--color-text-dim); }
.empty-sub { font-family: var(--font-body), sans-serif; color: var(--color-border); font-size: 0.8rem; }

.messages-list { display: flex; flex-direction: column; gap: 1rem; }

.player-compose {
  margin-top: 1.25rem;
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reply-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.75rem;
  background: var(--color-surface-alt);
  border-radius: 6px;
  border-left: 2px solid var(--color-gold-dark);
}
.reply-context-label {
  font-family: var(--font-body), sans-serif;
  font-size: 0.78rem;
  color: var(--color-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reply-context-clear {
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  font-size: 0.75rem;
  flex-shrink: 0;
  padding: 0 0.25rem;
}

.compose-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
}
.compose-textarea {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.9rem;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  line-height: 1.4;
}
.compose-textarea:focus { border-color: var(--color-gold-dark); }

.compose-send-btn {
  flex-shrink: 0;
  width: 2.6rem;
  height: 2.6rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.compose-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.compose-send-btn:hover:not(:disabled) { box-shadow: var(--shadow-soft); }

.compose-feedback {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--color-success, #34d399);
  text-align: center;
}
</style>
