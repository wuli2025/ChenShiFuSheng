<script setup lang="ts">
// 灵动工坊 —— VN 动效叙事生产线(参照「尘世画布·工作台」交互重制)
// 对话式创建向导 → AI 写稿(进度进对话流) → 剧本/图谱/生图/历史 四页签
// 图谱点节点 → 右侧对话抽屉 AI 改稿(应用才落盘);剧本先行,定稿解锁生图。
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { invoke } from "../tauri";
import { compile, type CompileResult, type VNProject } from "./vn/compile";
import {
  buildPlayHtml, collectJobs, exportStandalone, genImages, saveAndCompile, writeScript,
  type ImgJob,
} from "./vn/pipeline";
import { WIZARD_STEPS, EXAMPLE_BRIEF, buildBrief, actsOf, runResearch, type WizardAnswers } from "./vn/wizard";
import { chatRevise, applyBlocks, type ChatMsg } from "./vn/revise";
import VnGraph from "./vn/VnGraph.vue";

interface VnInfo {
  name: string;
  meta: Record<string, any>;
  has_script: boolean;
  has_project: boolean;
  img_done: number;
}

/* ================= 基础状态 ================= */
const projects = ref<VnInfo[]>([]);
const cur = ref<string>("");           // 当前打开的项目名;空 = 列表页
const tab = ref<"script" | "graph" | "imgs" | "history">("script");
const script = ref("");
const dirty = ref(false);
const rep = ref<CompileResult | null>(null);
const proj = ref<VNProject | null>(null);
const gpData = ref<any>(null);
const gpError = ref("");
const meta = reactive<Record<string, any>>({});
const log = ref<string[]>([]);
const phase = ref("");
const busy = ref<"" | "write" | "gen" | "export">("");
const auth = ref<any>(null);
const jobs = ref<ImgJob[]>([]);
const assets = ref<string[]>([]);
const covers = reactive<Record<string, string>>({});
const thumbs = reactive<Record<string, string>>({});
const preview = ref<{ file: string; url: string } | null>(null);
const playHtml = ref("");
const toastMsg = ref<{ t: string; kind: string } | null>(null);
const edEl = ref<HTMLTextAreaElement | null>(null);

let toastTimer: any = null;
function toast(t: string, kind = "ok") {
  toastMsg.value = { t, kind };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = null), 3600);
}
function pushLog(msg: string, ph?: string) {
  log.value.push(msg);
  if (log.value.length > 200) log.value.splice(0, log.value.length - 200);
  if (ph) phase.value = ph;
}

async function refresh() {
  try {
    projects.value = await invoke<VnInfo[]>("vn_list");
    loadCovers();
  } catch (e: any) {
    toast("读取项目失败: " + (e?.message || e), "err");
  }
  try { auth.value = await invoke("vn_probe_auth"); } catch (_) { /* 忽略 */ }
}
async function loadCovers() {
  for (const p of projects.value) {
    if (covers[p.name] !== undefined || !p.img_done) continue;
    covers[p.name] = "";
    for (const f of ["bg_title.png", "bg_title.jpg"]) {
      try { covers[p.name] = await invoke<string>("vn_asset_b64", { name: p.name, file: f }); break; }
      catch (_) { /* 试下一个扩展名 */ }
    }
  }
}

async function loadProjectData() {
  proj.value = null;
  try {
    const js = await invoke<string>("vn_read_file", { name: cur.value, file: "project.js" });
    const w: any = {};
    new Function("window", js)(w);
    proj.value = w.VN_PROJECT || null;
    if (w.GAME_PROJECT && !gpData.value) gpData.value = w.GAME_PROJECT;
  } catch (_) { /* 尚未编译 */ }
  try { assets.value = await invoke<string[]>("vn_list_assets", { name: cur.value }); } catch (_) { assets.value = []; }
  if (proj.value) jobs.value = await collectJobs(cur.value, proj.value, false);
  else jobs.value = [];
}

async function openProject(name: string) {
  cur.value = name;
  tab.value = "script";
  script.value = ""; dirty.value = false; rep.value = null; gpData.value = null; gpError.value = "";
  log.value = []; phase.value = "";
  Object.keys(thumbs).forEach(k => delete thumbs[k]);
  Object.keys(meta).forEach(k => delete meta[k]);
  closeDrawer();
  const info = projects.value.find(p => p.name === name);
  if (info) Object.assign(meta, info.meta);
  try {
    script.value = await invoke<string>("vn_read_file", { name, file: "script.md" });
  } catch (_) { /* 尚无剧本 */ }
  await loadProjectData();
}
function backToList() {
  if (dirty.value && !confirm("剧本有未保存修改,确定离开?")) return;
  closeDrawer();
  cur.value = "";
  refresh();
}
async function delProject(name: string) {
  if (!confirm(`删除项目「${name}」?(整个目录会被移除)`)) return;
  try { await invoke("vn_delete", { name }); delete covers[name]; refresh(); }
  catch (e: any) { toast(e?.message || String(e), "err"); }
}

/* ================= 对话式创建向导 ================= */
interface WizBubble { role: "ai" | "user" | "err" | "prog"; text: string }
const wiz = reactive({
  open: false,
  mode: "create" as "create" | "rewrite",
  step: 0,
  answers: {} as WizardAnswers,
  bubbles: [] as WizBubble[],
  input: "",
  stage: "steps" as "steps" | "summary" | "producing" | "error",
  name: "",
  created: false,
  research: "",
});
const wizChatEl = ref<HTMLElement | null>(null);
const wizStep = computed(() => WIZARD_STEPS[Math.min(wiz.step, WIZARD_STEPS.length - 1)]);
function wizScroll() {
  nextTick(() => { const el = wizChatEl.value; if (el) el.scrollTop = el.scrollHeight; });
}
function deriveName(story: string): string {
  const s = (story || "").replace(/[^一-龥A-Za-z0-9]/g, "");
  return s.slice(0, 6) || "新作";
}
function openWizard(mode: "create" | "rewrite", prefillStory?: string) {
  wiz.open = true; wiz.mode = mode; wiz.step = 0;
  wiz.answers = {}; wiz.bubbles = []; wiz.stage = "steps";
  wiz.name = ""; wiz.created = false; wiz.research = "";
  wiz.input = prefillStory || "";
  const hello = mode === "rewrite"
    ? "这次是整稿重写——旧稿会自动备份到项目 备份/ 目录。我们把设定重新过一遍。"
    : "我们像聊天一样把这部作品聊出来:十个问题,点选项或自由输入都行,随时「上一步」反悔。";
  wiz.bubbles.push({ role: "ai", text: hello + "\n\n" + WIZARD_STEPS[0].ask });
  wizScroll();
}
function closeWizard() {
  if (wiz.stage === "producing") return toast("生产进行中,先等它跑完", "err");
  wiz.open = false;
}
function wizAnswer(text: string) {
  if (wiz.stage !== "steps") return;
  const st = wizStep.value;
  const t = text.trim();
  if (!t && !st.optional) return toast("这一步不能跳过,选一个或写几个字", "err");
  wiz.bubbles.push({ role: "user", text: t || "(跳过)" });
  if (t) wiz.answers[st.key] = t; else delete wiz.answers[st.key];
  wiz.input = "";
  if (wiz.step < WIZARD_STEPS.length - 1) {
    wiz.step++;
    wiz.bubbles.push({ role: "ai", text: wizStep.value.ask });
  } else {
    wiz.stage = "summary";
    wiz.name = wiz.mode === "rewrite" ? cur.value : deriveName(wiz.answers.story || "");
    wiz.bubbles.push({
      role: "ai",
      text: "好,设定齐了。这是我整理的创作简报——确认无误就开始生产,想反悔点「再改改」:\n\n" + buildBrief(wiz.answers),
    });
  }
  wizScroll();
}
function wizBack() {
  if (wiz.stage === "producing") return;
  if (wiz.stage === "summary" || wiz.stage === "error") {
    wiz.stage = "steps";
    wiz.bubbles.pop();                       // 摘要/错误气泡
    if (wiz.bubbles[wiz.bubbles.length - 1]?.role === "user") wiz.bubbles.pop();
    wiz.input = wiz.answers[wizStep.value.key] || "";
    return;
  }
  if (wiz.step === 0) return;
  wiz.bubbles.pop();                         // 当前提问
  if (wiz.bubbles[wiz.bubbles.length - 1]?.role === "user") wiz.bubbles.pop();
  wiz.step--;
  const prev = WIZARD_STEPS[wiz.step];
  wiz.input = wiz.answers[prev.key] || "";
  delete wiz.answers[prev.key];
}
const wizProg = (msg: string, ph?: string) => {
  wiz.bubbles.push({ role: "prog", text: msg });
  pushLog(msg, ph);
  wizScroll();
};
async function wizProduce() {
  const name = (wiz.mode === "rewrite" ? cur.value : wiz.name.trim());
  if (!name) return toast("先给作品起个名字(2-6字)", "err");
  if (wiz.stage === "producing" || busy.value) return;
  wiz.stage = "producing";
  try {
    if (wiz.mode === "create" && !wiz.created) {
      await invoke("vn_create", { name, intent: wiz.answers.story || "" });
      wiz.created = true;
      wiz.name = name;
    }
    if (!wiz.research && (wiz.answers.research || "").includes("要")) {
      wiz.bubbles.push({ role: "ai", text: "先联网调研真实底料(约2-3分钟),之后进入写稿。" });
      wizScroll();
      wiz.research = await runResearch(wiz.answers.story || "", wiz.answers.genre || "", m => wizProg(m));
    }
    const brief = buildBrief(wiz.answers, wiz.research || undefined);
    wiz.bubbles.push({ role: "ai", text: "开始生产:AI 先出大纲,再逐幕写作,最后编译自检。进度我会贴在这里。" });
    wizScroll();
    busy.value = "write"; log.value = [];
    const r = await writeScript(name, brief, actsOf(wiz.answers), wizProg);
    await invoke("vn_update_meta", { name, patch: { scriptStatus: "draft", stats: r.stats, intent: wiz.answers.story || "" } });
    busy.value = "";
    wiz.open = false;
    await refresh();
    await openProject(name);
    rep.value = r;
    gpData.value = r.gp || null;
    gpError.value = "";
    toast("剧本稿完成,通读改稿后定稿再生图", "ok");
  } catch (e: any) {
    busy.value = "";
    wiz.stage = "error";
    wiz.bubbles.push({ role: "err", text: "✗ 生产失败:" + (e?.message || e) });
    wizScroll();
  }
}
function wizRetry() {
  wiz.stage = "summary";
  wizProduce();
}

/* ================= 保存 / 编译 / 定稿 ================= */
async function doSave() {
  if (!cur.value) return;
  try {
    const r = await saveAndCompile(cur.value, script.value);
    rep.value = r; dirty.value = false;
    if (r.ok) { gpData.value = r.gp; gpError.value = ""; }
    const patch: any = { scriptStatus: meta.scriptStatus === "final" ? "final" : "draft" };
    if (r.ok) patch.stats = r.stats;
    await invoke("vn_update_meta", { name: cur.value, patch });
    Object.assign(meta, patch);
    await loadProjectData();
    toast(r.ok ? "已保存,编译通过" : "已保存,但编译有错(见报告)", r.ok ? "ok" : "err");
  } catch (e: any) { toast(e?.message || String(e), "err"); }
}
async function doFinalize() {
  const toFinal = meta.scriptStatus !== "final";
  if (toFinal && dirty.value) return toast("先保存再定稿", "err");
  if (toFinal && (!rep.value || !rep.value.ok)) {
    const r = await saveAndCompile(cur.value, script.value);
    rep.value = r;
    if (!r.ok) return toast("编译不过,不能定稿", "err");
    gpData.value = r.gp; gpError.value = "";
  }
  await invoke("vn_update_meta", { name: cur.value, patch: { scriptStatus: toFinal ? "final" : "draft" } });
  meta.scriptStatus = toFinal ? "final" : "draft";
  toast(toFinal ? "已定稿,生图已解锁" : "已退回草稿");
}
function gotoLine(line?: number) {
  if (!line) return;
  tab.value = "script";
  nextTick(() => {
    const el = edEl.value;
    if (!el) return;
    const lines = script.value.split("\n");
    let off = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
    el.focus();
    el.setSelectionRange(off, off + (lines[line - 1]?.length ?? 0));
    el.scrollTop = Math.max(0, (line - 4) * 23);
  });
}

/* ================= 图谱 + 对话抽屉 ================= */
function refreshGraph() {
  if (!script.value.trim()) { gpError.value = gpData.value ? "" : "尚无剧本,先到「剧本」页写作或让 AI 生成"; return; }
  const r = compile(script.value);
  if (r.ok) {
    gpData.value = r.gp; gpError.value = "";
    if (!rep.value) rep.value = r;
  } else {
    gpError.value = r.errors.slice(0, 3).map(e => (e.line ? "第" + e.line + "行: " : "") + e.msg).join(" · ")
      + (gpData.value ? "(下方仍显示上一次编译通过的图谱)" : "");
  }
}

interface DrawerMsg { role: "user" | "ai" | "sys"; text: string; blocks?: { id: string; block: string }[]; applied?: boolean }
const drawer = reactive({ open: false, node: "", input: "", busy: false, msgs: [] as DrawerMsg[] });
const drawerLogEl = ref<HTMLElement | null>(null);
const QUICK_CHIPS = ["把这场戏写得更有电影感", "台词更口语一点", "给这场加一个镜头调度", "从这场岔出一条新支线"];
function drawerScroll() {
  nextTick(() => { const el = drawerLogEl.value; if (el) el.scrollTop = el.scrollHeight; });
}
function chatKey(node: string) { return `vn.chat.${cur.value}.${node}`; }
function openDrawer(id: string) {
  drawer.open = true; drawer.node = id; drawer.input = "";
  try { drawer.msgs = JSON.parse(localStorage.getItem(chatKey(id)) || "[]"); } catch (_) { drawer.msgs = []; }
  if (!drawer.msgs.length)
    drawer.msgs = [{ role: "sys", text: "对这场戏提意见:改台词、改画面、加抉择、岔支线……AI 给出修改块,你点「应用」才落盘。" }];
  drawerScroll();
}
function closeDrawer() { drawer.open = false; drawer.node = ""; }
function persistChat() {
  if (!drawer.node) return;
  const keep = drawer.msgs.filter(m => m.role !== "sys").slice(-20).map(m => ({ role: m.role, text: m.text }));
  try { localStorage.setItem(chatKey(drawer.node), JSON.stringify(keep)); } catch (_) { /* 存不下就算了 */ }
}
const drawerScene = computed(() => gpData.value?.scenes?.[drawer.node] || null);
async function drawerSend(preset?: string) {
  const text = (preset ?? drawer.input).trim();
  if (!text || drawer.busy || !drawer.node) return;
  drawer.input = ""; drawer.busy = true;
  drawer.msgs.push({ role: "user", text });
  persistChat(); drawerScroll();
  try {
    const history: ChatMsg[] = drawer.msgs
      .filter(m => m.role !== "sys").slice(0, -1).slice(-8)
      .map(m => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.text }));
    const r = await chatRevise(script.value, drawer.node, text, history);
    drawer.msgs.push({ role: "ai", text: r.reply || "(修改见下方预览)", blocks: r.blocks.length ? r.blocks : undefined });
  } catch (e: any) {
    drawer.msgs.push({ role: "sys", text: "✗ " + (e?.message || e) });
  }
  drawer.busy = false;
  persistChat(); drawerScroll();
}
async function applyMsg(m: DrawerMsg) {
  if (!m.blocks || m.applied) return;
  try {
    const next = applyBlocks(script.value, m.blocks, drawer.node);
    script.value = next;
    const r = await saveAndCompile(cur.value, next);
    rep.value = r; dirty.value = false;
    if (r.ok) { gpData.value = r.gp; gpError.value = ""; } else refreshGraph();
    m.applied = true;
    await loadProjectData();
    toast(r.ok ? "已应用并重编译通过" : "已应用,但编译有错(见剧本页报告)", r.ok ? "ok" : "err");
  } catch (e: any) { toast(e?.message || String(e), "err"); }
}

/* ================= 生图 ================= */
const allImgs = computed<{ file: string; label: string; kind: string }[]>(() => {
  if (!proj.value) return [];
  const out: { file: string; label: string; kind: string }[] = [];
  out.push({ file: "bg_title.jpg", label: "扉页主视觉", kind: "bg" });
  const seen = new Set<string>();
  for (const id of proj.value.order) {
    const sc = proj.value.scenes[id];
    if (sc.bg && sc.imgPrompt && !seen.has(sc.bg)) { seen.add(sc.bg); out.push({ file: sc.bg, label: sc.name, kind: "bg" }); }
  }
  for (const sp of proj.value.sprites) out.push({ file: sp.file, label: sp.char + " · " + sp.pose, kind: "spr" });
  return out;
});
function assetDone(file: string): boolean {
  return assets.value.includes(file) || assets.value.includes(file.replace(/\.jpg$/i, ".png"));
}
function actualFile(file: string): string | null {
  if (assets.value.includes(file)) return file;
  const png = file.replace(/\.jpg$/i, ".png");
  return assets.value.includes(png) ? png : null;
}
const imgDoneCount = computed(() => allImgs.value.filter(i => assetDone(i.file)).length);
const missCount = computed(() => jobs.value.length);
async function loadThumbs() {
  for (const im of allImgs.value) {
    const f = actualFile(im.file);
    if (!f || thumbs[f]) continue;
    try { thumbs[f] = await invoke<string>("vn_asset_b64", { name: cur.value, file: f }); } catch (_) { /* 忽略 */ }
  }
}
let stopFlag = false;
async function runGen(force: boolean) {
  if (busy.value || !proj.value) return;
  if (meta.scriptStatus !== "final") return toast("剧本先行:定稿之后才生图", "err");
  if (force && !confirm("全部重生成会覆盖已有图,确定?")) return;
  busy.value = "gen"; stopFlag = false; log.value = [];
  try {
    const js = force ? await collectJobs(cur.value, proj.value, true) : jobs.value;
    const r = await genImages(cur.value, js, pushLog, () => stopFlag);
    await loadProjectData();
    Object.keys(thumbs).forEach(k => delete thumbs[k]);
    await loadThumbs();
    toast(`生图结束:成 ${r.ok} / 败 ${r.failed.length}`, r.failed.length ? "err" : "ok");
  } catch (e: any) { toast(e?.message || String(e), "err"); }
  finally { busy.value = ""; }
}
async function regenOne(im: { file: string; label: string; kind: string }) {
  if (busy.value || !proj.value) return;
  if (meta.scriptStatus !== "final") return toast("剧本先行:定稿之后才生图", "err");
  busy.value = "gen"; stopFlag = false;
  try {
    const all = await collectJobs(cur.value, proj.value, true);
    const key = im.file.replace(/\.(jpg|png)$/i, "");
    const job = all.find(j => j.file.replace(/\.(jpg|png)$/i, "") === key);
    if (!job) throw new Error("找不到该图的生成任务(可能是手工指定的背景)");
    pushLog(`单张重生:${im.label}`);
    const r = await genImages(cur.value, [job], pushLog, () => stopFlag);
    const f = actualFile(im.file);
    if (f) delete thumbs[f];
    await loadProjectData();
    await loadThumbs();
    toast(r.ok ? `「${im.label}」已重生成` : `「${im.label}」重生成失败`, r.ok ? "ok" : "err");
  } catch (e: any) { toast(e?.message || String(e), "err"); }
  finally { busy.value = ""; }
}
async function showAsset(file: string) {
  const f = actualFile(file);
  if (!f) return toast("图片尚未生成", "err");
  try {
    const url = thumbs[f] || await invoke<string>("vn_asset_b64", { name: cur.value, file: f });
    preview.value = { file: f, url };
  } catch (_) { toast("图片读取失败", "err"); }
}

/* ================= 历史备份 ================= */
interface BackupRow { file: string; of: string; ts: number; bytes: number }
const backups = ref<BackupRow[]>([]);
const backupView = ref<{ file: string; content: string } | null>(null);
async function loadBackups() {
  try { backups.value = await invoke<BackupRow[]>("vn_list_backups", { name: cur.value }); }
  catch (_) { backups.value = []; }
}
function relTime(ts: number): string {
  const d = Math.max(0, Date.now() / 1000 - ts);
  if (d < 60) return "刚刚";
  if (d < 3600) return Math.floor(d / 60) + " 分钟前";
  if (d < 86400) return Math.floor(d / 3600) + " 小时前";
  if (d < 86400 * 30) return Math.floor(d / 86400) + " 天前";
  return new Date(ts * 1000).toLocaleDateString();
}
function fmtBytes(b: number): string {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " B";
}
async function viewBackup(row: BackupRow) {
  try {
    const content = await invoke<string>("vn_read_backup", { name: cur.value, file: row.file });
    backupView.value = { file: row.file, content };
  } catch (e: any) { toast(e?.message || String(e), "err"); }
}
async function rollback(row: BackupRow) {
  if (!confirm(`回滚到 ${relTime(row.ts)} 的 ${row.of}?当前版本会先自动备份。`)) return;
  try {
    await invoke("vn_restore_backup", { name: cur.value, file: row.file });
    try { script.value = await invoke<string>("vn_read_file", { name: cur.value, file: "script.md" }); } catch (_) { /* 保持现状 */ }
    dirty.value = false;
    const r = compile(script.value);
    rep.value = r;
    if (r.ok) { gpData.value = r.gp; gpError.value = ""; }
    await loadProjectData();
    await loadBackups();
    toast("已回滚到该版本", "ok");
  } catch (e: any) { toast(e?.message || String(e), "err"); }
}

/* ================= 试玩 / 导出 ================= */
async function doPlay(scene?: string) {
  if (!proj.value) return toast("先写剧本并编译", "err");
  try { playHtml.value = await buildPlayHtml(cur.value, scene); }
  catch (e: any) { toast(e?.message || String(e), "err"); }
}
async function doExport() {
  if (busy.value) return;
  busy.value = "export";
  try {
    const r = await exportStandalone(cur.value);
    toast(`已导出 ${r.mb}MB: ${r.path}`, "ok");
    invoke("vn_open_dir", { name: cur.value }).catch(() => {});
  } catch (e: any) { toast(e?.message || String(e), "err"); }
  finally { busy.value = ""; }
}

/* ================= 杂项 ================= */
function stLabel(m: Record<string, any>): { t: string; cls: string } {
  if (m.scriptStatus === "final") return { t: "已定稿", cls: "green" };
  if (m.scriptStatus === "draft") return { t: "草稿", cls: "gold" };
  return { t: "尚无剧本", cls: "" };
}
const statusLine = computed(() => {
  const s = meta.scriptStatus === "final" ? "已定稿,可生图" : meta.scriptStatus === "draft" ? "草稿" : "尚无剧本";
  return (dirty.value ? "● 未保存 · " : "") + s;
});
watch(tab, t => {
  if (t === "graph") refreshGraph();
  if (t === "imgs") loadThumbs();
  if (t === "history") loadBackups();
});
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && cur.value) { e.preventDefault(); doSave(); }
  if (e.key === "Escape" && drawer.open) closeDrawer();
}
onMounted(() => { refresh(); window.addEventListener("keydown", onKey); });
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="vns">
    <!-- ======= 列表页 ======= -->
    <template v-if="!cur">
      <header class="bar glass">
        <div class="ttl">
          <h1>灵动工坊</h1>
          <p>动效视觉小说生产线 · 对话式立项 → 剧本先行 → 图谱改稿 → 生图 → 单文件成品</p>
        </div>
        <div class="dots" v-if="auth">
          <span class="dot" :class="auth.claude?.authed ? 'ok' : 'bad'"></span><em>claude</em>
          <span class="dot" :class="auth.codex?.authed ? 'ok' : 'bad'"></span><em>codex</em>
        </div>
        <button class="abtn ghost" @click="openWizard('create', EXAMPLE_BRIEF)">示例提示词</button>
        <button class="abtn primary" @click="openWizard('create')">＋ 新建灵动叙事</button>
      </header>
      <div class="grid">
        <div v-for="p in projects" :key="p.name" class="pcard glass" @click="openProject(p.name)">
          <div class="cover">
            <img v-if="covers[p.name]" :src="covers[p.name]" alt="" />
            <span v-else class="glyph">{{ p.name.slice(0, 1) }}</span>
            <i class="veil"></i>
          </div>
          <div class="pbody">
            <div class="pname">{{ p.name }}</div>
            <div class="chips">
              <span class="chip" :class="stLabel(p.meta).cls">{{ stLabel(p.meta).t }}</span>
              <span v-if="p.meta.stats" class="chip">{{ p.meta.stats.scenes }}场景 · {{ p.meta.stats.endings }}结局 · 估{{ p.meta.stats.minutes }}min</span>
              <span class="chip">{{ p.img_done }} 图</span>
            </div>
            <div class="pbtns" @click.stop>
              <button class="abtn" @click="openProject(p.name)">打开</button>
              <button class="abtn ghost" @click="delProject(p.name)">删除</button>
            </div>
          </div>
        </div>
        <div class="pcard glass newcard" @click="openWizard('create')">
          <b>＋</b><span>对话式立项<br />十个问题聊出一部灵动剧本</span>
        </div>
      </div>
    </template>

    <!-- ======= 项目页 ======= -->
    <template v-else>
      <header class="bar glass">
        <button class="abtn ghost" @click="backToList">‹ 项目</button>
        <div class="ttl">
          <h1>{{ cur }}</h1>
          <p>{{ statusLine }}<b v-if="phase"> · {{ phase }}</b></p>
        </div>
        <nav class="tabs">
          <button class="tabbtn" :class="{ on: tab === 'script' }" @click="tab = 'script'">剧本</button>
          <button class="tabbtn" :class="{ on: tab === 'graph' }" @click="tab = 'graph'">图谱</button>
          <button class="tabbtn" :class="{ on: tab === 'imgs' }" @click="tab = 'imgs'">生图</button>
          <button class="tabbtn" :class="{ on: tab === 'history' }" @click="tab = 'history'">历史</button>
        </nav>
        <div class="acts">
          <button class="abtn primary" :disabled="!!busy" @click="doSave">保存并编译</button>
          <button class="abtn" :disabled="!!busy" @click="doFinalize">{{ meta.scriptStatus === "final" ? "✓ 已定稿" : "定稿" }}</button>
          <button class="abtn" :disabled="!proj" @click="doPlay()">▶ 试玩</button>
          <button class="abtn" :disabled="!proj || !!busy" @click="doExport">导出单文件</button>
          <button v-if="busy === 'gen'" class="abtn ghost" @click="stopFlag = true">停止</button>
          <button class="abtn ghost" title="打开项目目录" @click="invoke('vn_open_dir', { name: cur }).catch(() => {})">⧉</button>
        </div>
      </header>

      <!-- 剧本 -->
      <div v-if="tab === 'script'" class="work">
        <textarea
          ref="edEl"
          v-model="script"
          class="ed glass-soft"
          spellcheck="false"
          placeholder="尚无剧本。点右侧「AI 整稿重写」让 AI 写一部,或直接按灵动剧本格式手写。"
          @input="dirty = true"
        ></textarea>
        <aside class="side">
          <section class="panel glass" v-if="busy || log.length">
            <h4>{{ busy === "write" ? "AI 写稿中…" : busy === "gen" ? "生图中…" : "AI 任务" }}<span v-if="busy" class="spin"></span></h4>
            <div class="plog"><div v-for="(l, i) in log.slice(-40)" :key="i">{{ l }}</div></div>
          </section>
          <section class="panel glass">
            <h4>编译报告</h4>
            <div v-if="!rep" class="empty">保存后出报告</div>
            <template v-else>
              <div v-if="rep.stats" class="ok">✓ {{ rep.stats.scenes }} 场景 · {{ rep.stats.endings }} 结局 · {{ rep.stats.beats }} 拍 · 估 {{ rep.stats.minutes }} 分钟</div>
              <div v-for="(e, i) in rep.errors" :key="'e' + i" class="err" :class="{ link: e.line }" @click="gotoLine(e.line)">
                ✗ {{ e.line ? "第" + e.line + "行: " : "" }}{{ e.msg }}
              </div>
              <div v-for="(w, i) in rep.warnings" :key="'w' + i" class="warn">⚠ {{ w.msg }}</div>
            </template>
          </section>
          <section class="panel glass">
            <h4>整稿</h4>
            <p class="fine">对个别场景不满意,去「图谱」点节点对话微调;整体方向要变,才用整稿重写(旧稿自动备份)。</p>
            <button class="abtn wide" :disabled="!!busy" @click="openWizard('rewrite', meta.intent || '')">AI 整稿重写</button>
          </section>
        </aside>
      </div>

      <!-- 图谱 -->
      <div v-else-if="tab === 'graph'" class="graphwrap">
        <div v-if="gpError && gpData" class="gerr glass">{{ gpError }}</div>
        <VnGraph v-if="gpData" :gp="gpData" :assets="assets" @pick="openDrawer" @play="s => doPlay(s)" />
        <div v-else class="gempty glass-soft">
          <b>图谱还画不出来</b>
          <span>{{ gpError || "剧本编译通过后,这里会按幕分列画出全部场景与分支。" }}</span>
          <button class="abtn" @click="tab = 'script'">去写剧本</button>
        </div>
      </div>

      <!-- 生图 -->
      <div v-else-if="tab === 'imgs'" class="imgswrap">
        <div v-if="meta.scriptStatus !== 'final'" class="gate glass-soft">
          <b>剧本先行——定稿后解锁</b>
          <span>文字层返工零成本,图是最贵的产物。通读剧本、图谱里把每场戏改到满意,再回来一键出图。</span>
          <div class="gbtns">
            <button class="abtn" @click="tab = 'script'">去通读剧本</button>
            <button class="abtn primary" :disabled="!!busy" @click="doFinalize">现在定稿</button>
          </div>
        </div>
        <template v-else>
          <div class="imgbar glass">
            <span class="isum">共 {{ allImgs.length }} 张 · 已生成 {{ imgDoneCount }} · 缺 {{ allImgs.length - imgDoneCount }}</span>
            <div class="igrow"></div>
            <button class="abtn primary" :disabled="!!busy || !missCount" @click="runGen(false)">为缺图批量生图<i v-if="missCount">（{{ missCount }}）</i></button>
            <button class="abtn" :disabled="!!busy" @click="runGen(true)">全部重生成</button>
            <button v-if="busy === 'gen'" class="abtn ghost" @click="stopFlag = true">停止</button>
          </div>
          <section class="panel glass genlog" v-if="busy === 'gen' || (log.length && tab === 'imgs')">
            <h4>生图日志<span v-if="busy === 'gen'" class="spin"></span></h4>
            <div class="plog"><div v-for="(l, i) in log.slice(-24)" :key="i">{{ l }}</div></div>
          </section>
          <div class="igrid">
            <div v-for="im in allImgs" :key="im.file" class="icard glass">
              <div class="thumb" @click="showAsset(im.file)">
                <img v-if="actualFile(im.file) && thumbs[actualFile(im.file)!]" :src="thumbs[actualFile(im.file)!]" loading="lazy" alt="" />
                <span v-else-if="assetDone(im.file)" class="loading">载入中…</span>
                <span v-else class="todo">◌ 待生成</span>
              </div>
              <div class="ib">
                <div class="nm">{{ im.label }}</div>
                <div class="irow">
                  <span class="chip" :class="im.kind === 'spr' ? 'cyan' : ''">{{ im.kind === "spr" ? "立绘" : "场景" }}</span>
                  <button class="abtn tiny" :disabled="!!busy" @click="regenOne(im)">单张重生</button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 历史 -->
      <div v-else class="histwrap">
        <div v-if="!backups.length" class="gempty glass-soft">
          <b>还没有历史版本</b>
          <span>每次 AI 整稿、回滚或覆盖保存,旧版 script.md / project.js 会自动备份到这里。</span>
        </div>
        <div v-else class="hlist">
          <div v-for="b in backups" :key="b.file" class="hrow glass">
            <span class="hof" :class="{ js: /\.js/.test(b.of) }">{{ b.of }}</span>
            <span class="htime">{{ relTime(b.ts) }}</span>
            <span class="hsize">{{ fmtBytes(b.bytes) }}</span>
            <span class="hfile">{{ b.file }}</span>
            <div class="hbtns">
              <button class="abtn" @click="viewBackup(b)">查看</button>
              <button class="abtn ghost" @click="rollback(b)">回滚到此版</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 对话抽屉(图谱节点改稿) -->
      <transition name="drawer">
        <aside v-if="drawer.open" class="drawer glass-strong">
          <header class="dhead">
            <div class="dt">
              <h3>{{ drawerScene?.name || drawer.node }}</h3>
              <code>{{ drawer.node }}</code>
              <span v-if="drawerScene?.ending" class="chip gold">结局 · {{ drawerScene.tier || "普通" }}</span>
            </div>
            <button class="abtn ghost" @click="closeDrawer">✕</button>
          </header>
          <div class="dchips">
            <button v-for="q in QUICK_CHIPS" :key="q" class="qchip" :disabled="drawer.busy" @click="drawerSend(q)">{{ q }}</button>
            <button class="qchip play" @click="doPlay(drawer.node)">▶ 从此试玩</button>
          </div>
          <div ref="drawerLogEl" class="dlog">
            <template v-for="(m, i) in drawer.msgs" :key="i">
              <div class="msg" :class="m.role">{{ m.text }}</div>
              <div v-if="m.blocks" class="diffcard glass-soft">
                <div class="dh">✎ {{ m.blocks.length }} 处修改建议</div>
                <div v-for="b in m.blocks" :key="b.id" class="blk">
                  <div class="bid">{{ b.id }}</div>
                  <pre>{{ b.block }}</pre>
                </div>
                <div class="dbtns">
                  <button v-if="!m.applied" class="abtn primary" :disabled="drawer.busy" @click="applyMsg(m)">应用 {{ m.blocks.length }} 处修改</button>
                  <span v-else class="applied">✓ 已应用并重编译</span>
                </div>
              </div>
            </template>
            <div v-if="drawer.busy" class="msg sys typing">AI 正在改稿<i>·</i><i>·</i><i>·</i></div>
          </div>
          <footer class="dinput">
            <textarea
              v-model="drawer.input" rows="2"
              placeholder="像聊天一样提意见,Enter 发送 / Shift+Enter 换行"
              @keydown.enter.exact.prevent="drawerSend()"
            ></textarea>
            <button class="abtn primary" :disabled="drawer.busy || !drawer.input.trim()" @click="drawerSend()">发送</button>
          </footer>
        </aside>
      </transition>
    </template>

    <!-- ======= 创建/整稿向导(对话式) ======= -->
    <div v-if="wiz.open" class="modal wizmask" @click.self="closeWizard">
      <div class="wizbox glass-strong">
        <header class="whead">
          <div>
            <h3>{{ wiz.mode === "rewrite" ? "AI 整稿重写 · " + cur : "新建灵动叙事" }}</h3>
            <p v-if="wiz.stage === 'steps'">第 {{ wiz.step + 1 }} / {{ WIZARD_STEPS.length }} 问 · 点选项或自由输入</p>
            <p v-else-if="wiz.stage === 'producing'">生产中 · 进度实时贴进对话<span class="spin"></span></p>
            <p v-else>{{ wiz.stage === "summary" ? "确认简报,开始生产" : "生产失败,可重试" }}</p>
          </div>
          <button class="abtn ghost" :disabled="wiz.stage === 'producing'" @click="closeWizard">✕</button>
        </header>
        <div ref="wizChatEl" class="wchat">
          <div v-for="(b, i) in wiz.bubbles" :key="i" class="wb" :class="b.role">{{ b.text }}</div>
          <div v-if="wiz.stage === 'summary'" class="wsummary glass-soft">
            <label v-if="wiz.mode === 'create'">作品名(2-6字,可改)
              <input v-model="wiz.name" maxlength="12" />
            </label>
            <div class="wsbtns">
              <button class="abtn ghost" @click="wizBack">再改改</button>
              <button class="abtn primary" @click="wizProduce">开始生产</button>
            </div>
          </div>
          <div v-if="wiz.stage === 'error'" class="wsummary glass-soft">
            <div class="wsbtns">
              <button class="abtn ghost" @click="wizBack">回去改设定</button>
              <button class="abtn primary" @click="wizRetry">重试生产</button>
            </div>
          </div>
        </div>
        <footer v-if="wiz.stage === 'steps'" class="winput">
          <div v-if="wizStep.options" class="wopts">
            <button v-for="o in wizStep.options" :key="o" class="qchip" @click="wizAnswer(o)">{{ o }}</button>
          </div>
          <div class="wrow">
            <button class="abtn ghost" :disabled="wiz.step === 0" @click="wizBack">上一步</button>
            <textarea
              v-model="wiz.input" rows="2"
              :placeholder="wizStep.placeholder || '自由输入,Enter 确认'"
              @keydown.enter.exact.prevent="wizAnswer(wiz.input)"
            ></textarea>
            <button v-if="wizStep.optional" class="abtn ghost" @click="wizAnswer('')">跳过</button>
            <button class="abtn primary" @click="wizAnswer(wiz.input)">确认</button>
          </div>
        </footer>
      </div>
    </div>

    <!-- ======= 试玩 ======= -->
    <div v-if="playHtml" class="playwrap" @click.self="playHtml = ''">
      <div class="playbox glass-strong">
        <header>
          <span>试玩 · {{ cur }}</span>
          <em>剧场模式=T · 自动=A · 配音=V · 录屏 Win+Alt+R</em>
          <button class="abtn ghost" @click="playHtml = ''">✕ 关闭</button>
        </header>
        <iframe :srcdoc="playHtml" allow="autoplay" sandbox="allow-scripts"></iframe>
      </div>
    </div>

    <!-- ======= 图片预览 ======= -->
    <div v-if="preview" class="modal" @click.self="preview = null">
      <div class="imgprev glass-strong">
        <header><span>{{ preview.file }}</span><button class="abtn ghost" @click="preview = null">✕</button></header>
        <img :src="preview.url" />
      </div>
    </div>

    <!-- ======= 备份预览 ======= -->
    <div v-if="backupView" class="modal" @click.self="backupView = null">
      <div class="bakprev glass-strong">
        <header><span>{{ backupView.file }}</span><button class="abtn ghost" @click="backupView = null">✕</button></header>
        <pre>{{ backupView.content }}</pre>
      </div>
    </div>

    <div v-if="toastMsg" class="toast glass-strong" :class="toastMsg.kind">{{ toastMsg.t }}</div>
  </div>
</template>

<style scoped>
.vns { height: 100vh; padding: 44px 18px 16px 6px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }

/* ── 顶栏 ── */
.bar { display: flex; align-items: center; gap: 14px; padding: 12px 18px; border-radius: var(--r-lg); flex: none; }
.ttl { min-width: 0; }
.bar > .ttl { flex: 1; }
.ttl h1 { margin: 0; font-family: var(--f-serif); font-size: 19px; letter-spacing: 0.08em; color: var(--text-hi); }
.ttl p { margin: 2px 0 0; font-size: 12px; color: var(--text-mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ttl p b { color: var(--gold); font-weight: 500; }
.dots { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-dim); }
.dots em { font-style: normal; margin-right: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #666; }
.dot.ok { background: #5fce7b; box-shadow: 0 0 8px rgba(95, 206, 123, 0.7); }
.dot.bad { background: #ef7373; }
.tabs { display: flex; gap: 4px; padding: 4px; border-radius: var(--r-md); background: var(--glass-soft); border: 1px solid var(--hairline); }
.tabbtn { border: 1px solid transparent; background: transparent; color: var(--text-mut); font-size: 12.5px; letter-spacing: 0.08em;
  padding: 6px 16px; border-radius: var(--r-sm); cursor: pointer;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease), border-color var(--dur) var(--ease); }
.tabbtn:hover { color: var(--text-hi); background: var(--glass-press); }
.tabbtn.on { color: #f2d99a; background: linear-gradient(180deg, rgba(227, 179, 65, 0.16), rgba(227, 179, 65, 0.05));
  border-color: rgba(227, 179, 65, 0.32); }
.acts { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

/* ── 按钮 ── */
.abtn { border: 1px solid var(--hairline-strong); background: var(--glass-soft); color: var(--text); font-size: 12.5px;
  padding: 7px 14px; border-radius: var(--r-sm); cursor: pointer; letter-spacing: 0.04em;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease), transform var(--dur) var(--ease); }
.abtn:hover:not(:disabled) { background: var(--glass-press); color: var(--text-hi); }
.abtn:active:not(:disabled) { transform: scale(0.97); }
.abtn:disabled { opacity: 0.38; cursor: not-allowed; }
.abtn.primary { background: linear-gradient(180deg, rgba(227, 179, 65, 0.28), rgba(227, 179, 65, 0.14));
  border-color: rgba(227, 179, 65, 0.45); color: #f2d99a; }
.abtn.primary:hover:not(:disabled) { background: linear-gradient(180deg, rgba(227, 179, 65, 0.4), rgba(227, 179, 65, 0.2)); color: #fff; }
.abtn.ghost { background: transparent; }
.abtn.wide { width: 100%; }
.abtn.tiny { font-size: 11px; padding: 3px 10px; }
.abtn i { font-style: normal; color: var(--gold); }

/* ── 列表 ── */
.grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; align-content: start; padding: 2px; }
.pcard { border-radius: var(--r-lg); cursor: pointer; overflow: hidden; display: flex; flex-direction: column;
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease), border-color var(--dur) var(--ease); }
.pcard:hover { transform: translateY(-4px); box-shadow: var(--edge-hi), var(--shadow-lg); border-color: var(--hairline-strong); }
.cover { position: relative; height: 118px; overflow: hidden; flex: none;
  background: radial-gradient(130% 140% at 15% 0%, rgba(38, 54, 80, 0.85) 0%, rgba(20, 29, 43, 0.7) 45%, rgba(10, 15, 24, 0.6) 100%); }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.55s var(--ease); }
.pcard:hover .cover img { transform: scale(1.06); }
.cover .glyph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--f-serif); font-size: 42px; color: #3c4f6e; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.5); }
.cover .veil { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(232, 242, 252, 0.05), transparent 30%, rgba(8, 11, 17, 0.78)); }
.pbody { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.pname { font-family: var(--f-serif); font-size: 17px; color: var(--text-hi); letter-spacing: 0.06em; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 11px; padding: 2px 10px; border-radius: var(--r-pill); border: 1px solid var(--hairline); color: var(--text-mut); }
.chip.gold { border-color: rgba(227, 179, 65, 0.42); color: var(--gold); }
.chip.green { border-color: rgba(95, 206, 123, 0.42); color: #5fce7b; }
.chip.cyan { border-color: rgba(96, 200, 220, 0.42); color: #7fd4e4; }
.pbtns { display: flex; gap: 8px; margin-top: auto; }
.newcard { align-items: center; justify-content: center; text-align: center; color: var(--text-dim); border-style: dashed; min-height: 216px; gap: 10px; }
.newcard b { font-size: 26px; color: var(--gold); }
.newcard span { font-size: 12px; line-height: 1.8; }
.newcard:hover { color: var(--gold); border-color: rgba(227, 179, 65, 0.5); }

/* ── 剧本页 ── */
.work { flex: 1; display: flex; gap: 12px; min-height: 0; }
.ed { flex: 1; resize: none; border-radius: var(--r-lg); border: 1px solid var(--hairline); padding: 16px 18px;
  background: var(--glass-soft); color: var(--text); font: 13px/1.75 var(--f-serif), monospace; letter-spacing: 0.03em; outline: none; }
.ed:focus { border-color: rgba(227, 179, 65, 0.35); }
.side { width: 320px; flex: none; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.panel { border-radius: var(--r-lg); padding: 14px 16px; flex: none; }
.panel h4 { margin: 0 0 10px; font-size: 13px; color: var(--text-hi); letter-spacing: 0.08em; display: flex; align-items: center; gap: 8px; }
.empty { color: var(--text-dim); font-size: 12px; padding: 8px 0; }
.ok { color: #5fce7b; font-size: 12px; margin-bottom: 6px; }
.err { color: #ef7373; font-size: 12px; margin-bottom: 4px; }
.err.link { cursor: pointer; text-decoration: underline dotted rgba(239, 115, 115, 0.5); text-underline-offset: 3px; }
.err.link:hover { color: #ffb3b3; }
.warn { color: var(--gold); font-size: 12px; margin-bottom: 4px; opacity: 0.85; }
.plog { max-height: 220px; overflow-y: auto; font-size: 11.5px; line-height: 1.8; color: var(--text-mut); font-family: var(--f-sans); }
.spin { width: 12px; height: 12px; border: 2px solid rgba(227, 179, 65, 0.3); border-top-color: var(--gold); border-radius: 50%;
  display: inline-block; animation: sp 0.8s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }
.fine { font-size: 11.5px; color: var(--text-dim); line-height: 1.7; margin: 0 0 12px; }

/* ── 图谱页 ── */
.graphwrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.graphwrap > .vg { flex: 1; }
.gerr { flex: none; padding: 9px 16px; border-radius: var(--r-md); font-size: 12px; color: #ffb3b3;
  border-color: rgba(239, 115, 115, 0.4); }
.gempty { flex: 1; border-radius: var(--r-lg); display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; text-align: center; padding: 40px; }
.gempty b { font-family: var(--f-serif); font-size: 16px; color: var(--text-hi); letter-spacing: 0.08em; }
.gempty span { font-size: 12.5px; color: var(--text-mut); line-height: 1.8; max-width: 420px; }

/* ── 生图页 ── */
.imgswrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.gate { border-radius: var(--r-lg); border-style: dashed; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 14px; text-align: center; padding: 56px 40px; margin: auto 0; }
.gate b { font-family: var(--f-serif); font-size: 17px; color: var(--gold); letter-spacing: 0.1em; }
.gate span { font-size: 12.5px; color: var(--text-mut); line-height: 1.9; max-width: 460px; }
.gbtns { display: flex; gap: 10px; }
.imgbar { flex: none; display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: var(--r-md); }
.isum { font-size: 12.5px; color: var(--text-mut); }
.igrow { flex: 1; }
.genlog { flex: none; }
.igrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; align-content: start; }
.icard { border-radius: var(--r-md); overflow: hidden; display: flex; flex-direction: column;
  transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease); }
.icard:hover { transform: translateY(-2px); border-color: var(--hairline-strong); }
.thumb { height: 110px; background: rgba(6, 10, 17, 0.7); display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .todo, .thumb .loading { font-size: 12px; color: var(--text-dim); letter-spacing: 0.1em; }
.ib { padding: 9px 12px 11px; display: flex; flex-direction: column; gap: 8px; }
.ib .nm { font-size: 12.5px; color: var(--text-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.irow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }

/* ── 历史页 ── */
.histwrap { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; }
.hlist { display: flex; flex-direction: column; gap: 8px; padding: 2px; }
.hrow { display: flex; align-items: center; gap: 14px; padding: 11px 16px; border-radius: var(--r-md); font-size: 12.5px; }
.hof { font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; color: var(--gold); min-width: 84px; }
.hof.js { color: #7fd4e4; }
.htime { color: var(--text); min-width: 90px; }
.hsize { color: var(--text-dim); min-width: 64px; }
.hfile { flex: 1; color: var(--text-dim); font-size: 11px; font-family: "Cascadia Code", Consolas, monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hbtns { display: flex; gap: 8px; }

/* ── 对话抽屉 ── */
.drawer { position: fixed; top: 44px; right: 0; bottom: 0; width: 440px; max-width: 92vw; z-index: 70;
  display: flex; flex-direction: column; border-radius: var(--r-lg) 0 0 var(--r-lg); border-right: none; }
.drawer-enter-active, .drawer-leave-active { transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease); }
.drawer-enter-from, .drawer-leave-to { transform: translateX(36px); opacity: 0; }
.dhead { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 14px 16px 10px;
  border-bottom: 1px solid var(--hairline); }
.dt { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; min-width: 0; }
.dt h3 { margin: 0; font-family: var(--f-serif); font-size: 15px; color: var(--text-hi); letter-spacing: 0.06em; }
.dt code { font-family: "Cascadia Code", Consolas, monospace; font-size: 10.5px; color: var(--text-dim);
  background: rgba(8, 13, 22, 0.7); border: 1px solid var(--hairline); padding: 2px 7px; border-radius: 6px; }
.dchips { flex: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 16px; border-bottom: 1px solid var(--hairline); }
.qchip { font-size: 11.5px; padding: 4px 11px; border-radius: var(--r-pill); border: 1px solid var(--hairline);
  background: transparent; color: var(--text-mut); cursor: pointer;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease), border-color var(--dur) var(--ease); }
.qchip:hover:not(:disabled) { color: var(--text-hi); background: var(--glass-press); border-color: var(--hairline-strong); }
.qchip:disabled { opacity: 0.4; cursor: not-allowed; }
.qchip.play { color: var(--gold); border-color: rgba(227, 179, 65, 0.35); }
.dlog { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.msg { max-width: 92%; padding: 9px 13px; border-radius: var(--r-md); font-size: 12.5px; line-height: 1.7;
  white-space: pre-wrap; word-break: break-word; }
.msg.user { align-self: flex-end; background: linear-gradient(160deg, rgba(58, 90, 124, 0.7), rgba(44, 70, 97, 0.65));
  border: 1px solid rgba(120, 160, 200, 0.25); color: #eaf1f8; border-bottom-right-radius: 4px; }
.msg.ai { align-self: flex-start; background: var(--glass-soft); border: 1px solid var(--hairline); color: var(--text); border-bottom-left-radius: 4px; }
.msg.sys { align-self: center; color: var(--text-dim); font-size: 11.5px; background: none; padding: 2px 0; }
.typing i { animation: blink 1s infinite; font-style: normal; }
.typing i:nth-child(2) { animation-delay: 0.2s; }
.typing i:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 50% { opacity: 0.15; } }
.diffcard { align-self: stretch; border-radius: var(--r-md); overflow: hidden; border: 1px solid var(--hairline-strong); }
.diffcard .dh { padding: 7px 12px; font-size: 11.5px; color: var(--gold); background: rgba(30, 40, 58, 0.55); letter-spacing: 0.06em; }
.diffcard .blk { border-top: 1px solid var(--hairline); }
.diffcard .bid { padding: 5px 12px 0; font-family: "Cascadia Code", Consolas, monospace; font-size: 10px; color: var(--text-dim); }
.diffcard pre { margin: 0; padding: 6px 12px 10px; font-family: "Cascadia Code", Consolas, monospace; font-size: 11px;
  line-height: 1.6; max-height: 200px; overflow: auto; color: var(--text); white-space: pre-wrap; word-break: break-all; }
.diffcard .dbtns { padding: 8px 12px; background: rgba(30, 40, 58, 0.45); border-top: 1px solid var(--hairline); }
.applied { font-size: 12px; color: #5fce7b; }
.dinput { flex: none; display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--hairline); }
.dinput textarea { flex: 1; resize: none; background: rgba(8, 13, 22, 0.6); border: 1px solid var(--hairline-strong);
  border-radius: var(--r-sm); color: var(--text-hi); padding: 8px 11px; font-size: 12.5px; font-family: var(--f-sans);
  line-height: 1.6; outline: none; }
.dinput textarea:focus { border-color: rgba(227, 179, 65, 0.4); }
.dinput .abtn { align-self: flex-end; }

/* ── 向导 ── */
.modal { position: fixed; inset: 0; z-index: 80; background: rgba(4, 7, 12, 0.55); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; }
.wizbox { width: min(720px, 94vw); height: min(78vh, 780px); border-radius: var(--r-xl); display: flex; flex-direction: column; overflow: hidden; }
.whead { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 22px 14px;
  border-bottom: 1px solid var(--hairline); }
.whead h3 { margin: 0; font-family: var(--f-serif); font-size: 17px; color: var(--text-hi); letter-spacing: 0.08em; }
.whead p { margin: 4px 0 0; font-size: 11.5px; color: var(--text-mut); display: flex; align-items: center; gap: 8px; }
.wchat { flex: 1; overflow-y: auto; padding: 18px 22px; display: flex; flex-direction: column; gap: 10px; }
.wb { max-width: 86%; padding: 10px 14px; border-radius: var(--r-md); font-size: 13px; line-height: 1.75; white-space: pre-wrap; word-break: break-word; }
.wb.ai { align-self: flex-start; background: var(--glass-soft); border: 1px solid var(--hairline); color: var(--text); border-bottom-left-radius: 4px; }
.wb.user { align-self: flex-end; background: linear-gradient(160deg, rgba(58, 90, 124, 0.7), rgba(44, 70, 97, 0.65));
  border: 1px solid rgba(120, 160, 200, 0.25); color: #eaf1f8; border-bottom-right-radius: 4px; }
.wb.prog { align-self: flex-start; font-size: 11.5px; color: var(--text-mut); background: rgba(8, 13, 22, 0.5);
  border: 1px solid var(--hairline); padding: 5px 12px; font-family: var(--f-sans); }
.wb.err { align-self: flex-start; background: rgba(90, 30, 30, 0.35); border: 1px solid rgba(239, 115, 115, 0.45); color: #ffb3b3; }
.wsummary { align-self: stretch; border-radius: var(--r-md); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.wsummary label { font-size: 12px; color: var(--text-mut); display: flex; flex-direction: column; gap: 6px; }
.wsummary input { background: rgba(8, 13, 22, 0.6); border: 1px solid var(--hairline-strong); border-radius: var(--r-sm);
  color: var(--text-hi); padding: 8px 12px; font-size: 13px; outline: none; }
.wsummary input:focus { border-color: rgba(227, 179, 65, 0.4); }
.wsbtns { display: flex; justify-content: flex-end; gap: 10px; }
.winput { flex: none; border-top: 1px solid var(--hairline); padding: 12px 18px 14px; display: flex; flex-direction: column; gap: 10px; }
.wopts { display: flex; flex-wrap: wrap; gap: 6px; }
.wrow { display: flex; gap: 8px; align-items: flex-end; }
.wrow textarea { flex: 1; resize: none; background: rgba(8, 13, 22, 0.6); border: 1px solid var(--hairline-strong);
  border-radius: var(--r-sm); color: var(--text-hi); padding: 8px 12px; font-size: 13px; font-family: var(--f-sans);
  line-height: 1.6; outline: none; }
.wrow textarea:focus { border-color: rgba(227, 179, 65, 0.4); }

/* ── 试玩 / 预览 ── */
.playwrap { position: fixed; inset: 0; z-index: 90; background: rgba(3, 5, 9, 0.72); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; }
.playbox { width: min(92vw, 168vh); border-radius: var(--r-xl); overflow: hidden; display: flex; flex-direction: column; }
.playbox header { display: flex; align-items: center; gap: 14px; padding: 10px 16px; color: var(--text-hi); font-size: 13px; letter-spacing: 0.06em; }
.playbox header em { flex: 1; font-style: normal; font-size: 11px; color: var(--text-dim); text-align: right; letter-spacing: 0.04em; }
.playbox iframe { width: 100%; aspect-ratio: 16 / 9.6; border: none; background: #000; display: block; }
.imgprev { max-width: 82vw; max-height: 84vh; border-radius: var(--r-lg); overflow: hidden; display: flex; flex-direction: column; }
.imgprev header { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; font-size: 12px; color: var(--text-mut); }
.imgprev img { max-width: 82vw; max-height: 74vh; object-fit: contain; display: block; background: #0a0f18; }
.bakprev { width: min(820px, 92vw); max-height: 84vh; border-radius: var(--r-lg); overflow: hidden; display: flex; flex-direction: column; }
.bakprev header { flex: none; display: flex; justify-content: space-between; align-items: center; padding: 10px 16px;
  font-size: 12px; color: var(--text-mut); border-bottom: 1px solid var(--hairline); }
.bakprev pre { flex: 1; margin: 0; padding: 14px 18px; overflow: auto; font-family: "Cascadia Code", Consolas, monospace;
  font-size: 11.5px; line-height: 1.7; color: var(--text); white-space: pre-wrap; word-break: break-word; background: rgba(6, 10, 17, 0.5); }

.toast { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); z-index: 99; padding: 10px 22px;
  border-radius: var(--r-pill); font-size: 13px; color: var(--text-hi); max-width: 70vw; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.toast.err { border-color: rgba(239, 115, 115, 0.5); color: #ffb3b3; }
</style>
