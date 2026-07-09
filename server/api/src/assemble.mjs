// 装配器:引擎 + 剧本 + 素材 → 自包含单文件 HTML(PRD v6 §07)
// 纯函数毫秒级,发布时同步调用;产物 = 双击即玩,可独立分发,可挂大厅 iframe。
import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4",
};

// 素材相对路径 → data URI;http(s)/data: 原样保留
async function toDataUri(rel, fsRoot) {
  if (!rel || /^(https?:|data:)/.test(rel)) return rel;
  const abs = path.resolve(fsRoot, rel.replace(/^\//, ""));
  if (!abs.startsWith(path.resolve(fsRoot)))
    throw new Error(`素材路径越界: ${rel}`);
  const mime = MIME[path.extname(abs).toLowerCase()];
  if (!mime) throw new Error(`不支持的素材类型: ${rel}`);
  const buf = await readFile(abs);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * @param project  project_json(会被深拷贝,assets/cover 内联为 data URI)
 * @param opts     { engimePath, assetFsRoot }
 * @returns        { html, bytes }
 */
export async function assembleHTML(project, { enginePath, assetFsRoot }) {
  const engine = await readFile(enginePath, "utf8");
  const p = JSON.parse(JSON.stringify(project));
  for (const [k, v] of Object.entries(p.assets || {}))
    p.assets[k] = await toDataUri(v, assetFsRoot);
  if (p.meta?.cover) p.meta.cover = await toDataUri(p.meta.cover, assetFsRoot);

  const title = (p.meta?.title || "人生").replace(/</g, "&lt;");
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · 尘世浮生</title>
<style>
  html,body{margin:0;width:100%;height:100%;background:#0a0c12;overflow:hidden}
  #game{width:100%;height:100%}
  #quit{position:fixed;top:16px;right:18px;z-index:99;width:38px;height:38px;border-radius:50%;
    border:1px solid rgba(255,255,255,.25);background:rgba(10,14,22,.5);backdrop-filter:blur(8px);
    color:#cfd8e4;font-size:17px;line-height:36px;text-align:center;cursor:pointer;
    transition:opacity .5s ease;user-select:none}
  #quit.hide{opacity:0;pointer-events:none}
</style>
</head>
<body>
<div id="game"></div>
<div id="quit" title="退出 (Esc)">✕</div>
<script>
${engine}
</script>
<script>
window.__PROJECT__ = ${JSON.stringify(p)};
(function(){
  var quit = document.getElementById("quit"), t = 0;
  function poke(){ quit.classList.remove("hide"); clearTimeout(t); t = setTimeout(function(){ quit.classList.add("hide"); }, 3000); }
  addEventListener("mousemove", poke); addEventListener("touchstart", poke); poke();
  var engine = VividEngine.mount(document.getElementById("game"), window.__PROJECT__);
  function exit(){
    if (engine) engine.destroy();
    if (parent !== window) parent.postMessage({ type: "player:quit" }, "*");
    else if (history.length > 1) history.back(); else window.close();
  }
  quit.onclick = exit;
  addEventListener("keydown", function(e){ if (e.key === "Escape") exit(); });
})();
</script>
</body>
</html>`;
  return { html, bytes: Buffer.byteLength(html) };
}
