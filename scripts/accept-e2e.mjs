// 部署验收 E2E（对应 DEPLOY-HANDOFF.md §9 验收清单）。
// 与 scripts/ui-e2e.mjs 的区别：**不需要任何 AI 密钥** —— 平台不预置密钥是设计如此，
// 所以本脚本把「未配置模型时的正确降级行为」也当作断言项（§9 第 8 项）。
//
// 用法：先起生产服务器（端口任意），再
//   E2E_BASE=http://127.0.0.1:3100 node scripts/accept-e2e.mjs
// 截图存 scripts/accept-shots/。跑完级联清理测试用户。
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "dotenv/config";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const SHOTS = fileURLToPath(new URL("./accept-shots/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const email = `accept-${Date.now()}@test.dev`;
const password = "accept-pass-123";

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
page.setDefaultTimeout(60000);

try {
  // 1. 落地页可访问
  const home = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check("落地页可访问", home.status() === 200, `HTTP ${home.status()}`);
  await page.screenshot({ path: `${SHOTS}00-home.png` });

  // 2. /login 可访问
  const login = await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  check("登录页可访问", login.status() === 200, `HTTP ${login.status()}`);

  // 3. 注册 → 跳转 /today
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("昵称（可留空）").fill("验收同学");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "注册并开始" }).click();
  await page.waitForURL("**/today", { timeout: 30000 });
  check("注册 → 跳转 /today", true);
  await page.screenshot({ path: `${SHOTS}01-today.png` });

  // 4. 退出 + 重新登录
  await page.getByRole("button", { name: "退出" }).click();
  await page.waitForURL("**/login**");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL("**/today", { timeout: 30000 });
  check("退出 + 重新登录", true);

  // 5. 新建计划 → 加两个任务 → 勾选完成一个
  await page.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("计划名，例如「数据结构期末冲刺」").fill("验收计划·数据结构");
  await page.getByRole("button", { name: "新建计划" }).click();
  await page.getByText("验收计划·数据结构").first().waitFor();
  check("新建计划落库", true);

  await page.getByText("验收计划·数据结构").first().click();
  await page.waitForURL("**/plans/**");
  await page.getByPlaceholder("加一个任务").fill("红黑树插入调整习题 10 道");
  await page.getByRole("button", { name: "添加" }).click();
  await page.getByText("红黑树插入调整习题 10 道").waitFor();
  await page.getByPlaceholder("加一个任务").fill("图的最短路径总结");
  await page.getByRole("button", { name: "添加" }).click();
  await page.getByText("图的最短路径总结").waitFor();
  check("计划详情加任务", true);

  await page.getByRole("button", { name: "标记为完成" }).first().click();
  await page.getByRole("button", { name: "标记为未完成" }).first().waitFor({ timeout: 20000 });
  check("任务勾选完成（Server Action）", true);
  await page.screenshot({ path: `${SHOTS}02-plan.png` });

  // 6. 打卡 → 连续天数
  await page.goto(`${BASE}/checkin`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "打卡", exact: true }).click();
  await page.getByText("今天已打卡").waitFor({ timeout: 20000 });
  const checkinText = await page.locator("body").innerText();
  // 数字渲染在「当前连续天数」标签的上方，所以从后往前取：
  const streak = checkinText.match(/(\d+)\s*\n\s*当前连续天数/)?.[1] ?? "?";
  check("打卡落库（连续天数 = 1）", streak === "1", `当前连续天数 ${streak}`);
  await page.screenshot({ path: `${SHOTS}03-checkin.png` });

  // 7. 番茄钟页可打开
  await page.goto(`${BASE}/focus`, { waitUntil: "domcontentloaded" });
  check("番茄钟页可打开", (await page.locator("body").innerText()).length > 0);

  // 8. §9 第 8 项：未配置模型时的正确降级（这是预期行为，不是故障）
  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const chatText = await page.locator("body").innerText();
  check(
    "AI 未配置时提示去填模型（预期行为）",
    chatText.includes("连小理还没接上模型") && chatText.includes("去设置模型"),
    chatText.split("\n").find((l) => l.includes("还没接上模型")) ?? "",
  );
  await page.screenshot({ path: `${SHOTS}04-chat-unconfigured.png` });

  // 9. 知识库：粘贴文本 → 入库（无 embedding 走降级：关键词检索）
  await page.goto(`${BASE}/knowledge`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("资料名，例如「数据结构·树」").fill("验收·红黑树笔记");
  await page
    .getByPlaceholder("选一个文件读进来，或直接把内容贴在这里")
    .fill("# 红黑树\n\n插入默认染红。叔叔是红色：父叔变黑祖父变红，问题向上传递。口诀：红叔变色，黑叔旋转。");
  await page.getByRole("button", { name: "加入知识库" }).click();
  await page.getByText(/已入库/).waitFor({ timeout: 30000 });
  const ingText = await page.locator("body").innerText();
  check(
    "知识库入库（无 embedding 走降级路径）",
    /已入库/.test(ingText),
    ingText.split("\n").find((l) => l.includes("已入库")) ?? "",
  );
  await page.screenshot({ path: `${SHOTS}05-knowledge.png` });

  // 10. 知识库问答：无模型时「问」按钮应禁用 + 给出「去设置模型」入口（而不是 500）
  //     注意 canChat 只决定「能不能生成回答」，不影响「能不能传资料」——这是刻意的口径。
  await page.getByPlaceholder("例如：红黑树的插入怎么调整？").fill("叔叔是红色时怎么处理？");
  const askBtn = page.getByRole("button", { name: "问", exact: true });
  const askDisabled = await askBtn.isDisabled();
  const kbText = await page.locator("body").innerText();
  check(
    "知识库问答未配模型时禁用「问」并引导去设置（非 500）",
    askDisabled && kbText.includes("去设置模型"),
    `问按钮 disabled=${askDisabled}，含引导文案=${kbText.includes("去设置模型")}`,
  );
  await page.screenshot({ path: `${SHOTS}06-knowledge-ask-disabled.png` });

  // 11. 数据库侧交叉核对
  const { rows: u } = await db.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
  const uid = u[0]?.id;
  const { rows: counts } = await db.query(
    `SELECT
       (SELECT count(*) FROM "Plan"     WHERE "userId" = $1) AS plans,
       (SELECT count(*) FROM "Task"     WHERE "userId" = $1) AS tasks,
       (SELECT count(*) FROM "Task"     WHERE "userId" = $1 AND done) AS done_tasks,
       (SELECT count(*) FROM "CheckIn"  WHERE "userId" = $1) AS checkins,
       (SELECT count(*) FROM "Document" WHERE "userId" = $1) AS docs,
       (SELECT count(*) FROM "Report"   WHERE "userId" = $1) AS reports`,
    [uid],
  );
  const c = counts[0];
  check(
    "DB 核对：计划1 任务2 完成1 打卡1 资料1",
    Number(c.plans) === 1 &&
      Number(c.tasks) === 2 &&
      Number(c.done_tasks) === 1 &&
      Number(c.checkins) === 1 &&
      Number(c.docs) === 1,
    JSON.stringify(c),
  );
} catch (err) {
  check("脚本执行未抛异常", false, String(err).split("\n")[0]);
} finally {
  try {
    await page.screenshot({ path: `${SHOTS}99-final.png`, fullPage: true });
  } catch {
    /* 浏览器已关就跳过 */
  }
  await browser.close();
  await db.query(`DELETE FROM "User" WHERE email LIKE 'accept-%@test.dev'`).catch(() => {});
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) console.log("未通过：" + failed.map((f) => f.name).join(" | "));
process.exit(failed.length ? 1 : 0);
