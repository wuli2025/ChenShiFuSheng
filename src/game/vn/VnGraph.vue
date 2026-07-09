<script setup lang="ts">
// VnGraph —— 剧情图谱(SVG 曲线 + 玻璃节点卡):按幕分列自动布局,可拖节点/平移/滚轮缩放
import { computed, onMounted, reactive, ref, watch } from "vue";

interface GpOpt { t: string; to: string }
interface GpScene {
  name: string; ch?: string | null; bg?: string; imgPrompt?: string; bgManual?: boolean;
  ending?: boolean; tier?: string; choice?: { q: string; opts: GpOpt[] }; next?: string;
}
interface Gp { meta?: any; chapters: { id: string; name: string; scenes: string[] }[]; scenes: Record<string, GpScene> }

const props = defineProps<{ gp: Gp; assets: string[] }>();
const emit = defineEmits<{ (e: "pick", id: string): void; (e: "play", id: string): void }>();

const NW = 176, NH = 60, COLW = 300, X0 = 64, Y0 = 96, ROWH = 104;
const TIER_COLOR: Record<string, string> = { 传奇: "#e3b341", 隐藏: "#9d7bd8", 悲喜: "#b8524f", 普通: "#7c8b96" };

const pos = reactive<Record<string, { x: number; y: number }>>({});
const scale = ref(0.85);
const tx = ref(40);
const ty = ref(20);
const sel = ref("");
const wrapEl = ref<HTMLElement | null>(null);

function layout() {
  const seen = new Set<string>();
  const chs = props.gp?.chapters || [];
  chs.forEach((ch, ci) => {
    let row = 0;
    (ch.scenes || []).forEach(id => {
      if (seen.has(id)) return;
      seen.add(id);
      if (!pos[id]) pos[id] = { x: X0 + ci * COLW, y: Y0 + row * ROWH };
      row++;
    });
  });
  let orow = 0; // 不属于任何幕的孤儿场景放最后一列
  Object.keys(props.gp?.scenes || {}).forEach(id => {
    if (seen.has(id)) return;
    seen.add(id);
    if (!pos[id]) pos[id] = { x: X0 + chs.length * COLW, y: Y0 + orow * ROWH };
    orow++;
  });
  Object.keys(pos).forEach(id => { if (!seen.has(id)) delete pos[id]; });
}
watch(() => props.gp, () => { layout(); }, { immediate: true });

const nodes = computed(() => Object.keys(pos)
  .filter(id => props.gp?.scenes?.[id])
  .map(id => ({ id, sc: props.gp.scenes[id], p: pos[id] })));

function hasImg(sc: GpScene): boolean {
  if (!sc.bg) return false;
  return props.assets.includes(sc.bg) || props.assets.includes(sc.bg.replace(/\.jpg$/i, ".png"));
}
function tierColor(sc: GpScene): string { return TIER_COLOR[sc.tier || "普通"] || TIER_COLOR["普通"]; }

interface Edge { key: string; from: string; to: string; d: string; choice: boolean; lit: boolean; label?: string; lx?: number; ly?: number; lw?: number }
const edges = computed<Edge[]>(() => {
  const out: Edge[] = [];
  const scenes = props.gp?.scenes || {};
  for (const id of Object.keys(scenes)) {
    const sc = scenes[id], p1 = pos[id];
    if (!p1) continue;
    const outs: { to: string; label?: string }[] = [];
    if (sc.choice?.opts) sc.choice.opts.forEach(o => { if (o.to) outs.push({ to: o.to, label: (o.t || "").slice(0, 8) }); });
    else if (sc.next) outs.push({ to: sc.next });
    const labeled = outs.filter(o => o.label).length;
    let li = 0;
    outs.forEach((o, oi) => {
      const p2 = pos[o.to];
      if (!p2) return;
      const x1 = p1.x + NW, y1 = p1.y + NH / 2, x2 = p2.x, y2 = p2.y + NH / 2;
      const cm = (x1 + x2) / 2;
      const e: Edge = {
        key: id + "→" + o.to + "#" + oi, from: id, to: o.to, choice: !!o.label,
        d: `M${x1} ${y1} C ${cm} ${y1}, ${cm} ${y2}, ${x2} ${y2}`,
        lit: !!sel.value && (id === sel.value || o.to === sel.value),
      };
      if (o.label) {
        e.label = o.label;
        e.lx = x1 + 24;
        e.ly = y1 + (li - (labeled - 1) / 2) * 17;
        e.lw = o.label.length * 11 + 14;
        li++;
      }
      out.push(e);
    });
  }
  return out;
});

const ext = computed(() => {
  let w = 900, h = 640;
  Object.values(pos).forEach(p => { w = Math.max(w, p.x + NW + 220); h = Math.max(h, p.y + NH + 160); });
  return { w, h };
});

const cols = computed(() => {
  const chs = props.gp?.chapters || [];
  return chs.map((ch, ci) => ({ id: ch.id, name: ch.name, x: X0 + ci * COLW, h: ext.value.h - 80 }));
});

/* ---------- 交互:拖节点 / 平移 / 缩放 ---------- */
let dragN: { id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;
let panning: { px: number; py: number } | null = null;

function onDown(e: PointerEvent) {
  const nel = (e.target as HTMLElement).closest?.(".vgn") as HTMLElement | null;
  if (nel?.dataset.id && pos[nel.dataset.id]) {
    const id = nel.dataset.id;
    dragN = { id, sx: e.clientX, sy: e.clientY, ox: pos[id].x, oy: pos[id].y, moved: false };
  } else {
    panning = { px: e.clientX - tx.value, py: e.clientY - ty.value };
  }
  wrapEl.value?.setPointerCapture(e.pointerId);
}
function onMove(e: PointerEvent) {
  if (dragN) {
    const dx = (e.clientX - dragN.sx) / scale.value, dy = (e.clientY - dragN.sy) / scale.value;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragN.moved = true;
    if (dragN.moved) {
      pos[dragN.id].x = Math.max(0, dragN.ox + dx);
      pos[dragN.id].y = Math.max(0, dragN.oy + dy);
    }
  } else if (panning) {
    tx.value = e.clientX - panning.px;
    ty.value = e.clientY - panning.py;
  }
}
function onUp() {
  if (dragN && !dragN.moved) { sel.value = dragN.id; emit("pick", dragN.id); }
  dragN = null;
  panning = null;
}
function onDbl(e: MouseEvent) {
  const nel = (e.target as HTMLElement).closest?.(".vgn") as HTMLElement | null;
  if (nel?.dataset.id) emit("play", nel.dataset.id);
}
function zoomAt(cx: number, cy: number, k: number) {
  const ns = Math.min(1.6, Math.max(0.25, scale.value * k));
  tx.value = cx - (cx - tx.value) * (ns / scale.value);
  ty.value = cy - (cy - ty.value) * (ns / scale.value);
  scale.value = ns;
}
function onWheel(e: WheelEvent) {
  const r = wrapEl.value?.getBoundingClientRect();
  if (!r) return;
  zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 0.9);
}
function zoomBtn(k: number) {
  const r = wrapEl.value?.getBoundingClientRect();
  if (r) zoomAt(r.width / 2, r.height / 2, k);
}
function fit() {
  const ps = Object.values(pos);
  const r = wrapEl.value?.getBoundingClientRect();
  if (!ps.length || !r) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  ps.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + NW); y1 = Math.max(y1, p.y + NH + 20); });
  const s = Math.min(1.3, Math.max(0.25, Math.min((r.width - 100) / (x1 - x0), (r.height - 140) / (y1 - y0))));
  scale.value = s;
  tx.value = (r.width - (x1 - x0) * s) / 2 - x0 * s;
  ty.value = (r.height - (y1 - y0) * s) / 2 - y0 * s + 14;
}
onMounted(() => { fit(); });
defineExpose({ fit });
</script>

<template>
  <div ref="wrapEl" class="vg"
       @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"
       @dblclick="onDbl" @wheel.prevent="onWheel">
    <div class="vg-inner" :style="{ transform: `translate(${tx}px,${ty}px) scale(${scale})` }">
      <svg class="vg-svg" :width="ext.w" :height="ext.h">
        <defs>
          <marker id="vg-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="#4a5c78" />
          </marker>
        </defs>
        <path v-for="e in edges" :key="e.key" class="edge" :class="{ ch: e.choice, lit: e.lit }" :d="e.d" marker-end="url(#vg-arr)" />
        <g v-for="e in edges.filter(x => x.label)" :key="'l' + e.key">
          <rect class="elab-bg" :x="e.lx! - 5" :y="e.ly! - 11" :width="e.lw" height="17" rx="8" />
          <text class="elab" :x="e.lx" :y="e.ly! + 2">{{ e.label }}</text>
        </g>
      </svg>
      <div v-for="c in cols" :key="c.id" class="vg-col" :style="{ left: c.x - 26 + 'px', top: '28px', height: c.h + 'px' }"></div>
      <div v-for="c in cols" :key="'h' + c.id" class="vg-cap" :style="{ left: c.x + 'px', top: '44px' }">{{ c.name }}</div>
      <div v-for="n in nodes" :key="n.id" class="vgn" :data-id="n.id"
           :class="{ sel: sel === n.id, ending: n.sc.ending }"
           :style="{ left: n.p.x + 'px', top: n.p.y + 'px', width: NW + 'px', minHeight: NH + 'px',
                     borderColor: sel === n.id ? 'var(--gold)' : n.sc.ending ? tierColor(n.sc) : '' }">
        <div class="vgn-name">
          <i class="st" :class="{ on: hasImg(n.sc) }"></i>
          <span>{{ n.sc.name || n.id }}</span>
        </div>
        <div class="vgn-id">{{ n.id }}</div>
        <div v-if="n.sc.ending" class="vgn-tier" :style="{ color: tierColor(n.sc) }">结局 · {{ n.sc.tier || "普通" }}</div>
      </div>
    </div>
    <div class="vg-zoom glass">
      <button title="放大" @click="zoomBtn(1.2)">＋</button>
      <button title="缩小" @click="zoomBtn(1 / 1.2)">－</button>
      <button title="适配全图" @click="fit()">⤢</button>
    </div>
    <div class="vg-hint glass-soft">拖节点=布局 · 点节点=右侧对话改稿 · 双击=从此试玩 · 滚轮缩放</div>
  </div>
</template>

<style scoped>
.vg { position: relative; width: 100%; height: 100%; overflow: hidden; cursor: grab; border-radius: var(--r-lg);
  background: radial-gradient(1400px 720px at 24% -6%, rgba(26, 38, 58, 0.55) 0%, rgba(13, 18, 26, 0.5) 55%, rgba(7, 10, 16, 0.55) 100%); }
.vg:active { cursor: grabbing; }
.vg::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(rgba(226, 238, 252, 0.05) 1px, transparent 1px); background-size: 28px 28px;
  -webkit-mask-image: radial-gradient(1200px 700px at 32% 22%, #000, transparent 92%);
  mask-image: radial-gradient(1200px 700px at 32% 22%, #000, transparent 92%); }
.vg-inner { position: absolute; transform-origin: 0 0; }
.vg-svg { position: absolute; top: 0; left: 0; overflow: visible; pointer-events: none; }
.edge { fill: none; stroke: #48597a; stroke-width: 1.6; opacity: 0.9; transition: opacity var(--dur) var(--ease); }
.edge.ch { stroke: #6d84a8; stroke-dasharray: 5 4; }
.edge.lit { stroke: var(--gold); stroke-width: 2.4; opacity: 1; filter: drop-shadow(0 0 5px rgba(227, 179, 65, 0.55)); }
.elab-bg { fill: rgba(9, 13, 20, 0.85); stroke: rgba(226, 238, 252, 0.08); stroke-width: 0.6; }
.elab { font-size: 10.5px; fill: #8fa2ba; }
.vg-col { position: absolute; width: 252px; border-radius: var(--r-lg); pointer-events: none;
  background: linear-gradient(180deg, rgba(226, 238, 252, 0.028), rgba(226, 238, 252, 0.006) 55%, transparent);
  border: 1px solid rgba(226, 238, 252, 0.04); }
.vg-cap { position: absolute; font-family: var(--f-serif); font-size: 12.5px; letter-spacing: 0.3em; color: var(--text-dim);
  pointer-events: none; white-space: nowrap; padding-left: 2px; }
.vgn { position: absolute; box-sizing: border-box; padding: 8px 12px 9px; border-radius: var(--r-md); cursor: pointer; user-select: none;
  background: linear-gradient(165deg, rgba(33, 45, 67, 0.92), rgba(19, 27, 42, 0.9));
  border: 1px solid var(--hairline-strong); box-shadow: var(--edge-hi), 0 4px 14px -6px rgba(0, 0, 0, 0.55);
  transition: box-shadow var(--dur) var(--ease), border-color var(--dur) var(--ease); }
.vgn:hover { border-color: rgba(227, 179, 65, 0.5); box-shadow: var(--edge-hi), 0 8px 26px -8px rgba(0, 0, 0, 0.7); }
.vgn.sel { box-shadow: 0 0 0 2px rgba(227, 179, 65, 0.85), 0 0 26px -4px rgba(227, 179, 65, 0.45); }
.vgn.ending { background: linear-gradient(165deg, rgba(50, 41, 22, 0.9), rgba(28, 22, 12, 0.92)); }
.vgn-name { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-hi); line-height: 1.35; letter-spacing: 0.02em; }
.vgn-name .st { flex: none; width: 7px; height: 7px; border-radius: 50%; background: rgba(226, 238, 252, 0.16); }
.vgn-name .st.on { background: #5fce7b; box-shadow: 0 0 7px rgba(95, 206, 123, 0.7); }
.vgn-id { margin-top: 3px; font-family: "Cascadia Code", Consolas, monospace; font-size: 9.5px; color: #5f7089; letter-spacing: 0.04em; }
.vgn-tier { margin-top: 4px; font-size: 10.5px; letter-spacing: 0.08em; }
.vg-zoom { position: absolute; right: 14px; bottom: 14px; display: flex; flex-direction: column; gap: 3px; padding: 5px; border-radius: var(--r-md); z-index: 4; }
.vg-zoom button { width: 32px; height: 32px; border: none; background: transparent; color: var(--text); font-size: 15px;
  border-radius: var(--r-sm); cursor: pointer; transition: background var(--dur) var(--ease), color var(--dur) var(--ease); }
.vg-zoom button:hover { background: var(--glass-press); color: var(--text-hi); }
.vg-hint { position: absolute; left: 14px; bottom: 14px; padding: 6px 14px; border-radius: var(--r-pill);
  font-size: 11.5px; color: var(--text-mut); z-index: 4; pointer-events: none; }
</style>
