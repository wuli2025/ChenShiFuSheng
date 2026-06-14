<script setup lang="ts">
// 尘世浮生 · 游戏平台外壳
// Polaris 的对话/知识库/图谱等核心 stores 与组件全部保留在 src/ 下(备份见 App.polaris.vue.bak),
// 仅不再渲染其外壳。日后做「与 API 对话催生支线」时可直接复用 stores/chat。
import GamePlatform from "./game/GamePlatform.vue";
import ToastHost from "./components/ToastHost.vue";
</script>

<template>
  <GamePlatform />
  <ToastHost />
</template>

<style scoped></style>
