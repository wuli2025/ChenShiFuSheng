<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger';
    disabled?: boolean;
    type?: 'button' | 'submit';
  }>(),
  { variant: 'primary', disabled: false, type: 'button' }
);
</script>

<template>
  <button class="g-btn" :class="[`v-${variant}`]" :type="type" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.g-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: 0.16s var(--ease);
  line-height: 1.4;
}
.g-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.v-primary {
  background: var(--grad-amber);
  color: #fff;
  box-shadow: var(--shadow-1);
}
.v-primary:hover:not(:disabled) {
  box-shadow: var(--shadow-2);
  transform: translateY(-1px);
}
.v-ghost {
  background: var(--glass);
  color: var(--ink-1);
  border-color: var(--glass-line);
  backdrop-filter: blur(var(--glass-blur));
}
.v-ghost:hover:not(:disabled) {
  background: var(--glass-strong);
}
.v-danger {
  background: rgba(201, 111, 95, 0.14);
  color: var(--coral);
  border-color: rgba(201, 111, 95, 0.4);
}
.v-danger:hover:not(:disabled) {
  background: rgba(201, 111, 95, 0.22);
}
</style>
