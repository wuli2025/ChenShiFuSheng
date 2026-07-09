<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { usePlatformStore } from './store';
import { CloseIcon } from '../icons';

const store = usePlatformStore();
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') store.setState('edit');
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="immerse">
    <button class="x" aria-label="返回编辑" @click="store.setState('edit')"><CloseIcon /></button>
    <div class="center">
      <div class="ring" />
      <p class="slot">画布引擎接入位</p>
      <p class="sub">全屏沉浸 · 左右栏隐去 · Esc 或 ✕ 返回编辑态</p>
    </div>
  </div>
</template>

<style scoped>
.immerse {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 100% at 50% 0%, #1c1a17, #0e0d0b);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}
.x {
  position: absolute; top: 20px; right: 20px;
  width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.7);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.x:hover { color: #fff; }
.center { text-align: center; }
.ring {
  width: 96px; height: 96px; margin: 0 auto var(--sp-4);
  border-radius: 50%; border: 2px solid var(--amber-soft);
  box-shadow: 0 0 60px -10px rgba(212, 169, 79, 0.6);
}
.slot { color: var(--amber-soft); font-size: 18px; letter-spacing: 2px; }
.sub { color: rgba(255, 255, 255, 0.4); font-size: 12.5px; margin-top: var(--sp-2); }
</style>
