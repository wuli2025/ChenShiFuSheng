# PRD v11 逐项对照

> 对照 `尘世浮生_双端PRD_v11.html` 的每一条要求。
> **验证方式**列写的是"怎么证明它真的做了"，不是"我说做了"。

图例：✅ 完成并验证 · 🟡 部分（说明缺口）· ⬜ 未做（说明原因）

---

## §00 四个改判

| # | 要求 | 状态 | 验证方式 |
|---|---|---|---|
| 1 | 双端并存，共用同一 Rust 后端与同一份前端 | ✅ | `chenshi-api --embedded` 双模启动；`sidecar` crate 4 测试 + `real_api` 例子对真 api 端到端 |
| 2 | 生图双梯队，降级显式标记，SVG 绝对禁止 | ✅ | 摘掉 codex 实跑：无 fallback→报红 0 张 SVG；有 fallback→标记 `api_fallback` 产出真 PNG |
| 3 | 根目录清整为 `chenshi/` + `vault/` | ✅ | `docs/VAULT_INVENTORY.md`（从真实文件系统统计：works 3 / art 198 / research 8 / archive 95） |
| 4 | 网页端删掉目标文件夹与环境医生，D 盘固定路径，零询问直接执行 | ✅ | `test/端差断言.mjs`：产物里 grep 不到诊断页与目录对话框；立项即入队，无确认弹窗 |
| 5 | 大厂级视觉门面 + 工业级工程清单 | ✅ | `/design` 走查页 + `test/wcag.mjs`（实算对比度，改色板即红） |

## §01 目录清整

| 要求 | 状态 | 验证 |
|---|---|---|
| 纯 `mv`，零删除 | ✅ | `_legacy/` 保留全部旧代码；`git tag v7-snapshot` 兜底 |
| `vault/{works,art,research,archive}` | ✅ | `docs/VAULT_INVENTORY.md` |
| 清点表写入 `docs/` | ✅ | 同上，数字由脚本从文件系统实算 |
| `vault-import` 哈希去重导入 | ✅ | `cargo run -p gen-pipeline --example vault_import -- ../vault --apply` → 182 张唯一，二次导入幂等 |
| `docs/AI接口说明_v14.md` | ✅ | 已写，含 CLI 调用协议的全部坑 |

## §02 双端一后端

| 要求 | 状态 | 验证 |
|---|---|---|
| 后端双模启动（`--embedded`） | ✅ | `/v1/health` 返回 `mode: embedded` / `link_mode_allowed: true` |
| 存储 trait 两实现 | 🟡 | `EmbeddedStore` 已实装并测试；`PgStore` 未写（trait 已就位，补实现即可） |
| 队列 trait 两实现 | 🟡 | 进程内（DB 轮询）已实装；Redis Stream 未写 |
| 产物仓 trait 两实现 | 🟡 | 本地目录已实装；S3 未写 |
| Tauri 壳极薄（sidecar/托盘/目录/updater） | 🟡 | 壳源码 + `tauri.conf.json` 已写；**WSL 无 webkit2gtk，未编译验证**。守护逻辑抽到 `sidecar` crate，4 测试 + 真 api 端到端全过 |
| `platform.js` 是唯一 if(桌面) 的地方 | ✅ | 端差断言 ②：除 `platform.js` / `bridge.js` 外无人碰 `window.__TAURI__` |
| 桌面端不写独有页面 | ✅ | doctor 页动态 import，web 产物摇掉 |
| 桌面账号免登录 | ⬜ | 鉴权整体未做（当前 owner 硬编码 `local`） |

## §03 端差矩阵

| 能力 | 状态 | 验证 |
|---|---|---|
| 目标文件夹：网页无 / 桌面有 | ✅ | 端差断言 ①：`pick_directory` 不在 web 产物里 |
| 环境医生：网页无 / 桌面有 | ✅ | 同上；`doctor.js` 只在桌面动态加载 |
| 默认执行策略：两端直接开始执行 | ✅ | `POST /v1/projects` 立项即入队 `script` 任务，无确认 |
| 数据位置 `D:\chenshi-data` | ✅ | `gen_pipeline::data_dir()`；`/v1/health` 回显 |
| 账号 | ⬜ | 未做 |
| 供应商坞一致，桌面多联动开关 | ✅ | `Dock::desktop()` 才开放 link_mode；`/v1/health` 回显 |
| 其余功能严格一致 | ✅ | 同一份前端代码 |

## §04 生图双梯队

| 要求 | 状态 | 验证 |
|---|---|---|
| 梯队一 codex，独立 CODEX_HOME，300s，重试 ≤2 | ✅ | `image.rs` 单测 `tier1_retries_at_most_three_times`；`lane_dir` 隔离 |
| 梯队二自动降级 | ✅ | 假生图 API 实跑：日志 `降级至梯队二成功（已标记 api_fallback）` |
| 单张粒度 | ✅ | `batch_images` 逐张 `generate_one`，失败只记该张 |
| 显式标记 `source` | ✅ | 时间线 `image.done {source: api_fallback}`；UI 有 `badge-fallback` 角标 |
| 两梯队全败即红，绝不落 SVG | ✅ | 实跑：`find -name '*.svg'` = 0；单测 `both_tiers_failed_is_a_hard_error` |
| 共用 style_prompt | ✅ | 假 API 日志确认收到同一段「水彩纪实风…」 |
| `art.fallback: auto/off/api_only` | ✅ | 三个单测各覆盖一种策略 |

## §05 大厂级 UI

| 要求 | 状态 | 验证 |
|---|---|---|
| 双主题共享 spacing/圆角/阴影/字阶，只换色板 | ✅ | `tokens.css`；走查页切主题实看 |
| 间距 4px 基 / 圆角三档 / 阴影四层 / z 轴七层 | ✅ | 走查页可视化 |
| tabular-nums | ✅ | 走查页并排对比 |
| 色板过 WCAG AA（构建时脚本卡） | ✅ | `test/wcag.mjs` **抓出并修掉了两个不合规色**（弱文 2.72、警告 2.90） |
| 一族缓动 / 时长三档 / 位移 ≤12px | ✅ | tokens.css；走查页可点 |
| 三个招牌时刻 | ✅ | `--t-signature`；水晶球膨胀已实装 |
| 骨架屏统一节奏 / hover ≤120ms / reduced-motion | ✅ | tokens.css；走查页显示当前 `prefers-reduced-motion` |
| 空状态插画+一句话+主行动 | ✅ | `.empty` + 走查页样例 |
| 错误态三段式 | ✅ | `.error-state` + `errcode.rs` 15 条；测试断言「怎么办」不许是空话 |
| 焦点环全键盘可达 | ✅ | `:focus-visible`；走查页 Tab 测得 `outline-width: 2px` |
| 时间/大小/耗时统一格式化 | ✅ | `ui-kit/format.js`；走查页展示 |
| 1440/1920/125% 三档走查 | ✅ | `test/viewport.mjs` 四档 + 125% 全过 |
| 图标单一来源（lucide） | 🟡 | 图标位用了内联 SVG 与文字符号，未引入 lucide 包（自包含产物不想拉外部图标库） |
| 字标与 logo 四处同一套 | 🟡 | `ui-kit/version.js` 导出 `LOGO_SVG`；大厅左上已用，导出游戏启动幕与安装器未接 |
| P2.5：tokens + 12 组件 + `/design` 走查页 + WCAG 脚本 | ✅ | 全部完成；走查页自包含版已放桌面 |

## §06 工业级清单

| 域 | 状态 | 验证 |
|---|---|---|
| CI：clippy -D warnings + test | ✅ | `.github/workflows/ci.yml`；本地 69 测试 + clippy 零告警 |
| CI：Playwright 冒烟（立项→出活一条链） | ✅ | 5 个冒烟脚本，自带静态 server，本地全绿 |
| CI：Lighthouse ≥90 | ⬜ | 未接（本地已有帧率/首屏/溢出的等价断言） |
| CI：前端 tsc/eslint/vitest | ⬜ | 前端目前是原生 JS，无 TS/构建链，未引入 |
| CI：gitleaks | ✅ | ci.yml 里已配 |
| 错误码表 E-CLI/E-GEN/E-PUB 前后端共享 | ✅ | `errcode.rs` 15 条 + `GET /v1/errcodes`；`classify()` 对真实错误串有测试 |
| 前端全局 error boundary | 🟡 | 错误态组件与错误码已就位；未做全局 window.onerror 上报 |
| 用户可见错误必带「怎么办」 | ✅ | 单测 `every_code_tells_the_user_what_to_do` 禁止「请重试」 |
| 观测四看板 | ✅ | `GET /v1/metrics`：成功率 / CLI p50·p95 / 队列深度 / 生图失败率+降级率 + 按错误码聚合 |
| OpenTelemetry 导出 | ⬜ | 只有 tracing，未接 OTel |
| `timeline_events` 即审计日志 | ✅ | metrics 直接从时间线算，没另建埋点 |
| PG 每日备份 + 恢复演练 | ⬜ | compose 里留了 `./backup` 卷，脚本未写（PG 本身未接） |
| SQLite 快照轮换 ×7 | ⬜ | 桌面存储目前是 JSON + 原子写；轮换未做 |
| 产物仓写入原子（tmp+rename） | ✅ | `EmbeddedStore::flush` / `FileStore::flush` 都是 tmp+rename |
| 发布：镜像 tag 化 + 滚动重启 | 🟡 | compose.prod 已写；tag 化流水线未做 |
| 发布：Tauri updater 双通道 | 🟡 | `tauri.conf.json` 配了 updater；签名密钥与发布端点是占位 |
| 两端版本号同源 | ✅ | `ui-kit/version.js` + `test/version.mjs` 断言三处一致 |
| `.env.example` 齐全注释 | ✅ | 重写；旧 v7 版入 `_legacy` |
| `CHENSHI_DATA_DIR` 默认 D 盘 | ✅ | 代码默认值 + `.env.example` |

## §07 执行步骤

| 阶段 | 状态 | 冒烟结果 |
|---|---|---|
| P0+ 目录清整并入封存 | ✅ | tag `v7-snapshot`；清点表写入 docs；cargo check + 前端构建绿 |
| P1 基石提炼 | ✅ | cli-core 7 测试 + provider-dock 11 测试（55 预设一条不少） |
| P2 engine-runtime | ✅ | 371 节点剧本编译 → 123KB 单文件，实测可玩 |
| P2.5 ui-kit 先行 | ✅ | tokens + 12 组件 + `/design` + WCAG 脚本；三项人工核对（双主题/键盘/reduced-motion）全勾 |
| P3 Rust api + 持久地基 | ✅ | 杀 api → worker 继续写时间线 → 重启补拉，4 条事件不丢 |
| P4 worker + 五任务 | ✅ | 69 测试；真调 claude 端到端返回正确 JSON |
| P4+ 生图双梯队 | ✅ | 禁用 codex 两种场景实跑，见 §04 |
| P5 模板库 | ✅ | 5 模板；同一剧本跨模板判决不同（契约门禁断言） |
| P5+ vault-import | ✅ | 182 张唯一，幂等 |
| P6 大厅 + 流畅加固 | ✅ | 60.3fps / 0 运行时错误 / 四档视口无溢出 / 球真可见（截图取样） |
| P7 收尾 | 🟡 | CI/compose/env/version/metrics/错误码 已做；PG·Redis·鉴权·OTel·备份未做 |
| P8 桌面端投放 | 🟡 | sidecar 逻辑真测通过；Tauri 壳源码就位但**未编译**（无 GUI 依赖） |

---

## 明确未做的部分（不粉饰）

1. **PgStore / Redis Stream / S3 产物仓** —— trait 已就位，是纯粹的补实现工作。当前云端投放实际跑的是 `EmbeddedStore`。
2. **鉴权** —— `owner_id` 硬编码 `local`。多用户配额、BYOK 计费都依赖它。
3. **Tauri 壳未编译** —— WSL 无 webkit2gtk / libayatana-appindicator3。守护逻辑（真正会出错的部分）已抽出并测通；壳本身是几十行胶水。需要在有 GUI 依赖的机器上 `cargo tauri build` 验证。
4. **Lighthouse CI / tsc / eslint / vitest** —— 前端是原生 JS，没有 TS 与构建链。已用 Playwright 断言覆盖了帧率、首屏、溢出、可见性、布局。
5. **OpenTelemetry / PG 备份演练 / SQLite 快照轮换** —— 依赖 3 与 PG 落地。
6. **lucide 图标包** —— 为保持单文件产物自包含，用了内联 SVG。若引入 lucide 需按需内联子集。
