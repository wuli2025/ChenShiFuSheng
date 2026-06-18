// 视频生成:读 jobs JSON [{key,prompt,size?,noI2v?}],下载到 public/story-video/<key>.mp4
// 默认图生视频(i2v):若 public/story-art/<key>.png 存在,就把那张水墨静图动画化;
// 否则文生视频(t2v)。异步建任务→轮询→下载。幂等、并发2(视频任务重)。
// 用法: node scripts/dashscope/gen-video.mjs <jobs.json> [--force] [--concurrency 2] [--t2v]
import fs from "node:fs";
import path from "node:path";
import {
  VIDEO_DIR,
  ROOT,
  SYNTH_URL,
  taskUrl,
  T2V_MODEL,
  I2V_MODEL,
  headers,
  pool,
  sleep,
} from "./config.mjs";

const args = process.argv.slice(2);
const jobsFile = args[0];
if (!jobsFile) {
  console.error("用法: node gen-video.mjs <jobs.json> [--force] [--concurrency N] [--t2v]");
  process.exit(1);
}
const FORCE = args.includes("--force");
const FORCE_T2V = args.includes("--t2v");
const ci = args.indexOf("--concurrency");
const CONC = ci >= 0 && args[ci + 1] ? Number(args[ci + 1]) : 2;

const ART_DIR = path.join(ROOT, "public", "story-art");
const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));

function outPath(key) {
  return path.join(VIDEO_DIR, key.replace(/[^\w\-/]/g, "_") + ".mp4");
}
function artPath(key) {
  return path.join(ART_DIR, key.replace(/[^\w\-/]/g, "_") + ".png");
}
function dataUri(file) {
  const b64 = fs.readFileSync(file).toString("base64");
  return `data:image/png;base64,${b64}`;
}

async function createTask(job) {
  const src = artPath(job.key);
  const useI2v = !FORCE_T2V && !job.noI2v && fs.existsSync(src);
  const body = useI2v
    ? {
        model: I2V_MODEL,
        input: { prompt: job.prompt, img_url: dataUri(src) },
        parameters: { resolution: "720P", prompt_extend: true },
      }
    : {
        model: T2V_MODEL,
        input: { prompt: job.prompt },
        parameters: { size: job.size || "1280*720" },
      };
  const resp = await fetch(SYNTH_URL, { method: "POST", headers: headers(true), body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`create http ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  const j = await resp.json();
  const id = j?.output?.task_id;
  if (!id) throw new Error(`no task_id: ${JSON.stringify(j).slice(0, 160)}`);
  return { id, mode: useI2v ? "i2v" : "t2v" };
}

async function pollTask(id) {
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const resp = await fetch(taskUrl(id), { headers: headers(false) });
    if (!resp.ok) continue;
    const j = await resp.json();
    const st = j?.output?.task_status;
    if (st === "SUCCEEDED") return j.output.video_url;
    if (st === "FAILED" || st === "UNKNOWN")
      throw new Error(`task ${st}: ${j?.output?.message || ""}`);
  }
  throw new Error("poll timeout (>10min)");
}

async function genOne(job) {
  const out = outPath(job.key);
  if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 10000) return { key: job.key, status: "skip" };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { id, mode } = await createTask(job);
      const url = await pollTask(id);
      const vid = await fetch(url);
      if (!vid.ok) throw new Error(`download http ${vid.status}`);
      fs.writeFileSync(out, Buffer.from(await vid.arrayBuffer()));
      return { key: job.key, status: "ok", mode, bytes: fs.statSync(out).size };
    } catch (e) {
      lastErr = String(e?.message || e);
      await sleep(3000 * attempt);
    }
  }
  return { key: job.key, status: "fail", err: lastErr };
}

let ok = 0, skip = 0, fail = 0;
const fails = [];
await pool(jobs, CONC, async (job, i) => {
  const r = await genOne(job);
  if (r.status === "ok") ok++;
  else if (r.status === "skip") skip++;
  else { fail++; fails.push(r); }
  const tag = r.status === "ok" ? `✓ ${r.mode}` : r.status === "skip" ? "·" : "✗";
  console.log(`[${i + 1}/${jobs.length}] ${tag} ${job.key}` + (r.status === "fail" ? `  ${r.err}` : ""));
});

console.log(`\n=== video done: ok=${ok} skip=${skip} fail=${fail} ===`);
if (fails.length) {
  for (const f of fails) console.log(`  ${f.key}: ${f.err}`);
  process.exitCode = 2;
}
