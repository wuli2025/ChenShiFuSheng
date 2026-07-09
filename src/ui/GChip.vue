<script setup lang="ts">
withDefaults(
  defineProps<{ tone?: 'default' | 'amber' | 'jade' | 'coral' | 'azure'; active?: boolean }>(),
  { tone: 'default', active: false }
);
</script>

<template>
  <span class="g-chip" :class="[`t-${tone}`, { active }]">
    <slot />
  </span>
</template>

<style scoped>
.g-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--ink-2);
  background: var(--glass);
  border: 1px solid var(--glass-line);
  cursor: default;
  transition: 0.14s var(--ease);
}
.t-amber { color: var(--amber); border-color: var(--amber-soft); }
.t-jade { color: var(--jade); border-color: rgba(79, 157, 122, 0.5); }
.t-coral { color: var(--coral); border-color: rgba(201, 111, 95, 0.5); }
.t-azure { color: var(--azure); border-color: rgba(91, 143, 179, 0.5); }
.g-chip.active {
  background: linear-gradient(90deg, rgba(212, 169, 79, 0.16), transparent);
  color: var(--amber);
  border-color: var(--amber-soft);
}
</style>
