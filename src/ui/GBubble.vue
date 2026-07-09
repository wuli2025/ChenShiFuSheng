<script setup lang="ts">
withDefaults(defineProps<{ from?: 'user' | 'ai' }>(), { from: 'ai' });
</script>

<template>
  <div class="g-bubble-row" :class="from">
    <div class="g-bubble" :class="from">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.g-bubble-row { display: flex; margin: var(--sp-2) 0; }
.g-bubble-row.user { justify-content: flex-end; }
.g-bubble-row.ai { justify-content: flex-start; }
.g-bubble {
  max-width: 74%;
  padding: var(--sp-2) var(--sp-3);
  font-size: 13.5px;
  line-height: 1.7;
  border: 1px solid var(--glass-line);
  box-shadow: var(--shadow-1);
}
.g-bubble.ai {
  background: var(--glass-strong);
  color: var(--ink-1);
  border-radius: var(--r-md) var(--r-md) var(--r-md) 4px;
}
.g-bubble.user {
  background: linear-gradient(135deg, rgba(212, 169, 79, 0.2), rgba(185, 138, 46, 0.14));
  color: var(--ink-1);
  border-color: var(--amber-soft);
  border-radius: var(--r-md) var(--r-md) 4px var(--r-md);
}
</style>
