<script setup lang="ts">
// 外部 HTML 游戏播放器：iframe 全屏加载 public/external-games 下的自包含 HTML。
import { computed } from "vue";
import { platform } from "./platform";

const url = computed(() => platform.externalUrl || "");
</script>

<template>
  <div class="ext-root">
    <iframe
      v-if="url"
      :src="url"
      class="frame"
      frameborder="0"
      allow="autoplay; fullscreen"
    ></iframe>
    <div v-else class="empty">未指定游戏。</div>
  </div>
</template>

<style scoped>
.ext-root {
  height: 100vh;
  background: #08090b;
}
.frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
.empty {
  color: #cfc8ba;
  text-align: center;
  padding-top: 80px;
}
</style>
