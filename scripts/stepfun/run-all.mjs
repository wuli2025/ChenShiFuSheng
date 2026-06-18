// 一键补齐:顺序跑 jobs/ 下所有 <game>.art.json 与 <game>.tts.json(并发1,避开账号共享并发上限5)。
// 幂等:已生成的图/音频自动跳过,只补缺失。充值后直接 `node scripts/stepfun/run-all.mjs`。
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const jobsDir = path.join(here, "jobs");
const files = fs.readdirSync(jobsDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));

const artJobs = files.filter((f) => f.endsWith(".art.json")).sort();
const ttsJobs = files.filter((f) => f.endsWith(".tts.json")).sort();

function run(script, jobFile) {
  const full = path.join(jobsDir, jobFile);
  console.log(`\n>>> ${script}  ${jobFile}`);
  const r = spawnSync(process.execPath, [path.join(here, script), full, "--concurrency", "1"], {
    stdio: "inherit",
  });
  return r.status === 0;
}

console.log(`生图任务 ${artJobs.length} 个,配音任务 ${ttsJobs.length} 个。并发1顺序跑(幂等)。`);
let allOk = true;
for (const j of artJobs) allOk = run("gen-images.mjs", j) && allOk;
for (const j of ttsJobs) allOk = run("gen-tts.mjs", j) && allOk;

console.log(`\n=== 生成结束 ${allOk ? "(全部成功)" : "(仍有失败,多半是额度未到位,充值后再跑一次本脚本)"} ===`);

// 自动装配:扫描已落盘的图/音,重建 art-manifest.ts,游戏即时生效。
console.log("\n>>> 重建 manifest…");
spawnSync(process.execPath, [path.join(here, "build-manifest.mjs")], { stdio: "inherit" });

process.exitCode = allOk ? 0 : 2;
