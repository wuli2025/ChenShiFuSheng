<script setup lang="ts">
defineProps<{ text: string }>();
</script>

<template>
  <span class="g-tip-wrap">
    <slot />
    <span class="g-tip" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.g-tip-wrap { position: relative; display: inline-flex; }
.g-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  white-space: nowrap;
  padding: 4px 10px;
  border-radius: var(--r-sm);
  background: var(--ink-1);
  color: var(--cream-0);
  font-size: 11.5px;
  opacity: 0;
  pointer-events: none;
  transition: 0.16s var(--ease);
  box-shadow: var(--shadow-2);
  z-index: 40;
}
.g-tip-wrap:hover .g-tip { opacity: 1; transform: translateX(-50%) translateY(0); }
</style>
