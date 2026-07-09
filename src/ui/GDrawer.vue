<script setup lang="ts">
defineProps<{ modelValue: boolean; width?: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="modelValue" class="g-drawer-mask" @click.self="emit('update:modelValue', false)">
        <aside class="g-drawer" :style="{ width: width || '360px' }">
          <slot />
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.g-drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(90, 75, 50, 0.14);
  display: flex;
  justify-content: flex-end;
  z-index: 50;
}
.g-drawer {
  height: 100%;
  background: var(--glass-strong);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-left: 1px solid var(--glass-line);
  box-shadow: var(--shadow-2);
  padding: var(--sp-4);
  overflow-y: auto;
}
.drawer-enter-active,
.drawer-leave-active { transition: opacity 0.2s var(--ease); }
.drawer-enter-active .g-drawer,
.drawer-leave-active .g-drawer { transition: transform 0.2s var(--ease); }
.drawer-enter-from,
.drawer-leave-to { opacity: 0; }
.drawer-enter-from .g-drawer,
.drawer-leave-to .g-drawer { transform: translateX(100%); }
</style>
