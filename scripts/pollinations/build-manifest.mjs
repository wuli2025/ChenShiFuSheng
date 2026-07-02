// 扫描 public/story-art 生成 src/game/art-manifest.ts。
// 三主线(musk/karl/zhuyuanzhang)用本地新生成的 Pollinations 配图;
// chenshi(生成式内核示例)的图/音仍托管 R2(本地无文件),手工补回以免被扫描丢弃。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ART_DIR = path.join(ROOT, "public", "story-art");

const art = {};
if (fs.existsSync(ART_DIR)) {
  for (const game of fs.readdirSync(ART_DIR)) {
    const gdir = path.join(ART_DIR, game);
    if (!fs.statSync(gdir).isDirectory()) continue;
    for (const file of fs.readdirSync(gdir)) {
      if (!file.endsWith(".png")) continue;
      if (fs.statSync(path.join(gdir, file)).size < 3000) continue;
      art[`${game}/${file.slice(0, -4)}`] = `/story-art/${game}/${file}`;
    }
  }
}
// chenshi 仍在 R2(本地已外置),补回。
for (const k of ["age7", "age14", "age21", "age28_office", "age28_south"]) {
  art[`chenshi/${k}`] = `/story-art/chenshi/${k}.png`;
}
// 排序输出,稳定 diff。
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const artSorted = sortObj(art);
const voice = { "chenshi/age7": "/story-voice/chenshi/age7.mp3", "chenshi/age14": "/story-voice/chenshi/age14.mp3" };

const out = `// 自动生成 —— 由 scripts/pollinations/build-manifest.mjs 扫描 public/story-art 产出。
// 键: "<gameId>/<sceneId>" → 静态资源根路径。GameView/playModel 据此把真实配图/旁白挂到场景上。
// artFor/voiceFor/videoFor 经 assetUrl() 解析:设了 CDN 基址(VITE_ASSET_BASE)走 R2,否则用本地 public/。
// 三主线 musk/karl/zhuyuanzhang 为 Pollinations(Flux)真实生成配图;无对应键的场景回退到内联 SVG。
import { assetUrl } from "./assets";

export const ART: Record<string, string> = ${JSON.stringify(artSorted, null, 2)};

export const VOICE: Record<string, string> = ${JSON.stringify(voice, null, 2)};

export const VIDEO: Record<string, string> = {};

export function artFor(gameId: string, sceneId: string): string | undefined {
  return assetUrl(ART[gameId + "/" + sceneId]);
}
export function voiceFor(gameId: string, sceneId: string): string | undefined {
  return assetUrl(VOICE[gameId + "/" + sceneId]);
}
export function videoFor(gameId: string, sceneId: string): string | undefined {
  return assetUrl(VIDEO[gameId + "/" + sceneId]);
}
`;
fs.writeFileSync(path.join(ROOT, "src", "game", "art-manifest.ts"), out);
console.log(`manifest: ${Object.keys(artSorted).length} images (incl. chenshi), ${Object.keys(voice).length} voices`);
