import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  for (const ent of readdirSync(abs)) {
    const rel = path.join(dir, ent).replaceAll("\\", "/");
    if (
      rel === "node_modules" ||
      rel === "dist" ||
      rel.startsWith("src-tauri/target") ||
      rel.startsWith("src-tauri/gen")
    ) {
      continue;
    }
    const st = statSync(path.join(root, rel));
    if (st.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

function stringsInSet(source, name) {
  const re = new RegExp(
    `${name}\\s*=\\s*new\\s+Set(?:<[^>]+>)?\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`,
  );
  const block = source.match(re)?.[1] ?? "";
  return new Set([...block.matchAll(/["']([A-Za-z0-9_:-]+)["']/g)].map((m) => m[1]));
}

const lib = read("src-tauri/src/lib.rs");
const handler = lib.match(/tauri::generate_handler!\s*\[([\s\S]*?)\]\s*\)/)?.[1] ?? "";
const registered = new Set(
  [...handler.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*::([A-Za-z_][A-Za-z0-9_]*)\s*,/g)].map(
    (m) => m[1],
  ),
);

if (registered.size === 0) {
  console.error("No Tauri commands found in src-tauri/src/lib.rs generate_handler![]");
  process.exit(1);
}

const frontendFiles = walk("src").filter((f) => /\.(ts|vue)$/.test(f));
const invoked = new Map();
for (const file of frontendFiles) {
  const source = read(file);
  for (const m of source.matchAll(/\binvoke(?:<[^>()]+>)?\(\s*["']([A-Za-z0-9_:-]+)["']/g)) {
    const cmd = m[1];
    if (!invoked.has(cmd)) invoked.set(cmd, []);
    invoked.get(cmd).push(file);
  }
}

const stripped = stringsInSet(read("src/tauri.ts"), "STRIPPED_COMMANDS");

const missing = [...invoked.keys()]
  .filter((cmd) => !registered.has(cmd) && !stripped.has(cmd))
  .sort();
const staleStripped = [...stripped].filter((cmd) => registered.has(cmd)).sort();

if (missing.length || staleStripped.length) {
  if (missing.length) {
    console.error("Frontend invokes not registered in Rust and not listed in STRIPPED_COMMANDS:");
    for (const cmd of missing) {
      console.error(`  - ${cmd} (${[...new Set(invoked.get(cmd))].join(", ")})`);
    }
  }
  if (staleStripped.length) {
    console.error("Commands are registered in Rust but still listed in STRIPPED_COMMANDS:");
    for (const cmd of staleStripped) console.error(`  - ${cmd}`);
  }
  process.exit(1);
}

console.log(
  `Tauri contract OK: ${registered.size} registered, ${invoked.size} frontend invokes, ${stripped.size} stripped.`,
);
