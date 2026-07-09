<script setup lang="ts">
import { usePlatformStore } from './store';
import GBubble from '../ui/GBubble.vue';
import GCard from '../ui/GCard.vue';
import GButton from '../ui/GButton.vue';
import GProgress from '../ui/GProgress.vue';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
const store = usePlatformStore();
</script>

<template>
  <div class="timeline" :class="{ compact }">
    <template v-for="ev in store.timeline" :key="ev.id">
      <GBubble v-if="ev.kind === 'user'" from="user">{{ ev.text }}</GBubble>
      <GBubble v-else-if="ev.kind === 'ai'" from="ai">{{ ev.text }}</GBubble>

      <GCard v-else-if="ev.kind === 'task'" class="ev-card">
        <div class="row">
          <span class="dot task" />
          <b>{{ ev.title }}</b>
        </div>
        <GProgress :value="ev.progress" />
        <p class="note">{{ ev.note }} · {{ ev.progress }}%</p>
      </GCard>

      <GCard v-else class="ev-card">
        <div class="row">
          <span class="dot diff" />
          <b>{{ ev.title }}</b>
        </div>
        <p class="note">{{ ev.summary }}</p>
        <ul class="todos">
          <li v-for="(t, i) in ev.todos" :key="i" :class="{ done: t.done }">
            {{ t.done ? '✓' : '·' }} {{ t.label }}
          </li>
        </ul>
        <div v-if="!ev.resolved" class="acts">
          <GButton variant="primary" @click="store.resolveDiff(ev.id, 'adopt')">采纳</GButton>
          <GButton variant="ghost" @click="store.resolveDiff(ev.id, 'revise')">再改</GButton>
        </div>
        <p v-else class="resolved">{{ ev.resolved === 'adopt' ? '已采纳' : '已标记再改' }}</p>
      </GCard>
    </template>
  </div>
</template>

<style scoped>
.timeline { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-2); }
.timeline.compact { max-width: 100%; }
.ev-card { margin: var(--sp-2) 0; }
.compact .ev-card :deep(.g-card), .compact.ev-card { font-size: 12px; }
.row { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.row b { font-size: 13.5px; color: var(--ink-1); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot.task { background: var(--azure); }
.dot.diff { background: var(--amber); }
.note { font-size: 12.5px; color: var(--ink-2); margin: var(--sp-2) 0 0; }
.todos { list-style: none; padding: 0; margin: var(--sp-2) 0 0; }
.todos li { font-size: 12.5px; color: var(--ink-2); padding: 2px 0; }
.todos li.done { color: var(--jade); }
.acts { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); }
.resolved { font-size: 12px; color: var(--jade); margin-top: var(--sp-2); }
</style>
