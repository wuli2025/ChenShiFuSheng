#!/usr/bin/env node
/* ============================================================================
   WCAG AA 色板校验（PRD §05：色板全部过 WCAG AA 对比校验，构建时脚本卡）。

   直接解析 tokens.css，不开浏览器 —— CI 里跑得快，且改色板立刻红。
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast, parseColor, AA_TEXT, AA_LARGE } from '../packages/ui-kit/contrast.js';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../packages/ui-kit/tokens.css'), 'utf8');

/** 从 `[data-theme='x'] { ... }` 块里抽出所有 --var: value。 */
function themeVars(theme) {
  const re = new RegExp(`\\[data-theme=['"]${theme}['"]\\]\\s*\\{([^}]*)\\}`, 's');
  const m = re.exec(css);
  if (!m) throw new Error(`找不到主题 ${theme}`);
  // 先剥注释：`--bg-0: #070a12;  /* 最底 */` 的注释会黏到下一条声明的开头，
  // 让 `^\s*(--...)` 匹配不上，静默丢变量。
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const decl of body.split(';')) {
    const kv = /\s*(--[\w-]+)\s*:\s*(.+)/s.exec(decl);
    if (kv) vars[kv[1]] = kv[2].trim();
  }
  return vars;
}

/** 解析可能引用其它变量的值（如 --line-strong 引用 rgba(...)）。这里只需颜色字面量。 */
function color(vars, name) {
  const v = vars[name];
  if (!v) throw new Error(`主题里缺变量 ${name}`);
  return parseColor(v);
}

// 前景色 → 最低对比度要求。次要/装饰文本按大字标准（3.0），正文按 4.5。
const CHECKS = [
  ['--tx-1', '主文', AA_TEXT],
  ['--tx-2', '次文', AA_TEXT],
  ['--tx-3', '弱文', AA_LARGE],
  ['--acc', '主色', AA_LARGE],
  ['--acc-2', '辅色', AA_LARGE],
  ['--ok', '成功', AA_LARGE],
  ['--warn', '警告', AA_LARGE],
  ['--bad', '错误', AA_LARGE],
  ['--info', '信息', AA_LARGE],
];

// 每个前景色都要对三档背景都合规 —— 组件可能落在任意一档上。
const BACKGROUNDS = ['--bg-0', '--bg-1', '--bg-2'];

let failed = 0;
console.log('=== WCAG AA 色板校验（tokens.css）\n');

for (const theme of ['deep-space', 'cream-glass']) {
  const vars = themeVars(theme);
  console.log(`━━ ${theme}`);
  for (const [fgVar, label, min] of CHECKS) {
    const fg = color(vars, fgVar);
    const results = BACKGROUNDS.map(bgVar => {
      const r = contrast(fg, color(vars, bgVar));
      return { bgVar, r, ok: r >= min };
    });
    const worst = results.reduce((a, b) => (a.r < b.r ? a : b));
    const ok = results.every(x => x.ok);
    if (!ok) failed++;
    const detail = results.map(x => `${x.bgVar.replace('--bg-', 'bg')}=${x.r.toFixed(2)}`).join('  ');
    console.log(
      `  ${ok ? '✓' : '✗'} ${label.padEnd(4)} ${fgVar.padEnd(10)} 需 ≥${min.toFixed(1)}  ${detail}` +
      (ok ? '' : `   ← 最差 ${worst.bgVar} 仅 ${worst.r.toFixed(2)}`)
    );
  }
  console.log();
}

if (failed) {
  console.error(`✗ ${failed} 项未过 WCAG AA —— 色板改动被拒绝`);
  process.exit(1);
}
console.log('✓ 两个主题的全部前景/背景组合均过 WCAG AA');
