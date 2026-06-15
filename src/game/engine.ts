// 通用叙事引擎 —— 把「单游戏」抽象成可注册的 GameDef。
// 每个游戏自带:属性维度 / 场景图 / 选项 / 结局加权裁定 / 主题文案 / 场景配图。
// 引擎只认这套接口,GameStage 据此通用渲染;新增游戏 = 新增一个 GameDef。

export type Stats = Record<string, number>;

export interface StatDef {
  key: string; // 属性名,如「资本」
  color: string; // 进度条颜色
}

export interface Choice {
  text: string;
  hint?: string;
  effects?: Stats; // 属性增减(0–100 夹取)
  next: string; // 目标场景 id;"__end__" 走结局裁定
}

export interface Scene {
  id: string;
  age: string; // 大字:如「1995」或「七」
  ageNote: string; // 小字:如「硅谷 · 廿四岁」
  era: string; // 右上角:如「互联网元年 · 春」
  scene: string; // 章节题:— 一 · 斯坦福的岔路 —
  art?: string; // 背景配图 key(交给 def.art 解析为 SVG)
  lines: string[]; // 旁白逐句
  // 抉择节点:有 choices,读完旁白后弹选项。
  choices?: Choice[];
  // 纯叙事节点(一「幕」):无 choices,用 next 自动续接到下一幕。
  // 节奏:连推几个纯叙事幕(约 100–150 字)后,再给一个真正分流的抉择。
  next?: string;
  // 进入本幕时自动发生的「命运/偶发」事件:被动改属性,无需玩家选。
  event?: { effects?: Stats; note?: string };
  // 史笔批注:进入本幕时显示的一行小字,如「史载:乌台诗案,几置之死地。」
  footnote?: string;
}

export interface Ending {
  title: string;
  verse: string;
}

export interface GameTheme {
  sideTitle: string; // 侧栏竖排标题
  sealText: string; // 印章文字(两字一行,可用 \n)
  endScene: string; // 结局章节题:— 终 · …… —
  restartText: string; // 「再活一世」一类
  backText: string; // 返回大厅按钮
  statWords?: string[]; // 7 档定性词梯(由低到高)
}

export interface GameDef {
  id: string;
  start: string;
  initialStats: Stats;
  stats: StatDef[]; // 有序:决定侧栏顺序与配色
  scenes: Record<string, Scene>;
  judge: (s: Stats) => Ending; // 结局加权裁定
  theme: GameTheme;
  art?: (key: string | undefined) => string; // 场景 key -> SVG 字符串
}

export const DEFAULT_STAT_WORDS = [
  "几无",
  "微薄",
  "平平",
  "尚可",
  "颇足",
  "丰厚",
  "极盛",
];

// 把 0–100 的属性值映射成一个定性词。
export function statWord(v: number, words = DEFAULT_STAT_WORDS): string {
  const idx = Math.min(words.length - 1, Math.floor(v / (100 / words.length)));
  return words[idx] || words[Math.floor(words.length / 2)];
}

// 夹取应用一组属性增减,返回新 stats(原地修改传入对象)。
export function applyEffects(stats: Stats, effects?: Stats) {
  if (!effects) return;
  for (const k of Object.keys(effects)) {
    if (k in stats) {
      stats[k] = Math.max(0, Math.min(100, stats[k] + (effects[k] || 0)));
    }
  }
}
