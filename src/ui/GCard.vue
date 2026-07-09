<script setup lang="ts">
withDefaults(defineProps<{ pad?: boolean }>(), { pad: true });
</script>

<template>
  <div class="g-card" :class="{ pad }">
    <slot />
  </div>
</template>

<style scoped>
.g-card {
  background: var(--glass);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
}
.g-card.pad {
  padding: var(--sp-4);
}
</style>
