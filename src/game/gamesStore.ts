// 生成游戏的本地持久化（localStorage）。大厅从这里读取已生成的游戏。
import type { GeneratedGame } from "./story-schema";

const KEY = "polaris.games.v1";

function readAll(): GeneratedGame[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as GeneratedGame[]) : [];
  } catch {
    return [];
  }
}

// bgUrl 是运行时 objectURL(blob:),跨会话无效,持久化时剥掉。
function stripRuntime(k: string, v: unknown): unknown {
  return k === "bgUrl" ? undefined : v;
}

/** 写入失败(localStorage 配额满等)返回 false,调用方必须提示用户,不许静默丢数据。 */
function writeAll(list: GeneratedGame[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list, stripRuntime));
    return true;
  } catch (e) {
    console.warn("[gamesStore] 持久化失败(localStorage 配额满?)", e);
    return false;
  }
}

export function listGames(): GeneratedGame[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getGame(id: string | null): GeneratedGame | null {
  if (!id) return null;
  return readAll().find((g) => g.id === id) || null;
}

export function saveGame(g: GeneratedGame): boolean {
  const list = readAll().filter((x) => x.id !== g.id);
  list.push(g);
  return writeAll(list);
}

export function removeGame(id: string) {
  writeAll(readAll().filter((g) => g.id !== id));
}
