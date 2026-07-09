# 尘世浮生 v11 重构进度

> 上下文中断后从这里续跑。每个阶段一个 commit；`tag v7-snapshot` 是兜底还原点。

## 已完成

### P0 · 封存与目录清整 ✅
- `git tag v7-snapshot` 封存重构前的全部成果。
- 根目录七项杂物 → 两个模块（纯 `mv`，零删除）：
  - `chenshi/`  产品代码 monorepo（原 `尘世浮生/`）
  - `vault/`    资产库：`works/`(3 部成品 HTML) `art/`(261MB 原图) `research/` `archive/`
- `chenshi/_legacy/` 归档：`src-tauri`(旧壳) `server-node`(旧 Node 后端) `PolarisKB` `docker` `workspace` `scripts` 等。**未删除，仅摘出构建。**

### P1 · 基石提炼 ✅ （7 + 11 测试）
| crate | 来源 | 保住的实战细节 |
|---|---|---|
| `backend/cli-core` | `chat.rs`(2782行) `engine.rs` | prompt 走 stdin（Windows 32k argv 上限）· codex JSONL 按 `item.id` 去重 · claude stderr=错误/codex stderr=日志 · 退出码+`turn.failed` 双判 · Unix 进程组 + `kill_tree` · 每任务私有 `CLAUDE_CONFIG_DIR`/`CODEX_HOME` · 空闲挂死看门狗（非绝对超时） |
| `backend/provider-dock` | `provider.rs`(1852行) | 55 条预设一条不少（测试断言）· 受管键先清后套 · 唯一出口 `env_patch_for()` · 日志脱敏 `redact()` · 云端禁联动模式 |

**隔离契约已由测试守住**：`official_preset_injects_nothing`、`codex_engine_gets_empty_patch`、`cloud_dock_forbids_link_mode`、`redact_hides_secrets`。

### P2 · engine-runtime ✅
- `frontend/packages/engine-runtime/compile.mjs` —— 单文件编译器。
- 内联：数值引擎（软上限）+ VN 演出 + 天气粒子 + WebAudio 程序化 BGM/音效 + 打字机 + GATE 大字过场 + localStorage 存档 + 结局画像成绩单 + base64 插画。
- 产物自检：≤8MB、无外链、双击可玩。实测 371 节点剧本 → 123KB。

### P2.5 · ui-kit 先行 ✅
- `frontend/packages/ui-kit/tokens.css` —— 双主题（深空琉璃 / 奶油琉璃）共享 spacing/圆角/阴影/字阶；单一缓动族 `cubic-bezier(.2,.8,.2,1)`；时长三档 + 一个 `--t-signature`（招牌时刻）；12 个基础组件；焦点环；`prefers-reduced-motion`。
- `frontend/packages/ui-kit/crystal-hall.js` —— 水晶球大厅渲染引擎：**单 canvas** 渲染全部球体、视口裁剪、IntersectionObserver 暂停、实测帧率二次降级、球膨胀铺满的招牌转场。

### P3 · Rust api ✅ （6 测试 + 8 项 curl 冒烟）
- `backend/api`，axum。**双模启动**：`--embedded`（桌面）/ 默认（云端）。
- 存储 trait 一份，`EmbeddedStore` 已实装（JSON + 原子写 tmp+rename）；PG 实现按同 trait 补即可，业务逻辑零分叉。
- 持久时间线：`append_event` 先写库 → 再 `bus.send` 广播。SSE 只是显示器。
- `GET /timeline?after=N` 断线补拉；孤儿租约 30s 扫描回收（任务退回队列，**不作废**）。
- 冒烟已验证：杀进程重启后时间线完整；未知模板 400；`/v1/providers` 只回预设不回密钥。

### P4 · worker + 生图双梯队 ✅ （37 测试）
- `backend/worker`：五种任务（script/revise/image/fx/compile），完成直接写时间线，不依赖前端在线。
- 重试策略在 worker 层按任务类型定；`cli-core` 自身**不做任何自动 retry**。
- `backend/gen-pipeline`：
  - **模板契约**（5 个内置模板，从九部成品收编）—— 规则是数据不是代码。
  - **校验器** 由 `contract.checks` 驱动，10 个通用 check 函数。
  - **生图双梯队**：codex CLI 优先（并发线独立 `CODEX_HOME`，重试≤2）→ 单张粒度降级到生图 API，显式标记 `api_fallback`；两梯队全败该张即红，**绝不落 SVG/占位图**。

**全局硬底线**（`checks::GLOBAL_FLOOR`，任何模板不得豁免）：
1. `playtime_min` —— 单周目最短路径 ≥600s
2. `no_placeholder_art` —— 只认 `codex` / `api_fallback` 两种来源
3. `no_dangling_refs` —— 选项不得指向不存在的节点（会让玩家卡死）

### P5 · 模板库 ✅（前端已落地，DB 表待接）
- 模板墙 + 思路卡抽屉（rationale：为什么软上限 / 为什么门槛叙事自洽 / 为什么结局从画像反推）+ 「做同款」一键立项。
- **跨模板判决实证**（`cargo run -p gen-pipeline --example verify_contract`）：同一部 371 节点 30 结局的剧本 →
  - 经典款 ✓ 通过
  - 史诗长卷款 ✗ 结局不足 43
  - 行业沉浸款 ✗ 结局不足 35 且缺名词图谱
  - 混入 SVG 时，**所有模板一律拒绝**

### P6 · 大厅 + 前端 ✅（接线完成，性能加固见下）
- `frontend/apps/web/index.html` —— 大厅 / 模板库 / 创作台 / 设置 / Player Shell。
- `frontend/build.mjs` —— 打包自包含单文件（内联 CSS+JS，产物含外链即失败）。
- 端差：`platform.hasDoctor` / `platform.hasLocalFs` 是**全代码库唯一**感知端别的地方。

### P5+ · vault-import ✅
`cargo run -p gen-pipeline --example vault_import -- <vault> [--apply]`
- 182 张真生图，FNV-1a 内容哈希去重（全平台单存），重复导入幂等。
- `vault/works` 的 3 部成品挂为模板代表作试玩样例。

### P7 部分 · 部署编排 ✅
- `deploy/docker-compose.prod.yml`（api×2 / worker×N / nginx / PG / Redis）
- `deploy/nginx/nginx.conf`：`/games` 静态直出 + SSE 不缓冲 + 读写分级限流
- `Dockerfile.api`（**不含 CLI 与凭据**）/ `Dockerfile.worker`（含双 CLI + 内置 node 跑 compile.mjs）

### 端到端验证（真实进程）✅
| 验证项 | 结果 |
|---|---|
| 杀掉 api，worker 继续干活并写时间线，重启后补拉 | 4 条事件一条不丢 |
| codex 缺席 + 无 fallback | 报红，**0 张 SVG** |
| codex 缺席 + 有 fallback | 单张降级，`source: api_fallback`，2 张真 PNG |
| 含真生图编译 | 24 张 base64 内联，2.2MB，0 运行时错误 |
| 浏览器（1440×900） | 60.3fps，0 运行时错误，四档视口无横向溢出 |

### 修掉的两个真 bug
1. `Script::walk()` 的 **memo 污染**：环剪枝返回的 `0` 被缓存，污染所有经过该节点的路径 → 最短周目时长被算成荒谬小值。
2. **悬空引用被静默当作 0 秒路径**，掩盖真实剧情量。现已提升为全局硬检查 `no_dangling_refs`。

## 待办

### P7 · 收尾
- [ ] PgStore 实装（同 `Store` trait）+ Redis Stream 队列 + Redis pub/sub 多实例 SSE fan-out
- [ ] 观测四看板：任务成功率 / CLI p95 / 队列深度 / 生图失败率+降级率
- [ ] 配额三级（免费池 / BYOK / 并发 4）—— `Quota` 已实装，接入鉴权即可
- [ ] 鉴权：JWT + Redis 会话（当前 owner 硬编码 `local`）
- [ ] CI 门禁：clippy -D warnings、`npm run test`（Playwright 冒烟已写好）、Lighthouse ≥90

### P8 · 桌面端投放
- [ ] Tauri 薄壳：sidecar 守护 `chenshi-api --embedded`（随机端口 + token 握手）、托盘、目录对话框、updater
- [ ] doctor 页仅桌面路由注册；web 构建产物 tree-shaking 断言 grep 不到 doctor 代码
- [ ] 断网全链路冒烟

## 环境备忘
- **curl 打本地端口必须绕代理**：`export no_proxy=127.0.0.1,localhost`，否则系统代理劫持回环返回空响应。这正是 `cli-core::harden_child_env` 给子进程强制 `NO_PROXY` 的原因。
- **`pkill -f chenshi-api` 会误杀调用它的 shell**（命令行含该字符串），用 `pkill -x`。
- 数据目录：`CHENSHI_DATA_DIR`，默认 Windows `D:\chenshi-data` / Unix `/data/chenshi`。
