// 扫描 public/story-art 与 public/story-voice,生成 src/game/art-manifest.ts。
// 键为 "<game>/<scene>",值为公网根路径(Vite/Tauri 下 public 映射到 /)。
import fs from "node:fs";
import path from "node:path";
import { ART_DIR, VOICE_DIR, ROOT } from "./config.mjs";
const VIDEO_DIR = path.join(ROOT, "public", "story-video");

function scan(dir, ext, urlBase) {
  const map = {};
  if (!fs.existsSync(dir)) return map;
  for (const game of fs.readdirSync(dir)) {
    const gdir = path.join(dir, game);
    if (!fs.statSync(gdir).isDirectory()) continue;
    for (const file of fs.readdirSync(gdir)) {
      if (!file.endsWith(ext)) continue;
      const scene = file.slice(0, -ext.length);
      const size = fs.statSync(path.join(gdir, file)).size;
      if (size < 1000) continue; // 跳过空/坏文件
      map[`${game}/${scene}`] = `${urlBase}/${game}/${file}`;
    }
  }
  return map;
}

const art = scan(ART_DIR, ".png", "/story-art");
const voice = scan(VOICE_DIR, ".mp3", "/story-voice");
const video = scan(VIDEO_DIR, ".mp4", "/story-video");

const out = `// 自动生成 —— 请勿手改。由 scripts/stepfun/build-manifest.mjs 扫描 public/story-art 与 public/story-voice 产出。
// 键: "<gameId>/<sceneId>" → 静态资源根路径。GameView/playModel 据此把真实配图与旁白配音挂到场景上。
export const ART: Record<string, string> = ${JSON.stringify(art, null, 2)};

export const VOICE: Record<string, string> = ${JSON.stringify(voice, null, 2)};

export const VIDEO: Record<string, string> = ${JSON.stringify(video, null, 2)};

export function artFor(gameId: string, sceneId: string): string | undefined {
  return ART[gameId + "/" + sceneId];
}
export function voiceFor(gameId: string, sceneId: string): string | undefined {
  return VOICE[gameId + "/" + sceneId];
}
export function videoFor(gameId: string, sceneId: string): string | undefined {
  return VIDEO[gameId + "/" + sceneId];
}
`;

const dest = path.join(ROOT, "src", "game", "art-manifest.ts");
fs.writeFileSync(dest, out);
console.log(`manifest written: ${Object.keys(art).length} images, ${Object.keys(voice).length} voices → ${path.relative(ROOT, dest)}`);
