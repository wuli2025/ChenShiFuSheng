/* =====================================================================
 * vn/pipeline.ts · 灵动工坊生产管线（前端编排,Rust 执行 CLI）
 * 写剧本: 大纲 → 逐幕写作 → 组装 → 编译自检 → AI 自修复(≤2轮)
 * 生图:   场景横图(codex) + 立绘透明竖图(codex),双 worker 并发
 * ===================================================================== */
import { invoke } from "../../tauri";
import { compile, type VNProject, type CompileResult } from "./compile";
import { VN_SPEC } from "./spec";

export type Progress = (msg: string, phase?: string) => void;

function stripFences(text: string): string {
  const t = String(text || "").trim();
  const m = /^```[\w-]*\s*\n([\s\S]*?)\n?```\s*$/.exec(t);
  return m ? m[1].trim() : t;
}

async function runClaude(prompt: string, timeoutMs = 600000): Promise<string> {
  const out = await invoke<string>("vn_run_claude", { prompt, timeoutMs });
  return out.trim();
}

/* ---------------- 写剧本 ---------------- */
export async function writeScript(
  name: string, intent: string, acts: number, onProgress: Progress
): Promise<CompileResult> {
  onProgress(`① 生成 VN 大纲(${acts} 幕)…`, "大纲");
  const outlinePrompt = VN_SPEC
    + `\n\n【任务】为一部「灵动引擎」动效视觉小说产出 script.md 的「骨架」:\n`
    + `- 主题意图:${intent}\n`
    + `- 规模:${acts} 幕;每幕 3~7 个场景;结局 ≥4 个;抉择 ≥3 处且分布在不同幕(不要全压在最后一场);单周目 ≥10 分钟。\n`
    + `- 只输出:完整头部(标题/副标题/画风/角色 2~4 个含外貌与声线/每人 1~3 个姿势)`
    + ` + 每幕的「## 幕 actN · 幕名」行 + 该幕每个场景一行「### 场景id 场景名 <!-- 一句剧情要点+氛围 -->」`
    + `(结局写成「### E_xxx 结局名 [结局:档位] <!-- 要点 -->」)。\n`
    + `- 场景 id:第N幕第M景 sc_aN_MM;结局 E_ 前缀。台词此阶段不要写。`;
  const outline = stripFences(await runClaude(outlinePrompt, 420000));
  if (!/^#\s/.test(outline.trim())) throw new Error("大纲产出格式异常(未以 # 标题开头)");
  await invoke("vn_write_file", { name, file: "outline.md", content: outline });

  const actBlocks = outline.split(/\n(?=## 幕 )/);
  const header = actBlocks.shift()!;
  if (!actBlocks.length) throw new Error("大纲里没有任何「## 幕」");
  onProgress(`✓ 大纲完成:${actBlocks.length} 幕`);

  const written: string[] = [];
  for (let i = 0; i < actBlocks.length; i++) {
    const aHead = actBlocks[i].split("\n")[0];
    onProgress(`② 撰写 ${aHead.replace("## ", "")} …`, `写作 ${i + 1}/${actBlocks.length}`);
    const prevTail = written.length ? written[written.length - 1].split("\n").slice(-25).join("\n") : "(这是第一幕)";
    const aPrompt = VN_SPEC
      + `\n\n【任务】按骨架把这一幕写成完整的 script.md 幕块:每个场景写全 背景/环境音/粒子/滤镜/音乐/台词(含站位@、姿势、→移动、退场、镜头)/下一步或抉择,结局带结语。遵守全部格式与演出经验法则。\n`
      + `【游戏头部(角色与姿势以此为准,不许新增角色)】\n${header}\n`
      + `【全局骨架】\n${actBlocks.map(c => c.split("\n").slice(0, 14).join("\n")).join("\n")}\n`
      + `【上一幕结尾(衔接用)】\n${prevTail}\n`
      + `【本幕骨架(逐场景写全,id 不许改)】\n${actBlocks[i]}\n`
      + `只输出这一幕完整的「## 幕 …」块。`;
    const aOut = stripFences(await runClaude(aPrompt));
    if (!/^## 幕 /.test(aOut.trim())) throw new Error(`第${i + 1}幕产出格式异常`);
    written.push(aOut.trim());
    onProgress(`✓ ${aHead.replace("## ", "")} 完成(${aOut.length} 字)`);
  }

  onProgress("③ 组装完成,编译校验…", "组装编译");
  let script = header.trim() + "\n\n" + written.join("\n\n") + "\n";
  let rep = compile(script);
  let repair = 0;
  while (!rep.ok && repair < 2) {
    repair++;
    onProgress(`⚠ 编译有 ${rep.errors.length} 处错误,AI 自修复第 ${repair} 轮…`, `自修复 ${repair}/2`);
    const fixPrompt = VN_SPEC
      + `\n\n【任务】下面这份灵动剧本 script.md 编译报错,修复全部错误,输出修复后的完整 script.md(全文)。不许缩减规模。\n`
      + `【错误清单】\n${rep.errors.map(e => "- " + e.msg).join("\n")}\n【script.md 全文】\n${script}`;
    script = stripFences(await runClaude(fixPrompt)) + "\n";
    rep = compile(script);
  }
  if (!rep.ok) throw new Error("自修复 2 轮后仍有编译错误: " + rep.errors.map(e => e.msg).join(";").slice(0, 500));

  await invoke("vn_write_file", { name, file: "script.md", content: script });
  await invoke("vn_write_file", { name, file: "project.js", content: rep.js! });
  const s = rep.stats!;
  onProgress(`✓ 灵动剧本完成:${s.scenes} 场景 / ${s.endings} 结局 / ${s.beats} 拍 / 估 ${s.minutes} 分钟(${rep.warnings.length} 条警告)`, "完成");
  return rep;
}

/* ---------------- 保存并编译(手改剧本) ---------------- */
export async function saveAndCompile(name: string, script: string): Promise<CompileResult> {
  let prev: { project?: VNProject; gp?: any } | undefined;
  try {
    const old = await invoke<string>("vn_read_file", { name, file: "project.js" });
    const w: any = {};
    new Function("window", old)(w);
    prev = { project: w.VN_PROJECT, gp: w.GAME_PROJECT };
  } catch (_) { /* 首次编译 */ }
  const rep = compile(script, prev);
  await invoke("vn_write_file", { name, file: "script.md", content: script });
  if (rep.ok) await invoke("vn_write_file", { name, file: "project.js", content: await fixBgExtStr(name, rep.js!) });
  return rep;
}

/* project.js 里 bg 默认 .jpg;已生成 .png 的改指实际文件 */
async function fixBgExtStr(name: string, js: string): Promise<string> {
  try {
    const files = await invoke<string[]>("vn_list_assets", { name });
    for (const f of files) {
      if (/\.png$/i.test(f)) js = js.split('"' + f.replace(/\.png$/i, ".jpg") + '"').join('"' + f + '"');
    }
  } catch (_) {}
  return js;
}

/* ---------------- 生图 ---------------- */
export interface ImgJob { kind: "bg" | "sprite"; file: string; prompt: string; label: string }

export async function collectJobs(name: string, project: VNProject, force: boolean): Promise<ImgJob[]> {
  const jobs: ImgJob[] = [];
  const existing = new Set<string>(await invoke<string[]>("vn_list_assets", { name }));
  const has = (f: string) => existing.has(f) || existing.has(f.replace(/\.jpg$/i, ".png"));
  for (const sp of project.sprites) {
    if (!force && has(sp.file)) continue;
    jobs.push({ kind: "sprite", file: sp.file, prompt: (project.meta.sprHint || "") + ". " + sp.prompt, label: "立绘·" + sp.char + "·" + sp.pose });
  }
  const seen = new Set<string>();
  for (const id of project.order) {
    const sc = project.scenes[id];
    if (!sc.bg || !sc.imgPrompt || sc.bgManual || seen.has(sc.bg)) continue;
    seen.add(sc.bg);
    if (!force && has(sc.bg)) continue;
    jobs.push({ kind: "bg", file: sc.bg.replace(/\.jpg$/i, ".png"), prompt: (project.meta.styleHint || "") + "。" + sc.imgPrompt, label: sc.name });
  }
  if ((force || !has("bg_title.jpg")) && project.meta.theme)
    jobs.unshift({ kind: "bg", file: "bg_title.png", prompt: (project.meta.styleHint || "") + "。游戏标题页主视觉:" + project.meta.theme, label: "扉页" });
  return jobs;
}

export async function genImages(
  name: string, jobs: ImgJob[], onProgress: Progress, isStopped?: () => boolean
): Promise<{ ok: number; failed: ImgJob[] }> {
  let cursor = 0, ok = 0;
  const failed: ImgJob[] = [];
  onProgress(`待生成 ${jobs.length} 张(并发2,每线独立 CODEX_HOME)`);
  async function worker(wi: number) {
    while (cursor < jobs.length && !(isStopped && isStopped())) {
      const j = jobs[cursor++];
      onProgress(`▸ ${j.label} (${j.file})`, `生图 ${ok + failed.length + 1}/${jobs.length}`);
      let good = false;
      try {
        good = await invoke<boolean>("vn_codex_shot", { name, file: j.file, prompt: j.prompt, sprite: j.kind === "sprite", worker: wi });
        if (!good) {
          onProgress(`retry ${j.file}`);
          good = await invoke<boolean>("vn_codex_shot", { name, file: j.file, prompt: j.prompt, sprite: j.kind === "sprite", worker: wi });
        }
      } catch (e: any) { onProgress("✗ " + (e?.message || e)); }
      if (good) { ok++; onProgress(`OK ${j.file}`); }
      else { failed.push(j); onProgress(`XX ${j.file} 失败`); }
    }
  }
  await Promise.all([worker(1), worker(2)]);
  // bg 落盘为 .png,把 project.js 里的 .jpg 引用改过来
  try {
    const js = await invoke<string>("vn_read_file", { name, file: "project.js" });
    await invoke("vn_write_file", { name, file: "project.js", content: await fixBgExtStr(name, js) });
  } catch (_) {}
  onProgress(`生图结束 ok=${ok} fail=${failed.length}`, "完成");
  return { ok, failed };
}

/* ---------------- 试玩/导出的 HTML 组装 ---------------- */
import engineSrc from "./vn-engine.js?raw";

export async function buildPlayHtml(name: string, previewScene?: string): Promise<string> {
  const pjs = await invoke<string>("vn_read_file", { name, file: "project.js" });
  const assets = await invoke<Record<string, string>>("vn_assets_b64", { name });
  const esc = (s: string) => s.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title>
<style>html,body{margin:0;background:#0e1319}</style></head><body>
<script>window.ASSET_DATA=${esc(JSON.stringify(assets))};${previewScene ? `window.PREVIEW_SCENE=${JSON.stringify(previewScene)};` : ""}</script>
<script>${esc(pjs)}</script>
<script>${esc(engineSrc)}</script>
</body></html>`;
}

export async function exportStandalone(name: string): Promise<{ path: string; mb: number }> {
  const html = await buildPlayHtml(name);
  const path = await invoke<string>("vn_export", { name, html });
  return { path, mb: Math.round(html.length / 1024 / 1024 * 100) / 100 };
}
