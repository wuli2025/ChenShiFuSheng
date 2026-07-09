/* ============================================================================
   ui-kit / format —— 统一格式化函数。
   PRD §05「细节密度」：时间统一「x 分钟前」+ 悬浮绝对时间；
   文件大小 / 耗时统一格式化。页面禁止各写各的。
   ========================================================================= */

/** 相对时间：「刚刚 / 3 分钟前 / 昨天 / 3 月 12 日」。悬浮时配 absolute() 当 title。 */
export function relTime(ts, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - toMs(ts)) / 1000));
  if (s < 45) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d === 1) return '昨天';
  if (d < 7) return `${d} 天前`;
  const dt = new Date(toMs(ts));
  const sameYear = dt.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? `${dt.getMonth() + 1} 月 ${dt.getDate()} 日`
    : `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月 ${dt.getDate()} 日`;
}

/** 绝对时间，给 title 属性用。 */
export function absTime(ts) {
  const d = new Date(toMs(ts));
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 后端时间戳是秒；前端 Date.now() 是毫秒。统一收在这里，别让调用方猜。 */
function toMs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return Date.now();
  return n < 1e12 ? n * 1000 : n;
}

/** 文件大小：1023 B / 1.4 KB / 2.2 MB / 1.1 GB。二进制 1024 进制。 */
export function bytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** 耗时：820ms / 9.3s / 2 分 14 秒 / 1 小时 3 分。 */
export function duration(ms) {
  ms = Number(ms) || 0;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${Math.round(s % 60)} 秒`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

/** 大数字：1,234 / 1.2 万 / 3.4 亿。中文习惯用万/亿，不用 K/M。 */
export function count(n) {
  n = Number(n) || 0;
  if (n < 10000) return n.toLocaleString('zh-CN');
  if (n < 1e8) return `${(n / 1e4).toFixed(n < 1e5 ? 1 : 0)} 万`;
  return `${(n / 1e8).toFixed(1)} 亿`;
}
