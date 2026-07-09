// 排行榜:Redis 有序集合承接高频读写,Postgres 落一份审计记录。
// 榜按 (script_id, board) 维度,只保留每用户最高分。
import { pool, redis } from "./db.mjs";
import { requireAuth } from "./auth.mjs";

const key = (scriptId, board) => `lb:${scriptId}:${board}`;
const BOARD_RE = /^[\w-]{1,32}$/;

export function registerLeaderboardRoutes(app) {
  app.post("/v1/leaderboard/:scriptId/:board", { preHandler: requireAuth }, async (req, reply) => {
    const { scriptId, board } = req.params;
    if (!BOARD_RE.test(board)) return reply.code(400).send({ error: "非法榜单名" });
    const score = Number(req.body?.score);
    if (!Number.isFinite(score) || Math.abs(score) > 1e12)
      return reply.code(400).send({ error: "非法分数" });
    const member = `${req.user.id}:${req.user.username}`;
    // GT:只在新分更高时更新,天然防回退刷低分
    await redis.zadd(key(scriptId, board), "GT", score, member);
    await pool.query(
      `insert into scores (user_id, script_id, board, score) values ($1,$2,$3,$4)`,
      [req.user.id, scriptId, board, score]
    );
    const rank = await redis.zrevrank(key(scriptId, board), member);
    return { rank: rank == null ? null : rank + 1 };
  });

  app.get("/v1/leaderboard/:scriptId/:board", async (req) => {
    const { scriptId, board } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const flat = await redis.zrevrange(key(scriptId, board), 0, limit - 1, "WITHSCORES");
    const entries = [];
    for (let i = 0; i < flat.length; i += 2) {
      const [, ...nameParts] = flat[i].split(":");
      entries.push({
        rank: i / 2 + 1,
        username: nameParts.join(":"),
        score: Number(flat[i + 1]),
      });
    }
    return { entries };
  });
}
