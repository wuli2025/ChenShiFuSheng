<script setup lang="ts">
// 设置 · API 配置。
// 生图模型：本地配置(localStorage)，预置点选自动填端点。
// 文本模型：直接复用现有 provider 系统(provider_list / provider_switch)——即项目真实 API，可切换。
// 项目自带 API：当前 provider 只读展示，不在此覆盖。
import { onMounted, ref } from "vue";
import {
  IMAGE_PRESETS,
  getImageCfg,
  setImageCfg,
  type ImageCfg,
} from "./gameSettings";
import { provider, engineApi, type ProviderView, type EngineKind, type CodexStatus } from "../tauri";
import { audioCfg, engine } from "./audio";
import { prefs, resetPrefs } from "./prefs";
import { toast } from "../composables/useToast";
import {
  currentVersion,
  updateVersion,
  updateNotes,
  updateProgress,
  updateError,
  updating,
  checking,
  upToDate,
  checkForUpdate,
  manualCheck,
  applyUpdate,
} from "../composables/useUpdater";

const img = ref<ImageCfg>(getImageCfg());

function previewSound() {
  engine.unlock();
  engine.startBgm();
  engine.sfx("choice");
}

const providers = ref<ProviderView[]>([]);
const currentId = ref("");
const loadingProviders = ref(true);

// —— Agent 引擎(codex CLI 默认 / claude CLI)——
const curEngine = ref<EngineKind>("codex");
const codexStatus = ref<CodexStatus | null>(null);
const switchingEngine = ref(false);

const ENGINES: { id: EngineKind; name: string; desc: string }[] = [
  { id: "codex", name: "Codex CLI", desc: "OpenAI 官方 codex,吃 ChatGPT 订阅 · 默认" },
  { id: "claude", name: "Claude CLI", desc: "Anthropic Claude Code,受上面「文本模型供应商」影响" },
];

async function loadEngine() {
  try {
    curEngine.value = await engineApi.get();
  } catch {
    /* ignore */
  }
  try {
    codexStatus.value = await provider.codexStatus();
  } catch {
    codexStatus.value = null;
  }
}

async function switchEngine(id: EngineKind) {
  if (id === curEngine.value || switchingEngine.value) return;
  switchingEngine.value = true;
  try {
    curEngine.value = await engineApi.set(id);
    if (id === "codex" && codexStatus.value && !codexStatus.value.loggedIn) {
      toast.info("已切到 Codex,但尚未登录 ChatGPT。请先在终端运行 codex login,或切回 Claude。");
    } else {
      toast.success(`已切换引擎：${id === "codex" ? "Codex CLI" : "Claude CLI"}`);
    }
  } catch (e: any) {
    toast.error(`切换引擎失败：${e?.message || e}`);
  } finally {
    switchingEngine.value = false;
  }
}

function pickPreset(id: string) {
  const p = IMAGE_PRESETS.find((x) => x.id === id);
  if (!p) return;
  img.value.preset = id;
  if (id !== "custom") {
    img.value.endpoint = p.endpoint;
    img.value.model = p.model;
  }
}

function saveImg() {
  setImageCfg(img.value);
  toast.success("生图模型设置已保存");
}

async function loadProviders() {
  loadingProviders.value = true;
  try {
    const res = await provider.list();
    providers.value = res.providers;
    currentId.value = res.currentId;
  } catch (e: any) {
    toast.error(`读取供应商失败：${e?.message || e}`);
  } finally {
    loadingProviders.value = false;
  }
}

async function switchProvider(id: string) {
  if (id === currentId.value) return;
  try {
    await provider.switch(id);
    currentId.value = id;
    toast.success("已切换文本模型供应商");
  } catch (e: any) {
    toast.error(`切换失败：${e?.message || e}`);
  }
}

onMounted(() => {
  loadProviders();
  loadEngine();
  // 进设置即静默向我们的仓库（wuli2025/ChenShiFuSheng）问一次有无新版。
  checkForUpdate();
});
</script>

<template>
  <div class="set-root">
    <header class="head">
      <div class="title">设置</div>
    </header>

    <div class="wrap">
      <!-- Agent 引擎(codex CLI 默认 / claude CLI) -->
      <section class="card">
        <div class="card-head">
          <strong>AI 引擎（Agent 底座）</strong>
          <span class="hint">整条对话由哪个 CLI 驱动 · 默认 Codex</span>
        </div>
        <div class="engine-list">
          <button
            v-for="e in ENGINES"
            :key="e.id"
            class="engine"
            :class="{ on: e.id === curEngine }"
            :disabled="switchingEngine"
            @click="switchEngine(e.id)"
          >
            <span class="en">{{ e.name }}</span>
            <span class="ed">{{ e.desc }}</span>
            <span v-if="e.id === curEngine" class="cur">当前</span>
          </button>
        </div>
        <p v-if="codexStatus" class="note codex-note">
          ChatGPT 授权：
          <b :class="{ ok: codexStatus.loggedIn, err: !codexStatus.loggedIn }">
            {{ codexStatus.loggedIn ? "已登录" : "未登录" }}
          </b>
          <template v-if="!codexStatus.loggedIn">
            —— Codex 引擎需要 ChatGPT 订阅，请在终端运行 <code>codex login</code> 后重试，或改用 Claude 引擎。
          </template>
        </p>
      </section>

      <!-- 软件更新 -->
      <section class="card">
        <div class="card-head">
          <strong>软件更新</strong>
          <span class="hint">从官方仓库 wuli2025/ChenShiFuSheng 远程检查并安装新版</span>
        </div>
        <div class="f">
          <label>当前版本</label>
          <span class="ver">v{{ currentVersion || "—" }}</span>
        </div>
        <div class="f">
          <label>状态</label>
          <span class="up-status">
            <template v-if="checking">正在检查更新…</template>
            <template v-else-if="updating">
              {{ updateProgress < 100 ? `正在下载 v${updateVersion}` : `正在安装 v${updateVersion}` }}
            </template>
            <template v-else-if="updateVersion">
              发现新版本 <b class="new">v{{ updateVersion }}</b>
            </template>
            <template v-else-if="upToDate">已是最新版本</template>
            <template v-else-if="updateError"><b class="err">检查失败</b></template>
            <template v-else>点击「检查更新」向仓库询问</template>
          </span>
        </div>
        <!-- 下载进度条 -->
        <div v-if="updating" class="f">
          <label>进度</label>
          <div class="bar"><div class="bar-in" :style="{ width: updateProgress + '%' }"></div></div>
          <span class="vol">{{ updateProgress }}%</span>
        </div>
        <!-- 更新说明 -->
        <div v-if="updateVersion && updateNotes" class="notes">{{ updateNotes }}</div>
        <!-- 错误详情 -->
        <div v-if="updateError && !updating" class="err-box">{{ updateError }}</div>
        <div class="card-foot up-foot">
          <button class="save ghost" :disabled="checking || updating" @click="manualCheck">
            {{ checking ? "检查中…" : "检查更新" }}
          </button>
          <button v-if="updateVersion" class="save" :disabled="updating" @click="applyUpdate">
            {{ updating ? (updateProgress < 100 ? "下载中…" : "安装中…") : "立即更新并重启" }}
          </button>
        </div>
      </section>

      <!-- 音景 -->
      <section class="card">
        <div class="card-head">
          <strong>音景</strong>
          <span class="hint">程序化合成的水墨氛围，随剧情情绪变调</span>
        </div>
        <div class="f">
          <label>背景氛围</label>
          <label class="sw"><input type="checkbox" v-model="audioCfg.bgm" /> 缓慢演化的五声和声 + 风声底噪</label>
        </div>
        <div class="f">
          <label>音效</label>
          <label class="sw"><input type="checkbox" v-model="audioCfg.sfx" /> 翻页 / 抉择 / 结局的拨弦音</label>
        </div>
        <div class="f">
          <label>旁白配音</label>
          <label class="sw"><input type="checkbox" v-model="audioCfg.narration" /> 阶跃星辰 TTS 逐场景朗读旁白</label>
        </div>
        <div class="f">
          <label>旁白音量</label>
          <input type="range" min="0" max="1" step="0.05" v-model.number="audioCfg.narrationVol" class="range" />
          <span class="vol">{{ Math.round(audioCfg.narrationVol * 100) }}%</span>
        </div>
        <div class="f">
          <label>总音量</label>
          <input type="range" min="0" max="1" step="0.05" v-model.number="audioCfg.master" class="range" />
          <span class="vol">{{ Math.round(audioCfg.master * 100) }}%</span>
        </div>
        <div class="f">
          <label>背景音量</label>
          <input type="range" min="0" max="1" step="0.05" v-model.number="audioCfg.bgmVol" class="range" />
          <span class="vol">{{ Math.round(audioCfg.bgmVol * 100) }}%</span>
        </div>
        <div class="f">
          <label>音效音量</label>
          <input type="range" min="0" max="1" step="0.05" v-model.number="audioCfg.sfxVol" class="range" />
          <span class="vol">{{ Math.round(audioCfg.sfxVol * 100) }}%</span>
        </div>
        <div class="card-foot"><button class="save" @click="previewSound">试听</button></div>
      </section>

      <!-- 文本 · 阅读 -->
      <section class="card">
        <div class="card-head">
          <strong>文本 · 阅读</strong>
          <span class="hint">对标成熟视觉小说的阅读手感</span>
        </div>
        <div class="f">
          <label>打字机</label>
          <label class="sw"><input type="checkbox" v-model="prefs.typewriter" /> 旁白逐字浮现（关闭则整句直显）</label>
        </div>
        <div class="f">
          <label>文字速度</label>
          <input type="range" min="6" max="80" step="2" v-model.number="prefs.textSpeed" class="range invert" />
          <span class="vol">{{ prefs.textSpeed <= 16 ? "快" : prefs.textSpeed >= 50 ? "慢" : "中" }}</span>
        </div>
        <div class="f">
          <label>自动间隔</label>
          <input type="range" min="400" max="3000" step="100" v-model.number="prefs.autoSpeed" class="range" />
          <span class="vol">{{ (prefs.autoSpeed / 1000).toFixed(1) }}s</span>
        </div>
        <div class="f">
          <label>正文字号</label>
          <input type="range" min="0.85" max="1.4" step="0.05" v-model.number="prefs.fontScale" class="range" />
          <span class="vol">{{ Math.round(prefs.fontScale * 100) }}%</span>
        </div>
      </section>

      <!-- 画面 -->
      <section class="card">
        <div class="card-head">
          <strong>画面</strong>
          <span class="hint">氛围层，可按设备性能取舍</span>
        </div>
        <div class="f">
          <label>转场时长</label>
          <input type="range" min="0" max="700" step="50" v-model.number="prefs.transition" class="range" />
          <span class="vol">{{ prefs.transition }}ms</span>
        </div>
        <div class="f">
          <label>四角压暗</label>
          <label class="sw"><input type="checkbox" v-model="prefs.vignette" /> 暗角聚焦视线</label>
        </div>
        <div class="f">
          <label>水墨浮尘</label>
          <label class="sw"><input type="checkbox" v-model="prefs.particles" /> 空气中缓缓上浮的尘点</label>
        </div>
        <div class="f">
          <label>缓动镜头</label>
          <label class="sw"><input type="checkbox" v-model="prefs.kenBurns" /> 背景缓慢推拉，画面有呼吸感</label>
        </div>
        <div class="card-foot"><button class="save" @click="resetPrefs()">恢复默认</button></div>
      </section>

      <!-- 生图模型 -->
      <section class="card">
        <div class="card-head">
          <strong>生图模型 API</strong>
          <span class="hint">为剧情生成立绘 / 背景图</span>
        </div>
        <div class="chips">
          <button
            v-for="p in IMAGE_PRESETS"
            :key="p.id"
            class="chip"
            :class="{ on: img.preset === p.id }"
            @click="pickPreset(p.id)"
          >
            {{ p.name }}
          </button>
        </div>
        <div class="f"><label>Endpoint</label><input v-model="img.endpoint" class="in" placeholder="https://…" /></div>
        <div class="f"><label>Model</label><input v-model="img.model" class="in" placeholder="模型名" /></div>
        <div class="f"><label>API Key</label><input v-model="img.apiKey" class="in" type="password" placeholder="sk-…" /></div>
        <div class="f">
          <label>启用</label>
          <label class="sw"><input type="checkbox" v-model="img.enabled" /> 生成游戏时调用它出图（关闭则用水墨占位）</label>
        </div>
        <div class="card-foot"><button class="save" @click="saveImg">保存</button></div>
      </section>

      <!-- 文本模型（真实 provider 系统） -->
      <section class="card">
        <div class="card-head">
          <strong>文本 / LLM 模型（项目供应商）</strong>
          <span class="hint">生成剧情 / 续写自由输入 · 点击切换</span>
        </div>
        <div v-if="loadingProviders" class="loading">读取中…</div>
        <div v-else class="provider-list">
          <button
            v-for="p in providers"
            :key="p.id"
            class="prov"
            :class="{ on: p.id === currentId }"
            @click="switchProvider(p.id)"
          >
            <span class="pn">{{ p.name }}</span>
            <span class="pc">{{ p.category }}</span>
            <span v-if="p.id === currentId" class="cur">当前</span>
          </button>
        </div>
      </section>

      <!-- 项目自带 API 只读 -->
      <section class="card locked">
        <div class="card-head">
          <strong>项目自带 API（Agent 底座 / Claude Code）</strong>
          <span class="lock">锁定 · 只读</span>
        </div>
        <p class="note">
          平台生成与续写所依赖的底座由项目维护（当前供应商：<b>{{ currentId || "—" }}</b>）。
          上面切换的是文本模型供应商；底座本身的接入方式不在此处改动，也不会被覆盖。
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.set-root {
  height: 100vh;
  overflow-y: auto;
  background: transparent;
  color: var(--text);
  padding: 48px 40px 48px;
  font-family: var(--f-sans);
}
.head { display: flex; align-items: center; max-width: 760px; margin: 0 auto 26px; }
.title { flex: 1; text-align: center; font-family: var(--f-serif); font-size: 26px; letter-spacing: 0.32em; text-indent: 0.32em; color: var(--text-hi); }
.back { border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.03); color: #9aa1ab; padding: 7px 16px; border-radius: 999px; cursor: pointer; font-size: 13px; }
.back:hover { color: #ece3d0; }
.wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.card {
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  box-shadow: var(--edge-hi), var(--shadow-sm);
  padding: 22px 24px;
}
.card.locked { background: rgba(16, 11, 8, 0.5); }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.card-head strong { color: #ece3d0; font-size: 16px; }
.hint { font-size: 12px; color: #8a8f98; }
.lock { font-size: 11px; color: #cf8466; border: 1px dashed #b5654a; border-radius: 6px; padding: 2px 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.chip {
  border: 1px solid var(--hairline-strong); color: var(--text); background: transparent;
  border-radius: var(--r-pill); padding: 6px 16px; font-size: 12px; cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.chip:hover { border-color: var(--accent); color: var(--text-hi); }
.chip.on {
  background: rgba(201, 120, 79, 0.24); border-color: var(--accent-deep); color: var(--text-hi);
  box-shadow: inset 0 1px 0 rgba(255, 244, 230, 0.12);
}
.f { display: flex; align-items: center; gap: 12px; margin: 9px 0; font-size: 13px; }
/* 只有行首的字段名定宽;行内的开关 label(.sw) 要占满余宽,不许被挤成竖条 */
.f > label:first-child { flex: none; width: 78px; color: var(--text-dim); }
.in {
  flex: 1; background: rgba(20, 13, 9, 0.36);
  border: 1px solid var(--hairline); border-radius: var(--r-sm);
  padding: 9px 12px; color: var(--text-hi); font-size: 13px;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.in:focus { outline: none; border-color: rgba(224, 150, 88, 0.5); box-shadow: 0 0 0 3px rgba(224, 150, 88, 0.12); }
.sw { flex: 1; display: flex; align-items: center; gap: 8px; color: var(--text-hi); cursor: pointer; accent-color: var(--accent); }
.card-foot { margin-top: 14px; text-align: right; }
.save {
  border: none;
  background: linear-gradient(180deg, rgba(214, 148, 112, 0.92), rgba(181, 101, 74, 0.92));
  color: #fff7ec; border-radius: var(--r-pill); padding: 9px 24px; cursor: pointer; font-size: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 244, 230, 0.28), 0 4px 14px rgba(0, 0, 0, 0.3);
  transition: filter var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.save:hover:not(:disabled) { filter: brightness(1.08); }
.save:active { transform: scale(0.97); }
.loading { color: #8a8f98; font-size: 13px; }
.provider-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; max-height: 320px; overflow-y: auto; }
.prov {
  display: flex; align-items: center; gap: 10px; text-align: left;
  border: 1px solid var(--hairline); background: rgba(20, 13, 9, 0.28);
  border-radius: var(--r-md); padding: 11px 15px; cursor: pointer; color: var(--text);
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.prov:hover { border-color: var(--hairline-strong); background: rgba(40, 27, 18, 0.36); }
.prov.on {
  border-color: rgba(201, 139, 107, 0.5); background: rgba(201, 139, 107, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 244, 230, 0.1);
}
.pn { font-size: 14px; color: var(--text-hi); }
.pc { font-size: 11px; color: var(--text-dim); }
.cur { margin-left: auto; font-size: 11px; color: #d99a78; }
.note { font-size: 13px; line-height: 1.9; color: var(--text-mut); }
.note b { color: #cdb89a; }
/* AI 引擎选择 */
.engine-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.engine {
  position: relative; display: flex; flex-direction: column; gap: 5px; text-align: left;
  border: 1px solid var(--hairline); background: rgba(20, 13, 9, 0.28);
  border-radius: var(--r-md); padding: 14px 16px; cursor: pointer; color: var(--text);
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.engine:hover { border-color: var(--hairline-strong); background: rgba(40, 27, 18, 0.36); }
.engine.on {
  border-color: rgba(201, 139, 107, 0.5); background: rgba(201, 139, 107, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 244, 230, 0.1);
}
.engine:disabled { opacity: 0.6; cursor: wait; }
.en { font-size: 15px; color: var(--text-hi); }
.ed { font-size: 11px; color: var(--text-dim); line-height: 1.6; }
.engine .cur { position: absolute; top: 12px; right: 14px; font-size: 11px; color: #d99a78; }
.codex-note { margin-top: 12px; }
.codex-note .ok { color: #7da08a; }
.codex-note .err { color: #cf8466; }
.codex-note code { background: rgba(255, 255, 255, 0.06); padding: 1px 6px; border-radius: 4px; color: #cdb89a; font-size: 12px; }
.range { flex: 1; accent-color: #c98b6b; cursor: pointer; }
.vol { width: 44px; text-align: right; color: #cdb89a; font-size: 12px; }
/* 软件更新 */
.ver { color: #cdb89a; font-size: 13px; letter-spacing: 0.04em; }
.up-status { color: #cfc8ba; font-size: 13px; }
.up-status .new { color: #cf8466; }
.up-status .err { color: #cf8466; }
.bar { flex: 1; height: 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.bar-in { height: 100%; background: linear-gradient(90deg, #8aa2b8, #c98b6b); border-radius: 999px; transition: width 0.25s ease; }
.notes { margin: 6px 0 2px; padding: 10px 12px; border-left: 2px solid rgba(201, 139, 107, 0.5); background: rgba(255, 255, 255, 0.02); border-radius: 0 6px 6px 0; font-size: 12px; line-height: 1.8; color: #9aa1ab; white-space: pre-wrap; }
.err-box { margin: 6px 0 2px; font-size: 12px; line-height: 1.7; color: #cf8466; }
.up-foot { display: flex; justify-content: flex-end; gap: 10px; }
.save.ghost {
  border: 1px solid var(--hairline-strong);
  background: transparent;
  color: var(--text);
  box-shadow: none;
}
.save.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--text-hi); filter: none; }
.save:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
