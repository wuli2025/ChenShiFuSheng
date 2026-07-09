/* 极小静态服务器。测试脚本用它托管 frontend/，不依赖后端起没起。
   ESM 模块在 file:// 下会被 CORS 拦，所以必须走 http。 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

/** 起服务，返回 { base, close() }。端口 0 = 让内核挑空闲端口，避免并发测试撞车。 */
export function serve(root = ROOT) {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      // 去掉 query，防目录穿越
      const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      const file = join(root, rel);
      try {
        const buf = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(buf);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise(r => srv.close(r)),
      });
    });
  });
}
