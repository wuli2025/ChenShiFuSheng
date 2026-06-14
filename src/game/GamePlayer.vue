<script setup lang="ts">
// 通用播放器：渲染任意 GeneratedGame。背景 + 旁白逐句 + 选项(画面A/B…) + 对话框自由输入 + 加权结局。
import { computed, reactive, ref } from "vue";
import { backToLobby, platform } from "./platform";
import { getGame } from "./gamesStore";
import { continueScene } from "./generator";
import {
  judgeGenEnding,
  sceneBackground,
  statsToMap,
  type GeneratedGame,
  type GenOption,
  type GenScene,
} from "./story-schema";
import { toast } from "../composables/useToast";

const game = ref<GeneratedGame | null>(getGame(platform.gameId));

// 运行时属性表 {key: value}
const stats = reactive<Record<string, number>>(
  game.value ? statsToMap(game.value.stats) : {}
);
// 运行时场景表（可被自由输入注入新场景）
const scenes = reactive<Record<string, GenScene>>(
  game.value ? { ...game.value.scenes } : {}
);

const sceneId = ref(game.value?.startScene || "");
const revealed = ref(1);
const ended = ref(false);
const freeText = ref("");
const busy = ref(false);

const scene = computed<GenScene | null>(() => scenes[sceneId.value] || null);
const allShown = computed(
  () => !scene.value || revealed.value >= scene.value.lines.length
);
const ending = computed(() =>
  game.value ? judgeGenEnding(game.value, stats) : null
);
const bg = computed(() =>
  scene.value ? sceneBackground(scene.value) : "#14161a"
);
const statList = computed(() => game.value?.stats || []);

function statWord(v: number) {
  const idx = Math.min(6, Math.floor(v / 15));
  return ["几无", "微薄", "平平", "尚可", "颇足", "丰厚", "极盛"][idx] || "平平";
}

function advance() {
  if (ended.value || busy.value) return;
  if (!allShown.value && scene.value) revealed.value = scene.value.lines.length;
}

function applyEffects(effects?: Record<string, number>) {
  if (!effects) return;
  for (const k of Object.keys(effects)) {
    if (k in stats) {
      stats[k] = Math.max(0, Math.min(100, stats[k] + (Number(effects[k]) || 0)));
    }
  }
}

function gotoScene(next: string) {
  if (next === "__end__" || !scenes[next]) {
    ended.value = true;
    return;
  }
  sceneId.value = next;
  revealed.value = 1;
}

function pick(o: GenOption) {
  if (busy.value) return;
  applyEffects(o.effects);
  gotoScene(o.next);
}

// 自由输入：调 LLM 续写一个新场景并跳入（催生支线）
async function submitFree() {
  const action = freeText.value.trim();
  if (!action || busy.value || !game.value || !scene.value) return;
  busy.value = true;
  try {
    const ns = await continueScene(game.value, scene.value, stats, action);
    applyEffects((ns as any).__effects);
    scenes[ns.id] = ns;
    freeText.value = "";
    gotoScene(ns.id);
  } catch (e: any) {
    toast.error(`续写失败：${e?.message || e}`);
  } finally {
    busy.value = false;
  }
}

function restart() {
  if (!game.value) return;
  Object.assign(stats, statsToMap(game.value.stats));
  Object.keys(scenes).forEach((k) => delete scenes[k]);
  Object.assign(scenes, game.value.scenes);
  sceneId.value = game.value.startScene;
  revealed.value = 1;
  ended.value = false;
  freeText.value = "";
}
</script>

<template>
  <div class="player-root" :style="{ '--bg': bg }">
    <div v-if="!game" class="missing">游戏不存在或已删除。<button @click="backToLobby">返回大厅</button></div>

    <div v-else class="frame">
      <div class="bg-layer" :style="{ background: bg }"></div>
      <div class="grid">
        <div class="main" @click="advance">
          <template v-if="!ended && scene">
            <div class="scene-title">{{ scene.title }}</div>
            <div class="text">
              <p v-for="(ln, i) in scene.lines" :key="i" v-show="i < revealed" class="line">
                {{ ln }}
              </p>
            </div>

            <div class="tap" v-if="!allShown">轻触继续 ·</div>

            <template v-else>
              <div class="choices" @click.stop>
                <button
                  v-for="(o, i) in scene.options"
                  :key="i"
                  class="choice"
                  :disabled="busy"
                  @click="pick(o)"
                >
                  {{ o.text }}
                  <small v-if="o.hint">{{ o.hint }}</small>
                </button>
              </div>

              <div class="free" v-if="scene.freeInput" @click.stop>
                <input
                  v-model="freeText"
                  :disabled="busy"
                  class="free-input"
                  type="text"
                  placeholder="或：输入你自己的动作，由 AI 续写支线…"
                  @keyup.enter="submitFree"
                />
                <button class="free-btn" :disabled="busy || !freeText.trim()" @click="submitFree">
                  {{ busy ? "续写中…" : "去做" }}
                </button>
              </div>
            </template>
          </template>

          <!-- 结局 -->
          <template v-else-if="ended && ending">
            <div class="ending" @click.stop>
              <div class="scene-title">— 终 · 浮生若梦 —</div>
              <div class="end-title">{{ ending.title }}</div>
              <p class="end-verse">{{ ending.verse }}</p>
              <div class="end-stats">
                <span v-for="s in statList" :key="s.key">{{ s.label }} {{ stats[s.key] }}</span>
              </div>
              <div class="end-actions">
                <button class="end-btn" @click="restart">再活一世</button>
                <button class="end-btn ghost" @click="backToLobby">回浮生阁</button>
              </div>
            </div>
          </template>
        </div>

        <aside class="side">
          <div class="vtitle">{{ game.title }}</div>
          <div class="stat" v-for="s in statList" :key="s.key">
            <label>{{ s.label }} <span>{{ statWord(stats[s.key]) }}</span></label>
            <div class="bar"><i :style="{ width: stats[s.key] + '%' }"></i></div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-root {
  height: 100vh;
  background: #08090b;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.back {
  position: fixed;
  top: 20px;
  left: 24px;
  z-index: 10;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #9aa1ab;
  padding: 7px 16px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  letter-spacing: 0.1em;
}
.back:hover {
  color: #ece3d0;
}
.missing {
  color: #cfc8ba;
  text-align: center;
}
.missing button {
  margin-left: 12px;
  cursor: pointer;
}
.frame {
  position: relative;
  width: 100%;
  max-width: 960px;
  min-height: 600px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  background: #14161a;
  color: #d8d2c4;
}
.bg-layer {
  position: absolute;
  inset: 0;
  opacity: 0.5;
}
.grid {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 220px;
  min-height: 600px;
}
.main {
  padding: 54px 48px 40px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}
.scene-title {
  font-size: 13px;
  color: #9aa9b6;
  letter-spacing: 0.25em;
  margin-bottom: 22px;
}
.text {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 20px;
  line-height: 2.1;
  color: #e4ddce;
  max-width: 580px;
}
.line {
  margin-bottom: 6px;
  animation: rise 0.7s ease;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.tap {
  margin-top: 20px;
  font-size: 12px;
  letter-spacing: 0.3em;
  color: #5d6873;
  animation: pulse 1.6s infinite;
}
@keyframes pulse { 50% { opacity: 0.35; } }
.choices {
  margin-top: auto;
  padding-top: 30px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 580px;
}
.choice {
  text-align: left;
  padding: 14px 22px;
  cursor: pointer;
  border: none;
  border-left: 2px solid rgba(138, 162, 184, 0.45);
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), transparent);
  color: #cfc8ba;
  font-size: 16px;
  font-family: "Songti SC", "SimSun", serif;
  transition: 0.22s;
}
.choice:hover:not(:disabled) {
  border-left-color: #c98b6b;
  background: linear-gradient(90deg, rgba(201, 139, 107, 0.14), transparent);
  color: #f0e9da;
  padding-left: 28px;
}
.choice:disabled { opacity: 0.5; cursor: default; }
.choice small {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: #7c8694;
  font-family: sans-serif;
}
.free {
  margin-top: 16px;
  display: flex;
  gap: 10px;
  max-width: 580px;
}
.free-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 11px 14px;
  color: #e4ddce;
  font-size: 14px;
}
.free-input:focus { outline: none; border-color: #c98b6b; }
.free-btn {
  border: 1px solid #b5654a;
  background: rgba(201, 139, 107, 0.14);
  color: #f0e9da;
  border-radius: 8px;
  padding: 0 20px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}
.free-btn:disabled { opacity: 0.5; cursor: default; }

.side {
  position: relative;
  border-left: 1px solid rgba(255, 255, 255, 0.07);
  padding: 54px 24px;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.vtitle {
  writing-mode: vertical-rl;
  position: absolute;
  top: 40px;
  right: 14px;
  font-family: "Songti SC", "SimSun", serif;
  font-size: 24px;
  letter-spacing: 0.4em;
  color: rgba(233, 226, 210, 0.24);
}
.stat label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #9aa3ad;
  margin-bottom: 7px;
}
.stat label span { color: #cdb89a; }
.bar {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: #8aa2b8;
  transition: width 0.6s ease;
}
.ending { margin: auto 0; cursor: default; max-width: 580px; }
.end-title {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 60px;
  letter-spacing: 0.2em;
  color: #e9e2d2;
  margin: 16px 0 20px;
}
.end-verse {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 19px;
  line-height: 2;
  color: #cfc8ba;
}
.end-stats {
  margin-top: 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  font-size: 13px;
  color: #8a8f98;
}
.end-actions { margin-top: 36px; display: flex; gap: 14px; }
.end-btn {
  cursor: pointer;
  padding: 12px 26px;
  border-radius: 8px;
  border: 1px solid #b5654a;
  background: rgba(201, 139, 107, 0.12);
  color: #f0e9da;
  font-size: 15px;
  font-family: "Songti SC", "SimSun", serif;
}
.end-btn.ghost {
  border-color: rgba(255, 255, 255, 0.15);
  background: transparent;
  color: #9aa1ab;
}
</style>
