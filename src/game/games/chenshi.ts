// 《尘世浮生》—— 把原有 story.ts 包成 GameDef,老游戏照常可玩。
import type { GameDef } from "../engine";
import {
  SCENES,
  START_SCENE,
  INITIAL_STATS,
  judgeEnding,
} from "../story";

export const chenshiGame: GameDef = {
  id: "chenshi",
  start: START_SCENE,
  initialStats: { ...INITIAL_STATS },
  stats: [
    { key: "才情", color: "#8aa2b8" },
    { key: "家境", color: "#c98b6b" },
    { key: "风骨", color: "#b7c2a8" },
    { key: "心境", color: "#9a8fb0" },
  ],
  scenes: SCENES as unknown as GameDef["scenes"],
  judge: (s) => judgeEnding(s as any),
  theme: {
    sideTitle: "尘世浮生",
    sealText: "浮生\n之印",
    endScene: "— 终 · 浮生若梦 —",
    restartText: "再活一世",
    backText: "‹ 浮生阁",
  },
};
