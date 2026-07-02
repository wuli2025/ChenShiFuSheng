// 统一播放模型 —— 把「内置精修剧本(GameDef)」与「AI 生成剧本(GeneratedGame)」
// 归一成同一套数据，供唯一的播放器 GameView 渲染，彻底消除两套播放器的体验割裂。
import type { GameDef, CapDef, WeightedEnding, Scorecard } from "./engine";
import type { Mood } from "./audio";
import {
  judgeGenEnding,
  sceneBackground,
  statsToMap,
  type GeneratedGame,
  type GenScene,
} from "./story-schema";
import { artFor, voiceFor, videoFor } from "./art-manifest";

const MOODS = new Set<Mood>(["calm", "tense", "sorrow", "hope", "grand"]);
export function normMood(m: string | undefined): Mood | undefined {
  return m && MOODS.has(m as Mood) ? (m as Mood) : undefined;
}

// 内置剧本无 mood 字段:按章节题/时代里的字眼粗略推断,给配乐一点起伏。
function inferMood(text: string): Mood | undefined {
  const t = text || "";
  if (/(死|丧|别|散|墓|泪|孤|凋|败|战乱|灾|崩)/.test(t)) return "sorrow";
  if (/(战|险|逃|追|危|斗|劫|搏|赌|崩盘|绝境)/.test(t)) return "tense";
  if (/(钟|登|成|捷|曙|新生|登顶|盛|凯|荣)/.test(t)) return "grand";
  if (/(春|生|喜|愿|盼|约|启|始|遇|暖)/.test(t)) return "hope";
  return undefined;
}

export interface PlayChoice {
  text: string;
  hint?: string;
  effects?: Record<string, number>;
  tags?: string[];
  caps?: Record<string, number>;
  next: string;
}

export interface PlayScene {
  id: string;
  chapter: string; // 章节题:— 一 · …… —
  lines: string[];
  choices: PlayChoice[];
  freeInput: boolean;
  age?: string; // 大字(内置:年龄/年份)
  ageNote?: string;
  era?: string;
  bg?: string; // CSS background(生成游戏的画面)
  artHtml?: string; // SVG 配图(内置游戏,无真实配图时回退)
  img?: string; // 阶跃星辰生成的真实场景配图(优先于 artHtml)
  video?: string; // 万相图生视频:会动的水墨(优先于 img)
  voiceSrc?: string; // 阶跃星辰旁白配音 mp3 路径
  mood?: Mood; // 情绪 → 驱动音景
  // 纯叙事幕:无 choices,用 next 自动续接到下一幕(节奏:多转几幕再给一次抉择)
  next?: string;
  // 进入本幕时自动结算的「命运/偶发」事件:被动改属性 + 一行提示
  event?: { effects?: Record<string, number>; note?: string; caps?: Record<string, number> };
  // 史笔批注:进入本幕时显示的一行小字
  footnote?: string;
  // Checkpoint 评分卡(职业/专业体验向):进场公开打一次分
  scorecard?: Scorecard;
}

export interface PlayStat {
  key: string;
  label: string;
  color: string;
}

export interface PlayEnding {
  title: string;
  verse: string;
}

export interface PlayModel {
  kind: "builtin" | "generated";
  id: string;
  title: string;
  stats: PlayStat[];
  initialStats: Record<string, number>;
  start: string;
  scenes: Record<string, PlayScene>;
  theme: {
    sideTitle: string;
    sealText: string;
    endScene: string;
    restartText: string;
    backText: string;
    statWords?: string[];
  };
  judge: (stats: Record<string, number>) => PlayEnding;
  raw?: GeneratedGame; // 生成游戏保留原始数据，供自由输入续写
  // —— 评判机制(复盘评估)——
  caps?: CapDef[];
  initialCaps?: Record<string, number>;
  endings?: WeightedEnding[];
  career?: boolean;
  recommend?: (caps: Record<string, number>, stats: Record<string, number>) => string;
  diagnoseByCap?: Record<string, string>;
}

const GEN_STAT_COLORS = ["#8aa2b8", "#c98b6b", "#b7c2a8", "#9a8fb0", "#c9a86b"];

/** 内置 GameDef → PlayModel */
export function fromDef(def: GameDef): PlayModel {
  const scenes: Record<string, PlayScene> = {};
  for (const id of Object.keys(def.scenes)) {
    const s = def.scenes[id];
    scenes[id] = {
      id,
      chapter: s.scene,
      lines: [...(s.lines ?? [])],
      choices: (s.choices ?? []).map((c) => ({ ...c })),
      freeInput: false,
      age: s.age,
      ageNote: s.ageNote,
      era: s.era,
      artHtml: def.art ? def.art(s.art) : undefined,
      img: artFor(def.id, id),
      video: videoFor(def.id, id),
      voiceSrc: voiceFor(def.id, id),
      mood: inferMood(`${s.scene} ${s.era} ${(s.lines ?? []).join("")}`),
      next: s.next,
      event: s.event
        ? { effects: s.event.effects, note: s.event.note, caps: s.event.caps }
        : undefined,
      footnote: s.footnote,
      scorecard: s.scorecard,
    };
  }
  return {
    kind: "builtin",
    id: def.id,
    title: def.theme.sideTitle,
    stats: def.stats.map((st) => ({ key: st.key, label: st.key, color: st.color })),
    initialStats: { ...def.initialStats },
    start: def.start,
    scenes,
    theme: { ...def.theme },
    judge: (s) => def.judge(s),
    caps: def.caps,
    initialCaps: def.initialCaps,
    endings: def.endings,
    career: def.career,
    recommend: def.recommend,
    diagnoseByCap: def.diagnoseByCap,
  };
}

/** 单个生成场景 GenScene → PlayScene(自由输入续写时复用) */
export function genSceneToPlay(s: GenScene): PlayScene {
  return {
    id: s.id,
    chapter: s.title,
    lines: [...s.lines],
    choices: s.options.map((o) => ({
      text: o.text,
      hint: o.hint,
      effects: o.effects,
      next: o.next,
    })),
    freeInput: s.freeInput !== false,
    bg: sceneBackground(s),
    mood: normMood(s.mood),
  };
}

/** AI 生成 GeneratedGame → PlayModel */
export function fromGenerated(g: GeneratedGame): PlayModel {
  const scenes: Record<string, PlayScene> = {};
  for (const id of Object.keys(g.scenes)) {
    scenes[id] = genSceneToPlay(g.scenes[id]);
  }
  return {
    kind: "generated",
    id: g.id,
    title: g.title,
    stats: g.stats.map((st, i) => ({
      key: st.key,
      label: st.label,
      color: GEN_STAT_COLORS[i % GEN_STAT_COLORS.length],
    })),
    initialStats: statsToMap(g.stats),
    start: g.startScene && g.scenes[g.startScene] ? g.startScene : Object.keys(g.scenes)[0] || "s1",
    scenes,
    theme: {
      sideTitle: g.title,
      sealText: "浮生\n之印",
      endScene: "— 终 · 浮生若梦 —",
      restartText: "再活一世",
      backText: "‹ 浮生阁",
    },
    judge: (s) => {
      const e = judgeGenEnding(g, s);
      return { title: e.title, verse: e.verse };
    },
    raw: g,
  };
}
