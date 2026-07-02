// 运行态存档 + 多档位手动存读 + 结局图鉴(localStorage)。
import type { GenScene } from "./story-schema";

export interface LogEntry {
  kind: "chapter" | "line" | "choice";
  text: string;
}

export interface RunState {
  sceneId: string;
  revealed: number;
  stats: Record<string, number>;
  ended: boolean;
  extraScenes?: Record<string, GenScene>;
  log: LogEntry[];
  updatedAt: number;
  // 评判机制:累计能力维度 + 行为标签频次,供结局复盘画像(可空,旧档兼容)
  caps?: Record<string, number>;
  tagCounts?: Record<string, number>;
}

export interface SlotMeta {
  chapter: string;
  at: number;
}
export interface SlotData extends SlotMeta {
  state: RunState;
}

const RUN_KEY = "polaris.runs.v1";
const ENDINGS_KEY = "polaris.endings.v2";
const SLOTS_KEY = "polaris.slots.v1";

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? (o as Record<string, T>) : {};
  } catch {
    return {};
  }
}
// bgUrl 是运行时 objectURL(blob:),跨会话无效,持久化时剥掉(extraScenes 里会带)。
function stripRuntime(k: string, v: unknown): unknown {
  return k === "bgUrl" ? undefined : v;
}

let warnedQuota = false;
/** 写入失败(配额满等)返回 false;高频路径只 console 告警一次,手动存档由调用方提示。 */
function writeMap<T>(key: string, map: Record<string, T>): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(map, stripRuntime));
    return true;
  } catch (e) {
    if (!warnedQuota) {
      warnedQuota = true;
      console.warn("[saves] 存档持久化失败(localStorage 配额满?)", e);
    }
    return false;
  }
}

// —— 自动续玩存档 ——
export function saveRun(gameId: string, state: RunState): boolean {
  const all = readMap<RunState>(RUN_KEY);
  all[gameId] = { ...state, updatedAt: Date.now() };
  return writeMap(RUN_KEY, all);
}
export function loadRun(gameId: string): RunState | null {
  return readMap<RunState>(RUN_KEY)[gameId] || null;
}
export function hasRun(gameId: string): boolean {
  const r = readMap<RunState>(RUN_KEY)[gameId];
  return !!r && !r.ended;
}
export function clearRun(gameId: string) {
  const all = readMap<RunState>(RUN_KEY);
  delete all[gameId];
  writeMap(RUN_KEY, all);
}

// —— 多档位手动存读(slotId: "q" 快速档 / "1".."3" 手动档) ——
type SlotsByGame = Record<string, Record<string, SlotData>>;
export function saveSlot(
  gameId: string,
  slotId: string,
  state: RunState,
  chapter: string
): boolean {
  const all = readMap<Record<string, SlotData>>(SLOTS_KEY) as SlotsByGame;
  const g = all[gameId] || {};
  g[slotId] = { state: { ...state }, chapter, at: Date.now() };
  all[gameId] = g;
  return writeMap(SLOTS_KEY, all);
}
export function loadSlot(gameId: string, slotId: string): SlotData | null {
  const g = (readMap<Record<string, SlotData>>(SLOTS_KEY) as SlotsByGame)[gameId];
  return (g && g[slotId]) || null;
}
export function listSlots(gameId: string): Record<string, SlotMeta> {
  const g = (readMap<Record<string, SlotData>>(SLOTS_KEY) as SlotsByGame)[gameId] || {};
  const out: Record<string, SlotMeta> = {};
  for (const id of Object.keys(g)) out[id] = { chapter: g[id].chapter, at: g[id].at };
  return out;
}
export function deleteSlot(gameId: string, slotId: string) {
  const all = readMap<Record<string, SlotData>>(SLOTS_KEY) as SlotsByGame;
  if (all[gameId]) {
    delete all[gameId][slotId];
    writeMap(SLOTS_KEY, all);
  }
}

// —— 结局图鉴 ——
interface EndingRec {
  verse: string;
  at: number;
}
export function unlockEnding(gameId: string, title: string, verse = "") {
  if (!title) return;
  const all = readMap<Record<string, EndingRec>>(ENDINGS_KEY);
  const g = all[gameId] || {};
  if (!g[title]) {
    g[title] = { verse, at: Date.now() };
    all[gameId] = g;
    writeMap(ENDINGS_KEY, all);
  }
}
export function listUnlocked(gameId: string): string[] {
  const g = readMap<Record<string, EndingRec>>(ENDINGS_KEY)[gameId];
  return g ? Object.keys(g) : [];
}
export function listEndingDetail(gameId: string): { title: string; verse: string }[] {
  const g = readMap<Record<string, EndingRec>>(ENDINGS_KEY)[gameId] || {};
  return Object.keys(g).map((title) => ({ title, verse: g[title].verse }));
}
export function unlockedCount(gameId: string): number {
  return listUnlocked(gameId).length;
}
