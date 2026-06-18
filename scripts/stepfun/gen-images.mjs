// 生图:读 jobs JSON [{key,prompt,size?}],调 step-1x-medium 文生图,下载到 public/story-art/<key>.png
// 幂等(已存在跳过)、并发4、失败重试3。
// 用法: node scripts/stepfun/gen-images.mjs <jobs.json> [--force] [--size 1024x576] [--concurrency 4]
import fs from "node:fs";
import path from "node:path";
import {
  ART_DIR,
  BASE,
  IMAGE_MODEL,
  authHeaders,
  pool,
  sleep,
} from "./config.mjs";

const args = process.argv.slice(2);
const jobsFile = args[0];
if (!jobsFile) {
  console.error("用法: node gen-images.mjs <jobs.json> [--force] [--size WxH] [--concurrency N]");
  process.exit(1);
}
const FORCE = args.includes("--force");
const SIZE = argVal("--size", "1280x800"); // 宽幅,适配横向舞台(模型支持:1280x800)
const CONC = Number(argVal("--concurrency", "4"));

function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
if (!Array.isArray(jobs)) {
  console.error("jobs 必须是数组");
  process.exit(1);
}

// 全局风格锚点:无论哪个子 agent 写 prompt,都统一成水墨叙事风,保证整库视觉一致。
const STYLE_ANCHOR =
  " | traditional Chinese ink wash painting, shuimo aesthetic, muted desaturated ink tones, atmospheric mist, generous negative space, cinematic wide composition, soft rice-paper brush texture, elegant and restrained, no text, no caption, no watermark, no signature";

function targetPath(key) {
  // key: "game/scene" → public/story-art/game/scene.png
  const safe = key.replace(/[^\w\-/]/g, "_");
  return path.join(ART_DIR, safe + ".png");
}

function fullPrompt(job) {
  if (job.noStyle) return job.prompt;
  return job.prompt + STYLE_ANCHOR;
}

async function genOne(job) {
  const { key, prompt } = job;
  const out = targetPath(key);
  if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 2000) {
    return { key, status: "skip" };
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const size = job.size || SIZE;
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(`${BASE}/images/generations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt: fullPrompt(job),
          size,
          n: 1,
          response_format: "url",
        }),
      });
      if (!resp.ok) {
        lastErr = `http ${resp.status}: ${(await resp.text()).slice(0, 160)}`;
        if (resp.status === 429 || resp.status >= 500) {
          await sleep(2500 * attempt);
          continue;
        }
        break; // 4xx 其它直接放弃该 job
      }
      const json = await resp.json();
      const url = json?.data?.[0]?.url;
      const b64 = json?.data?.[0]?.b64_json;
      if (url) {
        const img = await fetch(url);
        if (!img.ok) throw new Error(`download http ${img.status}`);
        const buf = Buffer.from(await img.arrayBuffer());
        fs.writeFileSync(out, buf);
      } else if (b64) {
        fs.writeFileSync(out, Buffer.from(b64, "base64"));
      } else {
        lastErr = "no url/b64 in response";
        await sleep(1500 * attempt);
        continue;
      }
      return { key, status: "ok", bytes: fs.statSync(out).size };
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
  const r = await genOne(job);
  if (r.status === "ok") ok++;
  else if (r.status === "skip") skip++;
  else {
    fail++;
    fails.push(r);
  }
  const tag = r.status === "ok" ? "✓" : r.status === "skip" ? "·" : "✗";
  console.log(
    `[${i + 1}/${jobs.length}] ${tag} ${job.key}` +
      (r.status === "fail" ? `  ${r.err}` : "")
  );
});

console.log(`\n=== images done: ok=${ok} skip=${skip} fail=${fail} ===`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log(`  ${f.key}: ${f.err}`);
  process.exitCode = 2;
}
