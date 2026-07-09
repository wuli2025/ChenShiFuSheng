<script setup lang="ts">
// 创作工坊 —— 把「AI人生画布引擎」工作台嵌进大厅。
// 桌面(Tauri):以**原生子 WebView** 嵌入主窗口(studio_embed*,完整浏览器能力,
//   不弹外部浏览器),位置随 .frame-host 区域实时同步(ResizeObserver)。
// 浏览器/Docker:退回 iframe。服务不在线会自动 node 拉起(studio.rs ensure_server)。
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { invoke, isTauri } from "../tauri";

const STUDIO_URL =
  (import.meta.env.VITE_STUDIO_URL as string | undefined) || "http://127.0.0.1:1480/";

type State = "checking" | "starting" | "ready" | "down";
const state = ref<State>("checking");
const errMsg = ref("");
const frameKey = ref(0);
const frameHost = ref<HTMLElement | null>(null);

interface StudioStatus {
  running: boolean;
  url: string;
  dir: string | null;
}

let embedded = false;
let ro: ResizeObserver | null = null;

function hostRect() {
  const el = frameHost.value;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
}

function syncBounds() {
  if (!embedded) return;
  const r = hostRect();
  if (r && r.w > 10 && r.h > 10) invoke("studio_embed_bounds", r).catch(() => {});
}

async function ensure() {
  state.value = "checking";
  errMsg.value = "";
  if (!isTauri) {
    // 浏览器/Docker:无法代拉服务与原生嵌入,退回 iframe
    state.value = "ready";
    return;
  }
  try {
    const st = await invoke<StudioStatus>("studio_status");
    if (!st?.running) {
      state.value = "starting";
      const r = await invoke<StudioStatus>("studio_start");
      if (!r?.running) {
        state.value = "down";
        errMsg.value = "服务已尝试拉起但未就绪,可稍候点「重试」";
        return;
      }
    }
    state.value = "ready";
    await nextTick(); // 等 .frame-host 渲染出来再量尺寸
    const rect = hostRect();
    if (!rect || rect.w < 10) throw new Error("嵌入区域尺寸异常");
    await invoke("studio_embed", rect);
    embedded = true;
    if (frameHost.value && !ro) {
      ro = new ResizeObserver(syncBounds);
      ro.observe(frameHost.value);
    }
  } catch (e: any) {
    state.value = "down";
    errMsg.value = String(e?.message || e || "未知错误");
  }
}

function reload() {
  if (isTauri && embedded) invoke("studio_embed_reload").catch(() => {});
  else frameKey.value++;
}

onMounted(() => {
  ensure();
  window.addEventListener("resize", syncBounds);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", syncBounds);
  ro?.disconnect();
  ro = null;
  if (embedded) {
    embedded = false;
    invoke("studio_embed_close").catch(() => {});
  }
});
</script>

<template>
  <div class="studio">
    <header class="bar glass">
      <div class="head">
        <span class="dot" :class="state" aria-hidden="true"></span>
        <span class="name">创作工坊</span>
        <span class="sub">尘世画布 · 写剧本 → 改稿 → 定稿 → 生图 → 成品</span>
      </div>
      <div class="acts">
        <button class="abtn" title="重新加载工作台" @click="reload">刷新</button>
      </div>
    </header>

    <!-- 桌面:原生子 WebView 盖在这块区域上(浏览器整个嵌进来);浏览器模式:iframe -->
    <div v-if="state === 'ready'" ref="frameHost" class="frame-wrap glass-soft">
      <iframe
        v-if="!isTauri"
        :key="frameKey"
        class="frame"
        :src="STUDIO_URL"
        title="AI人生画布引擎 · 工作台"
        allow="fullscreen; autoplay"
      ></iframe>
    </div>

    <div v-else class="gate glass-strong">
      <template v-if="state === 'checking' || state === 'starting'">
        <div class="g-title">{{ state === "starting" ? "正在拉起创作工坊…" : "正在连接创作工坊…" }}</div>
        <div class="g-sub">本地服务 {{ STUDIO_URL }}</div>
        <div class="pulse" aria-hidden="true"></div>
      </template>
      <template v-else>
        <div class="g-title">创作工坊未就绪</div>
        <div class="g-sub">{{ errMsg }}</div>
        <div class="g-help">
          可手动双击「AI人生画布引擎」文件夹里的 <code>启动工作台.bat</code>,
          或设置环境变量 <code>POLARIS_STUDIO_DIR</code> 指向该文件夹后重试。
        </div>
        <button class="abtn big" @click="ensure">重试</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.studio {
  height: 100vh;
  padding: 44px 18px 16px 6px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-radius: var(--r-lg);
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  flex: none;
}
.dot.ready {
  background: #5fce7b;
  box-shadow: 0 0 8px rgba(95, 206, 123, 0.6);
}
.dot.down {
  background: #ef7373;
  box-shadow: 0 0 8px rgba(239, 115, 115, 0.5);
}
.dot.checking,
.dot.starting {
  background: var(--gold);
  box-shadow: 0 0 8px var(--accent-glow);
  animation: blink 1.1s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.35;
  }
}
.name {
  font-family: var(--f-serif);
  font-size: 15px;
  letter-spacing: 0.14em;
  color: var(--text-hi);
}
.sub {
  font-size: 12px;
  color: var(--text-mut);
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acts {
  display: flex;
  gap: 8px;
  flex: none;
}
.abtn {
  border: 1px solid var(--hairline-strong);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 12.5px;
  padding: 6px 14px;
  border-radius: var(--r-pill);
  cursor: pointer;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}
.abtn:hover {
  color: var(--text-hi);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 14px var(--accent-glow);
}
.abtn.big {
  font-size: 14px;
  padding: 9px 26px;
  margin-top: 18px;
}
.frame-wrap {
  flex: 1;
  min-height: 0;
  border-radius: var(--r-xl);
  overflow: hidden;
  background: #06090f;
}
.frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: #06090f;
}
.gate {
  flex: 1;
  border-radius: var(--r-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
}
.g-title {
  font-family: var(--f-serif);
  font-size: 20px;
  letter-spacing: 0.14em;
  color: var(--text-hi);
  margin-bottom: 10px;
}
.g-sub {
  font-size: 13px;
  color: var(--text-mut);
  margin-bottom: 6px;
}
.g-help {
  font-size: 12.5px;
  color: var(--text-mut);
  line-height: 1.9;
  max-width: 460px;
}
.g-help code {
  color: var(--gold);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  padding: 1px 7px;
  font-size: 12px;
}
.pulse {
  margin-top: 22px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid var(--accent-glow);
  border-top-color: var(--gold);
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
