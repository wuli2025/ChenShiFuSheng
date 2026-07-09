// 发布与泡泡深空大厅:发布=装配当前 project_json 为单文件 HTML 快照上架,
// 再改项目不影响已发布版。大厅列表无需登录,游标 id desc 分页;播放数自增走限流。
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./db.mjs";
import { requireAuth } from "./auth.mjs";
import { assembleHTML } from "./assemble.mjs";

// 装配环境:引擎源码位置 + 素材文件系统根(nginx /assets 卷;dev 指向 public/)
const ASSET_FS_ROOT = process.env.ASSET_FS_ROOT || "/data/assets";
const ENGINE_PATH = process.env.ENGINE_PATH || "/app/engine/vivid-engine.js";
const WARN_BYTES = 30 * 1024 * 1024, MAX_BYTES = 50 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerPublishRoutes(app) {
  // 发布前体检:项目存在 + 有封面 + 有产物(放宽为 project_json 非空)
  app.post("/v1/projects/:id/publish", { preHandler: requireAuth }, async (req, reply) => {
    const { visibility } = req.body || {};
    const vis = visibility === "link" ? "link" : "public";
    if (!UUID_RE.test(req.params.id))
      return reply.code(400).send({ error: "非法项目 id" });
    const { rows } = await pool.query(
      "select id, user_id, title, cover_asset, project_json from projects where id = $1",
      [req.params.id]
    );
    const p = rows[0];
    if (!p || p.user_id !== req.user.id)
      return reply.code(404).send({ error: "项目不存在" });
    if (!p.cover_asset)
      return reply.code(422).send({ error: "先生成封面:无封面不能发布" });
    if (!p.project_json)
      return reply.code(422).send({ error: "尚无装配产物,无法发布" });

    const { rows: verRows } = await pool.query(
      "select coalesce(max(version), 0) + 1 as v from publishes where project_id = $1",
      [p.id]
    );
    const version = verRows[0].v;
    const htmlPath = `/assets/publish/${p.id}_v${version}.html`;

    // 真装配:引擎+剧本+素材内联为单文件,写入 assets 卷(体积纪律 >50MB 拒发)
    let bytes;
    try {
      const out = await assembleHTML(p.project_json, {
        enginePath: ENGINE_PATH, assetFsRoot: ASSET_FS_ROOT,
      });
      bytes = out.bytes;
      if (bytes > MAX_BYTES)
        return reply.code(422).send({ error: `产物 ${(bytes / 1048576).toFixed(1)}MB 超过 50MB 上限,请压缩素材` });
      const abs = path.join(ASSET_FS_ROOT, "publish", `${p.id}_v${version}.html`);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, out.html);
    } catch (e) {
      req.log.error(e);
      return reply.code(422).send({ error: `装配失败: ${e.message}` });
    }

    const { rows: pubRows } = await pool.query(
      `insert into publishes (project_id, user_id, version, title, cover_url, html_path, visibility)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, project_id, version, title, cover_url, html_path, visibility, plays, created_at`,
      [p.id, req.user.id, version, p.title, p.cover_asset, htmlPath, vis]
    );
    const pub = pubRows[0];
    pub.plays = Number(pub.plays);
    pub.bytes = bytes;
    pub.warn = bytes > WARN_BYTES ? "产物超过 30MB,建议压缩素材" : undefined;
    return reply.code(201).send(pub);
  });

  app.delete("/v1/publishes/:id", { preHandler: requireAuth }, async (req, reply) => {
    if (!UUID_RE.test(req.params.id))
      return reply.code(400).send({ error: "非法发布 id" });
    const { rows } = await pool.query(
      "delete from publishes where id = $1 and user_id = $2 returning id",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: "发布不存在" });
    return { ok: true };
  });

  // 大厅:公开发布列表,游标 id desc,无需登录
  app.get("/v1/hall", async (req) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const cursor = req.query.cursor;
    const params = [limit];
    let where = "visibility = 'public'";
    if (cursor && UUID_RE.test(cursor)) {
      params.push(cursor);
      where += ` and id < $${params.length}`;
    }
    const { rows } = await pool.query(
      `select id, title, cover_url, html_path, plays, created_at from publishes
        where ${where} order by id desc limit $1`,
      params
    );
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return { items: rows.map((r) => ({ ...r, plays: Number(r.plays) })), nextCursor };
  });

  // 播放数自增,无需登录,限流防刷
  app.post("/v1/hall/:id/play", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    if (!UUID_RE.test(req.params.id))
      return reply.code(400).send({ error: "非法发布 id" });
    const { rows } = await pool.query(
      "update publishes set plays = plays + 1 where id = $1 and visibility = 'public' returning plays",
      [req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: "发布不存在" });
    return { plays: Number(rows[0].plays) };
  });
}
