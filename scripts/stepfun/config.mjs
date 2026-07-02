// 阶跃星辰(StepFun)生成流水线 —— 共享配置。
// 生图:step-1x-medium(文生图);配音:stepaudio-2.5-tts。
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");

// key 只从环境变量读,不给硬编码兜底(硬编码等于把密钥提交进仓库)。缺失时立即报错退出。
export const STEP_KEY = process.env.STEPFUN_KEY || "";
if (!STEP_KEY) {
  console.error("缺少环境变量 STEPFUN_KEY（阶跃星辰 API Key）");
  process.exit(1);
}

export const BASE = "https://api.stepfun.com/v1";
export const IMAGE_MODEL = "step-1x-medium";
export const TTS_MODEL = "stepaudio-2.5-tts";

export const ART_DIR = path.join(ROOT, "public", "story-art");
export const VOICE_DIR = path.join(ROOT, "public", "story-voice");

// 可用旁白音色(已实测可用)
export const VOICES = {
  cixingnansheng: "磁性男声",
  shenchennanyin: "深沉男音",
  wenrounvsheng: "温柔女声",
  qinqienvsheng: "亲切女声",
  linjiajiejie: "邻家姐姐",
  lengyanyujie: "冷艳御姐",
};

export function authHeaders(json = true) {
  const h = { Authorization: `Bearer ${STEP_KEY}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 简单并发池:对 items 跑 worker(item,i),最多 n 并发。
export async function pool(items, n, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}
