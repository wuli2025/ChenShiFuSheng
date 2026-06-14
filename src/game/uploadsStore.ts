// 游戏上传库（与 Polaris 知识库分离）。生成页上传的资料存这里，
// 既用于注入生成 prompt，也供「资料库」屏展示。默认空，不含 Polaris KB 内容。
export interface UploadItem {
  id: string;
  name: string;
  kind: string; // text | image | doc | other
  text: string; // 抽取出的文本（图片为空）
  ts: number;
}

const KEY = "polaris.game.uploads.v1";

function readAll(): UploadItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as UploadItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: UploadItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 配额满忽略 */
  }
}

export function listUploads(): UploadItem[] {
  return readAll().sort((a, b) => b.ts - a.ts);
}

export function addUpload(item: Omit<UploadItem, "id" | "ts">): UploadItem {
  const full: UploadItem = {
    ...item,
    id: `u_${Date.now().toString(36)}_${Math.floor(performance.now())}`,
    ts: Date.now(),
  };
  const list = readAll();
  list.push(full);
  writeAll(list);
  return full;
}

export function removeUpload(id: string) {
  writeAll(readAll().filter((u) => u.id !== id));
}

export function clearUploads() {
  writeAll([]);
}

/** 拼接所有上传文本，供注入生成 prompt。 */
export function uploadsAsContext(maxChars = 6000): string {
  const parts = readAll()
    .filter((u) => u.text && u.text.trim())
    .map((u) => `【${u.name}】\n${u.text.trim()}`);
  let out = parts.join("\n\n");
  if (out.length > maxChars) out = out.slice(0, maxChars) + "…";
  return out;
}
