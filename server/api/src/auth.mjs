// 账号:注册/登录/JWT 校验。密码 bcrypt(cost 12),用户名唯一。
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.mjs";
import { config } from "./config.mjs";

const USERNAME_RE = /^[\w一-龥-]{2,32}$/;

export function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.username }, config.jwtSecret, {
    expiresIn: config.jwtTtl,
  });
}

// Fastify preHandler:校验 Authorization: Bearer <jwt>
export async function requireAuth(req, reply) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, username: payload.name };
  } catch {
    reply.code(401).send({ error: "未登录或凭证已过期" });
  }
}

export function registerAuthRoutes(app) {
  app.post("/v1/auth/register", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { username, password } = req.body || {};
    if (!USERNAME_RE.test(username || ""))
      return reply.code(400).send({ error: "用户名需 2-32 位字母/数字/中文/-_" });
    if (typeof password !== "string" || password.length < 8 || password.length > 128)
      return reply.code(400).send({ error: "密码需 8-128 位" });
    const hash = await bcrypt.hash(password, 12);
    try {
      const { rows } = await pool.query(
        `insert into users (username, password_hash) values ($1, $2)
         returning id, username`,
        [username, hash]
      );
      return { token: signToken(rows[0]), user: rows[0] };
    } catch (e) {
      if (e.code === "23505") return reply.code(409).send({ error: "用户名已存在" });
      throw e;
    }
  });

  app.post("/v1/auth/login", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { username, password } = req.body || {};
    const { rows } = await pool.query(
      "select id, username, password_hash from users where username = $1",
      [username || ""]
    );
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password || "", user.password_hash));
    if (!ok) return reply.code(401).send({ error: "用户名或密码错误" });
    return { token: signToken(user), user: { id: user.id, username: user.username } };
  });

  app.get("/v1/auth/me", { preHandler: requireAuth }, async (req) => ({
    user: req.user,
  }));
}
