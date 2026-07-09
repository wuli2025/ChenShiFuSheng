<script setup lang="ts">
import { CloseIcon } from '../icons';
defineProps<{ modelValue: boolean; title?: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="g-modal-mask" @click.self="emit('update:modelValue', false)">
        <div class="g-modal">
          <div class="head">
            <h3>{{ title }}</h3>
            <button class="x" aria-label="关闭" @click="emit('update:modelValue', false)">
              <CloseIcon />
            </button>
          </div>
          <div class="body"><slot /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.g-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(90, 75, 50, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.g-modal {
  width: min(520px, 92vw);
  background: var(--glass-strong);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  padding: var(--sp-4);
}
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
.head h3 { font-size: 16px; color: var(--ink-1); }
.x { border: none; background: transparent; color: var(--ink-3); cursor: pointer; width: 24px; height: 24px; }
.x:hover { color: var(--ink-1); }
.body { color: var(--ink-2); font-size: 14px; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s var(--ease); }
.modal-enter-active .g-modal, .modal-leave-active .g-modal { transition: transform 0.2s var(--ease); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .g-modal, .modal-leave-to .g-modal { transform: translateY(12px) scale(0.98); }
</style>
