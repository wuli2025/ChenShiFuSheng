/* ============================================================================
   桌面桥 —— **只在 Tauri 里被动态 import**，web 构建产物里一个字节都没有。

   这里是唯一出现 Tauri invoke 命令名的地方。放在 apps/desktop/ 下，
   ui-kit 与 apps/web 都不引用它（除了 platform.js 的动态 import）。
   ========================================================================= */

const invoke = (...a) => window.__TAURI__.core.invoke(...a);

export const bridge = {
  /** 壳启动 sidecar 后，api 监听在内核分配的随机端口上。 */
  async apiBase() {
    return invoke('api_base');
  },

  async chooseFolder() {
    return invoke('pick_directory');
  },

  async showInFolder(path) {
    return invoke('reveal', { path });
  },
};
