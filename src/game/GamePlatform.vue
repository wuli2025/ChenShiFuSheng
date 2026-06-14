<script setup lang="ts">
import { platform } from "./platform";
import { getGame as getBuiltinDef } from "./registry";
import GameSidebar from "./GameSidebar.vue";
import GameLobby from "./GameLobby.vue";
import GameStage from "./GameStage.vue";
import GamePlayer from "./GamePlayer.vue";
import GameCreate from "./GameCreate.vue";
import GameLibrary from "./GameLibrary.vue";
import GameSettings from "./GameSettings.vue";
import GameExternal from "./GameExternal.vue";
</script>

<template>
  <div class="platform">
    <GameSidebar />
    <main class="content">
      <Transition name="fade" mode="out-in">
        <GameLobby v-if="platform.screen === 'lobby'" key="lobby" />
        <GameCreate v-else-if="platform.screen === 'create'" key="create" />
        <GameLibrary v-else-if="platform.screen === 'library'" key="library" />
        <GameSettings v-else-if="platform.screen === 'settings'" key="settings" />
        <GameExternal v-else-if="platform.screen === 'external'" key="external" />
        <!-- 体验：注册表里的内置游戏(尘世浮生/钢铁之路…)用引擎播放器，生成的游戏用通用播放器 -->
        <GameStage v-else-if="getBuiltinDef(platform.gameId)" key="stage" />
        <GamePlayer v-else key="player" />
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.platform {
  display: flex;
  height: 100vh;
  background: #0b0c0e;
  overflow: hidden;
}
.content {
  flex: 1;
  height: 100vh;
  overflow: hidden;
  position: relative;
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
