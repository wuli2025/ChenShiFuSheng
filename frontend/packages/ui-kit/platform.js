/* ============================================================================
   端别适配层 —— **全代码库唯一允许判断端别的地方**（PRD §02）。

   本文件必须保持「web 安全」：不含任何桌面专属的命令名、页面实现或文案。
   桌面能力全部藏在 `apps/desktop/bridge.js` 与 `doctor.js` 里，
   靠动态 import 引入 —— web 打包时它们的字节一个都不会进产物。
   （断言：test/端差断言.mjs）
   ========================================================================= */

const isTauri = typeof window !== 'undefined' && !!window.__TAURI__;

/** 桌面桥。懒加载一次，web 端永远是 null。 */
let bridgePromise = null;
function bridge() {
  if (!isTauri) return Promise.resolve(null);
  bridgePromise ??= import('../../apps/desktop/bridge.js').then(m => m.bridge);
  return bridgePromise;
}

export const platform = {
  get isDesktop() { return isTauri; },

  /** 本地文件系统能力。网页端没有 —— 产物固定写服务端的 CHENSHI_DATA_DIR。 */
  get hasLocalFs() { return isTauri; },

  /** 本机诊断页。网页端由服务端 /v1/health 的 selftest 覆盖。 */
  get hasDiagnostics() { return isTauri; },

  /** 联动写本地 CLI 配置。云端一律隔离模式。 */
  get hasLinkMode() { return isTauri; },

  /**
   * 桌面端的 apiBase 是本机随机端口（壳启动后端时由内核分配），要问壳要。
   * 网页端恒为 '/v1'；file:// 直开时返回 null，走离线演示。
   */
  async apiBase() {
    const b = await bridge();
    if (b) return b.apiBase();
    return location.protocol === 'file:' ? null : '/v1';
  },

  /** 选目录。仅桌面端；网页端调用即抛，提醒开发者别写进共享代码。 */
  async chooseFolder() {
    const b = await bridge();
    if (!b) throw new Error('仅桌面端可用：网页端不提供目标文件夹选择');
    return b.chooseFolder();
  },

  /** 在系统文件管理器中显示。仅桌面端。 */
  async showInFolder(path) {
    const b = await bridge();
    if (!b) throw new Error('仅桌面端可用');
    return b.showInFolder(path);
  },
};

/**
 * 本机诊断页按需加载。
 *
 * web 构建时 `build.mjs` 会把这个函数整体替换成 `return null`，
 * 于是诊断页的代码路径根本不存在，打包器无从把它拉进来。
 */
export async function loadDiagnosticsPage() {
  if (!platform.hasDiagnostics) return null;
  const mod = await import('../../apps/desktop/doctor.js');
  return mod.mountDoctor;
}
