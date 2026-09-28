// 端到端验收脚本（本地生产服务器 + 真实 Neon + 真实 DeepSeek）。
// 用法：先 `pnpm exec next start -p 3100`，再 `node scripts/e2e.mjs`
// 覆盖：页面渲染（带数据）、设置测试、连小理对话、知识库降级 ingest + ILIKE 问答、报告生成落库。
// 不覆盖（走 DEPLOY.md 手动清单）：注册/登录表单、Server Action 的任务/番茄钟/打卡操作。
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT } from "jose";
import pg from "pg";
import "dotenv/config";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
if (!process.env.DEEPSEEK_API_KEY) {
  console.error("先设置 DEEPSEEK_API_KEY 环境变量再运行（不要把 key 写进脚本）");
  process.exit(1);
}
const LLM = {
  baseUrl: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
  chatModel: "deepseek-chat",
  // DeepSeek 没有 embedding 模型 → 正好走「无向量降级 + ILIKE」路径
};

const scryptAsync = promisify(scrypt);
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

// ---- 准备测试用户与数据 ----
const email = `e2e-${Date.now()}@test.dev`;
const salt = randomBytes(16).toString("hex");
const key = await scryptAsync("e2e-password-123".normalize("NFKC"), salt, 64);
const passwordHash = `scrypt$${salt}$${key.toString("hex")}`;

const { rows: [user] } = await db.query(
  `INSERT INTO "User" ("id", "email", "passwordHash", "name") VALUES (gen_random_uuid()::text, $1, $2, '验收同学') RETURNING id`,
  [email, passwordHash],
);
// cuid 兼容性：上面用了 uuid，schema 默认 cuid 但列类型是 text，uuid 也能存

const today = new Date();
const utcDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dayMs = 86400000;
const t0 = utcDay(today);

const { rows: [plan] } = await db.query(
  `INSERT INTO "Plan" ("id", "userId", "title", "startDate", "endDate") VALUES (gen_random_uuid()::text, $1, '数据结构期末冲刺', $2, $3) RETURNING id`,
  [user.id, t0, new Date(t0.getTime() + 30 * dayMs)],
);
// 任务：1 个已完成（本周到期）、1 个停滞（4 天前创建）、1 个新待办
await db.query(
  `INSERT INTO "Task" ("id", "planId", "userId", "title", "done", "dueDate", "createdAt", "sortOrder") VALUES
   (gen_random_uuid()::text, $1, $2, '树与二叉树习题', true, $3, $4, 0),
   (gen_random_uuid()::text, $1, $2, '复习红黑树插入调整', false, NULL, $5, 1),
   (gen_random_uuid()::text, $1, $2, '图的最短路径总结', false, $6, $3, 2)`,
  [plan.id, user.id, t0, new Date(t0.getTime() - 3 * dayMs), new Date(t0.getTime() - 4 * dayMs), new Date(t0.getTime() + 2 * dayMs)],
);
// 番茄钟：今天 2 个完成（25+45）、1 个中断不算、6 天前 1 个、8 天前 1 个（不应进 7d）
await db.query(
  `INSERT INTO "PomodoroSession" ("id", "userId", "startedAt", "endedAt", "duration", "completed") VALUES
   (gen_random_uuid()::text, $1, $2, $2, 25, true),
   (gen_random_uuid()::text, $1, $2, $2, 45, true),
   (gen_random_uuid()::text, $1, $2, $2, 25, false),
   (gen_random_uuid()::text, $1, $3, $3, 25, true),
   (gen_random_uuid()::text, $1, $4, $4, 25, true)`,
  [user.id, t0, new Date(t0.getTime() - 6 * dayMs), new Date(t0.getTime() - 8 * dayMs)],
);
// 打卡：今天、昨天、前天（连续 3 天）
for (let i = 0; i < 3; i++) {
  const d = new Date(t0.getTime() - i * dayMs);
  await db.query(
    `INSERT INTO "CheckIn" ("id", "userId", "date", "streak") VALUES (gen_random_uuid()::text, $1, $2, $3)`,
    [user.id, d, 3 - i],
  );
}

// 会话 Cookie（与应用相同的 HS256 JWT）
const token = await new SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(user.id)
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const cookie = `duters_session=${token}`;

// ---- HTTP 辅助 ----
async function getPage(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  return { status: res.status, html: await res.text() };
}
async function postJson(path, body) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}
async function readStream(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
  }
  return acc;
}

// ---- 1. 页面渲染 ----
for (const p of ["/today", "/plans", "/focus", "/checkin", "/chat", "/knowledge", "/reports", "/settings/model"]) {
  const { status } = await getPage(p);
  check(`页面 ${p} 200`, status === 200, `status=${status}`);
}

const todayPage = await getPage("/today");
check("今日视图含真实任务数据", todayPage.html.includes("红黑树") || todayPage.html.includes("最短路径"));

const reportsPage = await getPage("/reports");
check("报告页指标卡片正确（今日 70 分钟）", reportsPage.html.includes("70"), reportsPage.html.match(/今日专注（分钟 · (\d+) 个番茄）/)?.[0] ?? "");

// ---- 2. 设置：测试连接（真实 DeepSeek）----
const testRes = await postJson("/api/settings/test", { config: LLM });
const testData = await testRes.json();
check("DeepSeek 测试连接 ok", testData.ok === true, JSON.stringify(testData));

// ---- 3. 连小理对话（真实流式 + 数据注入）----
const chatRes = await postJson("/api/chat", {
  config: LLM,
  messages: [{ role: "user", content: "我今天学得怎么样？一句话告诉我。" }],
});
const chatText = chatRes.ok ? await readStream(chatRes) : `HTTP ${chatRes.status}`;
check("连小理流式对话有输出", chatRes.ok && chatText.length > 10, chatText.slice(0, 90).replace(/\n/g, " "));

// ---- 4. 知识库：无向量降级 ingest + ILIKE 问答 ----
const md = `# 红黑树插入调整\n\n插入节点默认染红。若父节点为红色，分三种情况：\n1. 叔叔是红色：父叔变黑，祖父变红，问题向上传递。\n2. 叔叔是黑色且为内侧（LR/RL）：先旋转父节点转成外侧情况。\n3. 叔叔是黑色且为外侧（LL/RR）：祖父旋转，父变黑祖父变红。\n\n口诀：红叔变色，黑叔旋转。`;
const ingestRes = await postJson("/api/knowledge/ingest", { config: LLM, title: "数据结构·红黑树", content: md });
const ingestData = await ingestRes.json();
check("ingest 降级入库（degraded=true）", ingestData.ok === true && ingestData.degraded === true, JSON.stringify(ingestData));

const askRes = await postJson("/api/knowledge/ask", { config: LLM, question: "红黑树插入时叔叔是红色怎么办？" });
const askText = askRes.ok ? await readStream(askRes) : `HTTP ${askRes.status}`;
check("知识库问答带来源标记", askText.startsWith("__SOURCES__"), askText.split("\n")[0]);
check("知识库问答内容命中资料", askText.includes("变色") || askText.includes("红叔"), askText.split("\n").slice(1, 3).join(" ").slice(0, 90));

// ---- 5. 每日报告（真实生成 + 落库）----
const reportRes = await postJson("/api/reports", { config: LLM });
const reportText = reportRes.ok ? await readStream(reportRes) : `HTTP ${reportRes.status}`;
check("报告流式输出含 SUMMARY", reportText.includes("SUMMARY"), reportText.slice(0, 90).replace(/\n/g, " "));

await new Promise((r) => setTimeout(r, 1500)); // 落库在流结束后，给它一点时间
const { rows: reports } = await db.query(`SELECT content, summary, stats FROM "Report" WHERE "userId" = $1`, [user.id]);
check("Report 已落库且含指标快照", reports.length === 1 && reports[0].stats?.metrics?.focusMinutesToday === 70,
  reports.length ? `focusToday=${reports[0].stats?.metrics?.focusMinutesToday}, stale=${reports[0].stats?.metrics?.staleTasks?.length}` : "无记录");

// ---- 汇总 + 清理 ----
const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);

await db.query(`DELETE FROM "User" WHERE "id" = $1`, [user.id]); // 级联清掉所有测试数据
await db.end();
console.log("测试数据已清理");
process.exit(failed.length ? 1 : 0);
