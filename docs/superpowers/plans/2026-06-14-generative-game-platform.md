# 生成式游戏平台 Implementation Plan

> **For agentic workers:** 本计划在现有 Tauri+Vue3 项目「尘世浮生」上扩建，**纯前端改动，复用现有后端命令，后端零改动**。验证闸 = `npm run build`（vue-tsc 类型检查 + vite 打包）通过 + `npm run tauri:dev` 真机能跑出并游玩一个生成的游戏。

**Goal:** 把「尘世浮生」从单一内置叙事游戏，升级为「生成式游戏平台」：上传资料/选剧本副本/描述需求 → 调用现有 LLM API（Claude Code agent 底座）生成专属叙事游戏 → 进大厅点开即玩；含只读剧情结构树、设置页（生图/文本模型 API，可切换，不动项目自带 API）、并恢复知识库/图谱入口。

**Architecture:** 全部用现有 Tauri 命令，**不改 Rust**。
- 文本生成：复用 `chat.send({prompt,...})` + `listen("chat:stream")`（spawn `claude` CLI，走当前 provider）。
- provider 切换：复用 `provider_list / provider_switch`（即"文本模型 API"区，项目自带 API 只读展示）。
- 知识库/图谱：复用 `kb_*` 命令 + 现有 `KnowledgeGraph.vue` / KB 列表。
- 生图：新增 `imagegen.ts`，按设置里配置的 OpenAI-images 兼容端点真实出图；未配置则回退 CSS 渐变占位（保证零依赖也能跑出游戏）。
- 生成的游戏持久化到 `localStorage`，大厅读取展示。

**Tech Stack:** Vue 3 `<script setup>` + Pinia(已存在) + TypeScript + 现有 `src/tauri.ts` 封装；无新增依赖。

---

## 约束（来自用户，最高优先级）
- 绝不删除/改动：`chat_send`、`provider.rs`、`kb.rs`、`.env`、`chat:stream` 事件契约、`tauri.ts` 现有 invoke。
- 剧情结构「先只预览」，不做可拖拽编辑。
- 生成要「真跑通」（真调 LLM），不是 UI 假演示。
- 从现有项目文件夹改，不另起炉灶。

## 测试策略说明（TDD 适配）
本仓库**无测试框架**（package.json 无 vitest/jest）。为不引入范围蔓延，验证闸采用：①`npm run build` 类型/编译通过；②`npm run tauri:dev` 手动冒烟（生成→游玩→结局）。每个任务后跑 build。

---

## File Structure

新增（均在 `src/game/`）：
- `story-schema.ts` — 通用剧情数据类型 `GeneratedGame/GenScene/GenOption/GenEnding/GenStat` + 结局加权裁定 `judgeGenEnding()` + 安全表达式求值。
- `gamesStore.ts` — 生成游戏的 localStorage 持久化（list/get/save/remove）+ 内置 chenshi 元数据。
- `generator.ts` — 构造 prompt、调 `chat.send`、聚合 `chat:stream` delta、抽取并校验 JSON → `GeneratedGame`；以及自由输入续写 `continueScene()`。
- `imagegen.ts` — 读设置里的生图配置，真实出图；失败/未配置回退 null。
- `gameSettings.ts` — 生图/文本模型设置的 localStorage 读写。
- `StoryTree.vue` — 只读剧情结构树（按用户草图：起点→步骤→分岔→走向→结局）。
- `GameCreate.vue` — 生成首页：上传/选剧本副本/需求对话框 + Tab[需求描述 | 剧情数据结构(StoryTree 只读)] + 生成按钮 + 生成进度。
- `GamePlayer.vue` — 通用播放器：背景 + 旁白 + 选项(A/B...) + 对话框自由输入 + 结局；渲染 `GeneratedGame`。
- `GameLibrary.vue` — 知识库浏览（复用 `kb.list/kb.read`）。
- `GameGraph.vue` — 图谱（挂载现有 `components/KnowledgeGraph.vue`）。
- `GameSettings.vue` — 设置页：生图模型预置+key、文本模型(provider_list/switch)、项目自带 API 只读。

修改：
- `platform.ts` — 扩展 `Screen` 联合类型 + 导航函数。
- `GamePlatform.vue` — 按 screen 切换全部组件。
- `GameLobby.vue` — 加「生成新游戏」卡片 + 顶部导航（资料库/图谱/设置）+ 读取生成游戏列表。
- `games.ts` — 保留内置 chenshi 标记，大厅合并展示生成游戏。

---

## 剧情数据结构（核心 schema，引擎消费）

```ts
export interface GenStat { key: string; label: string; value: number }      // 0..100
export interface GenOption {
  text: string;                       // 画面A 选项A
  hint?: string;
  effects?: Record<string, number>;   // 属性增减，键为 stat.key
  next: string;                       // 目标场景 id 或 "__end__"
}
export interface GenScene {
  id: string;
  title: string;                      // — 场景小标题 —
  bgPrompt?: string;                  // 给生图模型的画面描述
  bg?: string;                        // 生成后的图 URL/dataURL（可空）
  bgCss?: string;                     // 回退用 CSS 背景
  lines: string[];                    // 旁白逐句
  options: GenOption[];               // 2-3 个分支选项
  freeInput?: boolean;                // 是否允许对话框自由输入
}
export interface GenEnding {
  id: string; title: string; verse: string;
  weight: string;                     // 权重表达式，引用 stat.key，如 "风骨*2 + 心境"
}
export interface GeneratedGame {
  id: string; title: string; subtitle: string; tag: string;
  cover: string; accent: string;
  stats: GenStat[]; startScene: string;
  scenes: Record<string, GenScene>; endings: GenEnding[];
  createdAt: number; source?: string;
}
```

结局裁定：对每个 ending 的 `weight` 做安全求值（把 stat.key 替换成数值，校验只剩 `[0-9+\-*/(). ]`，再 `Function` 求值），取最大者。

## 生成调用契约（真 LLM）
- `chat.send({ prompt, permissionMode: "manual", useKb: <是否勾选资料> })` 返回 reqId。
- `listen("chat:stream", ev => { if(ev.reqId===id){ if(ev.kind==="delta") buf+=ev.text; if(ev.kind==="done") resolve(buf); if(ev.kind==="error") reject; } })`。
- prompt 要求模型「只输出一个 JSON，匹配上面 schema，scenes 5-6 个，每场景 2-3 选项，结局给加权表达式」；解析时抽取第一个平衡 `{...}` 块。

---

## Tasks

### Task 1: 剧情 schema 与结局裁定
**Files:** Create `src/game/story-schema.ts`
- 定义上述全部接口。
- `export function evalWeight(expr: string, stats: Record<string,number>): number`：替换 key→值，正则白名单校验，`Function("return("+safe+")")()`，异常返回 -Infinity。
- `export function judgeGenEnding(g, statsMap): GenEnding`：遍历 endings 取 evalWeight 最大；空则返回兜底 ending。
- 验证：`npm run build` 通过。

### Task 2: localStorage 游戏仓库
**Files:** Create `src/game/gamesStore.ts`
- key `polaris.games.v1`。`listGames(): GeneratedGame[]`、`getGame(id)`、`saveGame(g)`、`removeGame(id)`，JSON 读写 try/catch。
- 验证：build 通过。

### Task 3: 设置存储 + 生图
**Files:** Create `src/game/gameSettings.ts`, `src/game/imagegen.ts`
- gameSettings：`getImageCfg()/setImageCfg()`（{preset,endpoint,apiKey,model,enabled}），localStorage key `polaris.game.image.v1`。预置列表常量：即梦Seedream/通义万相/SD/DALL·E，各自默认 endpoint。
- imagegen：`async genImage(prompt): Promise<string|null>`，读 cfg；未启用/无 key 直接 null；否则 `fetch(endpoint,{POST, headers:{Authorization:Bearer key}, body:{model,prompt,...}})`，取 `data[0].url`/`b64_json`→dataURL；任何异常 null。
- 验证：build 通过。

### Task 4: 生成器（真调 LLM）
**Files:** Create `src/game/generator.ts`
- `buildPrompt(req:{template,requirement,kbHint})`：拼系统化指令 + schema 说明 + 输出 JSON-only 约束。
- `extractJson(text): any`：找首个平衡花括号块并 `JSON.parse`。
- `async generateGame(req, onProgress): Promise<GeneratedGame>`：listen 注册→`chat.send`→聚合 delta（onProgress 抛字数/片段）→done→extractJson→补全 id/createdAt/默认 bgCss/accent→返回；unlisten。
- `async continueScene(game, scene, stats, action): Promise<{scene:GenScene, effects}>`：自由输入续写，prompt 要求返回一个新 GenScene JSON。
- 验证：build 通过。

### Task 5: 只读剧情结构树
**Files:** Create `src/game/StoryTree.vue`
- props: `game: GeneratedGame`。从 startScene BFS 出场景图，渲染 CSS 树（节点=场景标题，叶子=结局，按用户草图：纵向起点→步骤，分岔处横向展开走向）。纯只读，无拖拽。
- 验证：build 通过。

### Task 6: 生成首页
**Files:** Create `src/game/GameCreate.vue`
- 区域：①上传资料（`<input type=file>` 或从 KB 勾选，MVP 用需求文本即可，附"使用知识库"开关→传 useKb）②选剧本副本（预置模板下拉：尘世浮生/职场/校园/悬疑）③Tab：需求描述(textarea) | 剧情数据结构(生成后显示 StoryTree，未生成显示提示)。
- 「生成游戏」按钮：禁用态→loading（显示 generator 进度文本）→成功 saveGame + enterGame(id) 跳播放器；失败 toast。
- 验证：build 通过 + 真机点生成能出 JSON。

### Task 7: 通用播放器
**Files:** Create `src/game/GamePlayer.vue`
- props 来自 `getGame(platform.gameId)`。reactive stats 由 game.stats 初始化。
- 渲染：背景(bg 图或 bgCss) + 旁白逐句(沿用 ink 揭示动画) + 选项按钮(画面A/B…) + 对话框 `<input>`(freeInput 时) + 侧栏属性条。
- pick(option)：应用 effects，next==="__end__"→judgeGenEnding 出结局；否则切场景。
- submitFree(text)：调 continueScene，注入返回的新场景并应用 effects（"与 API 对话催生支线"）。
- 结局：标题+verse+属性+再玩/回大厅。
- 验证：build 通过 + 真机能玩通一局到结局。

### Task 8: 资料库 + 图谱屏
**Files:** Create `src/game/GameLibrary.vue`, `src/game/GameGraph.vue`
- Library：`kb.list()` 列文件，点击 `kb.read()` 预览。顶部返回大厅。
- Graph：直接 `<KnowledgeGraph />`（import 自 `../components/KnowledgeGraph.vue`），外套返回大厅。若该组件依赖 store，保持原样挂载。
- 验证：build 通过。

### Task 9: 设置页
**Files:** Create `src/game/GameSettings.vue`
- 生图模型：预置 chip（点选填 endpoint）+ apiKey 输入 + 启用开关 → setImageCfg。
- 文本模型：`provider.list()` 列出（真实！）+ 点击 `provider.switch(id)`；当前 provider 高亮。
- 项目自带 API：展示当前 .env/active provider，标"锁定·只读"，不提供改动。
- 验证：build 通过 + 切换 provider 真实生效。

### Task 10: 导航装配
**Files:** Modify `platform.ts`, `GamePlatform.vue`, `GameLobby.vue`, `games.ts`
- platform：`Screen = "lobby"|"create"|"play"|"library"|"graph"|"settings"`；加 `goCreate/goLibrary/goGraph/goSettings`，`enterGame(id)` 设 play。
- GamePlatform：v-if 切换全部 6 屏；play 时若 gameId==="chenshi" 用旧 `GameStage`，否则 `GamePlayer`（保住内置体验不回归）。
- GameLobby：合并 `GAMES`(内置) + `listGames()`(生成)；加「＋生成新游戏」卡→goCreate；顶部加 资料库/图谱/设置 入口。
- 验证：`npm run build` 通过；`npm run tauri:dev` 全链路冒烟：大厅→生成→真出游戏→点开玩到结局→设置切 provider→资料库/图谱可达。

---

## Self-Review 检查
- 覆盖 PRD v4 全部：大厅✓ 生成首页✓ 知识库✓ 图谱✓ 体验游戏✓ 设置✓ 剧情结构树(只读)✓ 生成编排(generator 调 LLM)✓ 生图(imagegen)✓ 加权结局✓ 自由输入支线✓。
- 不动后端/项目 API：文本走 chat_send、provider 复用、生图独立配置、项目 API 只读 ✓。
- 类型一致：GeneratedGame 字段在 store/generator/player/tree 间统一 ✓。
- 无占位：每文件职责与函数签名已定 ✓。
