// 游戏注册表 —— 大厅与播放器据此查找 GameDef。新增游戏只需在此登记。
import type { GameDef } from "./engine";
import { chenshiGame } from "./games/chenshi";
import { muskGame } from "./games/musk";

export const GAME_DEFS: Record<string, GameDef> = {
  [chenshiGame.id]: chenshiGame,
  [muskGame.id]: muskGame,
};

export function getGame(id: string | null): GameDef | null {
  if (!id) return null;
  return GAME_DEFS[id] || null;
}
