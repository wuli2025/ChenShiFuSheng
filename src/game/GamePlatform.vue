<script setup lang="ts">
import "./glass.css";
import { platform } from "./platform";
import GameSidebar from "./GameSidebar.vue";
import GameLobby from "./GameLobby.vue";
import GameView from "./GameView.vue";
import GameStudio from "./GameStudio.vue";
import GameVnStudio from "./GameVnStudio.vue";
import GameProjects from "./GameProjects.vue";
import GameTemplates from "./GameTemplates.vue";
import GameLibrary from "./GameLibrary.vue";
import GameGallery from "./GameGallery.vue";
import GameSettings from "./GameSettings.vue";
import GameExternal from "./GameExternal.vue";
import WarmAura from "./WarmAura.vue";
</script>

<template>
  <div class="platform">
    <!-- 呼吸式暖光晕:慢慢明灭的烛火氛围,坐在最底层 -->
    <div class="glow" aria-hidden="true"></div>
    <!-- 暖色氛围动效层:上浮萤火/光尘,居于侧栏/内容之下 -->
    <WarmAura class="sky" />
    <!-- 顶部拖拽条:与下方内容同色融为一体;macOS 红绿灯浮于此条 -->
    <div class="titlebar" data-tauri-drag-region></div>
    <GameSidebar />
    <main class="content">
      <Transition name="fade" mode="out-in">
        <GameLobby v-if="platform.screen === 'lobby'" key="lobby" />
        <!-- 创作工坊:嵌入画布引擎工作台,旧版对话式生成(create/templates)已由它取代 -->
        <GameStudio v-else-if="platform.screen === 'studio'" key="studio" />
        <!-- 灵动工坊:原生 VN 动效叙事生产线(claude写稿+codex立绘/场景+灵动引擎试玩/导出) -->
        <GameVnStudio v-else-if="platform.screen === 'vnstudio'" key="vnstudio" />
        <!-- 我的项目:用户自己生成的剧本工程,试玩/编辑/发布 -->
        <GameProjects v-else-if="platform.screen === 'projects'" key="projects" />
        <!-- 模板库:故事线模板,一键带骨架去生成 -->
        <GameTemplates v-else-if="platform.screen === 'templates'" key="templates" />
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
  /* 墨蓝夜色底:深海墨蓝 + 顶部一抹微光,与创作工坊(画布引擎)同一块夜空 */
  background:
    radial-gradient(120% 85% at 50% -10%, #182741 0%, #0e1626 38%, #090e18 72%, #06090f 100%);
  overflow: hidden;
  position: relative;
}
/* 呼吸式极光晕:金/青/墨蓝三色辉光缓缓明灭,铺满最底层 */
.glow {
  position: absolute;
  inset: -10%;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(40% 38% at 22% 18%, rgba(227, 179, 65, 0.1), transparent 70%),
    radial-gradient(46% 42% at 82% 30%, rgba(88, 196, 220, 0.08), transparent 72%),
    radial-gradient(50% 48% at 50% 108%, rgba(56, 88, 128, 0.22), transparent 70%);
  animation: breathe 14s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.06); }
}
/* 暖色氛围动效层:铺满平台,居于侧栏/内容之下 */
.sky {
  position: absolute;
  inset: 0;
  z-index: 1;
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
