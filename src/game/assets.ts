// 游戏静态资源(配图/配音/视频)基址解析 —— 为「自更新游戏平台」把美术从 exe 里解耦。
//
// 背景:此前 public/story-art(~197MB 配图)等会被 vite 打进 dist、再被 tauri::generate_context!
// 整包嵌进可执行文件 → exe 高达 238MB,自更新每次要下两百多 MB。改为「美术托管远程 CDN、
// 前端按需加载 + webview HTTP 缓存(首次后离线可用)」后,exe 可降到 ~12MB。
//
// 解析优先级:localStorage 覆盖 > 构建期 VITE_ASSET_BASE > 空串(= 仍用本地 public/ 路径)。
// 默认空串 → 不设 CDN 时行为与从前完全一致,零破坏;CDN 就绪后设基址即切换。
const LS_KEY = "polaris.assetBase.v1";

function normalize(u: string | null | undefined): string {
  return (u || "").trim().replace(/\/+$/, "");
}

function readBase(): string {
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls != null) return normalize(ls);
  } catch {
    /* localStorage 不可用时回退到构建期变量 */
  }
  const env = (import.meta as any).env?.VITE_ASSET_BASE as string | undefined;
  return normalize(env);
}

let BASE = readBase();

/** 当前生效的资源基址(空串=本地)。 */
export function assetBase(): string {
  return BASE;
}

/** 运行时切换资源基址(设置页可用);持久化到 localStorage。 */
export function setAssetBase(url: string): void {
  BASE = normalize(url);
  try {
    localStorage.setItem(LS_KEY, BASE);
  } catch {
    /* 忽略持久化失败,仅本会话生效 */
  }
}

/** 把站点根路径(如 `/story-art/x.png`)解析成最终可加载 URL。
 *  有 CDN 基址则前缀之;无基址或已是绝对 URL 则原样返回。 */
export function assetUrl(path: string | undefined): string | undefined {
  if (!path) return path;
  if (!BASE) return path; // 本地模式:用 public/ 原路径
  if (/^https?:\/\//.test(path)) return path; // 已是绝对地址
  return BASE + (path.startsWith("/") ? path : "/" + path);
}
