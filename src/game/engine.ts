import { evalArith } from "./expr";

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
  // 行为证据(仿 UniPrism reflection_tags):结算时统计 tag 频次 = 玩家「做了什么」的证据。
  tags?: string[];
  // 能力维度增减(0–100 夹取),驱动结局后的「复盘画像」雷达。键为 GameDef.caps[].key。
  caps?: Stats;
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
  event?: { effects?: Stats; note?: string; caps?: Stats };
  // 史笔批注:进入本幕时显示的一行小字,如「史载:乌台诗案,几置之死地。」
  footnote?: string;
  // Checkpoint 多维评分卡(仿 UniPrism 黑客松/路演 rubric):进入本幕时按当前属性公开打一次分,
  // 维度对玩家透明,让玩家看见「这次因哪一项被扣分」。仅职业/专业体验向(career)使用。
  scorecard?: Scorecard;
}

// 评分卡:每项 expr 引用 stat key(求值后夹取 0–100),weight 为权重(和不必为 1,内部归一)。
export interface Scorecard {
  title: string; // 如「天使轮·路演评分」
  items: { label: string; expr: string; weight: number }[];
  note?: string; // 一行点评/诊断
}

export interface Ending {
  title: string;
  verse: string;
}

// 能力维度(复盘画像雷达的一轴)。0–100,与属性同量纲。
export interface CapDef {
  key: string;
  label: string;
  color: string;
}

// 加权结局:weight 为引用 stat key 的表达式;用于「命运岔口」近失结局可视化与(可选)主裁定。
export interface WeightedEnding {
  id: string;
  title: string;
  verse: string;
  weight: string;
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
  judge: (s: Stats) => Ending; // 结局加权裁定(主裁定,决定结局标题)
  theme: GameTheme;
  art?: (key: string | undefined) => string; // 场景 key -> SVG 字符串
  // —— 评判机制(对照 UniPrism 补的「看见自己」一层)——
  caps?: CapDef[]; // 复盘能力维度;留空=不出画像
  initialCaps?: Stats; // 能力初值(默认每维 10)
  endings?: WeightedEnding[]; // 加权结局列表;用于「命运岔口」近失结局可视化
  career?: boolean; // 职业/专业体验向:出评分卡 + 方向推荐,叙事向(史传)不出
  // 方向推荐一句话(career 线):据能力画像给「你适合/下一步该补」。
  recommend?: (caps: Stats, stats: Stats) => string;
  // 诊断式质疑:按最弱能力维度给一句 NPC 质疑(规则定「问什么」,文案由剧本作者写)。键为 cap.key。
  diagnoseByCap?: Record<string, string>;
}

/** 加权结局裁定:按 weight 表达式求值取最高。供新剧本的 judge 直接复用。 */
export function resolveWeighted(
  endings: WeightedEnding[],
  stats: Stats
): Ending {
  let best = endings[0];
  let bestScore = -Infinity;
  for (const e of endings) {
    const sc = evalWeightExpr(e.weight, stats);
    if (sc > bestScore) {
      bestScore = sc;
      best = e;
    }
  }
  return best
    ? { title: best.title, verse: best.verse }
    : { title: "终", verse: "故事到此收束。" };
}

/** 安全求值权重表达式:把 stat key 替换为数值,仅允许数字与 + - * / ( ) 。 */
export function evalWeightExpr(expr: string, stats: Stats): number {
  if (!expr) return 0;
  let s = expr;
  const keys = Object.keys(stats).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const v = Number.isFinite(stats[k]) ? String(stats[k]) : "0";
    s = s.split(k).join(`(${v})`);
  }
  if (!/^[-+*/()\d.\s]+$/.test(s)) return -Infinity;
  try {
    // 手写解析器求值:生产 CSP 禁用 Function()/eval,动态代码在发行版必炸(见 expr.ts)
    const v = evalArith(s);
    return Number.isFinite(v) ? v : -Infinity;
  } catch {
    return -Infinity;
  }
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
