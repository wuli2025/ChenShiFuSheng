#!/usr/bin/env node
/* 版本号同源断言。四处不一致就红 —— 发布时版本漂移是最难查的事故之一。 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../packages/ui-kit/version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sources = [];

sources.push(['ui-kit/version.js', VERSION]);

const pkg = JSON.parse(readFileSync(join(root, 'frontend/package.json'), 'utf8'));
sources.push(['frontend/package.json', pkg.version]);

const cargo = readFileSync(join(root, 'backend/Cargo.toml'), 'utf8');
const cv = /\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/.exec(cargo);
sources.push(['backend/Cargo.toml', cv?.[1]]);

const tauri = join(root, 'frontend/apps/desktop/src-tauri/tauri.conf.json');
if (existsSync(tauri)) {
  const t = JSON.parse(readFileSync(tauri, 'utf8'));
  sources.push(['tauri.conf.json', t.version ?? t.package?.version]);
}

console.log('=== 版本号同源检查');
for (const [where, v] of sources) console.log(`  ${String(v).padEnd(10)} ${where}`);

const uniq = [...new Set(sources.map(([, v]) => v))];
if (uniq.length !== 1 || !uniq[0]) {
  console.error(`\n✗ 版本号不一致：${uniq.join(' vs ')}`);
  process.exit(1);
}
console.log(`\n✓ ${sources.length} 处版本号一致：${uniq[0]}`);
