// 手动应用迁移：Prisma CLI 的 schema-engine 在本机（Windows + 参数转义）连不上 Neon 时用。
// 用法：node scripts/apply-migration.mjs
// 行为：执行 prisma/migrations/000000_init/migration.sql，并在 _prisma_migrations 里登记，
//       与 `prisma migrate deploy` 的效果对齐（之后 CLI 能用了不会重复应用）。
// 已应用过则直接退出，幂等。
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import "dotenv/config";

const MIGRATION_NAME = "000000_init";
const sql = readFileSync(new URL(`../prisma/migrations/${MIGRATION_NAME}/migration.sql`, import.meta.url), "utf8");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 未配置");
  process.exit(1);
}

const client = new Client({
  connectionString: url,
  ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

// 迁移记录表（Prisma 标准结构，Postgres 方言）
await client.query(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"            VARCHAR(64) NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )
`);

const existing = await client.query(
  `SELECT id FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL`,
  [MIGRATION_NAME],
);
if (existing.rowCount > 0) {
  console.log(`${MIGRATION_NAME} 已应用过，跳过`);
  await client.end();
  process.exit(0);
}

await client.query("BEGIN");
try {
  await client.query(sql);
  await client.query(
    `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
     VALUES ($1, $2, now(), $3, now(), 1)`,
    [randomUUID(), createHash("sha256").update(sql).digest("hex"), MIGRATION_NAME],
  );
  await client.query("COMMIT");
  console.log(`${MIGRATION_NAME} 应用成功并已登记`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("迁移失败，已回滚：", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
