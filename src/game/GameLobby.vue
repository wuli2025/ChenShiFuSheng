<script setup lang="ts">
import { computed } from "vue";
import { GAMES } from "./games";
import { EXTERNAL_GAMES } from "./externalGames";
import { enterGame, enterExternal, goCreate } from "./platform";
import { listGames, removeGame } from "./gamesStore";
import { hasRun, unlockedCount } from "./saves";
import { toast } from "../composables/useToast";

// 大厅卡片 = 外部HTML游戏 + 内置游戏 + 本地生成的游戏
type CardKind = "builtin" | "generated" | "external";
interface Card {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  glyph: string;
  cover: string;
  accent: string;
  playable: boolean;
  kind: CardKind;
  url?: string;
}

const generatedRev = computed(() => listGames());

const cards = computed<Card[]>(() => {
  const ext: Card[] = EXTERNAL_GAMES.map((g) => ({
    id: g.id,
    title: g.title,
    subtitle: g.subtitle,
    tag: g.tag,
    glyph: g.glyph,
    cover: g.cover,
    accent: g.accent,
    playable: true,
    kind: "external",
    url: g.url,
  }));
  const builtin: Card[] = GAMES.map((g) => ({
    id: g.id,
    title: g.title,
    subtitle: g.subtitle,
    tag: g.tag,
    glyph: g.glyph,
    cover: g.cover,
    accent: g.accent,
    playable: g.playable,
    kind: "builtin",
  }));
  const gen: Card[] = generatedRev.value.map((g) => ({
    id: g.id,
    title: g.title,
    subtitle: g.subtitle,
    tag: g.tag,
    glyph: g.title.slice(0, 1),
    cover: g.cover,
    accent: g.accent,
    playable: true,
    kind: "generated",
  }));
  return [...gen, ...ext, ...builtin];
});

function onPick(c: Card) {
  if (!c.playable) return;
  if (c.kind === "external" && c.url) enterExternal(c.url, c.id);
  else enterGame(c.id);
}

function onRemove(id: string, e: Event) {
  e.stopPropagation();
  removeGame(id);
  toast.info("已删除该生成的游戏");
}
</script>

<template>
  <div class="lobby">
    <header class="lobby-head">
      <div class="title">浮 生 阁</div>
      <div class="sub">上传资料，择一剧本，生成你自己的一卷人生</div>
    </header>

    <div class="wall">
      <!-- 生成新游戏 -->
      <button class="card create" @click="goCreate">
        <div class="cover create-cover"><span class="plus">＋</span></div>
        <div class="meta">
          <div class="tag">生成</div>
          <div class="name">生成新游戏</div>
          <div class="desc">上传资料 · 选剧本副本 · 描述需求 → 由 AI 生成</div>
        </div>
        <div class="enter">去生成 →</div>
      </button>

      <button
        v-for="c in cards"
        :key="c.id"
        class="card"
        :class="{ disabled: !c.playable }"
        :style="{ '--accent': c.accent }"
        @click="onPick(c)"
      >
        <div class="cover" :style="{ background: c.cover }">
          <span class="glyph">{{ c.glyph }}</span>
          <span v-if="!c.playable" class="lock">未启</span>
          <span v-if="c.kind === 'generated'" class="gen-badge">生成</span>
          <span v-else-if="c.kind === 'external'" class="gen-badge ext">外部</span>
          <span v-if="c.kind !== 'external' && hasRun(c.id)" class="run-badge">续</span>
          <span v-if="c.kind !== 'external' && unlockedCount(c.id)" class="end-badge">
            阅 {{ unlockedCount(c.id) }} 结局
          </span>
          <span
            v-if="c.kind === 'generated'"
            class="del"
            title="删除"
            @click="onRemove(c.id, $event)"
            >×</span
          >
        </div>
        <div class="meta">
          <div class="tag">{{ c.tag }}</div>
          <div class="name">{{ c.title }}</div>
          <div class="desc">{{ c.subtitle }}</div>
        </div>
        <div class="enter" v-if="c.playable">入卷 →</div>
      </button>
    </div>

    <footer class="lobby-foot">尘世浮生 · 生成式游戏平台</footer>
  </div>
</template>

<style scoped>
.lobby {
  height: 100vh;
  overflow-y: auto;
  /* 透明:让平台底的流星星空透上来,大厅与窗口融为一体的墨黑 */
  background: transparent;
  color: #d8d2c4;
  padding: 56px 56px 40px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.lobby-head { text-align: center; margin-bottom: 46px; position: relative; }
.title {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 40px;
  letter-spacing: 0.5em;
  color: #ece3d0;
  text-indent: 0.5em;
}
.sub { margin-top: 14px; font-size: 13px; letter-spacing: 0.2em; color: #6c727c; }
.nav { margin-top: 22px; display: flex; gap: 12px; justify-content: center; }
.nav button {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #9aa1ab;
  padding: 7px 18px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  letter-spacing: 0.1em;
}
.nav button:hover { color: #ece3d0; border-color: rgba(255, 255, 255, 0.3); }

.wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 28px;
  max-width: 1080px;
  margin: 0 auto;
}
.card {
  appearance: none;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.015);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  color: inherit;
  transition: transform 0.25s, border-color 0.25s, box-shadow 0.25s;
  display: flex;
  flex-direction: column;
}
.card:not(.disabled):hover {
  transform: translateY(-6px);
  border-color: var(--accent, #c98b6b);
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.55);
}
.card.disabled { cursor: not-allowed; opacity: 0.55; }
.card.create { border-style: dashed; border-color: rgba(201, 139, 107, 0.4); }
.cover { position: relative; aspect-ratio: 16 / 10; display: flex; align-items: center; justify-content: center; }
.create-cover { background: linear-gradient(160deg, #1a2530, #11161c); }
.plus { font-size: 54px; color: #c98b6b; }
.glyph {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 72px;
  color: rgba(236, 227, 208, 0.9);
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}
.lock, .gen-badge {
  position: absolute;
  top: 12px;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: #b9b2a3;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 999px;
}
.lock { right: 12px; }
.gen-badge { left: 12px; color: #cf8466; border-color: rgba(201, 139, 107, 0.5); }
.del {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 22px;
  height: 22px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  color: #cfc8ba;
  font-size: 16px;
}
.del:hover { background: rgba(180, 60, 50, 0.6); color: #fff; }
.meta { padding: 18px 20px 16px; flex: 1; }
.tag { font-size: 11px; letter-spacing: 0.18em; color: var(--accent, #c98b6b); margin-bottom: 10px; }
.name { font-family: "Songti SC", "SimSun", serif; font-size: 22px; letter-spacing: 0.12em; color: #f0e9da; }
.desc { margin-top: 8px; font-size: 12.5px; line-height: 1.7; color: #8a8f98; }
.run-badge {
  position: absolute;
  bottom: 12px;
  left: 12px;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: #e7ddc9;
  background: rgba(201, 139, 107, 0.85);
  padding: 2px 9px;
  border-radius: 999px;
}
.end-badge {
  position: absolute;
  bottom: 12px;
  right: 12px;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #cf8466;
  border: 1px solid rgba(201, 139, 107, 0.5);
  background: rgba(0, 0, 0, 0.35);
  padding: 2px 9px;
  border-radius: 999px;
}
.enter { padding: 0 20px 18px; font-size: 13px; letter-spacing: 0.1em; color: var(--accent, #c98b6b); }
.lobby-foot { margin-top: 56px; text-align: center; font-size: 11px; letter-spacing: 0.3em; color: #494e57; }
</style>
