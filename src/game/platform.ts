// 游戏平台导航状态 —— 轻量单例 reactive。
// 屏:大厅 / 生成 / 体验(生成的) / 外部HTML游戏 / 资料库 / 设置。
import { reactive } from "vue";

export type Screen =
  | "lobby"
  | "create" // 已下线:旧版对话式生成(保留类型仅为兼容存量文件,入口已移除)
  | "play"
  | "external"
  | "projects" // 我的项目:用户自己生成的剧本工程,卡片可试玩/编辑/发布
  | "library"
  | "gallery"
  | "templates" // 模板库:故事线模板(v6 起重新进入左栏五分区)
  | "settings"
  | "studio" // 创作工坊/生成:嵌入 AI人生画布引擎工作台(双剧本线路+codex生图)
  | "vnstudio"; // 灵动工坊:原生 VN 动效叙事生产线(claude写稿+codex立绘场景+灵动引擎试玩/导出)

export interface PlatformState {
  screen: Screen;
  gameId: string | null;
  externalUrl: string | null;
  // 「故事线模板」→「以此模板起草」时暂存的提示骨架，供生成页开局预填。
  seedPrompt: string | null;
}

export const platform = reactive<PlatformState>({
  screen: "lobby",
  gameId: null,
  externalUrl: null,
  seedPrompt: null,
});

/** 进入某个（内置/生成的）游戏 */
export function enterGame(id: string) {
  platform.gameId = id;
  platform.externalUrl = null;
  platform.screen = "play";
}

/** 进入外部 HTML 游戏（iframe） */
export function enterExternal(url: string, id: string) {
  platform.externalUrl = url;
  platform.gameId = id;
  platform.screen = "external";
}

export function backToLobby() {
  platform.screen = "lobby";
  platform.gameId = null;
  platform.externalUrl = null;
}

/** @deprecated 旧版对话式生成已下线,创作统一走 goStudio()。保留仅为存量文件类型兼容。 */
export function goCreate() {
  platform.screen = "create";
}
/** 创作工坊:嵌入画布引擎工作台(写剧本 → 图谱改稿 → 定稿 → codex 生图 → 试玩/导出) */
export function goStudio() {
  platform.screen = "studio";
}
/** 灵动工坊:VN 动效叙事——一句话意图 → claude 写灵动剧本 → codex 场景图+透明立绘 → 试玩/导出 */
export function goVnStudio() {
  platform.screen = "vnstudio";
}
export function goProjects() {
  platform.screen = "projects";
}
export function goLibrary() {
  platform.screen = "library";
}
export function goGallery() {
  platform.screen = "gallery";
}
export function goTemplates() {
  platform.screen = "templates";
}
export function goSettings() {
  platform.screen = "settings";
}

/** 从某个故事线模板起草：带上提示骨架跳到生成页（不自动发送，交玩家再改）。 */
export function goCreateWith(prompt: string) {
  platform.seedPrompt = prompt;
  platform.screen = "create";
}
