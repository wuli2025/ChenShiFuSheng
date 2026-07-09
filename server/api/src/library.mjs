// 共享素材库:平台级资源,点「添加」在 project_assets 建引用(不复制文件),
// 持续存在直到手动移出。共享文件按内容哈希全平台只存一份。
import { pool } from "./db.mjs";
import { requireAuth } from "./auth.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["sfx", "voice", "ui", "bg", "sprite", "bgm"]);

async function ownProject(id, userId) {
  if (!UUID_RE.test(id || "")) return false;
  const { rows } = await pool.query(
    "select 1 from projects where id = $1 and user_id = $2", [id, userId]);
  return !!rows[0];
}

export function registerLibraryRoutes(app) {
  // 共享素材列表(仅 approved),支持 kind 过滤 / 关键词 / 游标 id desc
  app.get("/v1/library", async (req) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const params = [limit];
    let where = "status = 'approved'";
    if (KINDS.has(req.query.kind)) {
      params.push(req.query.kind);
      where += ` and kind = $${params.length}`;
    }
    if (req.query.q && String(req.query.q).trim()) {
      params.push(`%${String(req.query.q).trim()}%`);
      where += ` and (name ilike $${params.length} or style_tag ilike $${params.length} or mood_tag ilike $${params.length})`;
    }
    if (req.query.cursor && UUID_RE.test(req.query.cursor)) {
      params.push(req.query.cursor);
      where += ` and id < $${params.length}`;
    }
    const { rows } = await pool.query(
      `select id, kind, name, style_tag, mood_tag, path, bytes, duration_ms, created_at
         from assets_lib where ${where} order by id desc limit $1`,
      params
    );
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return { items: rows.map((r) => ({ ...r, bytes: Number(r.bytes) })), nextCursor };
  });

  // 添加引用
  app.post("/v1/projects/:id/assets", { preHandler: requireAuth }, async (req, reply) => {
    if (!(await ownProject(req.params.id, req.user.id)))
      return reply.code(404).send({ error: "项目不存在" });
    const { assetId } = req.body || {};
    if (!UUID_RE.test(assetId || ""))
      return reply.code(400).send({ error: "非法 assetId" });
    const { rows } = await pool.query(
      "select 1 from assets_lib where id = $1 and status = 'approved'", [assetId]);
    if (!rows[0]) return reply.code(404).send({ error: "素材不存在或未过审" });
    await pool.query(
      `insert into project_assets (project_id, asset_id) values ($1, $2)
       on conflict (project_id, asset_id) do nothing`,
      [req.params.id, assetId]
    );
    return reply.code(201).send({ ok: true });
  });

  // 移出引用
  app.delete("/v1/projects/:id/assets", { preHandler: requireAuth }, async (req, reply) => {
    if (!(await ownProject(req.params.id, req.user.id)))
      return reply.code(404).send({ error: "项目不存在" });
    const { assetId } = req.body || {};
    if (!UUID_RE.test(assetId || ""))
      return reply.code(400).send({ error: "非法 assetId" });
    await pool.query(
      "delete from project_assets where project_id = $1 and asset_id = $2",
      [req.params.id, assetId]
    );
    return { ok: true };
  });

  // 项目素材间列表(join assets_lib)
  app.get("/v1/projects/:id/assets", { preHandler: requireAuth }, async (req, reply) => {
    if (!(await ownProject(req.params.id, req.user.id)))
      return reply.code(404).send({ error: "项目不存在" });
    const { rows } = await pool.query(
      `select a.id, a.kind, a.name, a.style_tag, a.mood_tag, a.path,
              a.bytes, a.duration_ms, pa.added_at
         from project_assets pa join assets_lib a on a.id = pa.asset_id
        where pa.project_id = $1 order by pa.added_at desc`,
      [req.params.id]
    );
    return { assets: rows.map((r) => ({ ...r, bytes: Number(r.bytes) })) };
  });
}
