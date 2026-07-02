// 生成图片的本地持久缓存（IndexedDB）。
//
// 为什么需要它：生图供应商（StepFun / 万相 / Ark 等）返回的图片 URL 是带签名的
// 临时 OSS 链接，通常 24 小时内过期 —— 直接把 URL 存进游戏/存档，第二天图全裂。
// 而 base64 直接塞 localStorage 会立刻打爆 5MB 配额（一张 1024² PNG ≈ 1.5MB base64）。
//
// 方案：图片字节以 Blob 落 IndexedDB，游戏数据里只存稳定引用 "idb://<key>"；
// 渲染前经 hydrate 换成 objectURL。IndexedDB 不可用（隐私模式等）时所有操作
// 优雅降级为 no-op，调用方回退到原始 URL / CSS 占位。
const DB_NAME = "polaris.game.images";
const STORE = "images";
const DB_VERSION = 1;
/** 缓存条目上限，超出按写入时间淘汰最旧的（一张图 ~300KB-1.5MB，300 张 ≈ 100-450MB）。 */
const MAX_ENTRIES = 300;

export const IDB_PREFIX = "idb://";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "key" });
          os.createIndex("at", "at");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** 稳定 key：对 prompt 做 FNV-1a 哈希（无需 crypto.subtle，同步、跨端一致）。 */
export function imageKey(prompt: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `img_${(h >>> 0).toString(36)}_${prompt.length.toString(36)}`;
}

/** 存一张图。成功返回 "idb://<key>" 引用；IDB 不可用返回 null。 */
export async function putImage(key: string, blob: Blob): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const store = tx(db, "readwrite");
      const req = store.put({ key, blob, at: Date.now() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  if (!ok) return null;
  void pruneOld(db);
  return IDB_PREFIX + key;
}

async function pruneOld(db: IDBDatabase): Promise<void> {
  try {
    const store = tx(db, "readwrite");
    const countReq = store.count();
    countReq.onsuccess = () => {
      let excess = countReq.result - MAX_ENTRIES;
      if (excess <= 0) return;
      const cursorReq = store.index("at").openCursor();
      cursorReq.onsuccess = () => {
        const cur = cursorReq.result;
        if (!cur || excess <= 0) return;
        cur.delete();
        excess--;
        cur.continue();
      };
    };
  } catch {
    /* 淘汰失败不影响主流程 */
  }
}

export async function getImageBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = tx(db, "readonly").get(key);
      req.onsuccess = () => resolve(req.result?.blob ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// objectURL 记忆化：同一 key 只创建一次，避免每次 hydrate 泄漏 blob URL。
const urlCache = new Map<string, string>();

/**
 * 把引用解析成可渲染 URL：
 * - "idb://<key>" → objectURL（缓存命中）；缓存丢失返回 null（调用方可重新生成）。
 * - 其它（http/data:）原样返回。
 */
export async function resolveImageRef(ref: string): Promise<string | null> {
  if (!ref.startsWith(IDB_PREFIX)) return ref;
  const key = ref.slice(IDB_PREFIX.length);
  const hit = urlCache.get(key);
  if (hit) return hit;
  const blob = await getImageBlob(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/**
 * 批量水合：把一组场景里 bg 为 "idb://" 引用的图解析成 bgUrl（运行时字段）。
 * 返回发生变化的场景 id 列表，调用方据此刷新渲染。
 */
export async function hydrateSceneImages(
  scenes: Record<string, { bg?: string; bgUrl?: string }>
): Promise<string[]> {
  const changed: string[] = [];
  await Promise.all(
    Object.keys(scenes).map(async (id) => {
      const s = scenes[id];
      if (!s?.bg || !s.bg.startsWith(IDB_PREFIX) || s.bgUrl) return;
      const url = await resolveImageRef(s.bg);
      if (url) {
        s.bgUrl = url;
        changed.push(id);
      }
    })
  );
  return changed;
}
