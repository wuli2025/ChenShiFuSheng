/* ============================================================================
   版本号唯一真源（PRD §06 发布：两端版本号同源）。

   改版本只改这一处；CI 的 check-version 会断言以下四处一致：
     · 这个文件
     · backend/Cargo.toml     [workspace.package] version
     · frontend/package.json  version
     · Tauri 壳 tauri.conf.json（若存在）
   ========================================================================= */
export const VERSION = '0.11.0';

/** 产品字标。出现在：大厅左上 / 加载页 / 导出游戏启动幕 / 桌面端安装器 —— 四处同一套。 */
export const PRODUCT = '尘世浮生';
export const TAGLINE = '一生皆可演绎';

/** 水晶球 logo。四处复用同一段 SVG，禁止各画各的。 */
export const LOGO_SVG = `<svg viewBox="0 0 32 32" width="100%" height="100%" aria-label="${PRODUCT}">
  <defs>
    <radialGradient id="orb" cx="35%" cy="30%">
      <stop offset="0" stop-color="#a9c8ff"/>
      <stop offset=".55" stop-color="#4b6fd8"/>
      <stop offset="1" stop-color="#1b2545"/>
    </radialGradient>
  </defs>
  <circle cx="16" cy="16" r="14" fill="url(#orb)"/>
  <ellipse cx="11" cy="10" rx="4.6" ry="3.4" fill="rgba(255,255,255,.42)" transform="rotate(-28 11 10)"/>
  <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,.14)"/>
</svg>`;
