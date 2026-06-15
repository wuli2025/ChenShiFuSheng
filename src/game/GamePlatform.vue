<script setup lang="ts">
import { platform } from "./platform";
import GameSidebar from "./GameSidebar.vue";
import GameLobby from "./GameLobby.vue";
import GameView from "./GameView.vue";
import GameCreate from "./GameCreate.vue";
import GameLibrary from "./GameLibrary.vue";
import GameGallery from "./GameGallery.vue";
import GameSettings from "./GameSettings.vue";
import GameExternal from "./GameExternal.vue";
import MeteorSky from "./MeteorSky.vue";
</script>

<template>
  <div class="platform">
    <!-- 星空流星层:坐在墨黑底之上、所有界面之下 -->
    <MeteorSky class="sky" />
    <!-- 顶部黑色拖拽条:与下方内容同色融为一体;macOS 红绿灯浮于此条 -->
    <div class="titlebar" data-tauri-drag-region></div>
    <GameSidebar />
    <main class="content">
      <Transition name="fade" mode="out-in">
        <GameLobby v-if="platform.screen === 'lobby'" key="lobby" />
        <GameCreate v-else-if="platform.screen === 'create'" key="create" />
        <GameLibrary v-else-if="platform.screen === 'library'" key="library" />
        <GameGallery v-else-if="platform.screen === 'gallery'" key="gallery" />
        <GameSettings v-else-if="platform.screen === 'settings'" key="settings" />
        <GameExternal v-else-if="platform.screen === 'external'" key="external" />
        <!-- 体验：内置精修剧本与 AI 生成剧本统一走沉浸式播放器 GameView -->
        <GameView v-else key="view" />
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.platform {
  display: flex;
  height: 100vh;
  /* 墨黑底 + 顶部一抹幽蓝晕,作为流星星空的底色 */
  background: radial-gradient(130% 90% at 50% -15%, #131720, #07080a 62%);
  overflow: hidden;
  position: relative;
}
/* 流星星空层:铺满平台,居于侧栏/内容之下 */
.sky {
  position: absolute;
  inset: 0;
  z-index: 0;
}
/* 顶部拖拽条:透明叠在墨黑底上,高 32 —— 与内容同底色,上下融为一体 */
.titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  z-index: 60;
  background: transparent;
}
.content {
  flex: 1;
  height: 100vh;
  overflow: hidden;
  position: relative;
  /* 透明 → 让身后的流星星空透上来 */
  background: transparent;
  z-index: 10;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
