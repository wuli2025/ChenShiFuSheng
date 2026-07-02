# 尘世浮生 · Docker 版

把游戏平台跑成**浏览器访问的容器服务**。

> 历史说明：早期 Polaris 工作台曾有一套「Rust axum 全量 server」方案（host.rs /
> server.rs），随 server 板块下线已删除（本文档旧版描述的即那套架构，已过时）。
> 当前 Docker 版采用**轻量架构**：前端静态托管 + Node lite-server 只实现游戏平台
> 真正需要的后端能力，不依赖 Rust、不依赖 claude CLI，镜像构建 2-3 分钟。

---

## 一、快速开始

```bash
# 1) 准备环境变量
cp .env.example .env
#    编辑 .env，至少填一种 LLM 鉴权：
#    - ANTHROPIC_API_KEY=sk-ant-...          （Claude 官方）
#    - 或 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN（智谱/Kimi/DeepSeek 兼容端点）
#    生图（可选）：IMAGE_API_KEY=<StepFun 等的 key>（服务端注入，不下发浏览器）
#    公网部署务必设 POLARIS_AUTH_TOKEN=<一串口令>

# 2) 一键构建 + 拉起
docker compose up -d --build

# 3) 浏览器打开
#    http://localhost:8080
#    设了口令：http://localhost:8080/?token=<你的口令>
```

健康检查：`curl http://localhost:8080/api/health` → `ok`。

## 二、架构

```
浏览器 (Vue3 前端，与桌面版同一份源码)
   │  src/tauri.ts 适配层：非 Tauri 环境自动探测 /api/health → http 模式
   ├── invoke(cmd)   ──HTTP──▶ POST /api/invoke
   │      chat_send / chat_cancel → 已实现（见下）
   │      其余命令 → 501 → 前端自动回退浏览器 stub（UI 优雅降级）
   ├── listen(topic) ──WS────▶ GET /ws（chat:stream 事件广播）
   └── 生图          ──HTTP──▶ POST /api/imggen（供应商代理，规避 CORS）
                               GET  /api/imgproxy（图片字节下载代理）
                        │
              lite-server (Node 22，唯一依赖 ws)
                        │  直接调 Anthropic 兼容 /v1/messages 流式接口
                        ▼
              官方 API / 智谱 / Kimi / DeepSeek 等兼容端点
```

功能存活矩阵：

| 能力 | 状态 | 说明 |
|---|---|---|
| 内置游戏全量游玩 | ✅ | 纯前端 + 静态资源 |
| AI 生成游戏 / 自由输入续写 | ✅ | chat_send → SSE → chat:stream |
| 场景生图（含 IndexedDB 持久缓存） | ✅ | 走 `/api/imggen` 代理；`IMAGE_API_KEY` 服务端注入 |
| 存档 / 结局图鉴 | ✅ | 浏览器 localStorage + IndexedDB |
| 上传资料注入 / 知识库 / 语音 | ⛔ v1 未实现 | 前端自动回退 stub，界面降级 |

## 三、Windows 更新后如何同步

同一份源码，重建镜像即可：

```bash
git pull
docker compose up -d --build
```

Dockerfile 做了依赖分层：`package-lock.json` 不变时 `npm ci` 层复用，
通常 2-3 分钟出新镜像。

## 四、环境变量一览

| 变量 | 说明 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude 官方 key（与下面二选一） |
| `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` | Anthropic 兼容端点 |
| `ANTHROPIC_MODEL` | 模型名，默认 `claude-sonnet-5` |
| `POLARIS_AUTH_TOKEN` | 访问口令；设了则 API 与 WS 都要带 |
| `IMAGE_API_KEY` | 生图代理兜底 key（服务端注入，推荐） |
| `VITE_STEPFUN_API_KEY` | （构建期）打进前端的默认生图 key，**不推荐**：能被提取 |
| `POLARIS_CHAT_TIMEOUT_SECS` | 单次生成总超时，默认 300 |
| `IMAGE_PROXY_ALLOW` | 生图代理额外放行域名（逗号分隔） |

## 五、安全基线

- 容器 `read_only` 根文件系统 + `no-new-privileges`，以非 root（node）运行。
- `.dockerignore` 排除 `.env*`，密钥只经 compose 环境变量进入容器。
- 生图代理仅放行已知供应商域名；图片下载代理仅 https + 公网 IP 校验（防 SSRF）。
- 公网部署：务必设 `POLARIS_AUTH_TOKEN`，并建议前置 HTTPS 反代（Caddy/Traefik/群晖反代）。

## 六、常用运维

```bash
docker compose logs -f chenshi      # 看日志
docker compose restart chenshi      # 重启
docker compose down                 # 停
curl http://localhost:8080/api/health   # 健康检查
```

## 七、镜像瘦身（可选）

`public/story-art`（~151MB 内置游戏美术）默认打进镜像。若已把美术传 CDN，
构建前设 `VITE_ASSET_BASE=<CDN 基址>`，并在 Dockerfile 阶段 1 里把
`COPY public ./public` 改为排除 story-art，镜像可缩到 ~80MB。

## 八、群晖 NAS

参见 `DEPLOY-SYNOLOGY.md`（同样使用本 compose 文件）。
