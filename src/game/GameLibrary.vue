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
  background: transparent;
  color: var(--text);
  font-family: var(--f-sans);
}
.head { display: flex; align-items: center; padding: 48px 36px 18px; }
.title { flex: 1; text-align: center; font-family: var(--f-serif); font-size: 26px; letter-spacing: 0.4em; color: var(--text-hi); text-indent: 0.4em; }
.clear {
  border: 1px solid var(--hairline-strong);
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  backdrop-filter: blur(18px) saturate(150%);
  color: var(--text-mut);
  padding: 7px 18px; border-radius: var(--r-pill); cursor: pointer; font-size: 12px;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.clear:hover { color: #d99a78; border-color: var(--accent-deep); }
/* 两块琉璃并排悬浮,不再用分割线切割 */
.body {
  flex: 1; display: grid; grid-template-columns: 320px 1fr; gap: 16px;
  overflow: hidden; padding: 6px 24px 24px;
}
.list {
  overflow-y: auto; padding: 12px;
  border-radius: var(--r-lg);
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  border: 1px solid var(--hairline);
  box-shadow: var(--edge-hi), var(--shadow-sm);
}
.empty { color: var(--text-dim); font-size: 13px; line-height: 2; text-align: center; padding: 40px 18px; }
.goc {
  display: block; margin: 18px auto 0;
  border: 1px solid rgba(224, 150, 88, 0.4);
  background: rgba(201, 139, 107, 0.16); color: var(--text-hi);
  border-radius: var(--r-sm); padding: 9px 18px; cursor: pointer; font-size: 13px;
  transition: background var(--dur) var(--ease);
}
.goc:hover { background: rgba(201, 139, 107, 0.28); }
.item {
  width: 100%; text-align: left; display: flex; align-items: center; gap: 8px;
  border: none; background: transparent; color: var(--text);
  padding: 10px 12px; border-radius: var(--r-sm); cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.item:hover { background: rgba(255, 240, 220, 0.05); }
.item.on { background: rgba(201, 139, 107, 0.16); box-shadow: inset 0 1px 0 rgba(255, 244, 230, 0.08); }
.nm { flex: 1; font-size: 14px; color: var(--text-hi); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kd { font-size: 11px; color: var(--text-dim); }
.del { width: 20px; height: 20px; line-height: 18px; text-align: center; border-radius: 50%; color: var(--text-dim); transition: background var(--dur) var(--ease), color var(--dur) var(--ease); }
.del:hover { background: rgba(180,60,50,0.5); color: #fff; }
.preview {
  overflow-y: auto; padding: 26px 32px;
  border-radius: var(--r-lg);
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  border: 1px solid var(--hairline);
  box-shadow: var(--edge-hi), var(--shadow-sm);
}
.pv-title { font-size: 15px; color: var(--text-hi); margin-bottom: 14px; letter-spacing: 0.05em; }
.content { font-family: var(--f-serif); font-size: 15px; line-height: 2; color: var(--text); white-space: pre-wrap; word-break: break-word; }
.muted { color: var(--text-dim); font-size: 13px; }
.muted.center { text-align: center; padding-top: 80px; }
</style>
