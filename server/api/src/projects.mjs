// 项目 + 持久时间线:创作的隔离单位,一切事件先写库再广播。
// 时间线是一等持久实体:关掉页面、断网、切项目,任务照跑、记录永存、回来即续。
// SSE 只是显示器:先补拉库中 after 之后的事件,再订阅 redis 频道继续推。
import { pool, redis } from "./db.mjs";
import { requireAuth } from "./auth.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set([
  "user_msg", "ai_msg", "job_submitted", "job_progress",
  "job_result", "adopt", "save_summary", "pending_card",
]);

// 事务内取 max(seq)+1 追加事件,写库后广播到 tl:<projectId>。可传入已有 client 复用事务。
export async function appendEvent(projectId, kind, payload, client) {
  const c = client || (await pool.connect());
  const owned = !client;
  try {
    if (owned) await c.query("begin");
    const { rows } = await c.query(
      `insert into timeline_events (project_id, seq, kind, payload)
       select $1, coalesce(max(seq), 0) + 1, $2, $3::jsonb
         from timeline_events where project_id = $1
       returning id, seq, kind, payload, created_at`,
      [projectId, kind, JSON.stringify(payload ?? {})]
    );
    if (owned) await c.query("commit");
    const ev = rows[0];
    await redis
      .publish(`tl:${projectId}`, JSON.stringify({
        seq: Number(ev.seq), kind: ev.kind,
        payload: ev.payload, created_at: ev.created_at,
      }))
      .catch(() => {});
    return ev;
  } catch (e) {
    if (owned) await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    if (owned) c.release();
  }
}

// 取项目并校验属主,404 由调用方处理
async function ownedProject(id, userId) {
  if (!UUID_RE.test(id || "")) return null;
  const { rows } = await pool.query(
    "select id, user_id, title, cover_asset, status, project_json, created_at, updated_at from projects where id = $1",
    [id]
  );
  const p = rows[0];
  if (!p || p.user_id !== userId) return null;
  return p;
}

export function registerProjectRoutes(app) {
  app.post("/v1/projects", { preHandler: requireAuth }, async (req, reply) => {
    const { title } = req.body || {};
    if (typeof title !== "string" || !title.trim() || title.length > 120)
      return reply.code(400).send({ error: "title 为空或超长" });
    const { rows } = await pool.query(
      `insert into projects (user_id, title) values ($1, $2)
       returning id, title, cover_asset, status, created_at, updated_at`,
      [req.user.id, title.trim()]
    );
    return reply.code(201).send(rows[0]);
  });

  app.get("/v1/projects", { preHandler: requireAuth }, async (req) => {
    const { rows } = await pool.query(
      `select p.id, p.title, p.cover_asset, p.status, p.created_at, p.updated_at,
              coalesce(j.running, 0)::int as running_jobs,
              coalesce(t.last_seq, 0)::int as last_seq
         from projects p
         left join (
           select (params->>'projectId') as pid, count(*) as running
             from jobs where status in ('queued','running')
              and params ? 'projectId'
            group by params->>'projectId'
         ) j on j.pid = p.id::text
         left join (
           select project_id, max(seq) as last_seq
             from timeline_events group by project_id
         ) t on t.project_id = p.id
        where p.user_id = $1
        order by p.updated_at desc`,
      [req.user.id]
    );
    return { projects: rows };
  });

  app.get("/v1/projects/:id", { preHandler: requireAuth }, async (req, reply) => {
    const p = await ownedProject(req.params.id, req.user.id);
    if (!p) return reply.code(404).send({ error: "项目不存在" });
    return p;
  });

  // 补拉:按 seq 升序拉 after 之后的事件
  app.get("/v1/projects/:id/timeline", { preHandler: requireAuth }, async (req, reply) => {
    const p = await ownedProject(req.params.id, req.user.id);
    if (!p) return reply.code(404).send({ error: "项目不存在" });
    const after = Number(req.query.after) || 0;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const { rows } = await pool.query(
      `select seq, kind, payload, created_at from timeline_events
        where project_id = $1 and seq > $2 order by seq asc limit $3`,
      [p.id, after, limit]
    );
    return { events: rows.map((r) => ({ ...r, seq: Number(r.seq) })) };
  });

  // 写事件:事务内取 max(seq)+1,再广播
  app.post("/v1/projects/:id/events", { preHandler: requireAuth }, async (req, reply) => {
    const p = await ownedProject(req.params.id, req.user.id);
    if (!p) return reply.code(404).send({ error: "项目不存在" });
    const { kind, payload } = req.body || {};
    if (!KINDS.has(kind)) return reply.code(400).send({ error: "非法事件 kind" });
    const ev = await appendEvent(p.id, kind, payload ?? {});
    await pool.query("update projects set updated_at = now() where id = $1", [p.id]);
    return reply.code(201).send({
      seq: Number(ev.seq), kind: ev.kind, payload: ev.payload, created_at: ev.created_at,
    });
  });

  // SSE:先补拉 after 之后的事件逐条发出(id=seq),再订阅 redis 频道继续推
  app.get("/v1/projects/:id/timeline/events", { preHandler: requireAuth }, async (req, reply) => {
    const p = await ownedProject(req.params.id, req.user.id);
    if (!p) return reply.code(404).send({ error: "项目不存在" });

    const lastId = req.headers["last-event-id"];
    let after = Number(lastId ?? req.query.after) || 0;

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    // 先补拉库中 after 之后的事件
    const { rows } = await pool.query(
      `select seq, kind, payload, created_at from timeline_events
        where project_id = $1 and seq > $2 order by seq asc`,
      [p.id, after]
    );
    for (const r of rows) {
      const seq = Number(r.seq);
      after = Math.max(after, seq);
      reply.raw.write(`id: ${seq}\n` +
        `data: ${JSON.stringify({ seq, kind: r.kind, payload: r.payload, created_at: r.created_at })}\n\n`);
    }

    // 再订阅频道继续推(去重:仅推 seq > after 的)
    const sub = redis.duplicate();
    const chan = `tl:${p.id}`;
    await sub.subscribe(chan);
    sub.on("message", (_c, msg) => {
      try {
        const ev = JSON.parse(msg);
        if (ev.seq <= after) return;
        after = ev.seq;
        reply.raw.write(`id: ${ev.seq}\ndata: ${msg}\n\n`);
      } catch {}
    });
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 15_000);
    req.raw.on("close", () => { clearInterval(ping); sub.quit().catch(() => {}); });
  });
}
