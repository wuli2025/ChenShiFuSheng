// 幂等迁移器:按序执行 server/migrations/*.sql,记录到 schema_migrations。
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = process.env.MIGRATIONS_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
  `create table if not exists schema_migrations (
     name text primary key, applied_at timestamptz not null default now())`
);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const { rows } = await client.query("select 1 from schema_migrations where name = $1", [f]);
  if (rows[0]) continue;
  const sql = await readFile(path.join(dir, f), "utf8");
  console.log(`applying ${f} ...`);
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [f]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}
console.log("migrations up to date");
await client.end();
