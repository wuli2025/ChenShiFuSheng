<script setup lang="ts">
import { ref } from 'vue';
import GSegmented from '../ui/GSegmented.vue';
import GButton from '../ui/GButton.vue';
import GChip from '../ui/GChip.vue';
import ChatTimeline from './ChatTimeline.vue';
import { SaveIcon, AudioIcon } from '../icons';

const rightTab = ref<'chat' | 'asset'>('chat');
const source = ref<'online' | 'local'>('online');
const saved = ref(false);

const cats = ['音效', '语音', '按钮', '背景', '立绘', '音乐'];
const folders = [
  { name: '古风情绪包', count: 12 },
  { name: '都市日常', count: 8 },
];
const rows = ref([
  { name: '古风·柔美·循环', added: false },
  { name: '古风·伤感·循环', added: true },
  { name: '雨夜·环境·长', added: false },
]);

const nodes = [
  { title: '序章 · 报到', tone: 'hl' },
  { title: '深夜急诊(隐藏)', tone: 'ai' },
  { title: '归乡开诊所', tone: 'gr' },
];

function save() {
  saved.value = true;
  setTimeout(() => (saved.value = false), 1600);
}
</script>

<template>
  <div class="edit">
    <section class="canvas">
      <div class="canvas-head">
        <h3>剧情图谱 · 极简示意</h3>
        <GButton variant="primary" @click="save">
          <SaveIcon /> {{ saved ? '已保存' : '保存' }}
        </GButton>
      </div>
      <div class="graph">
        <template v-for="(n, i) in nodes" :key="i">
          <div class="fnode" :class="n.tone">{{ n.title }}</div>
          <span v-if="i < nodes.length - 1" class="arrow">→</span>
        </template>
      </div>
      <p class="hint">拖拽节点即改分支 · 手点和对话改的是同一份 script.md</p>
    </section>

    <aside class="right">
      <GSegmented
        v-model="rightTab"
        :options="[{ value: 'chat', label: '对话' }, { value: 'asset', label: '素材库' }]"
      />

      <div v-if="rightTab === 'chat'" class="pane thin">
        <ChatTimeline compact />
      </div>

      <div v-else class="pane asset">
        <div class="src">
          <GChip :active="source === 'online'" @click="source = 'online'">● 在线</GChip>
          <GChip :active="source === 'local'" @click="source = 'local'">○ 本地</GChip>
        </div>
        <div class="cats">
          <GChip v-for="c in cats" :key="c">{{ c }}</GChip>
        </div>
        <div class="folders">
          <div v-for="f in folders" :key="f.name" class="folder">
            🗂 {{ f.name }} <span>{{ f.count }}</span>
          </div>
        </div>
        <div class="rows">
          <div v-for="r in rows" :key="r.name" class="arow">
            <span class="an"><AudioIcon /> {{ r.name }}</span>
            <button class="add" :class="{ on: r.added }" @click="r.added = !r.added">
              {{ r.added ? '✓已添加' : '＋添加' }}
            </button>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.edit { display: flex; height: 100%; gap: var(--sp-4); padding: var(--sp-4); }
.canvas { flex: 1; display: flex; flex-direction: column; gap: var(--sp-4); }
.canvas-head { display: flex; align-items: center; justify-content: space-between; }
.canvas-head h3 { font-size: 15px; color: var(--ink-1); }
.graph {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  border: 1px dashed var(--glass-line);
  border-radius: var(--r-lg);
  background: var(--glass);
  padding: var(--sp-4);
}
.fnode {
  background: var(--glass-strong);
  border: 1px solid var(--glass-line);
  border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3);
  font-size: 13px;
  box-shadow: var(--shadow-1);
  color: var(--ink-1);
}
.fnode.hl { border-color: var(--amber-soft); color: var(--amber); }
.fnode.ai { border-color: rgba(91, 143, 179, 0.55); color: var(--azure); }
.fnode.gr { border-color: rgba(79, 157, 122, 0.55); color: var(--jade); }
.arrow { color: var(--amber); font-size: 16px; }
.hint { font-size: 12px; color: var(--ink-3); text-align: center; }
.right {
  width: 320px;
  flex-shrink: 0;
  background: var(--glass);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  overflow-y: auto;
}
.pane.thin { overflow-y: auto; }
.src, .cats { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.src :deep(.g-chip), .folder .an { cursor: pointer; }
.folders { display: flex; flex-direction: column; gap: var(--sp-2); }
.folder {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm);
  background: var(--glass-strong); border: 1px solid var(--glass-line);
  font-size: 12.5px; color: var(--ink-2);
}
.folder span { color: var(--ink-3); }
.rows { display: flex; flex-direction: column; gap: var(--sp-2); }
.arow {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm);
  background: var(--glass-strong); border: 1px solid var(--glass-line);
}
.an { display: flex; align-items: center; gap: var(--sp-2); font-size: 12.5px; color: var(--ink-1); }
.an :deep(svg) { width: 15px; height: 15px; }
.add {
  border: 1px solid var(--amber-soft); background: transparent; color: var(--amber);
  border-radius: 999px; padding: 3px 10px; font-size: 11.5px; cursor: pointer; white-space: nowrap;
}
.add.on { background: rgba(79, 157, 122, 0.14); color: var(--jade); border-color: rgba(79, 157, 122, 0.5); }
</style>
