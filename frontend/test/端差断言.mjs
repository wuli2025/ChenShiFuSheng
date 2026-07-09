#!/usr/bin/env node
/* ============================================================================
   端差断言（PRD §03 + §08 P8 冒烟）：

   ① web 构建产物里 grep 不到 doctor / 目标文件夹 的实现代码；
   ② 除 platform.js 外，任何源文件都不许直接摸 window.__TAURI__。

   第 ② 条是第 ① 条的前提 —— 端别判断散落各处时，tree-shaking 无从下手。
   ========================================================================= */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

// ---------------------------------------------------------------- ①
console.log('=== ① web 构建产物不含桌面专属代码');
const dist = join(FRONTEND, 'dist/尘世浮生.html');
if (!existsSync(dist)) {
  console.error('  ✗ 先跑 npm run build');
  process.exit(1);
}
const bundle = readFileSync(dist, 'utf8');

// 找的是「实现」的指纹，不是「doctor」这个词本身
// （platform.js 里的 hasDoctor 是能力开关，允许出现）。
// 指纹要选「实现独有」的字符串，不能选变量名 ——
// index.html 里的 `const mountDiagnostics = ...` 只是个局部名字，不是实现。
const FORBIDDEN = [
  ['doctorSteps', '诊断页 DOM 实现'],
  ['连不上本地后端', '诊断页错误文案'],
  ['梯队二 生图 API', '诊断页检查项文案'],
  ['pick_directory', 'Tauri 目录对话框命令'],
  ['reveal', 'Tauri 资源管理器命令'],
  ['npm i -g @anthropic-ai/claude-code', '诊断页的安装指引'],
];
for (const [needle, label] of FORBIDDEN) {
  const hit = bundle.includes(needle);
  console.log(`  ${hit ? '✗' : '✓'} ${label.padEnd(24)} ${hit ? '出现在产物里！' : '已被摇掉'}`);
  if (hit) failed++;
}
console.log(`  产物 ${(Buffer.byteLength(bundle) / 1024).toFixed(0)}KB`);

// ---------------------------------------------------------------- ②
console.log('\n=== ② 只有 platform.js 允许直接判断端别');
// bridge.js 是「桌面桥」本体 —— 它就该是唯一调 Tauri invoke 的地方。
// platform.js 只判断端别，不调 invoke。
const ALLOW = ['packages/ui-kit/platform.js', 'apps/desktop/bridge.js'];
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'test') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(js|mjs|html|ts)$/.test(name)) continue;
    const rel = relative(FRONTEND, p).replace(/\\/g, '/');
    if (ALLOW.includes(rel)) continue;
    const src = readFileSync(p, 'utf8');
    if (/__TAURI__/.test(src)) offenders.push(rel);
  }
}
walk(FRONTEND);

if (offenders.length) {
  offenders.forEach(o => console.log(`  ✗ ${o} 直接摸了 window.__TAURI__`));
  failed += offenders.length;
} else {
  console.log('  ✓ 端别判断只在 platform.js 里');
}

// ---------------------------------------------------------------- 汇总
if (failed) {
  console.error(`\n✗ 端差断言未通过（${failed} 项）`);
  process.exit(1);
}
console.log('\n✓ 端差断言通过：网页端不携带 doctor / 目标文件夹能力');
