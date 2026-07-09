<script setup lang="ts">
import { computed } from "vue";
import { GAMES } from "./games";
import { EXTERNAL_GAMES } from "./externalGames";
import { enterGame, enterExternal, goStudio } from "./platform";
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
      <!-- 创作工坊:嵌入画布引擎工作台(双剧本线路 + codex 生图) -->
      <button class="card create" @click="goStudio">
        <div class="cover create-cover"><span class="plus">＋</span></div>
        <div class="meta">
          <div class="tag">创作</div>
          <div class="name">创作工坊</div>
          <div class="desc">一句话意图 → AI 写剧本 → 定稿生图 → 出成品(人生画布 / 灵动叙事)</div>
        </div>
        <div class="enter">去创作 →</div>
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
  /* 透明:让平台底的暖色氛围动效透上来,大厅与窗口融为一体的暖底 */
  background: transparent;
  color: var(--text);
  padding: 60px 56px 40px;
  font-family: var(--f-sans);
}
.lobby-head { text-align: center; margin-bottom: 50px; position: relative; }
.title {
  font-family: var(--f-serif);
  font-size: 42px;
  font-weight: 500;
  letter-spacing: 0.5em;
  color: var(--text-hi);
  text-indent: 0.5em;
  text-shadow: 0 2px 34px rgba(227, 179, 65, 0.32);
}
.sub { margin-top: 16px; font-size: 13px; letter-spacing: 0.24em; color: var(--text-mut); }
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
  /* 琉璃卡:后景暖光被吸进玻璃里,顶缘一线高光交代厚度 */
  border: 1px solid var(--hairline);
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  border-radius: var(--r-lg);
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  color: inherit;
  transition: transform 0.38s var(--ease), box-shadow 0.38s var(--ease),
    background 0.38s var(--ease), border-color 0.38s var(--ease);
  display: flex;
  flex-direction: column;
  box-shadow: var(--edge-hi), var(--shadow-sm);
}
.card:not(.disabled):hover {
  transform: translateY(-6px) scale(1.012);
  background: rgba(34, 48, 70, 0.42);
  border-color: var(--hairline-strong);
  box-shadow:
    var(--edge-hi-strong),
    0 30px 70px rgba(0, 0, 0, 0.5),
    0 0 56px -10px var(--accent, #c98b6b);
}
.card:not(.disabled):active {
  transform: translateY(-2px) scale(0.995);
}
.card.disabled { cursor: not-allowed; opacity: 0.5; }
.card.create {
  background: linear-gradient(165deg, rgba(227, 179, 65, 0.13), rgba(24, 34, 52, 0.24));
  border-color: rgba(227, 179, 65, 0.28);
}
.cover { position: relative; aspect-ratio: 16 / 10; display: flex; align-items: center; justify-content: center; }
.create-cover { background: radial-gradient(120% 120% at 50% 30%, #1c2b46, #0b111d); }
.plus { font-size: 54px; color: #e3b341; text-shadow: 0 0 24px rgba(227, 179, 65, 0.5); }
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
  color: #cabfa9;
  border: 1px solid var(--hairline-strong);
  background: rgba(20, 13, 9, 0.4);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  padding: 3px 10px;
  border-radius: var(--r-pill);
}
.lock { right: 12px; }
.gen-badge { left: 12px; color: #e9c05e; border-color: rgba(227, 179, 65, 0.42); }
.del {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 24px;
  height: 24px;
  line-height: 22px;
  text-align: center;
  border-radius: 50%;
  background: rgba(20, 13, 9, 0.5);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border: 1px solid var(--hairline);
  color: #cfc8ba;
  font-size: 15px;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.del:hover { background: rgba(180, 60, 50, 0.6); color: #fff; }
.meta { padding: 18px 20px 16px; flex: 1; }
.tag { font-size: 11px; letter-spacing: 0.18em; color: var(--accent, #e0a96d); margin-bottom: 10px; }
.name { font-family: var(--f-serif); font-size: 22px; letter-spacing: 0.12em; color: var(--text-hi); }
.desc { margin-top: 8px; font-size: 12.5px; line-height: 1.7; color: var(--text-mut); }
.run-badge {
  position: absolute;
  bottom: 12px;
  left: 12px;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: #10141c;
  background: rgba(227, 179, 65, 0.85);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  padding: 3px 10px;
  border-radius: var(--r-pill);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}
.end-badge {
  position: absolute;
  bottom: 12px;
  right: 12px;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #e9c05e;
  border: 1px solid rgba(227, 179, 65, 0.42);
  background: rgba(9, 14, 24, 0.42);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  padding: 3px 10px;
  border-radius: var(--r-pill);
}
.enter { padding: 0 20px 18px; font-size: 13px; letter-spacing: 0.1em; color: var(--accent, #e0a96d); transition: letter-spacing var(--dur) var(--ease); }
.card:not(.disabled):hover .enter { letter-spacing: 0.18em; }
.lobby-foot { margin-top: 60px; text-align: center; font-size: 11px; letter-spacing: 0.32em; color: rgba(147, 165, 187, 0.45); }
</style>
