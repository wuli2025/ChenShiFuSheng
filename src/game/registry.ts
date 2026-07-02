// 游戏注册表 —— 大厅与播放器据此查找 GameDef。新增游戏只需在此登记。
// 三条主线剧本:朱元璋(布衣天子)· 马斯克(火星序曲)· 卡尔(无耻浮生);
// chenshi 为生成式内核(自创剧本入口),非固定故事,保留。
import type { GameDef } from "./engine";
import { chenshiGame } from "./games/chenshi";
import { zhuyuanzhangGame } from "./games/zhuyuanzhang";
import { muskGame } from "./games/musk";
import { karlGame } from "./games/karl";

export const GAME_DEFS: Record<string, GameDef> = {
  [chenshiGame.id]: chenshiGame,
  [zhuyuanzhangGame.id]: zhuyuanzhangGame,
  [muskGame.id]: muskGame,
  [karlGame.id]: karlGame,
};

export function getGame(id: string | null): GameDef | null {
  if (!id) return null;
  return GAME_DEFS[id] || null;
}
