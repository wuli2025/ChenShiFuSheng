// 配音:读 jobs JSON [{key,text,voice?,speed?}],调 stepaudio-2.5-tts,下载到 public/story-voice/<key>.mp3
// 幂等、并发3、失败重试3。
// 用法: node scripts/stepfun/gen-tts.mjs <jobs.json> [--force] [--concurrency 3]
import fs from "node:fs";
import path from "node:path";
import {
  VOICE_DIR,
  BASE,
  TTS_MODEL,
  authHeaders,
  pool,
  sleep,
} from "./config.mjs";

const args = process.argv.slice(2);
const jobsFile = args[0];
if (!jobsFile) {
  console.error("用法: node gen-tts.mjs <jobs.json> [--force] [--concurrency N]");
  process.exit(1);
}
const FORCE = args.includes("--force");
const ci = args.indexOf("--concurrency");
const CONC = ci >= 0 && args[ci + 1] ? Number(args[ci + 1]) : 3;
const DEFAULT_VOICE = "cixingnansheng";

const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));

function targetPath(key) {
  const safe = key.replace(/[^\w\-/]/g, "_");
  return path.join(VOICE_DIR, safe + ".mp3");
}

async function ttsOne(job) {
  const { key, text } = job;
  const voice = job.voice || DEFAULT_VOICE;
  const out = targetPath(key);
  if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 1200) {
    return { key, status: "skip" };
  }
  if (!text || !text.trim()) return { key, status: "skip" };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(`${BASE}/audio/speech`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          model: TTS_MODEL,
          input: text.slice(0, 900),
          voice,
          response_format: "mp3",
          speed: job.speed || 0.92,
        }),
      });
      if (!resp.ok) {
        lastErr = `http ${resp.status}: ${(await resp.text()).slice(0, 160)}`;
        if (resp.status === 429 || resp.status >= 500) {
          await sleep(2500 * attempt);
          continue;
        }
        break;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 1200) {
        lastErr = `audio too small (${buf.length}B)`;
        await sleep(1500 * attempt);
        continue;
      }
      fs.writeFileSync(out, buf);
      return { key, status: "ok", bytes: buf.length };
    } catch (e) {
      lastErr = String(e?.message || e);
      await sleep(1500 * attempt);
    }
  }
  return { key, status: "fail", err: lastErr };
}

let ok = 0,
  skip = 0,
  fail = 0;
const fails = [];
await pool(jobs, CONC, async (job, i) => {
  const r = await ttsOne(job);
  if (r.status === "ok") ok++;
  else if (r.status === "skip") skip++;
  else {
    fail++;
    fails.push(r);
  }
  const tag = r.status === "ok" ? "✓" : r.status === "skip" ? "·" : "✗";
  console.log(`[${i + 1}/${jobs.length}] ${tag} ${job.key}` + (r.status === "fail" ? `  ${r.err}` : ""));
});

console.log(`\n=== tts done: ok=${ok} skip=${skip} fail=${fail} ===`);
if (fails.length) {
  for (const f of fails) console.log(`  ${f.key}: ${f.err}`);
  process.exitCode = 2;
}
