<script setup lang="ts">
// 唯一的沉浸式播放器 —— 内置剧本与 AI 生成剧本统一走这里。
// 逐句打字机 · 角色对白 · 情绪化音景 · 场景淡切 · 浮尘/暗角/缓动镜头 · 纯叙事续幕 ·
// 进场命运事件/史笔批注 · 属性飘字 · 键盘 · 回看 · 自动 · 多档位存读 · 续玩 · 结局图鉴 · AI 续写。
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { backToLobby, platform } from "./platform";
import { getGame as getBuiltinDef } from "./registry";
import { getGame as getGeneratedGame, saveGame } from "./gamesStore";
import { statWord as statWordOf } from "./engine";
import {
  fromDef,
  fromGenerated,
  genSceneToPlay,
  type PlayChoice,
  type PlayModel,
  type PlayScene,
} from "./playModel";
import { sceneBackground, type GenScene } from "./story-schema";
import {
  buildProfile,
  fateFork,
  scoreCard,
  type ScorecardResult,
} from "./assess";
import { continueScene } from "./generator";
import { genImage, hydrateSceneImages, resolveImageRef } from "./imagegen";
import { getImageCfg } from "./gameSettings";
import { audioCfg, engine } from "./audio";
import { prefs } from "./prefs";
import InkParticles from "./InkParticles.vue";
import {
  clearRun,
  deleteSlot,
  listSlots,
  listUnlocked,
  loadRun,
  loadSlot,
  saveRun,
  saveSlot,
  unlockEnding,
  type LogEntry,
  type RunState,
  type SlotMeta,
} from "./saves";
import { toast } from "../composables/useToast";

// —— 取模型(内置/生成) ——
function buildModel(): PlayModel | null {
  const id = platform.gameId;
  const def = getBuiltinDef(id);
  if (def) return fromDef(def);
  const g = getGeneratedGame(id);
  if (g) return fromGenerated(g);
  return null;
}
const model = buildModel();
if (!model) backToLobby();

// 生成游戏专用:原始 GenScene 表(自由输入续写需要)
const rawScenes = reactive<Record<string, GenScene>>(
  model?.raw ? { ...model.raw.scenes } : {}
);

// 把 "idb://" 图片引用水合成 objectURL 并刷新对应场景背景(进场/读档/懒生成后都要跑)。
async function hydrateImages() {
  const changed = await hydrateSceneImages(rawScenes);
  for (const id of changed) {
    if (scenes[id]) scenes[id].bg = sceneBackground(rawScenes[id]);
  }
}
void hydrateImages();

// —— 运行态 ——
const scenes = reactive<Record<string, PlayScene>>(model ? { ...model.scenes } : {});
const stats = reactive<Record<string, number>>(model ? { ...model.initialStats } : {});
// —— 评判机制:能力维度累计 + 行为标签频次 ——
function freshCaps(): Record<string, number> {
  const c: Record<string, number> = {};
  for (const cap of model?.caps || []) c[cap.key] = model?.initialCaps?.[cap.key] ?? 10;
  return c;
}
const caps = reactive<Record<string, number>>(freshCaps());
const tagCounts = reactive<Record<string, number>>({});
const curScorecard = ref<ScorecardResult | null>(null);
function applyCaps(delta?: Record<string, number>) {
  if (!delta) return;
  for (const k of Object.keys(delta)) {
    if (k in caps) caps[k] = Math.max(0, Math.min(100, caps[k] + (delta[k] || 0)));
  }
}
function tallyTags(tags?: string[]) {
  for (const t of tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
}
const sceneId = ref(model?.start || "");
const lineIdx = ref(0); // 已完成揭示的行数
const typed = ref(0); // 当前行已打出的字数
const ended = ref(false);
const busy = ref(false);
const freeText = ref("");
const streamNote = ref("");
const curtain = ref(false); // 场景淡切黑幕
const auto = ref(false);
const showLog = ref(false);
const showSaves = ref(false);
const passiveNote = ref(""); // 进场被动事件/史笔批注,停留到下一幕
const log = reactive<LogEntry[]>([]);
const floaters = reactive<{ id: number; key: string; delta: number }[]>([]);
let floatSeq = 0;
let sceneCount = 0;

const scene = computed<PlayScene | null>(() => scenes[sceneId.value] || null);

// 解析对白:以「人物」起头的行显示说话人;其余为旁白。打字按正文长度计。
function parseLine(raw: string): { speaker?: string; body: string; raw: string } {
  const m = raw.match(/^[「『]([^」』]{1,12})[」』]\s*[:：]?\s*(.*)$/);
  if (m && m[2]) return { speaker: m[1], body: m[2], raw };
  return { body: raw, raw };
}
const parsedLines = computed(() => (scene.value?.lines || []).map(parseLine));
const allShown = computed(() => lineIdx.value >= parsedLines.value.length);
// 纯叙事幕:无 choices 但有 next → 读完出"续幕"而非选项
const canContinue = computed(
  () => !!scene.value && scene.value.choices.length === 0 && !!scene.value.next
);
const lineDone = computed(() => {
  const cur = parsedLines.value[lineIdx.value];
  return cur == null || typed.value >= cur.body.length;
});
const visibleLines = computed(() => {
  const ls = parsedLines.value;
  const out = ls.slice(0, lineIdx.value).map((p) => ({ speaker: p.speaker, body: p.body, typing: false }));
  if (lineIdx.value < ls.length) {
    const p = ls[lineIdx.value];
    out.push({ speaker: p.speaker, body: p.body.slice(0, typed.value), typing: true });
  }
  return out;
});
const ending = computed(() => (model ? model.judge(stats) : null));

// —— 复盘评估(结局后呈现:能力画像 / 命运岔口 / 行为证据 / 诊断质疑)——
const profile = computed(() =>
  ended.value && model ? buildProfile(model.caps, caps) : null
);
const fork = computed(() =>
  ended.value && model ? fateFork(model.endings, stats, ending.value?.title) : null
);
const topTags = computed(() =>
  Object.keys(tagCounts)
    .map((t) => ({ tag: t, n: tagCounts[t] }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
);
const diagnosis = computed(() => {
  const w = profile.value?.weakest;
  if (!w || !model?.diagnoseByCap) return "";
  return model.diagnoseByCap[w.key] || "";
});
const recommendLine = computed(() =>
  ended.value && model?.recommend ? model.recommend(caps, stats) : ""
);
// 能力雷达:把 profile.axes 摊成多边形点(viewBox 200x200,中心 100,半径 78)。
const radar = computed(() => {
  const ax = profile.value?.axes || [];
  const n = ax.length;
  if (n < 3) return null;
  const cx = 100, cy = 100, R = 78;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    ax.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" ")
  );
  const spokes = ax.map((_, i) => {
    const [x, y] = pt(i, R);
    return { x: x.toFixed(1), y: y.toFixed(1) };
  });
  const poly = ax
    .map((a, i) => pt(i, R * Math.max(0.06, a.value / 100)).map((v) => v.toFixed(1)).join(","))
    .join(" ");
  const labels = ax.map((a, i) => {
    const [x, y] = pt(i, R + 16);
    return { x: x.toFixed(1), y: y.toFixed(1), label: a.label, value: a.value };
  });
  return { rings, spokes, poly, labels };
});
const sceneBg = computed(
  () =>
    scene.value?.bg ||
    "radial-gradient(120% 90% at 80% 0%, rgba(44,70,97,.4), transparent 60%), radial-gradient(100% 80% at 0% 100%, rgba(90,55,50,.32), transparent 55%), #14161a"
);
const hasPhoto = computed(() => !!(scene.value?.img || scene.value?.video));
const unlocked = ref<string[]>(model ? listUnlocked(model.id) : []);
const totalEndings = computed(() => model?.raw?.endings.length || 0);
const slots = ref<Record<string, SlotMeta>>(model ? listSlots(model.id) : {});
const SLOT_IDS = ["1", "2", "3"];

function statWord(v: number) {
  return statWordOf(v, model?.theme.statWords);
}
function fmtTime(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// —— 打字机 ——
let typeTimer: number | null = null;
function startTyping() {
  if (typeTimer) {
    clearInterval(typeTimer);
    typeTimer = null;
  }
  const cur = parsedLines.value[lineIdx.value];
  if (cur == null) return;
  if (!prefs.typewriter) {
    typed.value = cur.body.length;
    return;
  }
  if (typed.value >= cur.body.length) return;
  typeTimer = window.setInterval(() => {
    const c = parsedLines.value[lineIdx.value];
    if (c == null || typed.value >= c.body.length) {
      if (typeTimer) clearInterval(typeTimer);
      typeTimer = null;
      return;
    }
    typed.value++;
  }, Math.max(6, prefs.textSpeed));
}

function logPush(e: LogEntry) {
  log.push(e);
}

// 推进旁白:未打完→立即打完;已打完→提交本行、起下一行
function advance() {
  if (ended.value || busy.value || curtain.value) return;
  if (allShown.value) return;
  const cur = parsedLines.value[lineIdx.value];
  if (!cur) return;
  if (typed.value < cur.body.length) {
    typed.value = cur.body.length;
    return;
  }
  logPush({ kind: "line", text: cur.raw });
  lineIdx.value++;
  typed.value = 0;
  if (lineIdx.value < parsedLines.value.length) {
    engine.sfx("advance");
    startTyping();
  }
}

// 轻触主区:旁白未完→推进;已完且是纯叙事幕→续到下一幕
function onTap() {
  if (ended.value || busy.value || curtain.value) return;
  if (!allShown.value) {
    advance();
    return;
  }
  if (canContinue.value) {
    engine.sfx("advance");
    gotoScene(scene.value!.next!);
  }
}

// —— 属性增减 + 飘字 ——
function applyEffects(effects?: Record<string, number>) {
  if (!effects) return;
  for (const k of Object.keys(effects)) {
    if (k in stats) {
      const d = Math.round(Number(effects[k]) || 0);
      if (!d) continue;
      const before = stats[k];
      stats[k] = Math.max(0, Math.min(100, before + d));
      const real = stats[k] - before;
      if (real !== 0) {
        const id = ++floatSeq;
        floaters.push({ id, key: k, delta: real });
        window.setTimeout(() => {
          const i = floaters.findIndex((f) => f.id === id);
          if (i >= 0) floaters.splice(i, 1);
        }, 1500);
      }
    }
  }
}
function floatersFor(key: string) {
  return floaters.filter((f) => f.key === key);
}

// —— 场景跳转(淡切) ——
function resetReveal() {
  lineIdx.value = 0;
  typed.value = 0;
  startTyping();
}
function applyMood() {
  const m = scenes[sceneId.value]?.mood;
  if (m) engine.setMood(m);
}

// —— 旁白配音(阶跃星辰 TTS,逐场景朗读) ——
let narrAudio: HTMLAudioElement | null = null;
function stopNarration() {
  if (narrAudio) {
    try {
      narrAudio.pause();
    } catch {
      /* ignore */
    }
    narrAudio = null;
  }
}
function playNarration(src?: string) {
  stopNarration();
  if (!src || !audioCfg.narration) return;
  try {
    const a = new Audio(src);
    a.volume = Math.max(0, Math.min(1, audioCfg.master * audioCfg.narrationVol));
    a.play().catch(() => {});
    narrAudio = a;
  } catch {
    /* ignore */
  }
}

// 已尝试过懒生成的场景 id(无论成败),避免重复请求。
const imgTried = new Set<string>();
/**
 * 懒生成场景配图:仅生成游戏、该场景尚无图、原始数据有 bgPrompt 时,
 * 后台静默出图,成功即挂到 scenes[id].bg(响应式,画面自动更新)。
 * 让 AI 续写催生的支线场景也能自动获得水墨配图。
 */
function maybeGenSceneImage(id: string) {
  if (!model || model.kind !== "generated") return;
  if (imgTried.has(id)) return;
  const ps = scenes[id];
  const raw = rawScenes[id];
  // raw.bg 才是「真实图片」标记;scenes[id].bg 出厂就被填了 CSS 渐变占位,不能据它判断。
  if (!ps || ps.img || !raw?.bgPrompt || raw.bg) return;
  if (!getImageCfg().enabled) return;
  imgTried.add(id);
  genImage(raw.bgPrompt)
    .then(async (ref) => {
      if (!ref || !rawScenes[id]) return;
      rawScenes[id].bg = ref;
      // idb:// 引用先水合成 objectURL,再重算 url(...) 背景,响应式刷新画面
      const url = await resolveImageRef(ref);
      if (url) rawScenes[id].bgUrl = url;
      if (scenes[id]) scenes[id].bg = sceneBackground(rawScenes[id]);
      persist();
      // 原始场景的图写回游戏库:下次会话直接命中,不再重新出图扣费。
      // (rawScenes 与 model.raw.scenes 共享场景对象,上面赋值已生效,存一次即可)
      if (model?.raw?.scenes[id]) saveGame(model.raw);
    })
    .catch(() => {});
}

function enterScene(id: string) {
  sceneId.value = id;
  resetReveal();
  sceneCount++;
  engine.setScene(sceneCount);
  applyMood();
  maybeGenSceneImage(id);
  const s = scenes[id];
  playNarration(s?.voiceSrc);
  if (s) {
    logPush({ kind: "chapter", text: s.chapter });
    // 进场结算被动「命运」事件 + 收集史笔批注
    if (s.event?.effects) applyEffects(s.event.effects);
    applyCaps(s.event?.caps);
    // Checkpoint 评分卡:在事件结算后按当前属性公开打一次分(快照,不随后续变化)
    curScorecard.value = s.scorecard ? scoreCard(s.scorecard, stats) : null;
    passiveNote.value = [s.event?.note, s.footnote].filter(Boolean).join("  ·  ");
    if (passiveNote.value) logPush({ kind: "line", text: `（${passiveNote.value}）` });
  } else {
    passiveNote.value = "";
    curScorecard.value = null;
  }
  persist();
}
function gotoScene(next: string) {
  if (next === "__end__" || !scenes[next]) {
    finishEnding();
    return;
  }
  const ms = Math.max(0, prefs.transition);
  if (ms <= 0) {
    enterScene(next);
    return;
  }
  curtain.value = true;
  window.setTimeout(() => {
    enterScene(next);
    nextTick(() => (curtain.value = false));
  }, ms);
}

function finishEnding() {
  const doEnd = () => {
    ended.value = true;
    curtain.value = false;
    engine.sfx("ending");
    if (model && ending.value) {
      unlockEnding(model.id, ending.value.title, ending.value.verse);
      unlocked.value = listUnlocked(model.id);
    }
    persist();
  };
  const ms = Math.max(0, prefs.transition);
  if (ms <= 0) {
    doEnd();
    return;
  }
  curtain.value = true;
  window.setTimeout(doEnd, ms);
}

function pick(c: PlayChoice) {
  if (busy.value || curtain.value) return;
  engine.sfx("choice");
  logPush({ kind: "choice", text: c.text });
  applyEffects(c.effects);
  applyCaps(c.caps);
  tallyTags(c.tags);
  gotoScene(c.next);
}

// —— 自由输入:AI 续写支线(仅生成游戏) ——
async function submitFree() {
  const action = freeText.value.trim();
  if (!action || busy.value || !model?.raw) return;
  const cur = rawScenes[sceneId.value];
  if (!cur) return;
  busy.value = true;
  streamNote.value = "正在落笔…";
  try {
    const ns = await continueScene(model.raw, cur, { ...stats }, action, (info) => {
      streamNote.value = info.note ? info.note : `落笔中… 已成 ${info.chars} 字`;
    });
    rawScenes[ns.id] = ns;
    scenes[ns.id] = genSceneToPlay(ns);
    logPush({ kind: "choice", text: `（你：${action}）` });
    applyEffects((ns as any).__effects);
    freeText.value = "";
    gotoScene(ns.id);
  } catch (e: any) {
    toast.error(`续写失败：${e?.message || e}`);
  } finally {
    busy.value = false;
    streamNote.value = "";
  }
}

// —— 存档 ——
function buildRunState(): RunState {
  const extras: Record<string, GenScene> = {};
  if (model?.raw) {
    for (const k of Object.keys(rawScenes)) {
      if (!model.raw.scenes[k]) extras[k] = rawScenes[k];
    }
  }
  return {
    sceneId: sceneId.value,
    revealed: lineIdx.value,
    stats: { ...stats },
    ended: ended.value,
    extraScenes: extras,
    log: [...log],
    updatedAt: Date.now(),
    caps: { ...caps },
    tagCounts: { ...tagCounts },
  };
}
function persist() {
  if (model) saveRun(model.id, buildRunState());
}

function restoreFrom(run: RunState) {
  if (run.extraScenes) {
    for (const k of Object.keys(run.extraScenes)) {
      rawScenes[k] = run.extraScenes[k];
      scenes[k] = genSceneToPlay(run.extraScenes[k]);
    }
    void hydrateImages();
  }
  Object.assign(stats, run.stats);
  if (run.caps) Object.assign(caps, run.caps);
  if (run.tagCounts) {
    Object.keys(tagCounts).forEach((k) => delete tagCounts[k]);
    Object.assign(tagCounts, run.tagCounts);
  }
  sceneId.value = scenes[run.sceneId] ? run.sceneId : model!.start;
  log.splice(0, log.length, ...(run.log || []));
  ended.value = run.ended;
  // 续玩时把已读旁白直接展开到底,玩家从抉择点继续
  lineIdx.value = parsedLines.value.length;
  typed.value = 0;
  applyMood();
}

// —— 多档位存读 ——
function doSave(slotId: string) {
  if (!model) return;
  const ok = saveSlot(model.id, slotId, buildRunState(), scenes[sceneId.value]?.chapter || "");
  slots.value = listSlots(model.id);
  if (!ok) {
    toast.error("存档失败：本地存储空间已满，请清理旧游戏或档位");
    return;
  }
  toast.success(slotId === "q" ? "已快速存档" : `已存入档位 ${slotId}`);
}
function doLoad(slotId: string) {
  if (!model) return;
  const d = loadSlot(model.id, slotId);
  if (!d) {
    toast.info("该档位为空");
    return;
  }
  restoreFrom(d.state);
  persist();
  showSaves.value = false;
  toast.success("已读取存档");
}
function doDelete(slotId: string) {
  if (!model) return;
  deleteSlot(model.id, slotId);
  slots.value = listSlots(model.id);
}

function restart() {
  if (!model) return;
  Object.keys(scenes).forEach((k) => delete scenes[k]);
  Object.assign(scenes, model.scenes);
  Object.keys(rawScenes).forEach((k) => delete rawScenes[k]);
  if (model.raw) Object.assign(rawScenes, model.raw.scenes);
  imgTried.clear(); // 重开后允许缺图场景重新出图
  void hydrateImages();
  Object.assign(stats, model.initialStats);
  Object.assign(caps, freshCaps());
  Object.keys(tagCounts).forEach((k) => delete tagCounts[k]);
  curScorecard.value = null;
  log.splice(0, log.length);
  ended.value = false;
  auto.value = false;
  sceneCount = 0;
  clearRun(model.id);
  enterScene(model.start);
}

function leave() {
  engine.sfx("back");
  stopNarration();
  persist();
  backToLobby();
}

function toggleSound() {
  const on = audioCfg.bgm || audioCfg.sfx;
  audioCfg.bgm = !on;
  audioCfg.sfx = !on;
}
function toggleNarration() {
  audioCfg.narration = !audioCfg.narration;
  if (audioCfg.narration) playNarration(scene.value?.voiceSrc);
  else stopNarration();
}

// —— 自动播放(自调度,读取 prefs.autoSpeed) ——
let autoTimer: number | null = null;
function autoTick() {
  if (auto.value && !ended.value && !busy.value && !curtain.value) {
    if (!allShown.value) {
      if (lineDone.value) advance();
    } else if (canContinue.value) {
      gotoScene(scene.value!.next!);
    }
  }
  autoTimer = window.setTimeout(autoTick, lineDone.value ? Math.max(400, prefs.autoSpeed) : 220);
}

// —— 键盘 ——
function onKey(e: KeyboardEvent) {
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  const typingField = tag === "input" || tag === "textarea";
  if (e.key === "Escape") {
    if (showSaves.value) {
      showSaves.value = false;
      e.preventDefault();
      return;
    }
    if (showLog.value) {
      showLog.value = false;
      e.preventDefault();
      return;
    }
    if (!typingField) {
      leave();
      e.preventDefault();
    }
    return;
  }
  if (typingField || showLog.value || showSaves.value) return;
  if (ended.value) return;
  if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
    if (!allShown.value || canContinue.value) {
      onTap();
      e.preventDefault();
    }
    return;
  }
  if (/^[1-9]$/.test(e.key) && allShown.value && scene.value) {
    const c = scene.value.choices[Number(e.key) - 1];
    if (c) {
      pick(c);
      e.preventDefault();
    }
    return;
  }
  if (e.key === "h" || e.key === "H" || e.key === "l") {
    showLog.value = !showLog.value;
    e.preventDefault();
  } else if (e.key === "a" || e.key === "A") {
    auto.value = !auto.value;
    e.preventDefault();
  } else if (e.key === "s" || e.key === "S") {
    showSaves.value = !showSaves.value;
    e.preventDefault();
  }
}

function firstGesture() {
  engine.unlock();
  if (audioCfg.bgm) engine.startBgm();
  applyMood();
  // 首个手势解锁后,补播当前场景旁白(自动播放策略下首场可能被拦)
  if (audioCfg.narration && narrAudio == null) playNarration(scene.value?.voiceSrc);
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("pointerdown", firstGesture, { once: true });
  autoTick();
  if (!model) return;
  const run = loadRun(model.id);
  if (run && !run.ended && scenes[run.sceneId]) {
    restoreFrom(run);
    toast.info("已从上次进度续上");
  } else {
    if (run?.ended) clearRun(model.id);
    enterScene(model.start);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  if (typeTimer) clearInterval(typeTimer);
  if (autoTimer) clearTimeout(autoTimer);
  stopNarration();
  persist();
});
</script>

<template>
  <div class="stage-root" v-if="model">
    <button class="back" @click="leave">{{ model.theme.backText }}</button>

    <!-- 右上控制簇 -->
    <div class="controls">
      <button class="ctl" :class="{ on: auto }" title="自动播放 (A)" @click="auto = !auto">自动</button>
      <button class="ctl" title="存读 (S)" @click="showSaves = true">存读</button>
      <button class="ctl" title="回看 (H)" @click="showLog = true">回看</button>
      <button class="ctl" :class="{ on: audioCfg.bgm || audioCfg.sfx }" title="氛围音乐" @click="toggleSound">
        {{ audioCfg.bgm || audioCfg.sfx ? "音" : "默" }}
      </button>
      <button class="ctl" :class="{ on: audioCfg.narration }" title="旁白配音" @click="toggleNarration">
        {{ audioCfg.narration ? "白" : "哑" }}
      </button>
      <button class="ctl" title="重新开始" @click="restart">重来</button>
    </div>

    <div class="frame ink">
      <!-- 画面层:会动的水墨(万相 i2v) › 真实配图(阶跃星辰生图) › 内置 SVG › 生成背景 -->
      <video
        v-if="scene && scene.video"
        class="stage-video"
        :key="'vid-' + sceneId"
        :src="scene.video"
        autoplay
        loop
        muted
        playsinline
      ></video>
      <div
        v-else-if="scene && scene.img"
        class="stage-photo"
        :class="{ kb: prefs.kenBurns }"
        :key="'img-' + sceneId"
        :style="{ backgroundImage: `url(${scene.img})` }"
      ></div>
      <div
        v-else-if="scene && scene.artHtml"
        class="stage-art"
        :class="{ kb: prefs.kenBurns }"
        :key="sceneId"
        v-html="scene.artHtml"
      ></div>
      <div
        v-else
        class="stage-bg"
        :class="{ kb: prefs.kenBurns }"
        :key="'bg-' + sceneId"
        :style="{ background: sceneBg }"
      ></div>
      <div class="art-veil" :class="{ photo: hasPhoto }"></div>
      <div class="vignette" v-if="prefs.vignette"></div>
      <InkParticles v-if="prefs.particles" />

      <div class="ink-grid">
        <div class="ink-main" @click="onTap">
          <template v-if="!ended && scene">
            <div class="ink-node" v-if="scene.age || scene.era">
              <span class="age" v-if="scene.age">{{ scene.age }}</span>
              <span class="age-note" v-if="scene.ageNote">{{ scene.ageNote }}</span>
              <span class="ink-era" v-if="scene.era">{{ scene.era }}</span>
            </div>
            <div class="ink-scene">{{ scene.chapter }}</div>
            <div class="fate-note" v-if="passiveNote">{{ passiveNote }}</div>

            <!-- Checkpoint 评分卡(评判机制·过程性 rubric,维度对玩家公开) -->
            <div class="scorecard" v-if="curScorecard" @click.stop>
              <div class="sc-head">
                <span>{{ curScorecard.title }}</span>
                <span class="sc-total">{{ curScorecard.total }}<small>分</small></span>
              </div>
              <div class="sc-item" v-for="it in curScorecard.items" :key="it.label">
                <span class="sc-label">{{ it.label }}</span>
                <span class="sc-bar"><i :style="{ width: it.value + '%' }"></i></span>
                <span class="sc-val">{{ it.value }}</span>
              </div>
              <div class="sc-note" v-if="curScorecard.note">{{ curScorecard.note }}</div>
            </div>

            <div class="ink-text" :style="{ fontSize: 20 * prefs.fontScale + 'px' }">
              <p
                v-for="(ln, i) in visibleLines"
                :key="i"
                class="line"
                :class="{ rise: !ln.typing, said: ln.speaker }"
              >
                <span v-if="ln.speaker" class="speaker">{{ ln.speaker }}</span>
                <span class="body">{{ ln.body }}<span v-if="ln.typing && !lineDone" class="caret">▍</span></span>
              </p>
            </div>

            <div class="ink-tap" v-if="!allShown">轻触 / 空格 继续 ·</div>
            <div class="ink-tap cont" v-else-if="canContinue">轻触 续幕 ›</div>

            <div class="ink-choices" v-else @click.stop>
              <button
                v-for="(c, i) in scene.choices"
                :key="i"
                class="ink-choice"
                :disabled="busy"
                @click="pick(c)"
              >
                <span class="ck">{{ i + 1 }}</span>
                <span class="ctext">{{ c.text }}<small v-if="c.hint">{{ c.hint }}</small></span>
              </button>

              <div class="free" v-if="scene.freeInput" @click.stop>
                <input
                  v-model="freeText"
                  :disabled="busy"
                  class="free-input"
                  type="text"
                  placeholder="或：写下你自己的动作，由 AI 落笔续写…"
                  @keyup.enter="submitFree"
                />
                <button class="free-btn" :disabled="busy || !freeText.trim()" @click="submitFree">
                  {{ busy ? "落笔中…" : "去做" }}
                </button>
              </div>
            </div>
          </template>

          <!-- 结局 -->
          <template v-else-if="ended && ending">
            <div class="ending" @click.stop>
              <div class="ink-scene">{{ model.theme.endScene }}</div>
              <div class="end-title">{{ ending.title }}</div>
              <p class="end-verse">{{ ending.verse }}</p>
              <div class="end-stats">
                <span v-for="s in model.stats" :key="s.key">{{ s.label }} {{ stats[s.key] }}</span>
              </div>

              <!-- 复盘画像 · 评判机制「看见自己」一层 -->
              <div class="review" v-if="profile">
                <div class="review-head">— 复盘 · 你是个什么样的决策者 —</div>
                <div class="review-body">
                  <div class="radar" v-if="radar">
                    <svg viewBox="-14 -18 228 236" aria-hidden="true">
                      <g class="rgrid">
                        <polygon v-for="(r, i) in radar.rings" :key="'r' + i" :points="r" />
                        <line
                          v-for="(sp, i) in radar.spokes"
                          :key="'sp' + i"
                          x1="100"
                          y1="100"
                          :x2="sp.x"
                          :y2="sp.y"
                        />
                      </g>
                      <polygon class="rshape" :points="radar.poly" />
                      <g class="rlabels">
                        <text
                          v-for="(l, i) in radar.labels"
                          :key="'lb' + i"
                          :x="l.x"
                          :y="l.y"
                        >{{ l.label }}</text>
                      </g>
                    </svg>
                  </div>
                  <div class="review-text">
                    <p class="rv-line" v-if="profile.review">{{ profile.review }}</p>
                    <p class="rv-rec" v-if="recommendLine">{{ recommendLine }}</p>
                    <div class="rv-tags" v-if="topTags.length">
                      <span class="rv-tag" v-for="t in topTags" :key="t.tag">
                        {{ t.tag }}<i>×{{ t.n }}</i>
                      </span>
                    </div>
                    <p class="rv-fork" v-if="fork && fork.nearMiss">
                      命运岔口 · 你距「{{ fork.nearMiss.title }}」仅差 {{ fork.margin }} 分——当年若有一步另作抉择，便是另一种人生。
                    </p>
                    <p class="rv-diag" v-if="diagnosis">{{ diagnosis }}</p>
                  </div>
                </div>
              </div>

              <div class="end-collect">
                结局图鉴 · 已解阅 {{ unlocked.length }}<template v-if="totalEndings"> / {{ totalEndings }}</template>
                <div class="collect-list">
                  <span v-for="t in unlocked" :key="t" class="seal-tag">{{ t }}</span>
                </div>
              </div>
              <div class="end-actions">
                <button class="end-btn" @click="restart">{{ model.theme.restartText }}</button>
                <button class="end-btn ghost" @click="leave">回浮生阁</button>
              </div>
            </div>
          </template>
        </div>

        <!-- 侧栏:命数 -->
        <aside class="ink-side">
          <div class="ink-vtitle">{{ model.theme.sideTitle }}</div>
          <div class="ink-stat" v-for="s in model.stats" :key="s.key">
            <label>{{ s.label }} <span>{{ statWord(stats[s.key]) }}</span></label>
            <div class="stat-bar">
              <i :style="{ width: stats[s.key] + '%', background: s.color }"></i>
            </div>
            <transition-group name="float" tag="div" class="float-host">
              <span
                v-for="f in floatersFor(s.key)"
                :key="f.id"
                class="floater"
                :class="f.delta > 0 ? 'up' : 'down'"
              >
                {{ f.delta > 0 ? "+" : "" }}{{ f.delta }}
              </span>
            </transition-group>
          </div>
          <div class="ink-seal">
            <span v-for="(ln, i) in model.theme.sealText.split('\n')" :key="i">
              {{ ln }}<br v-if="i < model.theme.sealText.split('\n').length - 1" />
            </span>
          </div>
        </aside>
      </div>

      <!-- 续写流式遮罩 -->
      <transition name="fade">
        <div class="penmask" v-if="busy" @click.stop>
          <div class="pen-ink"></div>
          <div class="pen-note">{{ streamNote || "落笔中…" }}</div>
        </div>
      </transition>

      <!-- 场景淡切黑幕 -->
      <div class="curtain" :class="{ show: curtain }"></div>
    </div>

    <!-- 存读面板 -->
    <transition name="fade">
      <div class="overlay" v-if="showSaves" @click.self="showSaves = false">
        <div class="panel">
          <div class="pl-head">存档 · 读档<button class="pl-close" @click="showSaves = false">×</button></div>
          <div class="pl-body">
            <div class="slot quick">
              <div class="slot-info">
                <b>快速档</b>
                <span v-if="slots.q">{{ slots.q.chapter }} · {{ fmtTime(slots.q.at) }}</span>
                <span v-else class="empty">空</span>
              </div>
              <div class="slot-act">
                <button @click="doSave('q')">存</button>
                <button :disabled="!slots.q" @click="doLoad('q')">读</button>
              </div>
            </div>
            <div class="slot" v-for="id in SLOT_IDS" :key="id">
              <div class="slot-info">
                <b>档位 {{ id }}</b>
                <span v-if="slots[id]">{{ slots[id].chapter }} · {{ fmtTime(slots[id].at) }}</span>
                <span v-else class="empty">空</span>
              </div>
              <div class="slot-act">
                <button @click="doSave(id)">存</button>
                <button :disabled="!slots[id]" @click="doLoad(id)">读</button>
                <button class="del" :disabled="!slots[id]" @click="doDelete(id)">删</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 回看 backlog -->
    <transition name="fade">
      <div class="overlay" v-if="showLog" @click.self="showLog = false">
        <div class="panel">
          <div class="pl-head">前情 · 回看<button class="pl-close" @click="showLog = false">×</button></div>
          <div class="pl-body scroll">
            <template v-for="(e, i) in log" :key="i">
              <div v-if="e.kind === 'chapter'" class="bl-chapter">{{ e.text }}</div>
              <div v-else-if="e.kind === 'choice'" class="bl-choice">▸ {{ e.text }}</div>
              <p v-else class="bl-line">{{ e.text }}</p>
            </template>
            <div v-if="!log.length" class="bl-empty">尚无前情。</div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.stage-root {
  height: 100vh;
  background: transparent;
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
  z-index: 20;
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
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
.controls {
  position: fixed;
  top: 18px;
  right: 24px;
  z-index: 20;
  display: flex;
  gap: 8px;
}
.ctl {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: #9aa1ab;
  padding: 6px 13px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  letter-spacing: 0.12em;
  transition: 0.2s;
}
.ctl:hover {
  color: #ece3d0;
  border-color: rgba(255, 255, 255, 0.3);
}
.ctl.on {
  color: #e0c4b3;
  border-color: #b5654a;
  background: rgba(201, 139, 107, 0.16);
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
    radial-gradient(100% 70% at 0% 100%, rgba(60, 40, 40, 0.22), transparent 55%), #14161a;
  color: #d8d2c4;
}
.stage-art,
.stage-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.62;
  animation: artFade 1.2s ease;
}
/* 会动的水墨层(万相 i2v):铺满、循环、静音自动播放 */
.stage-video {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.96;
  animation: photoFade 1.4s ease;
}
/* 真实配图层:图片为主,接近满显,缓动镜头 */
.stage-photo {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.96;
  animation: photoFade 1.4s ease;
}
.stage-photo.kb {
  animation: photoFade 1.4s ease, kenburns 30s ease-in-out 1.4s infinite alternate;
  transform-origin: 60% 40%;
}
@keyframes photoFade {
  from {
    opacity: 0;
    transform: scale(1.06);
  }
  to {
    opacity: 0.96;
  }
}
.stage-art :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
.stage-art.kb,
.stage-bg.kb {
  animation: artFade 1.2s ease, kenburns 26s ease-in-out 1.2s infinite alternate;
  transform-origin: 60% 40%;
}
@keyframes kenburns {
  from {
    transform: scale(1.02) translate(0, 0);
  }
  to {
    transform: scale(1.1) translate(-1.5%, -1.5%);
  }
}
@keyframes artFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.62;
  }
}
.art-veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(100deg, rgba(8, 12, 20, 0.92) 18%, rgba(8, 12, 20, 0.5) 56%, rgba(8, 12, 20, 0.34) 100%),
    linear-gradient(0deg, rgba(8, 12, 20, 0.7), transparent 40%);
}
/* 有真实配图时:图片为主,只在文字区(左侧+底部)压暗保证可读,右上留白展示画面 */
.art-veil.photo {
  background: linear-gradient(
      100deg,
      rgba(8, 11, 17, 0.82) 0%,
      rgba(8, 11, 17, 0.55) 34%,
      rgba(8, 11, 17, 0.12) 62%,
      rgba(8, 11, 17, 0) 100%
    ),
    linear-gradient(0deg, rgba(6, 9, 14, 0.85) 2%, rgba(6, 9, 14, 0.2) 30%, transparent 50%);
}
.vignette {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  box-shadow: inset 0 0 160px 40px rgba(0, 0, 0, 0.55);
}
.ink-grid {
  position: relative;
  z-index: 4;
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
.fate-note {
  font-size: 12.5px;
  color: #cdb89a;
  letter-spacing: 0.08em;
  margin: -6px 0 14px;
  padding-left: 12px;
  border-left: 2px solid rgba(201, 139, 107, 0.5);
  opacity: 0.9;
}
.ink-text {
  font-family: "Songti SC", "SimSun", serif;
  line-height: 2.1;
  color: #ddd6c7;
  letter-spacing: 0.04em;
  max-width: 560px;
  min-height: 120px;
}
.ink-text .line {
  margin-bottom: 6px;
}
.ink-text .line.rise {
  animation: rise 0.6s ease;
}
.ink-text .line.said .body {
  color: #ece3d0;
}
.speaker {
  display: inline-block;
  margin-right: 12px;
  padding: 1px 10px;
  border-left: 2px solid #c98b6b;
  color: #cf8466;
  font-size: 0.82em;
  letter-spacing: 0.1em;
  vertical-align: 0.06em;
}
.caret {
  color: #c98b6b;
  animation: blink 0.9s steps(1) infinite;
  margin-left: 1px;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
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
.ink-tap.cont {
  color: #c98b6b;
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
  display: flex;
  align-items: flex-start;
  gap: 12px;
  text-align: left;
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
.ink-choice:hover:not(:disabled) {
  border-left-color: #c98b6b;
  background: linear-gradient(90deg, rgba(201, 139, 107, 0.16), transparent);
  color: #f0e9da;
  padding-left: 28px;
}
.ink-choice:disabled {
  opacity: 0.5;
  cursor: default;
}
.ink-choice .ck {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  border: 1px solid rgba(138, 162, 184, 0.4);
  border-radius: 50%;
  font-size: 11px;
  line-height: 19px;
  text-align: center;
  color: #8aa2b8;
  font-family: sans-serif;
}
.ink-choice .ctext small {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: #7c8694;
  letter-spacing: 0.06em;
  font-family: sans-serif;
}
.free {
  margin-top: 6px;
  display: flex;
  gap: 10px;
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
.free-input:focus {
  outline: none;
  border-color: #c98b6b;
}
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
.free-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

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
.ink-stat {
  position: relative;
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
.float-host {
  position: absolute;
  right: 0;
  top: -2px;
  pointer-events: none;
}
.floater {
  position: absolute;
  right: 0;
  font-size: 13px;
  font-family: sans-serif;
  white-space: nowrap;
}
.floater.up {
  color: #8fc7a0;
}
.floater.down {
  color: #cf8466;
}
.float-enter-active {
  transition: all 1.4s ease;
}
.float-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.float-leave-active {
  transition: all 0.6s ease;
}
.float-leave-to {
  opacity: 0;
  transform: translateY(-18px);
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
  animation: rise 1.2s ease;
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
  flex-wrap: wrap;
  gap: 22px;
  font-size: 13px;
  color: #8a8f98;
  letter-spacing: 0.1em;
}
.end-collect {
  margin-top: 24px;
  font-size: 12px;
  color: #7e8a96;
  letter-spacing: 0.1em;
}
.collect-list {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.seal-tag {
  border: 1px solid rgba(201, 139, 107, 0.4);
  color: #cf8466;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-family: "Songti SC", serif;
}
.end-actions {
  margin-top: 36px;
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

/* Checkpoint 评分卡(游玩中) */
.scorecard {
  margin: 4px 0 16px;
  max-width: 420px;
  padding: 14px 18px;
  border: 1px solid rgba(138, 162, 184, 0.28);
  border-left: 2px solid #8aa2b8;
  border-radius: 8px;
  background: linear-gradient(120deg, rgba(44, 70, 97, 0.18), rgba(8, 12, 20, 0.1));
  cursor: default;
}
.sc-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: "Songti SC", serif;
  font-size: 14px;
  letter-spacing: 0.16em;
  color: #cdb89a;
  margin-bottom: 12px;
}
.sc-total {
  font-size: 26px;
  color: #e9e2d2;
  letter-spacing: 0;
}
.sc-total small {
  font-size: 12px;
  color: #8a8f98;
  margin-left: 2px;
}
.sc-item {
  display: grid;
  grid-template-columns: 64px 1fr 30px;
  align-items: center;
  gap: 10px;
  margin: 7px 0;
}
.sc-label {
  font-size: 12.5px;
  color: #9aa3ad;
  letter-spacing: 0.08em;
}
.sc-bar {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.sc-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #5b86a8, #8aa2b8);
  transition: width 0.7s ease;
}
.sc-val {
  font-size: 12px;
  color: #cfc8ba;
  font-family: sans-serif;
  text-align: right;
}
.sc-note {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: #cdb89a;
  letter-spacing: 0.04em;
  padding-left: 10px;
  border-left: 2px solid rgba(201, 139, 107, 0.45);
}

/* 复盘画像(结局后) */
.review {
  margin-top: 30px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  animation: rise 1s ease;
}
.review-head {
  font-size: 12px;
  letter-spacing: 0.25em;
  color: #7e8a96;
  margin-bottom: 16px;
}
.review-body {
  display: flex;
  gap: 22px;
  align-items: center;
  flex-wrap: wrap;
}
.radar {
  flex: none;
  width: 188px;
  height: 196px;
}
.radar svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.rgrid polygon {
  fill: none;
  stroke: rgba(138, 162, 184, 0.18);
  stroke-width: 0.8;
}
.rgrid line {
  stroke: rgba(138, 162, 184, 0.16);
  stroke-width: 0.7;
}
.rshape {
  fill: rgba(201, 139, 107, 0.26);
  stroke: #c98b6b;
  stroke-width: 1.4;
  stroke-linejoin: round;
}
.rlabels text {
  fill: #b9b2a3;
  font-size: 9px;
  font-family: "Songti SC", serif;
  letter-spacing: 0.04em;
  text-anchor: middle;
  dominant-baseline: middle;
}
.review-text {
  flex: 1;
  min-width: 240px;
}
.rv-line {
  font-family: "Songti SC", serif;
  font-size: 16px;
  color: #ece3d0;
  letter-spacing: 0.06em;
  margin: 0 0 8px;
}
.rv-rec {
  font-size: 13.5px;
  line-height: 1.8;
  color: #cdb89a;
  letter-spacing: 0.03em;
  margin: 8px 0;
}
.rv-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.rv-tag {
  font-size: 12px;
  color: #cfc8ba;
  border: 1px solid rgba(138, 162, 184, 0.4);
  border-radius: 6px;
  padding: 3px 9px;
  letter-spacing: 0.06em;
}
.rv-tag i {
  color: #8a8f98;
  font-style: normal;
  margin-left: 4px;
  font-size: 11px;
}
.rv-fork {
  font-size: 13px;
  line-height: 1.8;
  color: #8aa2b8;
  letter-spacing: 0.03em;
  margin: 12px 0 8px;
  padding-left: 12px;
  border-left: 2px solid rgba(138, 162, 184, 0.5);
}
.rv-diag {
  font-family: "Songti SC", serif;
  font-size: 14px;
  line-height: 1.9;
  color: #d3a98f;
  letter-spacing: 0.04em;
  margin: 10px 0 0;
}

/* 续写遮罩 */
.penmask {
  position: absolute;
  inset: 0;
  z-index: 8;
  background: rgba(8, 10, 14, 0.62);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  cursor: default;
}
.pen-ink {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, #c98b6b, #6b3b2c);
  animation: penpulse 1.3s ease-in-out infinite;
}
@keyframes penpulse {
  0%,
  100% {
    transform: scale(0.7);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}
.pen-note {
  font-family: "Songti SC", serif;
  font-size: 14px;
  letter-spacing: 0.2em;
  color: #cfc8ba;
}

/* 场景淡切 */
.curtain {
  position: absolute;
  inset: 0;
  z-index: 9;
  background: #07080a;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.curtain.show {
  opacity: 1;
  pointer-events: all;
}

/* 通用浮层(存读 / 回看) */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(6, 7, 10, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel {
  width: 100%;
  max-width: 560px;
  max-height: 76vh;
  background: #14161a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pl-head {
  padding: 16px 22px;
  font-family: "Songti SC", serif;
  letter-spacing: 0.2em;
  color: #ece3d0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pl-close {
  border: none;
  background: transparent;
  color: #8a8f98;
  font-size: 20px;
  cursor: pointer;
}
.pl-close:hover {
  color: #ece3d0;
}
.pl-body {
  padding: 16px 22px 22px;
  overflow-y: auto;
}
.pl-body.scroll {
  max-height: 60vh;
}
.slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  margin-bottom: 10px;
}
.slot.quick {
  border-color: rgba(201, 139, 107, 0.4);
}
.slot-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #cfc8ba;
}
.slot-info b {
  color: #ece3d0;
  font-size: 13px;
  letter-spacing: 0.08em;
}
.slot-info .empty {
  color: #6c727c;
}
.slot-act {
  display: flex;
  gap: 6px;
}
.slot-act button {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: transparent;
  color: #cfc8ba;
  border-radius: 7px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
.slot-act button:hover:not(:disabled) {
  border-color: #c98b6b;
  color: #f0e9da;
}
.slot-act button:disabled {
  opacity: 0.4;
  cursor: default;
}
.slot-act .del:hover:not(:disabled) {
  border-color: #b04c3c;
  color: #e08a78;
}
.bl-chapter {
  margin: 18px 0 8px;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: #7e8a96;
}
.bl-line {
  font-family: "Songti SC", serif;
  font-size: 15px;
  line-height: 1.9;
  color: #cfc8ba;
  margin: 2px 0;
}
.bl-choice {
  color: #c98b6b;
  font-size: 14px;
  margin: 6px 0;
  letter-spacing: 0.04em;
}
.bl-empty {
  color: #6c727c;
  text-align: center;
  padding: 30px 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
