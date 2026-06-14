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

function writeAll(list: GeneratedGame[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 配额满等异常忽略 */
  }
}

export function listGames(): GeneratedGame[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getGame(id: string | null): GeneratedGame | null {
  if (!id) return null;
  return readAll().find((g) => g.id === id) || null;
}

export function saveGame(g: GeneratedGame) {
  const list = readAll().filter((x) => x.id !== g.id);
  list.push(g);
  writeAll(list);
}

export function removeGame(id: string) {
  writeAll(readAll().filter((g) => g.id !== id));
}
