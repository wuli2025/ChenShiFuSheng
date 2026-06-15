// 生成式游戏 · 通用剧情数据结构
// 由 LLM 生成、引擎消费。沿用《尘世浮生》的"属性 + 场景图 + 选项 + 加权结局"思路，
// 但完全数据驱动、不写死任何剧情，支持自由输入催生支线（continueScene 注入新场景）。

export interface GenStat {
  key: string; // 唯一键，effects / weight 表达式引用它
  label: string; // 展示名，如 才情
  value: number; // 0..100
}

export interface GenOption {
  text: string; // 选项文案（画面A 选项A）
  hint?: string; // 属性增减提示，如 "才情 +,家境 −"
  effects?: Record<string, number>; // 键为 stat.key 的增减
  next: string; // 目标场景 id；"__end__" 走结局裁定
}

export interface GenScene {
  id: string;
  title: string; // 场景小标题，如 — 一 · 城南旧寓 —
  bgPrompt?: string; // 给生图模型的画面描述
  bg?: string; // 生成后的背景图 URL / dataURL（可空）
  bgCss?: string; // 回退用 CSS 背景
  lines: string[]; // 旁白逐句
  options: GenOption[]; // 2-3 个分支选项
  freeInput?: boolean; // 是否允许对话框自由输入
  mood?: string; // 情绪:calm/tense/sorrow/hope/grand —— 驱动音景
}

export interface GenEnding {
  id: string;
  title: string;
  verse: string;
  weight: string; // 权重表达式，引用 stat.key，如 "风骨*2 + 心境"
}

export interface GeneratedGame {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  cover: string; // CSS background（封面）
  accent: string;
  stats: GenStat[];
  startScene: string;
  scenes: Record<string, GenScene>;
  endings: GenEnding[];
  createdAt: number;
  source?: string; // 用了哪些资料/剧本副本
  builtin?: boolean;
}

const DEFAULT_BG_CSS =
  "radial-gradient(120% 90% at 80% 0%, rgba(44,70,97,.45), transparent 60%), radial-gradient(100% 80% at 0% 100%, rgba(90,55,50,.35), transparent 55%), #14161a";

export function sceneBackground(s: GenScene): string {
  if (s.bg) return `url("${s.bg}") center/cover no-repeat`;
  return s.bgCss || DEFAULT_BG_CSS;
}

/**
 * 安全求值权重表达式：把 stat.key 替换成当前数值，仅允许数字与 + - * / ( ) 后再求值。
 * 任何非法/异常返回 -Infinity，使该结局不会被选中。
 */
export function evalWeight(expr: string, stats: Record<string, number>): number {
  if (!expr) return 0;
  let s = expr;
  // 先把较长的 key 替换掉，避免子串冲突
  const keys = Object.keys(stats).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const safeVal = Number.isFinite(stats[k]) ? String(stats[k]) : "0";
    s = s.split(k).join(`(${safeVal})`);
  }
  if (!/^[-+*/()\d.\s]+$/.test(s)) return -Infinity;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict";return(${s});`)();
    return typeof v === "number" && Number.isFinite(v) ? v : -Infinity;
  } catch {
    return -Infinity;
  }
}

/** 按加权裁定挑结局；endings 为空给兜底。 */
export function judgeGenEnding(
  game: GeneratedGame,
  statsMap: Record<string, number>
): GenEnding {
  const list = game.endings || [];
  if (list.length === 0) {
    return {
      id: "__default__",
      title: "终",
      verse: "故事到此收束，来过，也就散了。",
      weight: "0",
    };
  }
  let best = list[0];
  let bestScore = -Infinity;
  for (const e of list) {
    const score = evalWeight(e.weight, statsMap);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/** 把 stats 数组拍平成 {key: value} 方便求值。 */
export function statsToMap(stats: GenStat[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of stats) m[s.key] = s.value;
  return m;
}
