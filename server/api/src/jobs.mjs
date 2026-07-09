// AI 生成任务:剧本(script)/图片(image)。提交入 BullMQ 队列,worker 在沙箱内
// 用 claude / codex CLI 生产,进度与产物回写 Postgres,前端轮询或 SSE 拉进度。
// 配额:每用户同时最多 N 个活跃任务 + 每日总量配额,防刷防打爆生成集群。
import { Queue } from "bullmq";
import { pool, redis, bullConnection } from "./db.mjs";
import { config } from "./config.mjs";
import { requireAuth } from "./auth.mjs";

export const genQueue = new Queue("generate", {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

const KINDS = new Set(["script", "image", "sprite", "cover", "voice", "assemble", "revise"]);
const ID_RE = /^\d{1,18}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badId = (req, reply) => {
  if (!ID_RE.test(req.params.id)) { reply.code(400).send({ error: "非法任务 id" }); return true; }
  return false;
};

export function registerJobRoutes(app) {
  app.post("/v1/jobs", { preHandler: requireAuth }, async (req, reply) => {
    const { kind, prompt, params, projectId } = req.body || {};
    if (!KINDS.has(kind)) return reply.code(400).send({ error: "kind 非法" });
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20_000)
      return reply.code(400).send({ error: "prompt 为空或超长" });

    // 可选 projectId:校验属主,透传到 job.data 与 jobs.params(供时间线归属与运行数统计)
    if (projectId != null) {
      if (!UUID_RE.test(String(projectId)))
        return reply.code(400).send({ error: "非法 projectId" });
      const { rows: pr } = await pool.query(
        "select 1 from projects where id = $1 and user_id = $2", [projectId, req.user.id]);
      if (!pr[0]) return reply.code(404).send({ error: "项目不存在" });
    }

    // 配额检查
    const { rows: activeRows } = await pool.query(
      `select count(*)::int as n from jobs
        where user_id = $1 and status in ('queued','running')`,
      [req.user.id]
    );
    if (activeRows[0].n >= config.maxActiveJobsPerUser)
      return reply.code(429).send({ error: "已有任务在生成中,请等待完成" });
    const quotaKey = `quota:${req.user.id}:${new Date().toISOString().slice(0, 10)}`;
    const used = await redis.incr(quotaKey);
    if (used === 1) await redis.expire(quotaKey, 86_400 * 2);
    if (used > config.dailyJobQuota) {
      return reply.code(429).send({ error: "今日生成配额已用完" });
    }

    // projectId 并入 params 落库,供项目运行数统计与时间线归属
    const storedParams = { ...(params ?? {}) };
    if (projectId != null) storedParams.projectId = String(projectId);
    const { rows } = await pool.query(
      `insert into jobs (user_id, kind, prompt, params, status)
       values ($1, $2, $3, $4::jsonb, 'queued') returning id`,
      [req.user.id, kind, prompt, JSON.stringify(storedParams)]
    );
    const jobId = rows[0].id;
    // BullMQ 不允许纯数字自定义 id,统一加前缀
    await genQueue.add(kind, {
      jobId, userId: req.user.id, kind, prompt,
      params: params ?? {}, projectId: projectId != null ? String(projectId) : null,
    }, {
      jobId: `job-${jobId}`,
      priority: kind === "image" ? 2 : 1,
    });
    return reply.code(202).send({ jobId });
  });

  app.get("/v1/jobs/:id", { preHandler: requireAuth }, async (req, reply) => {
    if (badId(req, reply)) return;
    const { rows } = await pool.query(
      `select id, kind, status, progress, error, result, created_at, updated_at
         from jobs where id = $1 and user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: "任务不存在" });
    return rows[0];
  });

  app.get("/v1/jobs", { preHandler: requireAuth }, async (req) => {
    const { rows } = await pool.query(
      `select id, kind, status, progress, error, created_at, updated_at
         from jobs where user_id = $1 order by id desc limit 50`,
      [req.user.id]
    );
    return { jobs: rows };
  });

  // SSE 进度流:订阅 worker 发布的 job:<id> 频道,断线由前端重连
  app.get("/v1/jobs/:id/events", { preHandler: requireAuth }, async (req, reply) => {
    if (badId(req, reply)) return;
    const { rows } = await pool.query(
      "select user_id, status from jobs where id = $1", [req.params.id]);
    if (!rows[0] || rows[0].user_id !== req.user.id)
      return reply.code(404).send({ error: "任务不存在" });

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const sub = redis.duplicate();
    const chan = `job:${req.params.id}`;
    await sub.subscribe(chan);
    sub.on("message", (_c, msg) => reply.raw.write(`data: ${msg}\n\n`));
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 15_000);
    req.raw.on("close", () => { clearInterval(ping); sub.quit().catch(() => {}); });
  });

  app.post("/v1/jobs/:id/cancel", { preHandler: requireAuth }, async (req, reply) => {
    if (badId(req, reply)) return;
    const { rows } = await pool.query(
      `update jobs set status = 'cancelled', updated_at = now()
        where id = $1 and user_id = $2 and status in ('queued','running')
        returning id`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return reply.code(409).send({ error: "任务不可取消" });
    await redis.publish(`job:${req.params.id}:ctl`, "cancel");
    const job = await genQueue.getJob(`job-${req.params.id}`);
    if (job && (await job.isWaiting())) await job.remove().catch(() => {});
    return { ok: true };
  });
}
