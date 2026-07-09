<script setup lang="ts">
withDefaults(
  defineProps<{ modelValue: string; placeholder?: string; multiline?: boolean }>(),
  { placeholder: '', multiline: false }
);
const emit = defineEmits<{ 'update:modelValue': [string] }>();
function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement | HTMLTextAreaElement).value);
}
</script>

<template>
  <textarea
    v-if="multiline"
    class="g-input area"
    :value="modelValue"
    :placeholder="placeholder"
    rows="3"
    @input="onInput"
  />
  <input
    v-else
    class="g-input"
    :value="modelValue"
    :placeholder="placeholder"
    @input="onInput"
  />
</template>

<style scoped>
.g-input {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  border: 1px solid var(--glass-line);
  background: var(--glass-strong);
  color: var(--ink-1);
  font-size: 13.5px;
  font-family: inherit;
  line-height: 1.6;
  transition: 0.16s var(--ease);
  outline: none;
}
.g-input::placeholder { color: var(--ink-3); }
.g-input:focus { border-color: var(--amber-soft); box-shadow: var(--shadow-1); }
.area { resize: vertical; }
</style>
