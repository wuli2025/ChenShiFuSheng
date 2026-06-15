<script setup lang="ts">
// 结局图鉴 —— 汇总每个游戏已解阅的结局(标题 + 收束语)，给重玩以收集动力。
import { computed } from "vue";
import { GAMES } from "./games";
import { listGames } from "./gamesStore";
import { enterGame } from "./platform";
import { listEndingDetail, unlockedCount } from "./saves";

interface GalleryItem {
  id: string;
  title: string;
  accent: string;
  total: number; // 已知结局总数(生成游戏有,内置未知=0)
}

const items = computed<GalleryItem[]>(() => {
  const gen = listGames().map((g) => ({
    id: g.id,
    title: g.title,
    accent: g.accent || "#c98b6b",
    total: g.endings?.length || 0,
  }));
  const builtin = GAMES.filter((g) => g.playable).map((g) => ({
    id: g.id,
    title: g.title,
    accent: g.accent || "#c98b6b",
    total: 0,
  }));
  return [...gen, ...builtin].filter((g) => unlockedCount(g.id) > 0 || g.total > 0);
});

function endings(id: string) {
  return listEndingDetail(id);
}
</script>

<template>
  <div class="gallery">
    <header class="g-head">
      <div class="title">结 局 图 鉴</div>
      <div class="sub">浮生百态 · 已走过的结局留痕于此</div>
    </header>

    <div v-if="!items.length" class="empty">
      尚未抵达任何结局。择一卷人生走到底，结局便会在此留痕。
    </div>

    <div class="list">
      <section v-for="g in items" :key="g.id" class="game" :style="{ '--accent': g.accent }">
        <div class="g-row">
          <div class="g-title">{{ g.title }}</div>
          <div class="g-count">
            已解阅 {{ unlockedCount(g.id) }}<template v-if="g.total"> / {{ g.total }}</template>
          </div>
          <button class="g-play" @click="enterGame(g.id)">再赴 →</button>
        </div>
        <div class="ends" v-if="endings(g.id).length">
          <div class="end" v-for="(e, i) in endings(g.id)" :key="i">
            <div class="e-title">{{ e.title }}</div>
            <div class="e-verse" v-if="e.verse">{{ e.verse }}</div>
          </div>
        </div>
        <div class="ends-empty" v-else>尚未解阅任何结局。</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  height: 100vh;
  overflow-y: auto;
  background: transparent;
  color: #d8d2c4;
  padding: 56px 56px 40px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.g-head {
  text-align: center;
  margin-bottom: 40px;
}
.title {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 34px;
  letter-spacing: 0.4em;
  color: #ece3d0;
  text-indent: 0.4em;
}
.sub {
  margin-top: 12px;
  font-size: 13px;
  letter-spacing: 0.2em;
  color: #6c727c;
}
.empty {
  max-width: 560px;
  margin: 80px auto;
  text-align: center;
  color: #8a8f98;
  font-family: "Songti SC", serif;
  font-size: 16px;
  line-height: 2;
}
.list {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.game {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.015);
  padding: 20px 24px 22px;
}
.g-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.g-title {
  font-family: "Songti SC", serif;
  font-size: 20px;
  letter-spacing: 0.1em;
  color: #f0e9da;
}
.g-count {
  font-size: 12px;
  color: var(--accent, #c98b6b);
  letter-spacing: 0.1em;
}
.g-play {
  margin-left: auto;
  border: 1px solid rgba(201, 139, 107, 0.5);
  background: rgba(201, 139, 107, 0.12);
  color: #f0e9da;
  border-radius: 8px;
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
}
.g-play:hover {
  background: rgba(201, 139, 107, 0.24);
}
.ends {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.end {
  border-left: 2px solid var(--accent, #c98b6b);
  padding: 8px 14px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.03), transparent);
}
.e-title {
  font-family: "Songti SC", serif;
  font-size: 16px;
  color: #ece3d0;
  letter-spacing: 0.08em;
}
.e-verse {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.8;
  color: #9aa1ab;
  font-family: "Songti SC", serif;
}
.ends-empty {
  margin-top: 14px;
  font-size: 13px;
  color: #6c727c;
}
</style>
