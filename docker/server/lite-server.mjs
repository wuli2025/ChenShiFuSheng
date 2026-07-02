// 尘世浮生 · Docker 轻量后端（lite-server）
//
// 定位：让浏览器版游戏平台在容器里可用的最小后端。前端(src/tauri.ts)探测到
// /api/health 后进入 http 模式：invoke 走 POST /api/invoke，事件走 WS /ws。
// 本服务只实现游戏平台真正需要的命令（chat_send / chat_cancel），其余一律
// 返回 501 —— 前端收到 501 会自动回退浏览器 stub，UI 优雅降级而不是报错。
//
// LLM 不再依赖 claude CLI：直接调 Anthropic 兼容 /v1/messages 流式接口
// （官方 API 或智谱/Kimi/DeepSeek 等兼容端点），SSE 转成 chat:stream 事件广播。
//
// 环境变量：
//   PORT=8080
//   POLARIS_AUTH_TOKEN        访问口令（设了则 /api/* 与 /ws 均需携带）
//   ANTHROPIC_BASE_URL        兼容端点，默认 https://api.anthropic.com
//   ANTHROPIC_API_KEY         官方 key（走 x-api-key 头）
//   ANTHROPIC_AUTH_TOKEN      兼容端点 token（走 Authorization: Bearer）
//   ANTHROPIC_MODEL           模型名，默认 claude-sonnet-5
//   POLARIS_CHAT_TIMEOUT_SECS 单次生成总超时，默认 300
//   IMAGE_API_KEY             生图代理兜底 key（前端没填 key 时服务端注入）
//   IMAGE_PROXY_ALLOW         生图代理额外放行的域名（逗号分隔）
import http from "node:http";
import { promises as dns } from "node:dns";
import net from "node:net";
import path from "node:path";
import { createReadStream, promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.DIST_DIR || path.join(__dirname, "dist");
const PORT = Number(process.env.PORT) || 8080;
const AUTH_TOKEN = (process.env.POLARIS_AUTH_TOKEN || "").trim();
const ANTHROPIC_BASE = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com")
  .trim()
  .replace(/\/+$/, "");
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const ANTHROPIC_AUTH_TOKEN = (process.env.ANTHROPIC_AUTH_TOKEN || "").trim();
const MODEL = (process.env.ANTHROPIC_MODEL || "claude-sonnet-5").trim();
const CHAT_TIMEOUT_MS =
  (Number(process.env.POLARIS_CHAT_TIMEOUT_SECS) || 300) * 1000;
const IMAGE_API_KEY = (process.env.IMAGE_API_KEY || "").trim();

// 生图代理放行的 API 域名（防 SSRF：只允许打向已知供应商）
const IMGGEN_ALLOW = new Set(
  [
    "api.stepfun.com",
    "ark.cn-beijing.volces.com",
    "dashscope.aliyuncs.com",
    "dashscope-intl.aliyuncs.com",
    "api.siliconflow.cn",
    "api.openai.com",
    ...(process.env.IMAGE_PROXY_ALLOW || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ].map((h) => h.toLowerCase())
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// ── 鉴权 ─────────────────────────────────────────────────────
function authorized(req, url) {
  if (!AUTH_TOKEN) return true;
  const h = req.headers["authorization"] || "";
  if (h === `Bearer ${AUTH_TOKEN}`) return true;
  return url.searchParams.get("token") === AUTH_TOKEN;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── WS 广播 ──────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });
function broadcast(topic, payload) {
  const frame = JSON.stringify({ topic, payload });
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(frame);
  }
}

// ── chat_send：Anthropic 兼容流式接口 → chat:stream 事件 ────────
let reqSeq = 0;
const inflight = new Map(); // reqId -> AbortController

function anthropicHeaders() {
  const h = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (ANTHROPIC_API_KEY) h["x-api-key"] = ANTHROPIC_API_KEY;
  else if (ANTHROPIC_AUTH_TOKEN) h["authorization"] = `Bearer ${ANTHROPIC_AUTH_TOKEN}`;
  return h;
}

async function runChat(reqId, prompt) {
  const ctrl = new AbortController();
  inflight.set(reqId, ctrl);
  const killer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
  try {
    const resp = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
      method: "POST",
      headers: anthropicHeaders(),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 32_000,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => "");
      broadcast("chat:stream", {
        reqId,
        kind: "error",
        text: `LLM HTTP ${resp.status}: ${text.slice(0, 300)}`,
      });
      return;
    }
    // 解析 SSE：event 之间以空行分隔，取 data: 行里的 JSON
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let ev;
          try {
            ev = JSON.parse(data);
          } catch {
            continue;
          }
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            broadcast("chat:stream", { reqId, kind: "delta", text: ev.delta.text });
          } else if (ev.type === "message_stop") {
            broadcast("chat:stream", { reqId, kind: "done" });
            done = true;
          } else if (ev.type === "error") {
            broadcast("chat:stream", {
              reqId,
              kind: "error",
              text: ev.error?.message || "LLM 流错误",
            });
            done = true;
          }
        }
      }
    }
    if (!done) broadcast("chat:stream", { reqId, kind: "done" });
  } catch (e) {
    broadcast("chat:stream", {
      reqId,
      kind: "error",
      text: e?.name === "AbortError" ? "生成已取消或超时" : String(e?.message || e),
    });
  } finally {
    clearTimeout(killer);
    inflight.delete(reqId);
  }
}

async function handleInvoke(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
  } catch {
    return sendJson(res, 400, { error: "invalid JSON" });
  }
  const { cmd, args } = body || {};
  if (cmd === "chat_send") {
    const prompt = String(args?.args?.prompt ?? args?.prompt ?? "").trim();
    if (!prompt) return sendJson(res, 400, { error: "prompt 为空" });
    if (!ANTHROPIC_API_KEY && !ANTHROPIC_AUTH_TOKEN) {
      return sendJson(res, 500, {
        error: "服务端未配置 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN",
      });
    }
    const reqId = `req_${Date.now().toString(36)}_${++reqSeq}`;
    void runChat(reqId, prompt);
    // invoke<string> 契约：响应体就是 JSON 编码的返回值
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(reqId));
  }
  if (cmd === "chat_cancel") {
    const id = String(args?.reqId || "");
    inflight.get(id)?.abort();
    res.writeHead(200, { "content-type": "application/json" });
    return res.end("null");
  }
  // 未实现命令 → 501，前端自动回退浏览器 stub
  return sendJson(res, 501, { error: "CMD_NOT_IMPLEMENTED", cmd: String(cmd || "") });
}

// ── 生图代理：规避浏览器 CORS，key 可由服务端注入 ────────────────
function hostAllowed(u) {
  return IMGGEN_ALLOW.has(u.hostname.toLowerCase());
}

async function handleImgGen(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
  } catch {
    return sendJson(res, 400, { error: "invalid JSON" });
  }
  let target;
  try {
    target = new URL(String(body.url || ""));
  } catch {
    return sendJson(res, 400, { error: "invalid url" });
  }
  if (target.protocol !== "https:" || !hostAllowed(target)) {
    return sendJson(res, 403, { error: `域名未放行: ${target.hostname}` });
  }
  const key = String(body.apiKey || "") || IMAGE_API_KEY;
  if (!key) return sendJson(res, 400, { error: "缺少生图 API Key（前端或 IMAGE_API_KEY）" });
  try {
    const upstream = await fetch(target, {
      method: String(body.method || "POST"),
      headers: {
        ...(body.body != null ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${key}`,
        ...(body.headers && typeof body.headers === "object" ? body.headers : {}),
      },
      body: body.body != null ? JSON.stringify(body.body) : undefined,
      signal: AbortSignal.timeout(90_000),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { "content-type": "application/json; charset=utf-8" });
    return res.end(text);
  } catch (e) {
    return sendJson(res, 502, { error: `代理请求失败: ${String(e?.message || e)}` });
  }
}

// 图片字节代理：下载供应商返回的临时图 URL（域名不定，用公网 IP 校验防 SSRF）
const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];
async function isPublicHost(hostname) {
  if (net.isIP(hostname)) return !isPrivateIp(hostname);
  let addrs;
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    return false;
  }
  return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
}
function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return (
      low === "::1" ||
      low.startsWith("fc") ||
      low.startsWith("fd") ||
      low.startsWith("fe80") ||
      low.startsWith("::ffff:127.") ||
      low === "::"
    );
  }
  return PRIVATE_V4.some((re) => re.test(ip));
}

async function handleImgProxy(req, res, url) {
  let target;
  try {
    target = new URL(url.searchParams.get("url") || "");
  } catch {
    return sendJson(res, 400, { error: "invalid url" });
  }
  if (target.protocol !== "https:") return sendJson(res, 403, { error: "仅允许 https" });
  if (!(await isPublicHost(target.hostname))) {
    return sendJson(res, 403, { error: "目标主机未放行" });
  }
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(60_000) });
    const ct = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !ct.startsWith("image/")) {
      return sendJson(res, 502, { error: `上游非图片响应(${upstream.status} ${ct})` });
    }
    const len = Number(upstream.headers.get("content-length") || 0);
    if (len > 20 * 1024 * 1024) return sendJson(res, 413, { error: "图片过大" });
    res.writeHead(200, { "content-type": ct, "cache-control": "public, max-age=86400" });
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.end(buf);
  } catch (e) {
    return sendJson(res, 502, { error: `下载失败: ${String(e?.message || e)}` });
  }
}

// ── 静态托管（SPA） ──────────────────────────────────────────
async function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.normalize(path.join(DIST, rel));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  let st = await fs.stat(file).catch(() => null);
  let finalPath = file;
  if (!st || st.isDirectory()) {
    // SPA 回退：未知路径回 index.html
    finalPath = path.join(DIST, "index.html");
    st = await fs.stat(finalPath).catch(() => null);
    if (!st) {
      res.writeHead(404);
      return res.end("dist 未构建");
    }
  }
  const ext = path.extname(finalPath).toLowerCase();
  const immutable = urlPath.startsWith("/assets/");
  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "content-length": st.size,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(finalPath).pipe(res);
}

// ── HTTP 入口 ────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;
  try {
    if (p === "/api/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("ok");
    }
    if (p.startsWith("/api/")) {
      if (!authorized(req, url)) return sendJson(res, 401, { error: "unauthorized" });
      if (p === "/api/invoke" && req.method === "POST") return await handleInvoke(req, res);
      if (p === "/api/imggen" && req.method === "POST") return await handleImgGen(req, res);
      if (p === "/api/imgproxy" && req.method === "GET")
        return await handleImgProxy(req, res, url);
      // /api/upload 等其余接口 v1 未实现 → 501（前端相应功能降级）
      return sendJson(res, 501, { error: "NOT_IMPLEMENTED", path: p });
    }
    return await serveStatic(res, p);
  } catch (e) {
    log("ERR", p, e);
    if (!res.headersSent) sendJson(res, 500, { error: "internal" });
    else res.end();
  }
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/ws" || !authorized(req, url)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => {
    wss.emit("connection", client, req);
  });
});

// 平滑退出：容器 stop 时不吞正在写的响应
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    log(`收到 ${sig}，正在退出…`);
    for (const ctrl of inflight.values()) ctrl.abort();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}

server.listen(PORT, () => {
  log(`尘世浮生 lite-server 已启动: http://0.0.0.0:${PORT}`);
  log(`  LLM: ${ANTHROPIC_BASE} · ${MODEL} · ${ANTHROPIC_API_KEY || ANTHROPIC_AUTH_TOKEN ? "已配置密钥" : "⚠ 未配置密钥(生成功能不可用)"}`);
  log(`  口令: ${AUTH_TOKEN ? "已启用" : "未启用(仅限内网使用!)"}`);
});
