// 尘世浮生 · 生成 worker
// 消费 BullMQ "generate" 队列,在沙箱约束下驱动 claude / codex CLI 生产
// 剧本 JSON 与插图,产物归档到共享 assets 卷,状态/进度回写 Postgres,
// 进度事件经 Redis pub/sub 推给 api 的 SSE。
import { Worker } from "bullmq";
import Redis from "ioredis";
import pg from "pg";
import pino from "pino";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeJobDir, cleanJobDir, runSandboxed } from "./sandbox.mjs";
import { appendTimeline } from "./timeline.mjs";

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const REDIS_URL = process.env.REDIS_URL;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const pub = new Redis(REDIS_URL);

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 4);
const SCRIPT_TIMEOUT_MS = Number(process.env.SCRIPT_TIMEOUT_SECS || 600) * 1000;
const IMAGE_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_SECS || 300) * 1000;
const ASSETS_DIR = process.env.ASSETS_DIR || "/data/assets";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// 复现留痕:把「实际发给 CLI 的完整指令 + 参数」逐字写到 assets/<jobId>/manifest.json。
// 任务临时目录(dir/REQUEST.md 等)会被 cleanJobDir 整个清掉,唯这份 manifest 随产物长存——
// 支撑 PRD v6 §05 验收:「实发 prompt 逐字核对 + 同参重跑结构一致」。
async function archiveManifest(jobId, manifest) {
  const outDir = path.join(ASSETS_DIR, String(jobId));
  await mkdir(outDir, { recursive: true });
  const rec = { jobId: String(jobId), archivedAt: new Date().toISOString(), ...manifest };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(rec, null, 2));
  return `/assets/${jobId}/manifest.json`;
}

async function setJob(jobId, fields) {
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(fields)) {
    vals.push(v);
    sets.push(`${k} = $${vals.length}${k === "result" ? "::jsonb" : ""}`);
  }
  vals.push(jobId);
  await pool.query(
    `update jobs set ${sets.join(", ")}, updated_at = now() where id = $${vals.length}`,
    vals
  );
}

async function publish(jobId, payload) {
  await pub.publish(`job:${jobId}`, JSON.stringify(payload)).catch(() => {});
}

async function isCancelled(jobId) {
  const { rows } = await pool.query("select status from jobs where id = $1", [jobId]);
  return !rows[0] || rows[0].status === "cancelled";
}

// 订阅取消指令 → AbortController 击杀沙箱进程组
function watchCancel(jobId) {
  const ac = new AbortController();
  const sub = new Redis(REDIS_URL);
  sub.subscribe(`job:${jobId}:ctl`).then(() =>
    sub.on("message", (_c, m) => { if (m === "cancel") ac.abort(); })
  );
  return { signal: ac.signal, close: () => sub.quit().catch(() => {}) };
}

// ── 剧本生成:claude CLI 无头模式,产出严格 JSON 剧本 ──────────────
async function genScript(jobId, prompt, params, dir, signal) {
  const spec = [
    "你是人生模拟器剧本生产流水线。根据下面的需求生成完整剧本 JSON,",
    "只输出一个 JSON 对象写入 script.json 文件,结构:",
    `{"meta":{"title","theme","version"},"stats":[...],"nodes":{...},"endings":[...]}`,
    "节点须构成有向无环图,每个结局可达。需求:",
    prompt,
  ].join("\n");
  await writeFile(path.join(dir, "REQUEST.md"), spec);

  const argv = ["-p", `按 REQUEST.md 的要求生成剧本,把最终 JSON 写入 ${dir}/script.json`,
     "--output-format", "json", "--max-turns", String(params.maxTurns || 30),
     "--dangerously-skip-permissions"];
  // 先落 manifest 再跑:即便任务失败/被取消,也留下「发了什么」的证据供排障与复现
  const manifest = await archiveManifest(jobId, {
    kind: "script", engine: CLAUDE_BIN, argv, params, request: spec,
  });

  const r = await runSandboxed(CLAUDE_BIN, argv, {
    cwd: dir, timeoutMs: SCRIPT_TIMEOUT_MS, signal,
    onStdout: () => publish(jobId, { type: "progress", note: "生成中" }),
  });
  if (r.timedOut) throw new Error("剧本生成超时");
  const raw = await readFile(path.join(dir, "script.json"), "utf8")
    .catch(() => { throw new Error(`剧本文件未产出(exit=${r.code}): ${r.stderr.slice(0, 500)}`); });
  const script = JSON.parse(raw); // 非法 JSON 直接抛错,任务判失败
  if (!script.nodes || !script.endings) throw new Error("剧本结构缺 nodes/endings");
  return { script, manifest };
}

// ── 插图生成:codex CLI,产物图片归档到 assets 卷 ──────────────────
async function genImage(jobId, prompt, params, dir, signal, kindLabel = "image") {
  const argv = ["exec", "--skip-git-repo-check", "-C", dir,
     `用生图能力生成插画并保存为 PNG 到当前目录:${prompt}`];
  const manifest = await archiveManifest(jobId, {
    kind: kindLabel, engine: CODEX_BIN, argv, params, prompt,
  });
  const r = await runSandboxed(CODEX_BIN, argv,
    { cwd: dir, timeoutMs: IMAGE_TIMEOUT_MS, signal }
  );
  if (r.timedOut) throw new Error("生图超时");
  const files = [];
  for (const f of await readdir(dir)) {
    if (!IMAGE_EXTS.has(path.extname(f).toLowerCase())) continue;
    const s = await stat(path.join(dir, f));
    if (s.size > 1024) files.push(f); // 过滤空壳文件
  }
  if (!files.length)
    throw new Error(`生图无产物(exit=${r.code}): ${r.stderr.slice(0, 500)}`);
  const outDir = path.join(ASSETS_DIR, String(jobId));
  await mkdir(outDir, { recursive: true });
  const assets = [];
  for (const f of files) {
    await copyFile(path.join(dir, f), path.join(outDir, f));
    assets.push(`/assets/${jobId}/${f}`);
  }
  return { assets, manifest };
}

// ── 封面生成:与 image 同管线,但产物归档为 assets/<jobId>/cover.png,
//    再把 projects.cover_asset 更新为该路径 ────────────────────────────
async function genCover(jobId, projectId, prompt, params, dir, signal) {
  const { assets, manifest } = await genImage(jobId, prompt, params, dir, signal, "cover");
  // 把首张产物另存为固定的 cover.png,便于发布体检与内嵌
  const outDir = path.join(ASSETS_DIR, String(jobId));
  const first = assets[0].split("/").pop();
  const coverRel = `/assets/${jobId}/cover.png`;
  await copyFile(path.join(outDir, first), path.join(outDir, "cover.png"));
  if (projectId) {
    await pool.query(
      "update projects set cover_asset = $1, updated_at = now() where id = $2",
      [coverRel, projectId]
    );
  }
  return { assets, cover: coverRel, manifest };
}

const NOT_IMPL = new Set(["sprite", "voice", "assemble", "revise"]);

const worker = new Worker(
  "generate",
  async (job) => {
    const { jobId, kind, prompt, params, projectId } = job.data;
    if (await isCancelled(jobId)) return;
    await setJob(jobId, { status: "running", progress: 5 });
    await publish(jobId, { type: "status", status: "running" });
    await appendTimeline(pool, pub, projectId, "job_progress",
      { jobId, kind, status: "running", progress: 5 });
    const dir = await makeJobDir(jobId);
    const cancel = watchCancel(jobId);
    try {
      let result;
      if (kind === "script") result = await genScript(jobId, prompt, params, dir, cancel.signal);
      else if (kind === "image") result = await genImage(jobId, prompt, params, dir, cancel.signal);
      else if (kind === "cover") result = await genCover(jobId, projectId, prompt, params, dir, cancel.signal);
      else if (NOT_IMPL.has(kind)) throw new Error(`任务类型 ${kind} 尚未实现`);
      else throw new Error(`未知任务类型 ${kind}`);
      if (await isCancelled(jobId)) return;
      await setJob(jobId, { status: "done", progress: 100, result: JSON.stringify(result) });
      await publish(jobId, { type: "status", status: "done", result });
      await appendTimeline(pool, pub, projectId, "job_result",
        { jobId, kind, status: "done", result });
    } catch (e) {
      if (await isCancelled(jobId)) return;
      const msg = String(e.message || e);
      await setJob(jobId, { status: "failed", error: msg.slice(0, 2000) });
      await publish(jobId, { type: "status", status: "failed", error: msg });
      await appendTimeline(pool, pub, projectId, "job_result",
        { jobId, kind, status: "failed", error: msg.slice(0, 2000) });
      throw e; // 交给 BullMQ 按 attempts 重试
    } finally {
      cancel.close();
      await cleanJobDir(jobId).catch(() => {});
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: CONCURRENCY,
    lockDuration: Math.max(SCRIPT_TIMEOUT_MS, IMAGE_TIMEOUT_MS) + 60_000,
  }
);

worker.on("failed", (job, err) => log.error({ job: job?.id, err: err.message }, "job failed"));
worker.on("completed", (job) => log.info({ job: job.id }, "job done"));
log.info({ concurrency: CONCURRENCY }, "worker up");

const shutdown = async () => { await worker.close(); await pool.end(); pub.disconnect(); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
