/* ============================================================================
   WCAG 2.1 相对亮度与对比度。
   走查页实时显示，CI 脚本据此卡住不合规的色板改动。
   规范：https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
   ========================================================================= */

/** 支持 #rgb / #rrggbb / rgb(a) / hsl(a)。返回 [r,g,b]，0-255。 */
export function parseColor(css) {
  const s = String(css).trim();

  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return [p[0], p[1], p[2]];
  }

  m = /^hsla?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    return hslToRgb(parseFloat(p[0]), parseFloat(p[1]) / 100, parseFloat(p[2]) / 100);
  }

  throw new Error(`无法解析颜色: ${css}`);
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255].map(v => Math.round(v));
}

/** WCAG 相对亮度。 */
export function luminance([r, g, b]) {
  const f = v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** 对比度，1..21。顺序无关。 */
export function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA 门槛：正文 4.5，大字（≥18.66px 或 ≥14px 粗体）与图形/次要文本 3.0。 */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3.0;
