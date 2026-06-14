<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { backToLobby, platform } from "./platform";
import { getGame } from "./registry";
import { applyEffects, statWord as statWordOf, type Choice, type Stats } from "./engine";

// 当前游戏由大厅选定;每次从大厅进入都会重新挂载本组件,故 setup 期读取即可。
const def = getGame(platform.gameId);
if (!def) backToLobby();

const STAT_KEYS = computed(() => (def ? def.stats.map((s) => s.key) : []));
const STAT_COLOR = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  def?.stats.forEach((s) => (m[s.key] = s.color));
  return m;
});

const stats = reactive<Stats>({ ...(def?.initialStats || {}) });
const sceneId = ref(def?.start || "");
const revealed = ref(1); // 已显示到第几句旁白
const ended = ref(false);

const scene = computed(() => def!.scenes[sceneId.value]);
const allShown = computed(() => revealed.value >= scene.value.lines.length);
const ending = computed(() => def!.judge(stats));
const artHtml = computed(() => (def?.art ? def.art(scene.value?.art) : ""));

function advanceNarration() {
  if (ended.value) return;
  if (!allShown.value) revealed.value = scene.value.lines.length;
}

function pick(c: Choice) {
  applyEffects(stats, c.effects);
  if (c.next === "__end__" || !def!.scenes[c.next]) {
    ended.value = true;
    return;
  }
  sceneId.value = c.next;
  revealed.value = 1;
}

function restart() {
  Object.assign(stats, def!.initialStats);
  sceneId.value = def!.start;
  revealed.value = 1;
  ended.value = false;
}

function statWord(v: number) {
  return statWordOf(v, def?.theme.statWords);
}
</script>

<template>
  <div class="stage-root" v-if="def">
    <!-- 顶栏:返回大厅 -->
    <button class="back" @click="backToLobby">{{ def.theme.backText }}</button>

    <div class="frame ink">
      <!-- 场景配图层(有 art 才铺) -->
      <div v-if="artHtml" class="stage-art" v-html="artHtml"></div>
      <div v-if="artHtml" class="art-veil"></div>

      <div class="ink-grid">
        <!-- 主区:旁白 + 抉择 / 结局 -->
        <div class="ink-main" @click="advanceNarration">
          <template v-if="!ended">
            <div class="ink-node">
              <span class="age">{{ scene.age }}</span>
              <span class="age-note">{{ scene.ageNote }}</span>
              <span class="ink-era">{{ scene.era }}</span>
            </div>
            <div class="ink-scene">{{ scene.scene }}</div>

            <div class="ink-text">
              <p
                v-for="(ln, i) in scene.lines"
                :key="i"
                v-show="i < revealed"
                class="line"
              >
                {{ ln }}
              </p>
            </div>

            <!-- 旁白未读完:提示点击;读完:出选项 -->
            <div class="ink-tap" v-if="!allShown">轻触继续 ·</div>
            <div class="ink-choices" v-else @click.stop>
              <button
                v-for="(c, i) in scene.choices"
                :key="i"
                class="ink-choice"
                @click="pick(c)"
              >
                {{ c.text }}
                <small v-if="c.hint">{{ c.hint }}</small>
              </button>
            </div>
          </template>

          <!-- 结局 -->
          <template v-else>
            <div class="ending" @click.stop>
              <div class="ink-scene">{{ def.theme.endScene }}</div>
              <div class="end-title">{{ ending.title }}</div>
              <p class="end-verse">{{ ending.verse }}</p>
              <div class="end-stats">
                <span v-for="k in STAT_KEYS" :key="k">
                  {{ k }} {{ stats[k] }}
                </span>
              </div>
              <div class="end-actions">
                <button class="end-btn" @click="restart">{{ def.theme.restartText }}</button>
                <button class="end-btn ghost" @click="backToLobby">回浮生阁</button>
              </div>
            </div>
          </template>
        </div>

        <!-- 侧栏:命数 -->
        <aside class="ink-side">
          <div class="ink-vtitle">{{ def.theme.sideTitle }}</div>
          <div class="ink-stat" v-for="k in STAT_KEYS" :key="k">
            <label>{{ k }} <span>{{ statWord(stats[k]) }}</span></label>
            <div class="stat-bar">
              <i :style="{ width: stats[k] + '%', background: STAT_COLOR[k] }"></i>
            </div>
          </div>
          <div class="ink-seal">
            <span v-for="(ln, i) in def.theme.sealText.split('\n')" :key="i">
              {{ ln }}<br v-if="i < def.theme.sealText.split('\n').length - 1" />
            </span>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-root {
  height: 100vh;
  background: #08090b;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.back {
  position: fixed;
  top: 20px;
  left: 24px;
  z-index: 10;
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #9aa1ab;
  padding: 7px 16px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  letter-spacing: 0.1em;
  transition: 0.2s;
}
.back:hover {
  color: #ece3d0;
  border-color: rgba(255, 255, 255, 0.3);
}

.frame.ink {
  position: relative;
  width: 100%;
  max-width: 960px;
  min-height: 600px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  background: radial-gradient(120% 80% at 80% 0%, rgba(44, 70, 97, 0.28), transparent 60%),
    radial-gradient(100% 70% at 0% 100%, rgba(60, 40, 40, 0.22), transparent 55%),
    #14161a;
  color: #d8d2c4;
}

/* 场景配图层:铺满整帧,沉在内容之下 */
.stage-art {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.62;
  animation: artFade 1.2s ease;
}
.stage-art :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
@keyframes artFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.62;
  }
}
/* 压暗 + 左侧加重,保证文字可读 */
.art-veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(100deg, rgba(8, 12, 20, 0.92) 18%, rgba(8, 12, 20, 0.5) 56%, rgba(8, 12, 20, 0.34) 100%),
    linear-gradient(0deg, rgba(8, 12, 20, 0.7), transparent 40%);
}
.ink-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr 240px;
  min-height: 600px;
}
.ink-main {
  padding: 54px 48px 44px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}
.ink-node {
  display: flex;
  align-items: baseline;
  gap: 16px;
  color: #8aa2b8;
  letter-spacing: 0.3em;
  font-size: 13px;
}
.ink-node .age {
  font-size: 52px;
  color: #e9e2d2;
  letter-spacing: 0.06em;
  font-weight: 300;
  font-family: "Songti SC", "SimSun", serif;
}
.age-note {
  align-self: flex-end;
  padding-bottom: 10px;
}
.ink-era {
  margin-left: auto;
  font-size: 12px;
  color: #6c7c8c;
  letter-spacing: 0.2em;
}
.ink-scene {
  font-size: 13px;
  color: #7e8a96;
  letter-spacing: 0.25em;
  margin: 28px 0 16px;
}
.ink-text {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 20px;
  line-height: 2.1;
  color: #ddd6c7;
  letter-spacing: 0.04em;
  max-width: 560px;
}
.ink-text .line {
  margin-bottom: 6px;
  animation: rise 0.7s ease;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.ink-tap {
  margin-top: 20px;
  font-size: 12px;
  letter-spacing: 0.3em;
  color: #5d6873;
  animation: pulse 1.6s infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
.ink-choices {
  margin-top: auto;
  padding-top: 34px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 560px;
}
.ink-choice {
  appearance: none;
  text-align: left;
  position: relative;
  padding: 15px 22px;
  cursor: pointer;
  border: none;
  border-left: 2px solid rgba(138, 162, 184, 0.45);
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.045), transparent);
  color: #cfc8ba;
  font-size: 16px;
  letter-spacing: 0.04em;
  transition: 0.25s;
  font-family: "Songti SC", "SimSun", serif;
  backdrop-filter: blur(1px);
}
.ink-choice:hover {
  border-left-color: #c98b6b;
  background: linear-gradient(90deg, rgba(201, 139, 107, 0.16), transparent);
  color: #f0e9da;
  padding-left: 28px;
}
.ink-choice small {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: #7c8694;
  letter-spacing: 0.06em;
  font-family: sans-serif;
}

/* 侧栏 */
.ink-side {
  position: relative;
  border-left: 1px solid rgba(255, 255, 255, 0.07);
  padding: 54px 28px;
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.ink-vtitle {
  writing-mode: vertical-rl;
  position: absolute;
  top: 44px;
  right: 16px;
  font-family: "Songti SC", "SimSun", serif;
  font-size: 28px;
  letter-spacing: 0.5em;
  color: rgba(233, 226, 210, 0.26);
}
.ink-stat label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #9aa3ad;
  letter-spacing: 0.12em;
  margin-bottom: 7px;
}
.ink-stat label span {
  color: #cdb89a;
}
.stat-bar {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.stat-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}
.ink-seal {
  margin-top: auto;
  align-self: flex-start;
  width: 52px;
  height: 52px;
  border: 1px solid #b5654a;
  border-radius: 6px;
  color: #cf8466;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "Songti SC", serif;
  font-size: 13px;
  letter-spacing: 0.1em;
  line-height: 1.2;
  text-align: center;
  opacity: 0.85;
}

/* 结局 */
.ending {
  margin: auto 0;
  cursor: default;
  max-width: 560px;
}
.end-title {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 64px;
  letter-spacing: 0.2em;
  color: #e9e2d2;
  margin: 18px 0 22px;
}
.end-verse {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 19px;
  line-height: 2;
  color: #cfc8ba;
  letter-spacing: 0.04em;
}
.end-stats {
  margin-top: 30px;
  display: flex;
  gap: 22px;
  font-size: 13px;
  color: #8a8f98;
  letter-spacing: 0.1em;
}
.end-actions {
  margin-top: 40px;
  display: flex;
  gap: 14px;
}
.end-btn {
  appearance: none;
  cursor: pointer;
  padding: 12px 26px;
  border-radius: 8px;
  border: 1px solid #b5654a;
  background: rgba(201, 139, 107, 0.12);
  color: #f0e9da;
  font-size: 15px;
  letter-spacing: 0.1em;
  font-family: "Songti SC", "SimSun", serif;
  transition: 0.2s;
}
.end-btn:hover {
  background: rgba(201, 139, 107, 0.22);
}
.end-btn.ghost {
  border-color: rgba(255, 255, 255, 0.15);
  background: transparent;
  color: #9aa1ab;
}
.end-btn.ghost:hover {
  color: #ece3d0;
}
</style>
