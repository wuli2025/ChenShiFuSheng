// 评判机制 · 复盘评估 —— 对照 UniPrism 补齐「看见自己」那一层。
// 引擎只算确定性数值,不调 AI:把已躺在 history(选项 tags / caps 增减)里的过程数据
// 翻译成「能力画像 + 一句点评 + 命运岔口 + 诊断式质疑」。纯前端、零依赖、可回放。
import type { CapDef, WeightedEnding, Stats } from "./engine";
import { evalWeightExpr } from "./engine";

export interface ProfileAxis {
  key: string;
  label: string;
  color: string;
  value: number; // 0–100
}

export interface Profile {
  axes: ProfileAxis[];
  strongest: ProfileAxis | null;
  weakest: ProfileAxis | null;
  review: string; // 一句话点评
}

/** 由能力维度定义 + 累计能力值构建复盘画像。 */
export function buildProfile(
  caps: CapDef[] | undefined,
  capVals: Stats
): Profile | null {
  if (!caps || caps.length === 0) return null;
  const axes: ProfileAxis[] = caps.map((c) => ({
    key: c.key,
    label: c.label,
    color: c.color,
    value: clamp(Math.round(capVals[c.key] ?? 0)),
  }));
  let strongest: ProfileAxis | null = null;
  let weakest: ProfileAxis | null = null;
  for (const a of axes) {
    if (!strongest || a.value > strongest.value) strongest = a;
    if (!weakest || a.value < weakest.value) weakest = a;
  }
  const review =
    strongest && weakest && strongest.key !== weakest.key
      ? `你强在「${strongest.label}」，弱在「${weakest.label}」。`
      : strongest
      ? `你最鲜明的底色是「${strongest.label}」。`
      : "";
  return { axes, strongest, weakest, review };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v || 0));
}

export interface RankedEnding extends WeightedEnding {
  score: number;
}

export interface FateFork {
  reached: RankedEnding; // 你走到的结局
  nearMiss: RankedEnding | null; // 仅差一点点的另一个结局
  margin: number; // 与近失结局的分差(>=0)
}

/**
 * 把加权结局按当前属性排名,给出「命运岔口」:你到达的结局 + 最接近的另一种人生。
 * reachedTitle 为主裁定(judge)的结局标题,用于和加权排名对齐(优先以它为「到达」)。
 */
export function fateFork(
  endings: WeightedEnding[] | undefined,
  stats: Stats,
  reachedTitle?: string
): FateFork | null {
  if (!endings || endings.length === 0) return null;
  const ranked: RankedEnding[] = endings
    .map((e) => ({ ...e, score: evalWeightExpr(e.weight, stats) }))
    .filter((e) => Number.isFinite(e.score))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;

  // 「到达」优先用主裁定标题对齐;对不上再退回加权第一名。
  let reachedIdx = reachedTitle
    ? ranked.findIndex((e) => e.title === reachedTitle)
    : 0;
  if (reachedIdx < 0) reachedIdx = 0;
  const reached = ranked[reachedIdx];

  // 近失:排名里与「到达」分数最接近的另一个结局(优先取紧邻的更高分者)。
  let nearMiss: RankedEnding | null = null;
  let margin = 0;
  let best = Infinity;
  for (let i = 0; i < ranked.length; i++) {
    if (i === reachedIdx) continue;
    const d = Math.abs(ranked[i].score - reached.score);
    if (d < best) {
      best = d;
      nearMiss = ranked[i];
      margin = d;
    }
  }
  return { reached, nearMiss, margin: Math.round(margin) };
}

export interface ScoreItem {
  label: string;
  value: number; // 0–100
  weight: number;
}
export interface ScorecardResult {
  title: string;
  items: ScoreItem[];
  total: number; // 0–100 加权总分
  note?: string;
}

/** 评分卡求值:每项 expr → 0–100,按 weight 归一加权出总分。 */
export function scoreCard(
  card: { title: string; items: { label: string; expr: string; weight: number }[]; note?: string },
  stats: Stats
): ScorecardResult {
  const items: ScoreItem[] = card.items.map((it) => ({
    label: it.label,
    value: clamp(evalWeightExpr(it.expr, stats)),
    weight: it.weight,
  }));
  const wsum = items.reduce((a, b) => a + b.weight, 0) || 1;
  const total = Math.round(
    items.reduce((a, b) => a + b.value * b.weight, 0) / wsum
  );
  return { title: card.title, items, total, note: card.note };
}
