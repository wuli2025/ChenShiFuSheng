<script setup lang="ts">
withDefaults(defineProps<{ value?: number }>(), { value: 0 });
</script>

<template>
  <div class="g-progress" role="progressbar">
    <div class="bar" :style="{ width: Math.max(0, Math.min(100, value)) + '%' }" />
  </div>
</template>

<style scoped>
.g-progress {
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: rgba(190, 175, 150, 0.22);
  overflow: hidden;
}
.bar {
  height: 100%;
  border-radius: 999px;
  background: var(--grad-amber);
  transition: width 0.3s var(--ease);
}
</style>
