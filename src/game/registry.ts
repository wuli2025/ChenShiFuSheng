// 游戏注册表 —— 大厅与播放器据此查找 GameDef。新增游戏只需在此登记。
import type { GameDef } from "./engine";
import { chenshiGame } from "./games/chenshi";
import { muskGame } from "./games/musk";
import { simaqianGame } from "./games/simaqian";
import { zhugeliangGame } from "./games/zhugeliang";
import { sushiGame } from "./games/sushi";
import { wuzetianGame } from "./games/wuzetian";
import { zhangqianGame } from "./games/zhangqian";
import { wangyangmingGame } from "./games/wangyangming";
import { liqingzhaoGame } from "./games/liqingzhao";
import { zhengheGame } from "./games/zhenghe";
import { yingzhengGame } from "./games/yingzheng";
import { zhuyuanzhangGame } from "./games/zhuyuanzhang";

export const GAME_DEFS: Record<string, GameDef> = {
  [chenshiGame.id]: chenshiGame,
  [muskGame.id]: muskGame,
  [simaqianGame.id]: simaqianGame,
  [zhugeliangGame.id]: zhugeliangGame,
  [sushiGame.id]: sushiGame,
  [wuzetianGame.id]: wuzetianGame,
  [zhangqianGame.id]: zhangqianGame,
  [wangyangmingGame.id]: wangyangmingGame,
  [liqingzhaoGame.id]: liqingzhaoGame,
  [zhengheGame.id]: zhengheGame,
  [yingzhengGame.id]: yingzhengGame,
  [zhuyuanzhangGame.id]: zhuyuanzhangGame,
};

export function getGame(id: string | null): GameDef | null {
  if (!id) return null;
  return GAME_DEFS[id] || null;
}
