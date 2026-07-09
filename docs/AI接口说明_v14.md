# AI 接口说明 v14

> v13 随画布引擎发布。v14 是 v11 重构后的版本：**规则从代码里搬进模板契约**，
> 生图从「单梯队 + 报错」变成「双梯队 + 显式降级」。

---

## 一、唯一真源

```
script.md  ←  唯一真源
   ↑            ↑              ↑
AI 写      编辑器手点      校验器读
```

- 剧本、数值、门槛、结局、**演出行**，全在 `script.md`（内含 JSON，符合 `Script` schema）。
- AI 写「演出:」行与编辑器手点动效，改的是**同一份数据**。没有第二套存储。
- 编译器 `compile.mjs` 只读 `script.md` + 素材目录，产出单文件 HTML。

## 二、数据流铁律

1. **一切事件先写 `timeline_events`，再广播。** SSE 只是显示器。
   - worker 是**另一个进程**，它写库；api 的 SSE 从时间线 tail 读，不是只听内存总线。
   - 断线用 `Last-Event-ID` + `GET /timeline?after=N` 补拉，状态自动收敛。
2. **关掉页面任务照跑。** worker 完成直接写时间线，不依赖任何前端在线。
3. **失败即报错，不静默降级。** 唯一的例外是生图梯队二，而它必须**显式标记**。

## 三、机制参数化（零剧情模板）

代码里**没有**任何题材知识。节点数、结局数、属性维度、门槛哲学、校验清单，
全部来自 `templates` 表的 `contract_json`：

```jsonc
{
  "id": "life-seven-classic",
  "scale":   { "nodes_min": 160, "endings_min": 29, "playtime_min_sec": 600 },
  "numeric": { "soft_cap": true, "attrs": ["体魄","学识","技术","魅力","存款"],
               "growth_curve": "diminishing", "cap": 100 },
  "gates":   { "style": "attr_threshold", "narrative_consistency": true },
  "endings": { "style": "persona_report", "reachability_proof": true },
  "art":     { "scene": "codex_shot_landscape", "sprite": "codex_sprite_transparent",
               "style_prompt": "…", "fallback": "auto", "concurrency": 2 },
  "checks":  ["playtime_min", "nodes_min", "endings_min", "endings_reachable_all",
              "true_branching", "numeric_within_softcap", "gate_narrative_consistency"],
  "ext": {}   // 新题材塞不进时用它，不改 schema
}
```

**prompt 里禁止手写死数字。** 用 `{{nodes_min}}` 这类占位符，由 `Contract::inject` 注入 ——
保证契约、校验器、prompt 三处永不漂移。（`prompts.rs` 有测试断言无残留占位符。）

## 四、校验：全局硬底线 + 模板级规则

`checks::run()` 执行 `contract.checks ∪ GLOBAL_FLOOR`。

**全局硬底线**（`GLOBAL_FLOOR`，任何模板不得豁免）：

| check | 含义 |
|---|---|
| `playtime_min` | 单周目**最短路径** ≥600 秒。用最短路而非最长路 —— 玩家可能一路冲结局 |
| `no_placeholder_art` | 插画来源只认 `codex` / `api_fallback`。SVG、占位图、无图，一律拒绝 |
| `no_dangling_refs` | 选项不得指向不存在的节点。会让玩家卡死 |

模板级规则（示例）：`nodes_min` `endings_min` `endings_reachable_all` `true_branching`
`numeric_within_softcap` `gate_narrative_consistency` `glossary_present` `hidden_line_density`。

未知的 check 名会**响亮地失败**，而不是静默跳过。

## 五、CLI 调用协议

全系统只有 `cli-core` 能 spawn CLI。踩过的坑都写在代码注释里，改之前先读：

| 约束 | 原因 |
|---|---|
| prompt **永远走 stdin** | Windows `CreateProcessW` 的 lpCommandLine 上限 32767 字符，33k 必抛 206 |
| codex JSONL 按 `item.id` 去重 | 同一 item 会反复推**全量**文本，不去重就刷屏 |
| claude stderr = 错误；codex stderr = 日志 | codex 的 stderr 是 tracing 输出，当致命错误会误杀 |
| 成败看退出码 **和** `turn.failed` | codex 退出码 0 也可能是失败 |
| Unix 下子进程 `process_group(0)` | `kill -TERM -pid` 才能带走整棵子孙树 |
| `ProcGuard` (Drop) 兜底 | future 被 abort/drop 时 Rust 不会替你回收子进程 |
| worker 监听 SIGTERM | 否则 Drop 根本不跑，在飞的 CLI 全成孤儿 |
| **官方档不设 `CLAUDE_CONFIG_DIR`** | 设了就丢登录态，一律 `Not logged in`。只有跑第三方供应商时才隔离 |
| codex 私有 `CODEX_HOME` 要种 `auth.json` | 并发线必须隔离，但空目录没有凭据 |
| 不做自动 retry | 重试策略在 gen-pipeline 按任务类型定（生图 ≤2 次，写剧本交人工） |

## 六、生图双梯队

```
梯队一  codex CLI（并发线各自独立 CODEX_HOME，单张 300s，重试 ≤2）
   │ 失败
   ↓
梯队二  生图模型 API 直连（走 provider-dock 的 EnvPatch，业务层不知道厂商）
   │ 也失败
   ↓
  报红。绝不落 SVG / 占位图。
```

三原则：
1. **单张粒度**降级，不整批放弃。
2. **显式标记** `source: codex | api_fallback`，时间线留痕，UI 有角标，可一键用 codex 重生。
3. 两个梯队**都是真生图模型**。风格一致性靠共用同一段 `style_prompt`。

选路策略由 `contract.art.fallback` 控制：`auto`（默认）/ `off`（不降级）/ `api_only`（跳过 codex）。

## 七、五种任务

| kind | 轻/重 | 自动重试 | 说明 |
|---|---|---|---|
| `script` | 重 | 0 次 | 长任务，失败交人工（别烧钱） |
| `revise` | 轻 | 1 次 | 改节点，产出 diff 卡，人工确认才落库 |
| `fx` | 轻 | 1 次 | 写「演出:」行，与编辑器同权 |
| `image` | 重 | 2 次 | 双梯队 |
| `compile` | 重 | 1 次 | 编译 + 跑 `contract.checks`，不过则产物不进大厅 |

配额：每项目 1 重 + N 轻；每用户跨项目总并发 4（env 可调）。
worker 有 N 个并发消费槽（`CHENSHI_WORKER_SLOTS`，默认 4）—— **串行会让重任务堵死轻任务**。

## 八、错误码

用户可见的错误必须带「发生了什么 / 为什么 / 怎么办」三段。表在 `gen-pipeline/src/errcode.rs`，
前端通过 `GET /v1/errcodes` 拉同一份，文案不会漂移。

- `E-CLI-xx` CLI 调用（未找到 / 未登录 / 挂死 / 输出超限 / 取消 / 额度）
- `E-GEN-xx` 生产任务（校验未过 / 两梯队全败 / 无备用通道 / 找不到剧本 / 悬空引用）
- `E-PUB-xx` 发布（校验未过 / 含外链 / 体积超限 / 配额）

测试断言「怎么办」不许是「请重试」这种空话。
