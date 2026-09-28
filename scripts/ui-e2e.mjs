// 浏览器端 UI 验收（真实 Chrome + 本地生产服务器 + 真实 Neon + 真实 DeepSeek）。
// 用法：先 `pnpm exec next start -p 3100`，再
//   DEEPSEEK_API_KEY=sk-... node scripts/ui-e2e.mjs
// 覆盖 scripts/e2e.mjs 到不了的表单路径：注册/登录/退出、计划与任务的 Server Action、
// 打卡、设置页保存+测试连接、连小理聊天 UI、知识库上传与问答 UI、报告生成 UI。
// 截图存 scripts/ui-e2e-shots/（已 gitignore）。跑完级联清理测试用户。
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "dotenv/config";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const SHOTS = fileURLToPath(new URL("./ui-e2e-shots/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("先设置 DEEPSEEK_API_KEY 环境变量再运行");
  process.exit(1);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const email = `ui-e2e-${Date.now()}@test.dev`;
const password = "ui-e2e-pass-123";

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
page.setDefaultTimeout(60000);

try {
  // 1. 注册
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("昵称（可留空）").fill("验收同学");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "注册并开始" }).click();
  await page.waitForURL("**/today", { timeout: 20000 });
  check("注册 → 跳转 /today", true);
  await page.screenshot({ path: `${SHOTS}01-today.png` });

  // 2. 退出 → 再登录
  await page.getByRole("button", { name: "退出" }).click();
  await page.waitForURL("**/login**");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: /登录/ }).click();
  await page.waitForURL("**/today", { timeout: 20000 });
  check("退出 + 重新登录", true);

  // 3. 新建计划 → 加任务 → 勾选完成
  await page.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("计划名，例如「数据结构期末冲刺」").fill("验收计划·数据结构");
  await page.getByRole("button", { name: "新建计划" }).click();
  await page.getByText("验收计划·数据结构").first().waitFor();
  check("新建计划（Server Action）", true);

  await page.getByText("验收计划·数据结构").first().click();
  await page.waitForURL("**/plans/**");
  await page.getByPlaceholder("加一个任务").fill("红黑树插入调整习题 10 道");
  await page.getByRole("button", { name: "添加" }).click();
  await page.getByText("红黑树插入调整习题 10 道").waitFor();
  // 再加一个保持待办的任务，供连小理/报告验证「引用真实待办」
  await page.getByPlaceholder("加一个任务").fill("图的最短路径总结");
  await page.getByRole("button", { name: "添加" }).click();
  await page.getByText("图的最短路径总结").waitFor();
  check("计划详情加任务", true);

  await page.getByRole("button", { name: /标记完成|完成/ }).first().click().catch(async () => {
    // 备选：任务行的第一个提交按钮就是勾选
    await page.locator("li form button[type=submit], div form button[type=submit]").first().click();
  });
  await page.waitForTimeout(1500);

  // 4. 打卡
  await page.goto(`${BASE}/checkin`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "打卡" }).click();
  await page.getByText("今天已打卡").waitFor();
  check("打卡（连续天数出现）", true);
  await page.screenshot({ path: `${SHOTS}02-checkin.png` });

  // 5. 设置页：保存 DeepSeek 配置 + 测试连接
  await page.goto(`${BASE}/settings/model`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("https://api.deepseek.com/v1").fill("https://api.deepseek.com");
  await page.getByPlaceholder("sk-...").fill(process.env.DEEPSEEK_API_KEY);
  await page.getByPlaceholder("deepseek-chat").fill("deepseek-chat");
  await page.getByRole("button", { name: "保存到本机" }).click();
  await page.getByRole("button", { name: "测试连接" }).click();
  await page.getByText(/连接成功|ok|可用/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  const settingsText = await page.locator("body").innerText();
  check("设置页测试连接成功", /连上了|成功|可用/i.test(settingsText), settingsText.match(/连上了|连接成功/)?.[0] ?? "");

  // 6. 连小理聊天 UI
  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("问点什么，回车发送").fill("我待办里有什么？一句话。");
  await page.getByPlaceholder("问点什么，回车发送").press("Enter");
  await page.waitForFunction(
    () => document.body.innerText.includes("最短路径"),
    { timeout: 90000 },
  );
  const chatText = await page.locator("body").innerText();
  check("连小理 UI 回复引用真实待办", chatText.includes("最短路径"), chatText.slice(-120).replace(/\n/g, " "));
  await page.screenshot({ path: `${SHOTS}03-chat.png` });

  // 7. 知识库 UI：上传 + 问答
  await page.goto(`${BASE}/knowledge`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("资料名，例如「数据结构·树」").fill("验收·红黑树笔记");
  await page.getByPlaceholder("把 Markdown 粘贴进来，或点下面的按钮选文件").fill(
    "# 红黑树\n\n插入默认染红。叔叔是红色：父叔变黑祖父变红，问题向上传递。口诀：红叔变色，黑叔旋转。",
  );
  await page.getByRole("button", { name: "加入知识库" }).click();
  await page.getByText(/已入库/).waitFor({ timeout: 30000 });
  check("知识库上传（UI，降级无向量）", true);

  await page.getByPlaceholder("例如：红黑树的插入怎么调整？").fill("叔叔是红色时怎么处理？");
  await page.getByRole("button", { name: "问" }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes("变色") || document.body.innerText.includes("红叔"),
    { timeout: 60000 },
  );
  check("知识库问答命中资料（UI）", true);
  await page.screenshot({ path: `${SHOTS}04-knowledge.png` });

  // 8. 报告 UI：生成总结
  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /生成总结|重新生成/ }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes("SUMMARY") || document.body.innerText.includes("今日报告"),
    { timeout: 90000 },
  );
  await page.waitForTimeout(3000); // 等流结束 + refresh
  await page.screenshot({ path: `${SHOTS}05-reports.png`, fullPage: true });
  check("报告生成（UI 流式）", true);

  // 9. 数据库侧核对
  const { rows: u } = await db.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
  const uid = u[0]?.id;
  const { rows: counts } = await db.query(
    `SELECT
       (SELECT count(*) FROM "Plan" WHERE "userId" = $1) AS plans,
       (SELECT count(*) FROM "Task" WHERE "userId" = $1 AND done) AS done_tasks,
       (SELECT count(*) FROM "CheckIn" WHERE "userId" = $1) AS checkins,
       (SELECT count(*) FROM "Document" WHERE "userId" = $1 AND status = 'ready') AS docs,
       (SELECT count(*) FROM "Report" WHERE "userId" = $1) AS reports`,
    [uid],
  );
  const c = counts[0];
  check(
    "DB 核对：计划1 完成任务≥1 打卡1 资料1 报告1",
    Number(c.plans) >= 1 && Number(c.done_tasks) >= 1 && Number(c.checkins) >= 1 && Number(c.docs) >= 1 && Number(c.reports) >= 1,
    JSON.stringify(c),
  );

} finally {
  try {
    await page.screenshot({ path: `${SHOTS}99-final-state.png`, fullPage: true });
    console.log("最终页面:", page.url());
  } catch { /* 浏览器已关就跳过 */ }
  await browser.close();
  // 清理放在 finally：失败轮也不留孤儿数据
  await db.query(`DELETE FROM "User" WHERE email LIKE 'ui-e2e-%@test.dev'`).catch(() => {});
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
process.exit(failed.length ? 1 : 0);
