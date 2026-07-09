<script setup lang="ts">
defineProps<{ modelValue: string; options: { value: string; label: string }[] }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();
</script>

<template>
  <div class="g-seg" role="tablist">
    <button
      v-for="o in options"
      :key="o.value"
      class="seg"
      :class="{ on: o.value === modelValue }"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.g-seg {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: 999px;
  background: var(--glass);
  border: 1px solid var(--glass-line);
}
.seg {
  border: none;
  background: transparent;
  padding: 5px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  cursor: pointer;
  transition: 0.16s var(--ease);
}
.seg:hover { color: var(--ink-1); }
.seg.on {
  background: var(--grad-amber);
  color: #fff;
  box-shadow: var(--shadow-1);
}
</style>
