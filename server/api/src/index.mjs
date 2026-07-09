// 尘世浮生 · 生产 API 服务
// nginx 之后的应用层:认证 / 云存档 / 排行榜 / AI 生成任务。
// 无状态,可水平扩容(compose 里 --scale api=N)。
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.mjs";
import { pool, redis, assertReady } from "./db.mjs";
import { registerAuthRoutes } from "./auth.mjs";
import { registerSaveRoutes } from "./saves.mjs";
import { registerLeaderboardRoutes } from "./leaderboard.mjs";
import { registerJobRoutes, genQueue } from "./jobs.mjs";
import { registerProjectRoutes } from "./projects.mjs";
import { registerPublishRoutes } from "./publish.mjs";
import { registerLibraryRoutes } from "./library.mjs";

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
  trustProxy: config.trustProxy,
  bodyLimit: config.bodyLimit,
});

// 空 body 的 JSON POST(如 cancel)按 {} 处理,不报 400
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  if (!body || !body.trim()) return done(null, {});
  try { done(null, JSON.parse(body)); } catch (e) { e.statusCode = 400; done(e); }
});

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  timeWindow: "1 minute",
  redis, // 多实例共享计数
});

app.get("/v1/health", async () => {
  await pool.query("select 1");
  await redis.ping();
  return { ok: true };
});

// Prometheus 风格最小指标
app.get("/v1/metrics", async () => {
  const counts = await genQueue.getJobCounts("waiting", "active", "failed", "completed");
  const { rows } = await pool.query("select count(*)::int as users from users");
  return [
    `chenshi_queue_waiting ${counts.waiting}`,
    `chenshi_queue_active ${counts.active}`,
    `chenshi_queue_failed ${counts.failed}`,
    `chenshi_queue_completed ${counts.completed}`,
    `chenshi_users_total ${rows[0].users}`,
  ].join("\n") + "\n";
});

registerAuthRoutes(app);
registerSaveRoutes(app);
registerLeaderboardRoutes(app);
registerJobRoutes(app);
registerProjectRoutes(app);
registerPublishRoutes(app);
registerLibraryRoutes(app);

app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  const code = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  reply.code(code).send({ error: code === 500 ? "服务器内部错误" : err.message });
});

const shutdown = async (sig) => {
  app.log.info({ sig }, "shutting down");
  await app.close();
  await genQueue.close().catch(() => {});
  await pool.end().catch(() => {});
  redis.disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await assertReady();
await app.listen({ port: config.port, host: "0.0.0.0" });
