// 游戏平台导航状态 —— 轻量单例 reactive。
// 屏:大厅 / 生成 / 体验(生成的) / 外部HTML游戏 / 资料库 / 设置。
import { reactive } from "vue";

export type Screen =
  | "lobby"
  | "create"
  | "play"
  | "external"
  | "library"
  | "gallery"
  | "templates"
  | "settings";

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

export function goCreate() {
  platform.screen = "create";
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
