import pg from "pg";
import Redis from "ioredis";
import { config } from "./config.mjs";

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: true,
});

// BullMQ 需要独立连接(maxRetriesPerRequest 必须为 null)
export const bullConnection = { url: config.redisUrl };

export async function assertReady() {
  await pool.query("select 1");
  await redis.ping();
}
