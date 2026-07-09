#!/usr/bin/env node
/* 把 /design 走查页打成自包含单文件，双击可开（ESM 相对 import 在 file:// 下会被 CORS 拦）。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'dist', 'ui-kit走查页.html');

const html = readFileSync(join(here, 'apps/web/design.html'), 'utf8');
const css = readFileSync(join(here, 'packages/ui-kit/tokens.css'), 'utf8');
const fmt = readFileSync(join(here, 'packages/ui-kit/format.js'), 'utf8');
const ctr = readFileSync(join(here, 'packages/ui-kit/contrast.js'), 'utf8');

const bundled = html
  .replace(/<link rel="stylesheet" href="[^"]*tokens\.css">/,
    `<style>\n${css}\n</style>`)
  .replace(/import \{[^}]*\} from '[^']*format\.js';\s*import \{[^}]*\} from '[^']*contrast\.js';/,
    `/* inlined */\n${fmt.replace(/^export /gm, '')}\n${ctr.replace(/^export /gm, '')}`);

if (/^\s*import\s.+from\s+['"]/m.test(bundled)) {
  console.error('✗ 仍有 ESM import 未内联');
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bundled);
console.log(`✓ ${out}  ${(Buffer.byteLength(bundled) / 1024).toFixed(0)}KB  自包含`);
