<script setup lang="ts">
// 资料库：只显示「游戏上传库」（与 Polaris 知识库分离，默认空）。
// 这些资料用于生成时注入，不来自、也不写入 Polaris KB。
import { onMounted, ref } from "vue";
import {
  listUploads,
  removeUpload,
  clearUploads,
  type UploadItem,
} from "./uploadsStore";
import { goCreate } from "./platform";
import { toast } from "../composables/useToast";

const items = ref<UploadItem[]>([]);
const current = ref<UploadItem | null>(null);

function load() {
  items.value = listUploads();
}

function open(it: UploadItem) {
  current.value = it;
}

function onRemove(id: string, e: Event) {
  e.stopPropagation();
  removeUpload(id);
  if (current.value?.id === id) current.value = null;
  load();
  toast.info("已移除");
}

function onClear() {
  clearUploads();
  current.value = null;
  load();
  toast.info("资料库已清空");
}

onMounted(load);
</script>

<template>
  <div class="lib-root">
    <header class="head">
      <div class="title">资 料 库</div>
      <button v-if="items.length" class="clear" @click="onClear">清空</button>
    </header>

    <div class="body">
      <aside class="list">
        <div v-if="items.length === 0" class="empty">
          资料库为空。<br />在「生成」页上传文件（文档 / 图片），会出现在这里，并用于注入生成。
          <button class="goc" @click="goCreate">去生成页上传 →</button>
        </div>
        <button
          v-for="it in items"
          :key="it.id"
          class="item"
          :class="{ on: current && it.id === current.id }"
          @click="open(it)"
        >
          <span class="nm">{{ it.name }}</span>
          <span class="kd">{{ it.kind }}</span>
          <span class="del" title="移除" @click="onRemove(it.id, $event)">×</span>
        </button>
      </aside>
      <section class="preview">
        <div v-if="!current" class="muted center">从左侧选择一份资料预览。</div>
        <template v-else>
          <div class="pv-title">{{ current.name }}</div>
          <pre v-if="current.text" class="content">{{ current.text }}</pre>
          <div v-else class="muted center">（图片 / 无文本内容）</div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lib-root {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(120% 80% at 50% -10%, #1a1d22, #0b0c0e 60%);
  color: #d8d2c4;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.head { display: flex; align-items: center; padding: 24px 36px 16px; }
.title { flex: 1; text-align: center; font-family: "Songti SC", serif; font-size: 24px; letter-spacing: 0.4em; color: #ece3d0; }
.clear { border: 1px solid rgba(255,255,255,0.14); background: transparent; color: #9aa1ab; padding: 6px 16px; border-radius: 999px; cursor: pointer; font-size: 12px; }
.clear:hover { color: #cf8466; border-color: #b5654a; }
.body { flex: 1; display: grid; grid-template-columns: 320px 1fr; overflow: hidden; }
.list { border-right: 1px solid rgba(255, 255, 255, 0.07); overflow-y: auto; padding: 12px; }
.empty { color: #6c727c; font-size: 13px; line-height: 2; text-align: center; padding: 40px 18px; }
.goc { display: block; margin: 18px auto 0; border: 1px solid #b5654a; background: rgba(201,139,107,0.14); color: #f0e9da; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
.item { width: 100%; text-align: left; display: flex; align-items: center; gap: 8px; border: none; background: transparent; color: #cfc8ba; padding: 10px 12px; border-radius: 8px; cursor: pointer; }
.item:hover { background: rgba(255, 255, 255, 0.04); }
.item.on { background: rgba(201, 139, 107, 0.12); }
.nm { flex: 1; font-size: 14px; color: #ece3d0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kd { font-size: 11px; color: #6c727c; }
.del { width: 20px; height: 20px; line-height: 18px; text-align: center; border-radius: 50%; color: #8a8f98; }
.del:hover { background: rgba(180,60,50,0.5); color: #fff; }
.preview { overflow-y: auto; padding: 26px 32px; }
.pv-title { font-size: 15px; color: #ece3d0; margin-bottom: 14px; letter-spacing: 0.05em; }
.content { font-family: "Songti SC", serif; font-size: 15px; line-height: 2; color: #d8d2c4; white-space: pre-wrap; word-break: break-word; }
.muted { color: #6c727c; font-size: 13px; }
.muted.center { text-align: center; padding-top: 80px; }
</style>
