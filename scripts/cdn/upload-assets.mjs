// 把游戏美术(配图/配音/视频/外部游戏)上传到 Cloudflare R2,使其脱离可执行文件。
//
// 背景:此前这些资源在 public/ 下 → 被打进 dist → 被 tauri::generate_context! 焊进 exe(~226MB)。
// 上传到 R2 + 前端设 ASSET_BASE 指向公开域名后,exe 可降到 ~12MB,自更新只换小 exe。
//
// 用法:
//   1) 装 wrangler 并登录:  npm i -g wrangler && wrangler login
//   2) 建桶并开公开访问(自定义域名,如 assets.llmwiki.cloud):Cloudflare 控制台 R2 → 桶 → Settings
//   3) 设环境变量后运行:
//        $env:R2_BUCKET="chenshi-assets"; node scripts/cdn/upload-assets.mjs
//   4) 把前端基址设为该公开域名:构建期 VITE_ASSET_BASE=https://assets.llmwiki.cloud
//      或运行时设置页调用 setAssetBase("https://assets.llmwiki.cloud")
//   5) 确认线上能取图后,删除 public 下这些大目录(见末尾提示),重建即得 ~12MB exe。
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC = path.join(ROOT, "public");
const BUCKET = process.env.R2_BUCKET;
if (!BUCKET) {
  console.error("缺少 R2_BUCKET 环境变量(目标桶名)。");
  process.exit(1);
}

// 需要上传的目录(相对 public/);键路径与前端 /story-art/... 站点根路径一一对应。
const DIRS = ["story-art", "story-voice", "story-video", "external-games"];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let n = 0;
let bytes = 0;
for (const d of DIRS) {
  const base = path.join(ROOT, "public", d);
  if (!fs.existsSync(base)) {
    console.log(`跳过(不存在): public/${d}`);
    continue;
  }
  for (const file of walk(base)) {
    // R2 对象键 = 站点根路径去掉开头斜杠,如 story-art/chenshi/age7.png
    // 注:cwd 设为 public、用相对路径,避免绝对路径里的中文经 cmd 乱码。
    const key = path.relative(PUBLIC, file).split(path.sep).join("/");
    // 安全护栏:key 直接拼进 shell 命令,含 shell 元字符的文件名可注入命令。
    // 正常美术文件名不会含这些字符;命中则跳过并告警,不静默、不放行。
    if (/["`$&|;<>(){}\\!%*?\n\r]/.test(key)) {
      console.warn(`  ⚠ 跳过含特殊字符的文件名(防命令注入): ${key}`);
      continue;
    }
    bytes += fs.statSync(file).size;
    // 逐文件重试:wrangler 偶发网络/限流失败,单张失败不该中断整批。
    let ok = false;
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      try {
        execSync(`wrangler r2 object put "${BUCKET}/${key}" --file "${key}" --remote`, {
          cwd: PUBLIC,
          stdio: ["ignore", "ignore", "ignore"],
        });
        ok = true;
      } catch (e) {
        if (attempt === 4) { console.error(`  ✗ 失败(4次): ${key}`); throw e; }
        // 同步退避:不再借 shell(powershell)睡眠,避免又一处 shell 调用。
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 2000);
      }
    }
    n += 1;
    if (n % 20 === 0) console.log(`  已上传 ${n} 个…`);
  }
}
console.log(`完成:上传 ${n} 个文件,共 ${(bytes / 1024 / 1024).toFixed(1)} MB 到 R2 桶 ${BUCKET}。`);
console.log("下一步:设 VITE_ASSET_BASE / setAssetBase 指向公开域名,确认取图正常后,可删本地大目录:");
console.log('  Remove-Item public\\story-art,public\\story-voice,public\\story-video,public\\external-games -Recurse -Force');
console.log("  然后重建 → exe 应降到 ~12MB。(external-games 走 iframe,如仍想内置可保留该目录。)");
