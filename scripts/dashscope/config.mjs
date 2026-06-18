// 阿里云 DashScope 通义万相 视频生成 —— 共享配置。
// 文生视频 t2v + 图生视频 i2v(把已有水墨静图变成会动的循环短片)。
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");

export const DASH_KEY = process.env.DASHSCOPE_KEY || "sk-ca3639e450044a23ae5c84045dd2ca11";

export const BASE = "https://dashscope.aliyuncs.com/api/v1";
export const SYNTH_URL = `${BASE}/services/aigc/video-generation/video-synthesis`;
export const taskUrl = (id) => `${BASE}/tasks/${id}`;

export const T2V_MODEL = "wanx2.1-t2v-turbo"; // 文生视频
export const I2V_MODEL = "wanx2.1-i2v-turbo"; // 图生视频(动画化静图)

export const VIDEO_DIR = path.join(ROOT, "public", "story-video");

export function headers(async = true) {
  const h = { Authorization: `Bearer ${DASH_KEY}`, "Content-Type": "application/json" };
  if (async) h["X-DashScope-Async"] = "enable";
  return h;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
