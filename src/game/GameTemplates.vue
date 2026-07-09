<script setup lang="ts">
// 故事线模板 —— 从爆款文案样本库里拉出的几套交互手法，落成可套用的模板；
// 每套标明落到本引擎哪个字段、配套哪一层「评判机制」(对照 UniPrism)，并给优劣与起草入口。
import { computed, ref } from "vue";
import { goCreateWith } from "./platform";
import { toast } from "../composables/useToast";
import {
  EVAL_LAYERS,
  filterTemplates,
  evalLayerOf,
  type LineKind,
  type StorylineTemplate,
} from "./templates";

type Tab = "all" | LineKind;
const tab = ref<Tab>("all");
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "narrative", label: "叙事向" },
  { key: "career", label: "职业向" },
];

const list = computed(() => filterTemplates(tab.value === "all" ? "all" : tab.value));

const open = ref<Record<string, boolean>>({});
function toggle(id: string) {
  open.value[id] = !open.value[id];
}

const LINE_LABEL: Record<LineKind, string> = {
  narrative: "叙事向",
  career: "职业向",
  both: "通用",
};

function draft(t: StorylineTemplate) {
  goCreateWith(t.seed);
  toast.success(`已带「${t.name}」骨架进入生成，改两笔就能开写`);
}

async function copySeed(t: StorylineTemplate) {
  try {
    await navigator.clipboard.writeText(t.seed);
    toast.success("模板骨架已复制");
  } catch {
    toast.error("复制失败，可手动选中");
  }
}

function layerNo(id: string): string {
  return EVAL_LAYERS.find((l) => l.id === id)?.no ?? "";
}
</script>

<template>
  <div class="tpl-root">
    <div class="scroll">
      <header class="head">
        <div class="kicker">STORYLINE TEMPLATES · 拉片提炼</div>
        <h1>故事线模板</h1>
        <p class="sub">
          从《爆款文案样本库》里挑出最贴合本引擎「场景图 + 加权抉择 + 复盘画像」结构的几套<b>交互手法</b>，
          落成可直接套用的模板。每套都标明它落到我们 schema 的哪个字段、配套哪一层「评判机制」，一键即可带骨架去生成。
        </p>
      </header>

      <!-- 模板方式的优劣 -->
      <div class="prosbar">
        <div class="pc good">
          <h4>模板化写法的好处</h4>
          <ul>
            <li>起稿快：从空白到有骨架，照着字段填。</li>
            <li>与引擎同构：直接落到 Scene / Choice / Ending / caps / tags，手写与 AI 生成都能消费。</li>
            <li>评判有抓手：每套自带「该挂哪层评判」，不会写完才发现没数据。</li>
            <li>可叠加：一条线能同时套多套（开场钩子＋复调抉择＋延迟代价＋意象结局），buff 叠满。</li>
          </ul>
        </div>
        <div class="pc warn">
          <h4>要警惕的代价</h4>
          <ul>
            <li>易套路化：几套反复用，不同剧本会「撞脸」，要在题材与文案上做变化。</li>
            <li>抄招不抄词：模板是手法不是文案，直接套原句会侵权、也失原创。</li>
            <li>过度模板伤沉浸：VN 叙事向若处处露评分/画像会打断代入 —— 职业向可重，叙事向要轻。</li>
            <li>评判要喂数据：tags / caps 得在写选项时就埋，补写成本高。</li>
          </ul>
        </div>
      </div>

      <!-- 评判五层 pipeline(对照 UniPrism) -->
      <section class="eval">
        <h2>配套的「评判机制」· 五层<span class="en">对照 UniPrism · 已在引擎落地</span></h2>
        <p class="lead">
          模板负责「怎么玩」，评判负责「玩完看见自己」。UniPrism 的评判是一条从「记录行为」到「给出方向建议」的链路，
          下面五层已全部实现于 <code>engine.ts / assess.ts</code>——每套模板的角标即它主要喂养的那一层。
        </p>
        <div class="layers">
          <div v-for="l in EVAL_LAYERS" :key="l.id" class="layer">
            <div class="lno">{{ l.no }}</div>
            <div class="lbody">
              <div class="lt">
                {{ l.title }}
                <span class="badge" :class="l.status">{{ l.status === "done" ? "已实现" : "半有" }}</span>
              </div>
              <div class="ld">{{ l.desc }}</div>
              <div class="lf"><code>{{ l.field }}</code></div>
            </div>
          </div>
        </div>
      </section>

      <!-- 线类型筛选 -->
      <div class="tabs">
        <button
          v-for="t in TABS"
          :key="t.key"
          class="tab"
          :class="{ on: tab === t.key }"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
        <span class="count">{{ list.length }} 套</span>
      </div>

      <!-- 模板卡 -->
      <section class="cards">
        <article
          v-for="t in list"
          :key="t.id"
          class="card"
          :class="{ open: open[t.id] }"
        >
          <div class="chead" @click="toggle(t.id)">
            <div class="ctitle">
              <span class="name">{{ t.name }}</span>
              <span class="line" :class="t.line">{{ LINE_LABEL[t.line] }}</span>
              <span class="evtag" v-if="t.evalLayer" :title="'配套评判层 ' + layerNo(t.evalLayer)">
                评判 {{ layerNo(t.evalLayer) }}
              </span>
            </div>
            <span class="chev">{{ open[t.id] ? "−" : "+" }}</span>
          </div>
          <div class="origin">原型：{{ t.origin }}</div>
          <p class="hook">{{ t.hook }}</p>

          <Transition name="expand">
            <div v-if="open[t.id]" class="cbody">
              <h5>交互结构 → 落到我们哪个字段</h5>
              <div class="fields">
                <div v-for="(f, i) in t.structure" :key="i" class="field">
                  <code>{{ f.slot }}</code>
                  <span>{{ f.desc }}</span>
                </div>
              </div>

              <h5>可套用示例 <i>（原创草样，抄招不抄词）</i></h5>
              <div class="samples">
                <div v-for="(s, i) in t.sample" :key="i" class="sample">
                  <span class="slbl">{{ s.label }}</span>
                  <p>{{ s.text }}</p>
                </div>
              </div>

              <div class="evalbox" v-if="t.evalNote">
                <span class="etitle">配套评判 · {{ layerNo(t.evalLayer) }} {{ evalLayerOf(t)?.title }}</span>
                <p>{{ t.evalNote }}</p>
              </div>

              <div class="pcgrid">
                <div class="col good">
                  <h6>优势</h6>
                  <ul><li v-for="(p, i) in t.pros" :key="i">{{ p }}</li></ul>
                </div>
                <div class="col warn">
                  <h6>局限</h6>
                  <ul><li v-for="(c, i) in t.cons" :key="i">{{ c }}</li></ul>
                </div>
              </div>

              <div class="actions">
                <button class="act primary" @click="draft(t)">以此模板起草 →</button>
                <button class="act" @click="copySeed(t)">复制骨架</button>
              </div>
            </div>
          </Transition>
        </article>
      </section>

      <footer class="foot">
        取材《职业体验沉浸式游戏 · 文案样本库(拉片)》与《UniPrism 评判机制对照分析》 ·
        模板存交互手法，非文案；产品文案须原创。
      </footer>
    </div>
  </div>
</template>

<style scoped>
.tpl-root {
  height: 100vh;
  overflow: hidden;
  color: #d8d2c4;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  padding-top: 44px;
}
.scroll {
  height: 100%;
  overflow-y: auto;
  max-width: 940px;
  margin: 0 auto;
  padding: 8px 28px 80px;
}
/* —— 头 —— */
.head { border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 20px; margin-bottom: 22px; }
.kicker { color: #9a7b3f; font-size: 12px; letter-spacing: 0.35em; }
.head h1 {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 28px; color: #ece3d0; letter-spacing: 0.18em; margin: 8px 0 10px;
}
.sub { color: #b0a998; font-size: 14px; line-height: 1.9; margin: 0; }
.sub b { color: #e0c4b3; font-weight: 600; }

/* —— 优劣 —— */
.prosbar { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 26px; }
@media (max-width: 720px) { .prosbar { grid-template-columns: 1fr; } }
.pc {
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  border: 1px solid var(--hairline);
  box-shadow: var(--edge-hi), var(--shadow-sm);
  border-radius: var(--r-md); padding: 16px 18px;
}
.pc.good { border-top: 3px solid #3f6b4f; }
.pc.warn { border-top: 3px solid #9e3b32; }
.pc h4 { margin: 0 0 10px; font-size: 14.5px; color: #ece3d0; }
.pc ul { margin: 0; padding-left: 18px; }
.pc li { font-size: 13px; line-height: 1.75; color: #bdb6a6; margin: 5px 0; }

/* —— 评判五层 —— */
.eval { margin-bottom: 28px; }
.eval h2 {
  font-family: "Songti SC", serif; font-size: 19px; color: #e6dcc7;
  letter-spacing: 0.1em; margin: 0 0 6px; display: flex; align-items: baseline; gap: 12px;
}
.eval h2 .en { font-family: sans-serif; font-size: 11px; letter-spacing: 0.2em; color: #7a8088; }
.lead { color: #a9a291; font-size: 13px; line-height: 1.85; margin: 0 0 14px; }
.lead code { background: rgba(255, 255, 255, 0.07); padding: 1px 6px; border-radius: 4px; font-size: 12px; color: #cbb79a; }
.layers { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.layer {
  display: flex; gap: 12px;
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--hairline);
  box-shadow: var(--edge-hi);
  border-radius: var(--r-md); padding: 13px 15px;
}
.lno {
  flex: none; font-family: "Songti SC", serif; font-size: 20px;
  color: #c98b6b; line-height: 1;
}
.lt { font-size: 13.5px; color: #e6dcc7; font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge { font-size: 10px; padding: 1px 7px; border-radius: 20px; letter-spacing: 0.05em; }
.badge.done { background: rgba(63, 107, 79, 0.28); color: #8fc7a3; }
.badge.partial { background: rgba(154, 123, 63, 0.28); color: #d8bd82; }
.ld { font-size: 12px; color: #a9a291; line-height: 1.7; margin: 5px 0; }
.lf code { font-size: 11px; color: #8f96a0; background: rgba(255, 255, 255, 0.05); padding: 1px 5px; border-radius: 4px; word-break: break-all; }

/* —— 筛选 —— */
.tabs { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.tab {
  border: 1px solid var(--hairline-strong);
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  backdrop-filter: blur(16px) saturate(150%);
  color: #b0a998; border-radius: var(--r-pill); padding: 6px 18px; font-size: 13px; cursor: pointer;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.tab:hover { color: var(--text-hi); border-color: var(--accent); }
.tab.on {
  background: rgba(201, 120, 79, 0.24); border-color: var(--accent-deep); color: var(--text-hi);
  box-shadow: inset 0 1px 0 rgba(255, 244, 230, 0.12);
}
.count { margin-left: auto; font-size: 12px; color: #6c727c; }

/* —— 模板卡 —— */
.cards { display: flex; flex-direction: column; gap: 14px; }
.card {
  background: var(--glass-soft);
  -webkit-backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  border: 1px solid var(--hairline);
  box-shadow: var(--edge-hi), var(--shadow-sm);
  border-radius: var(--r-lg); padding: 16px 20px;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}
.card.open {
  border-color: rgba(201, 139, 107, 0.38);
  background: rgba(60, 39, 24, 0.36);
  box-shadow: var(--edge-hi-strong), var(--shadow-md);
}
.chead { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
.ctitle { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.name { font-family: "Songti SC", serif; font-size: 18px; color: #f0e9da; letter-spacing: 0.06em; }
.line { font-size: 11px; padding: 1px 9px; border-radius: 20px; }
.line.narrative { background: rgba(63, 107, 79, 0.25); color: #8fc7a3; }
.line.career { background: rgba(44, 70, 97, 0.4); color: #9fbfda; }
.line.both { background: rgba(154, 123, 63, 0.25); color: #d8bd82; }
.evtag { font-size: 11px; color: #c98b6b; border: 1px solid rgba(201, 139, 107, 0.4); border-radius: 5px; padding: 1px 7px; }
.chev { font-size: 22px; color: #8a8f98; line-height: 1; flex: none; }
.origin { font-size: 12px; color: #8a8f98; margin: 8px 0 6px; }
.hook { font-size: 13.5px; line-height: 1.85; color: #cfc8ba; margin: 0; }

.cbody { margin-top: 14px; border-top: 1px dashed rgba(255, 255, 255, 0.1); padding-top: 14px; }
.cbody h5 { font-size: 13px; color: #e0c4b3; margin: 14px 0 8px; letter-spacing: 0.05em; }
.cbody h5:first-child { margin-top: 0; }
.cbody h5 i { font-style: normal; font-size: 11px; color: #6c727c; }
.fields { display: flex; flex-direction: column; gap: 7px; }
.field { display: flex; gap: 10px; align-items: baseline; font-size: 12.5px; line-height: 1.7; }
.field code {
  flex: none; background: rgba(44, 70, 97, 0.35); color: #a9c6de;
  padding: 1px 7px; border-radius: 5px; font-size: 11.5px; white-space: nowrap;
}
.field span { color: #b6b0a3; }
.samples { display: flex; flex-direction: column; gap: 8px; }
.sample {
  background: rgba(154, 123, 63, 0.08); border-left: 3px solid #9a7b3f;
  border-radius: 0 8px 8px 0; padding: 8px 14px;
}
.slbl { font-size: 11px; color: #c8a659; letter-spacing: 0.08em; }
.sample p { margin: 4px 0 0; font-size: 13px; line-height: 1.8; color: #d5cebd; font-family: "Songti SC", serif; }

.evalbox {
  margin-top: 14px; background: rgba(44, 70, 97, 0.16);
  border: 1px solid rgba(120, 150, 180, 0.22); border-left: 3px solid #5a7ea0;
  border-radius: 0 8px 8px 0; padding: 10px 14px;
}
.etitle { font-size: 12px; color: #9fbfda; font-weight: 600; letter-spacing: 0.04em; }
.evalbox p { margin: 5px 0 0; font-size: 12.5px; line-height: 1.75; color: #b6c3cf; }

.pcgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
@media (max-width: 560px) { .pcgrid { grid-template-columns: 1fr; } }
.col h6 { margin: 0 0 6px; font-size: 12.5px; }
.col.good h6 { color: #8fc7a3; }
.col.warn h6 { color: #d99a92; }
.col ul { margin: 0; padding-left: 16px; }
.col li { font-size: 12px; line-height: 1.7; color: #b0a998; margin: 4px 0; }

.actions { display: flex; gap: 10px; margin-top: 18px; }
.act {
  border: 1px solid var(--hairline-strong); background: transparent;
  color: var(--text); border-radius: var(--r-pill); padding: 8px 20px; font-size: 13px; cursor: pointer;
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease),
    background var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.act:hover { border-color: var(--accent); color: var(--text-hi); transform: translateY(-1px); }
.act:active { transform: scale(0.97); }
.act.primary { border-color: var(--accent-deep); background: rgba(201, 139, 107, 0.18); color: var(--text-hi); }

.foot { margin-top: 34px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 11.5px; color: #6c727c; text-align: center; line-height: 1.7; }

/* 展开动画 */
.expand-enter-active, .expand-leave-active { transition: opacity 0.22s ease; }
.expand-enter-from, .expand-leave-to { opacity: 0; }
</style>
