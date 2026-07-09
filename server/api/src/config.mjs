// 统一配置真源:所有环境变量在此收敛并校验,启动即 fail-fast。
const req = (name, fallback) => {
  const v = (process.env[name] ?? fallback ?? "").toString().trim();
  if (!v) throw new Error(`[config] 缺少必填环境变量 ${name}`);
  return v;
};
const opt = (name, fallback = "") =>
  (process.env[name] ?? fallback).toString().trim();

export const config = {
  env: opt("NODE_ENV", "production"),
  port: Number(opt("PORT", "8081")),
  // 安全:JWT 密钥必须显式提供,禁止默认值
  jwtSecret: req("JWT_SECRET"),
  jwtTtl: opt("JWT_TTL", "7d"),
  databaseUrl: req("DATABASE_URL"),
  redisUrl: req("REDIS_URL"),
  // 单用户生成任务并发/日配额
  maxActiveJobsPerUser: Number(opt("MAX_ACTIVE_JOBS_PER_USER", "2")),
  dailyJobQuota: Number(opt("DAILY_JOB_QUOTA", "50")),
  bodyLimit: Number(opt("BODY_LIMIT_BYTES", String(1024 * 1024))),
  saveMaxBytes: Number(opt("SAVE_MAX_BYTES", String(512 * 1024))),
  trustProxy: opt("TRUST_PROXY", "true") === "true",
};
