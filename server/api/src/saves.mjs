// 云存档:每用户每剧本多槽位,乐观并发(version 自增,携带旧版本写入则 409)。
import { pool } from "./db.mjs";
import { config } from "./config.mjs";
import { requireAuth } from "./auth.mjs";

export function registerSaveRoutes(app) {
  app.get("/v1/saves", { preHandler: requireAuth }, async (req) => {
    const { rows } = await pool.query(
      `select script_id, slot, version, updated_at,
              octet_length(data::text) as bytes
         from saves where user_id = $1 order by updated_at desc`,
      [req.user.id]
    );
    return { saves: rows };
  });

  app.get("/v1/saves/:scriptId/:slot", { preHandler: requireAuth }, async (req, reply) => {
    const { rows } = await pool.query(
      `select data, version, updated_at from saves
        where user_id = $1 and script_id = $2 and slot = $3`,
      [req.user.id, req.params.scriptId, Number(req.params.slot) || 0]
    );
    if (!rows[0]) return reply.code(404).send({ error: "存档不存在" });
    return rows[0];
  });

  app.put("/v1/saves/:scriptId/:slot", { preHandler: requireAuth }, async (req, reply) => {
    const { data, baseVersion } = req.body || {};
    if (data == null) return reply.code(400).send({ error: "缺少 data" });
    const raw = JSON.stringify(data);
    if (raw.length > config.saveMaxBytes)
      return reply.code(413).send({ error: `存档超过 ${config.saveMaxBytes} 字节上限` });
    const slot = Number(req.params.slot) || 0;
    const { rows } = await pool.query(
      `insert into saves (user_id, script_id, slot, data, version)
       values ($1, $2, $3, $4::jsonb, 1)
       on conflict (user_id, script_id, slot) do update
         set data = excluded.data,
             version = saves.version + 1,
             updated_at = now()
         where $5::int is null or saves.version = $5::int
       returning version`,
      [req.user.id, req.params.scriptId, slot, raw, baseVersion ?? null]
    );
    if (!rows[0]) return reply.code(409).send({ error: "版本冲突:云端已有更新的存档" });
    return { version: rows[0].version };
  });

  app.delete("/v1/saves/:scriptId/:slot", { preHandler: requireAuth }, async (req) => {
    await pool.query(
      "delete from saves where user_id = $1 and script_id = $2 and slot = $3",
      [req.user.id, req.params.scriptId, Number(req.params.slot) || 0]
    );
    return { ok: true };
  });
}
