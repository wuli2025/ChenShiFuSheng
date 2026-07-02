// 自动生图 —— 按设置里配置的图像 API 真实出图,为剧情场景生成水墨配图。
// 兼容三类协议:
//   ① OpenAI-images 同步(StepFun / Seedream-Ark / SiliconFlow / DALL·E 等):
//      POST {model,prompt,size,response_format} → data[0].url | data[0].b64_json | data[0].image(b64)
//   ② 通义万相 DashScope 异步:POST 提交任务 → 轮询 task 直到 SUCCEEDED → results[0].url
//
// 稳定性设计:
//   - 供应商返回的图片 URL 是临时签名链接(通常 24h 过期),不能直接持久化。
//     出图后把字节落 IndexedDB(imageStore),对外返回稳定引用 "idb://<key>",
//     渲染前经 resolveImageRef/hydrateSceneImages 换成 objectURL。
//   - 同一 prompt 命中缓存直接复用,不重复扣费。
//   - 错误分类(鉴权/限流/超时/服务端/网络),仅对可恢复错误做指数退避重试;
//     最近一次失败原因由 lastImageError() 暴露给 UI。
//   - Docker/浏览器模式下走 /api/imggen 服务端代理(规避 CORS,key 可由服务端注入)。
// 未配置 / 未启用 / 全部失败 → 返回 null,调用方回退到 CSS 渐变占位。
import { getImageCfg } from "./gameSettings";
import { getImageBlob, imageKey, putImage, IDB_PREFIX } from "./imageStore";
import { backendAuthHeaders, backendIsHttp, isTauri } from "../tauri";

export { resolveImageRef, hydrateSceneImages } from "./imageStore";

/** 水墨风格后缀:让生成图与《尘世浮生》墨蓝水墨基调一致。 */
const INK_STYLE =
  "，中国传统水墨画风格，写意，大量留白，淡墨晕染，宣纸质感，古典意境，电影级氛围构图，无文字无水印";

/** 单张出图超时(毫秒)。同步接口走它;异步接口轮询另有总时长上限。 */
const REQ_TIMEOUT = 60_000;
/** 异步任务(DashScope)总轮询时长上限。 */
const ASYNC_BUDGET = 90_000;
/** genImagesFor 并发上限(避免触发供应商限流)。 */
const CONCURRENCY = 3;
/** 单张最多尝试次数(仅对限流/超时/网络/服务端错误重试)。 */
const MAX_ATTEMPTS = 3;
/** 重试退避基线;限流时优先用响应头 Retry-After(上限 15s)。 */
const BACKOFF_MS = [0, 1_000, 3_000];

// —— 错误分类:暴露给 UI,让"没出图"可排障 ——
export type ImageGenErrorKind =
  | "disabled" // 未配置/未启用
  | "auth" // 401/403,key 无效
  | "rate-limit" // 429
  | "server" // 5xx
  | "timeout"
  | "network"
  | "bad-response"; // 4xx 参数问题 / 响应里抠不出图

export interface ImageGenError {
  kind: ImageGenErrorKind;
  status?: number;
  message: string;
  at: number;
}

let _lastError: ImageGenError | null = null;
let _retryAfterMs = 0;

/** 最近一次生图失败的原因(成功后清空)。 */
export function lastImageError(): ImageGenError | null {
  return _lastError;
}

/** 把错误翻译成给用户看的一句话。 */
export function describeImageError(e: ImageGenError | null): string {
  if (!e) return "";
  switch (e.kind) {
    case "disabled":
      return "未配置生图模型（设置 → 生图）";
    case "auth":
      return "生图 API Key 无效或过期";
    case "rate-limit":
      return "生图接口限流，稍后会自动补图";
    case "server":
      return "生图服务端异常";
    case "timeout":
      return "生图超时";
    case "network":
      return "网络异常，无法访问生图接口";
    default:
      return "生图接口返回了无法解析的结果";
  }
}

function setError(kind: ImageGenErrorKind, message: string, status?: number) {
  _lastError = { kind, message, status, at: Date.now() };
}

const RETRIABLE: ReadonlySet<ImageGenErrorKind> = new Set([
  "rate-limit",
  "server",
  "timeout",
  "network",
]);

interface ImgCfgLike {
  endpoint: string;
  apiKey: string;
  model: string;
}

function withStyle(prompt: string): string {
  const p = (prompt || "").trim();
  if (!p) return p;
  // 已经带「水墨」字样就不重复堆砌
  return /水墨/.test(p) ? p : p + INK_STYLE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeout: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Docker/浏览器模式(非 Tauri 且探测到 polaris 后端)→ 走服务端代理。 */
async function viaProxy(): Promise<boolean> {
  return !isTauri && (await backendIsHttp());
}

/**
 * 供应商 API 请求:Tauri/纯前端直连;Docker 浏览器模式改走 /api/imggen 代理
 * (浏览器直连供应商会被 CORS 拦;代理侧还能用服务端 IMAGE_API_KEY 兜底注入)。
 */
async function apiRequest(
  url: string,
  apiKey: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> },
  timeout = REQ_TIMEOUT
): Promise<Response> {
  if (await viaProxy()) {
    return fetchWithTimeout(
      "/api/imggen",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...backendAuthHeaders() },
        body: JSON.stringify({
          url,
          method: opts.method || "POST",
          apiKey,
          headers: opts.headers || {},
          body: opts.body ?? null,
        }),
      },
      timeout
    );
  }
  const hasBody = opts.body !== undefined && opts.body !== null;
  return fetchWithTimeout(
    url,
    {
      method: opts.method || "POST",
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${apiKey}`,
        ...(opts.headers || {}),
      },
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    },
    timeout
  );
}

/** 发请求并做错误分类;成功返回 JSON,失败返回 null 并记录 lastImageError。 */
async function requestJson(
  url: string,
  apiKey: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> },
  timeout = REQ_TIMEOUT
): Promise<any | null> {
  _retryAfterMs = 0;
  let resp: Response;
  try {
    resp = await apiRequest(url, apiKey, opts, timeout);
  } catch (e: any) {
    if (e?.name === "AbortError") setError("timeout", `请求超时(${timeout / 1000}s)`);
    else setError("network", String(e?.message || e));
    return null;
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const brief = text.slice(0, 300);
    if (resp.status === 401 || resp.status === 403) setError("auth", brief, resp.status);
    else if (resp.status === 429) {
      const ra = Number(resp.headers.get("retry-after"));
      _retryAfterMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 15_000) : 0;
      setError("rate-limit", brief, 429);
    } else if (resp.status >= 500) setError("server", brief, resp.status);
    else setError("bad-response", brief, resp.status);
    return null;
  }
  try {
    return await resp.json();
  } catch {
    setError("bad-response", "响应不是合法 JSON");
    return null;
  }
}

interface PickedImage {
  url?: string;
  b64?: string;
}

/** 从五花八门的响应里尽量抠出一张可用图(url 或 b64)。 */
function pickImage(json: any): PickedImage | null {
  if (!json) return null;
  // OpenAI-images: { data: [ { url | b64_json | image | b64 } ] }
  const item = json?.data?.[0] ?? json?.images?.[0] ?? json?.output?.results?.[0];
  if (item) {
    if (typeof item === "string") {
      if (item.startsWith("http")) return { url: item };
      if (item.startsWith("data:")) return { b64: item.split(",")[1] || "" };
      return { b64: item };
    }
    if (item.b64_json) return { b64: String(item.b64_json) };
    if (item.image) return { b64: String(item.image) };
    if (item.b64) return { b64: String(item.b64) };
    if (item.url) return { url: String(item.url) };
  }
  // 某些接口直接顶层给 url
  if (typeof json?.url === "string") return { url: json.url };
  return null;
}

function b64ToBlob(b64: string): Blob | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "image/png" });
  } catch {
    return null;
  }
}

/** 下载远程图片字节:直连失败(CORS 等)且有后端时走 /api/imgproxy。 */
async function fetchImageBlob(url: string): Promise<Blob | null> {
  try {
    const resp = await fetchWithTimeout(url, {}, REQ_TIMEOUT);
    if (resp.ok) return await resp.blob();
  } catch {
    /* 尝试代理 */
  }
  if (await viaProxy()) {
    try {
      const resp = await fetchWithTimeout(
        `/api/imgproxy?url=${encodeURIComponent(url)}`,
        { headers: { ...backendAuthHeaders() } },
        REQ_TIMEOUT
      );
      if (resp.ok) return await resp.blob();
    } catch {
      /* 放弃,回退远程 URL */
    }
  }
  return null;
}

/**
 * 把出图结果持久化到 IndexedDB,返回稳定引用 "idb://<key>"。
 * 落库失败时降级:b64 → dataURL(可渲染但体积大),url → 原样(会过期,聊胜于无)。
 */
async function persistImage(cacheKey: string, img: PickedImage): Promise<string | null> {
  let blob: Blob | null = null;
  if (img.b64) blob = b64ToBlob(img.b64);
  else if (img.url) blob = await fetchImageBlob(img.url);
  if (blob) {
    const ref = await putImage(cacheKey, blob);
    if (ref) return ref;
  }
  if (img.b64) return `data:image/png;base64,${img.b64}`;
  return img.url ?? null;
}

/** 通义万相 DashScope 异步流程:提交任务 → 轮询直到完成。 */
async function genDashScope(cfg: ImgCfgLike, prompt: string): Promise<PickedImage | null> {
  const submit = await requestJson(cfg.endpoint, cfg.apiKey, {
    body: {
      model: cfg.model || "wanx-v1",
      input: { prompt },
      parameters: { size: "1024*1024", n: 1 },
    },
    headers: { "X-DashScope-Async": "enable" },
  });
  const taskId = submit?.output?.task_id;
  if (!taskId) {
    if (!_lastError) setError("bad-response", "DashScope 未返回 task_id");
    return null;
  }
  // 轮询地址跟随配置的端点域名(兼容 dashscope-intl 等),不再写死公共云。
  let origin = "https://dashscope.aliyuncs.com";
  try {
    origin = new URL(cfg.endpoint).origin;
  } catch {
    /* 用默认公共云 */
  }
  const taskUrl = `${origin}/api/v1/tasks/${taskId}`;
  const deadline = Date.now() + ASYNC_BUDGET;
  while (Date.now() < deadline) {
    await sleep(2_500);
    const poll = await requestJson(taskUrl, cfg.apiKey, { method: "GET" });
    const status = poll?.output?.task_status;
    if (status === "SUCCEEDED") {
      const url = poll?.output?.results?.[0]?.url;
      if (url) return { url: String(url) };
      setError("bad-response", "DashScope 任务成功但无图片 URL");
      return null;
    }
    if (status === "FAILED" || status === "UNKNOWN") {
      setError("server", `DashScope 任务失败(${status})`);
      return null;
    }
  }
  setError("timeout", `DashScope 任务超过 ${ASYNC_BUDGET / 1000}s 未完成`);
  return null;
}

/**
 * 调生图模型生成一张图。返回稳定引用:"idb://<key>"(已缓存)或退化的
 * dataURL / 远程 URL;失败返回 null(原因见 lastImageError())。
 * 渲染前用 resolveImageRef() 换成可用 URL。
 */
export async function genImage(prompt: string): Promise<string | null> {
  const cfg = getImageCfg();
  const styled = withStyle(prompt);
  if (!styled) return null;
  // Docker 代理模式允许前端不填 key(服务端用 IMAGE_API_KEY 注入)。
  const proxied = await viaProxy();
  if (!cfg.enabled || !cfg.endpoint || (!cfg.apiKey && !proxied)) {
    setError("disabled", "生图未启用或未配置");
    return null;
  }

  // 同一 prompt 命中本地缓存 → 直接复用,不重复扣费。
  const cacheKey = imageKey(styled);
  if (await getImageBlob(cacheKey)) return IDB_PREFIX + cacheKey;

  const isDashScope = /dashscope(-intl)?\.aliyuncs\.com/i.test(cfg.endpoint);

  const once = async (): Promise<PickedImage | null> => {
    if (isDashScope) return genDashScope(cfg, styled);
    const json = await requestJson(cfg.endpoint, cfg.apiKey, {
      body: {
        model: cfg.model || undefined,
        prompt: styled,
        n: 1,
        size: "1024x1024",
        // 优先要 b64:字节直接到手,持久化不依赖二次下载(供应商不支持时会回 url)
        response_format: "b64_json",
      },
    });
    if (json == null) return null;
    const img = pickImage(json);
    if (!img) setError("bad-response", "响应中未找到图片字段");
    return img;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const wait = _retryAfterMs || BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      await sleep(wait);
    }
    const img = await once();
    if (img) {
      const ref = await persistImage(cacheKey, img);
      if (ref) {
        _lastError = null;
        return ref;
      }
      setError("bad-response", "图片持久化失败");
    }
    // 鉴权/参数类错误重试也不会好,直接放弃
    if (!_lastError || !RETRIABLE.has(_lastError.kind)) break;
  }
  return null;
}

/**
 * 批量为场景出图,带并发上限。逐张完成即回调 onOne(可即时把图挂到场景上)。
 * 失败的保持 null(调用方用 bgCss 占位)。
 */
export async function genImagesFor(
  prompts: { id: string; prompt: string }[],
  onOne?: (id: string, url: string | null) => void
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  let cursor = 0;

  async function worker() {
    while (cursor < prompts.length) {
      const i = cursor++;
      const p = prompts[i];
      const url = await genImage(p.prompt);
      out[p.id] = url;
      onOne?.(p.id, url);
    }
  }

  const n = Math.min(CONCURRENCY, Math.max(1, prompts.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}
