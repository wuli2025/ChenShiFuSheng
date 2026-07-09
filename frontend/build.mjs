#!/usr/bin/env node
/* ============================================================================
   前端打包：把 tokens.css + crystal-hall.js 内联进 index.html，
   产出一个自包含的、双击即可运行的 HTML。

   用法: node build.mjs [outPath]

   生产部署时前端仍走 Vite 多 chunk 构建（路由级代码分割）；
   这个单文件产物用于「双击试用」与「离线演示」。
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'dist', '尘世浮生.html');

const html = readFileSync(join(here, 'apps/web/index.html'), 'utf8');
const css = readFileSync(join(here, 'packages/ui-kit/tokens.css'), 'utf8');
const js = readFileSync(join(here, 'packages/ui-kit/crystal-hall.js'), 'utf8');

let bundled = html
  // 内联 tokens.css
  .replace(
    /<link rel="stylesheet" href="[^"]*tokens\.css">/,
    `<style>\n/* ==== ui-kit/tokens.css (inlined) ==== */\n${css}\n</style>`
  )
  // 把 ESM import 换成内联模块：crystal-hall.js 去掉 export 关键字后直接前置
  .replace(
    /import \{ CrystalHall \} from '[^']*crystal-hall\.js';/,
    `/* ==== ui-kit/crystal-hall.js (inlined) ==== */\n${js.replace(/^export /gm, '')}`
  );

// 自包含校验：不能再有 <link rel=stylesheet>、ESM import 语句、或任何 http(s) 外链。
const violations = [];
if (/<link[^>]+rel=["']stylesheet/.test(bundled)) violations.push('残留 <link rel=stylesheet>');
if (/^\s*import\s.+from\s+['"]/m.test(bundled)) violations.push('残留 ESM import 语句');
if (/<(script|link|img)[^>]+(src|href)=["']https?:\/\//.test(bundled)) violations.push('含 http(s) 外链');
if (violations.length) {
  console.error('✗ 不是自包含产物：' + violations.join('；'));
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bundled);
console.log(`✓ ${out}  ${(Buffer.byteLength(bundled) / 1024).toFixed(0)}KB  自包含 · 无外链`);
