// Pollinations(Flux)文生图流水线 —— 无需 API Key,为剧情场景生成真实栅格配图。
// 读 jobs JSON [{key,prompt}],GET image.pollinations.ai 下载到 public/story-art/<key>.png。
// 幂等(已存在且>3KB跳过)、并发可调、失败重试。
// 用法: node scripts/pollinations/gen.mjs <jobs.json> [--force] [--concurrency 3] [--w 1280] [--h 800]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const ART_DIR = path.join(ROOT, "public", "story-art");

const args = process.argv.slice(2);
const jobsFile = args[0];
if (!jobsFile) {
  console.error("用法: node gen.mjs <jobs.json> [--force] [--concurrency N] [--w W] [--h H]");
  process.exit(1);
}
const FORCE = args.includes("--force");
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const CONC = Number(argVal("--concurrency", "3"));
const W = Number(argVal("--w", "1280"));
const H = Number(argVal("--h", "800"));

const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
if (!Array.isArray(jobs)) { console.error("jobs 必须是数组"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function targetPath(key) {
  const safe = key.replace(/[^\w\-/]/g, "_");
  return path.join(ART_DIR, safe + ".png");
}
// 稳定种子:由 key 派生,保证可复现且每图不同。
function seedFor(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1000000;
}

async function genOne(job) {
  const { key, prompt } = job;
  const out = targetPath(key);
  if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 3000) return { key, status: "skip" };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const seed = job.seed ?? seedFor(key);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${W}&height=${H}&nologo=true&model=flux&seed=${seed}&enhance=true`;
  let lastErr = "";
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 150000);
      const resp = await fetch(url, { signal: ctrl.signal, headers: { Accept: "image/png" } });
      clearTimeout(timer);
      // 429/5xx:退避后重试(免费匿名档限流;多遍 pass 兜底,本张退避适中即可)
      if (!resp.ok) { lastErr = `http ${resp.status}`; await sleep(3000 * attempt + Math.floor(Math.random() * 1500)); continue; }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 3000) { lastErr = `tiny ${buf.length}b`; await sleep(3000 * attempt); continue; }
      fs.writeFileSync(out, buf);
      return { key, status: "ok", bytes: buf.length };
    } catch (e) {
      lastErr = String(e?.message || e);
      await sleep(5000 * attempt);
    }
  }
  return { key, status: "fail", err: lastErr };
}

let ok = 0, skip = 0, fail = 0;
const fails = [];
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const i = cursor++;
    const r = await genOne(jobs[i]);
    if (r.status === "ok") ok++; else if (r.status === "skip") skip++; else { fail++; fails.push(r); }
    const tag = r.status === "ok" ? "OK " : r.status === "skip" ? " . " : "XX ";
    console.log(`[${i + 1}/${jobs.length}] ${tag}${jobs[i].key}` + (r.status === "fail" ? `  ${r.err}` : r.bytes ? `  ${(r.bytes/1024|0)}KB` : ""));
    // 礼貌间隔:仅真正请求过时留出小节流窗口(并发已铺开,小间隔即可)
    if (r.status !== "skip") await sleep(800);
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, () => worker()));
console.log(`\n=== done: ok=${ok} skip=${skip} fail=${fail} ===`);
if (fails.length) { console.log("FAILED:", fails.map((f) => f.key).join(", ")); process.exitCode = 2; }
