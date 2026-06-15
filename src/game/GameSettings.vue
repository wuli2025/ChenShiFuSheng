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
import { provider, type ProviderView } from "../tauri";
import { toast } from "../composables/useToast";

const img = ref<ImageCfg>(getImageCfg());

const providers = ref<ProviderView[]>([]);
const currentId = ref("");
const loadingProviders = ref(true);

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

onMounted(loadProviders);
</script>

<template>
  <div class="set-root">
    <header class="head">
      <div class="title">设置 · 模型 API</div>
    </header>

    <div class="wrap">
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
  background: radial-gradient(120% 80% at 50% -10%, #1a1d22, #0b0c0e 60%);
  color: #d8d2c4;
  padding: 44px 40px 48px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.head { display: flex; align-items: center; max-width: 760px; margin: 0 auto 26px; }
.title { flex: 1; text-align: center; font-family: "Songti SC", serif; font-size: 24px; letter-spacing: 0.3em; color: #ece3d0; }
.back { border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.03); color: #9aa1ab; padding: 7px 16px; border-radius: 999px; cursor: pointer; font-size: 13px; }
.back:hover { color: #ece3d0; }
.wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
.card { border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; background: rgba(255, 255, 255, 0.015); padding: 22px 24px; }
.card.locked { background: rgba(0, 0, 0, 0.25); }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.card-head strong { color: #ece3d0; font-size: 16px; }
.hint { font-size: 12px; color: #8a8f98; }
.lock { font-size: 11px; color: #cf8466; border: 1px dashed #b5654a; border-radius: 6px; padding: 2px 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.chip { border: 1px solid rgba(138, 162, 184, 0.4); color: #cfc8ba; background: transparent; border-radius: 18px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
.chip.on { background: rgba(44, 70, 97, 0.55); border-color: #8aa2b8; color: #ece3d0; }
.f { display: flex; align-items: center; gap: 12px; margin: 9px 0; font-size: 13px; }
.f > label { width: 78px; color: #8a8f98; }
.in { flex: 1; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 7px; padding: 8px 11px; color: #e4ddce; font-size: 13px; }
.in:focus { outline: none; border-color: #c98b6b; }
.sw { display: flex; align-items: center; gap: 8px; color: #cfc8ba; cursor: pointer; }
.card-foot { margin-top: 14px; text-align: right; }
.save { border: 1px solid #b5654a; background: rgba(201, 139, 107, 0.16); color: #f0e9da; border-radius: 8px; padding: 8px 22px; cursor: pointer; font-size: 14px; }
.loading { color: #8a8f98; font-size: 13px; }
.provider-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; max-height: 320px; overflow-y: auto; }
.prov { display: flex; align-items: center; gap: 10px; text-align: left; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.02); border-radius: 8px; padding: 10px 14px; cursor: pointer; color: #cfc8ba; }
.prov:hover { border-color: rgba(138, 162, 184, 0.6); }
.prov.on { border-color: #c98b6b; background: rgba(201, 139, 107, 0.1); }
.pn { font-size: 14px; color: #ece3d0; }
.pc { font-size: 11px; color: #6c727c; }
.cur { margin-left: auto; font-size: 11px; color: #cf8466; }
.note { font-size: 13px; line-height: 1.9; color: #9aa1ab; }
.note b { color: #cdb89a; }
</style>
