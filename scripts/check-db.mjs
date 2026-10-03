// 部署自检：确认能连上数据库、且迁移已应用（表存在）。
//
// 为什么单独做成脚本：直接在 shell 里内联 `node -e` 需要多层引号转义，
// 实际部署时极易因为转义写错而误判成"数据库有问题"。固定成文件更可靠。
//
// 用法（在应用目录下，会读同目录的 .env）：
//   cd /opt/study-for-duters && node scripts/check-db.mjs
// 退出码：0 = 正常（表已建好）；1 = 连不上或缺表。
import "dotenv/config";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL 未配置（检查应用目录下的 .env）");
  process.exit(1);
}

// 常见配置错误先给出可操作的提示，而不是只抛原始报错
if (!/sslmode=/.test(url)) {
  console.warn("⚠ DATABASE_URL 里没有 sslmode=require —— Neon 需要 TLS，很可能连不上");
}
if (/channel_binding=require/.test(url)) {
  console.warn("⚠ DATABASE_URL 带了 channel_binding=require —— 部分 Node 环境下会握手失败，建议去掉");
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`,
  );
  const names = tables.map((t) => t.table_name);

  if (names.length === 0) {
    console.error("✗ 能连上数据库，但 public schema 里没有任何表 —— 迁移还没跑");
    console.error("  处理：pnpm exec prisma migrate deploy   （失败则 node scripts/apply-migration.mjs）");
    process.exit(1);
  }

  const { rows: users } = await client.query(`select count(*)::int as n from "User"`);
  const { rows: ver } = await client.query(`select extversion from pg_extension where extname = 'vector'`);

  console.log("✓ 数据库连通，迁移已应用");
  console.log(`  public schema 表数：${names.length}`);
  console.log(`  User 行数：${users[0].n}`);
  console.log(
    ver.length
      ? `  pgvector：已启用（${ver[0].extversion}）`
      : "  pgvector：⚠ 未启用 —— 资料库的向量检索会降级为关键词匹配（功能仍可用）",
  );
} catch (err) {
  console.error("✗ 数据库连接失败：", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
