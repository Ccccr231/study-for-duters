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

  // 7. 专注（番茄钟）：完整走一遍「开始 → 暂停 → 结束并记录」与「放弃」两条路径。
  //    重点验服务端对 duration 的钳制：前端根本不传 duration，服务端按 startedAt 自己算，
  //    所以刚开就结束必须落到下限 MIN_SESSION_MINUTES(1)，而不是 0。
  //    注意一个产品语义（代码现状，不是本脚本的判定）：手动「结束并记录」写入的是
  //    completed=false，而 /focus 的「今日累计」与连小理 prompt 的 focusMinutesToday
  //    都只统计 completed=true（见 app/(app)/focus/page.tsx 与 app/api/chat/route.ts）。
  //    也就是说：点了「结束并记录」会留下一条记录，但**不会**计入今日累计。
  //    只有真正走完 25/45 分钟（计时归零 → finish(true)）才算数。
  //    这是刻意设计还是口径不一致，由所有者确认；本脚本按现状断言，不改语义。
  await page.goto(`${BASE}/focus`, { waitUntil: "domcontentloaded" });
  check("番茄钟页可打开", (await page.locator("body").innerText()).length > 0);

  const { rows: uidRows } = await db.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
  const uid = uidRows[0]?.id;
  const sessionCount = async () =>
    (await db.query(`SELECT count(*)::int AS n FROM "PomodoroSession" WHERE "userId" = $1`, [uid]))
      .rows[0].n;

  // 7a. 开始 → 暂停 → 结束并记录
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("button", { name: "暂停", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "结束并记录" }).click();
  await page.getByRole("button", { name: "开始", exact: true }).waitFor({ timeout: 25000 });
  const afterEnd = await sessionCount();
  const { rows: sess } = await db.query(
    `SELECT duration, completed FROM "PomodoroSession"
      WHERE "userId" = $1 ORDER BY "startedAt" DESC LIMIT 1`,
    [uid],
  );
  check(
    "专注：结束并记录落库，时长被服务端钳制到下限 1 分钟",
    afterEnd === 1 && sess[0]?.duration === 1 && sess[0]?.completed === false,
    `行数=${afterEnd} duration=${sess[0]?.duration} completed=${sess[0]?.completed}`,
  );

  // 7b. 放弃 → 不留脏数据（reset 只清前端引用，不应写库）
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("button", { name: "放弃", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "放弃", exact: true }).click();
  await page.getByRole("button", { name: "开始", exact: true }).waitFor({ timeout: 20000 });
  const afterAbandon = await sessionCount();
  check("专注：放弃不落库（无脏数据）", afterAbandon === 1, `行数=${afterAbandon}`);
  await page.screenshot({ path: `${SHOTS}07-focus.png` });

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

  // 11. 数据库侧交叉核对（uid 已在第 7 步取过，直接复用）
  const { rows: counts } = await db.query(
    `SELECT
       (SELECT count(*) FROM "Plan"     WHERE "userId" = $1) AS plans,
       (SELECT count(*) FROM "Task"     WHERE "userId" = $1) AS tasks,
       (SELECT count(*) FROM "Task"     WHERE "userId" = $1 AND done) AS done_tasks,
       (SELECT count(*) FROM "CheckIn"  WHERE "userId" = $1) AS checkins,
       (SELECT count(*) FROM "Document" WHERE "userId" = $1) AS docs,
       (SELECT count(*) FROM "PomodoroSession" WHERE "userId" = $1) AS sessions,
       (SELECT count(*) FROM "Report"   WHERE "userId" = $1) AS reports`,
    [uid],
  );
  const c = counts[0];
  check(
    "DB 核对：计划1 任务2 完成1 打卡1 资料1 专注1",
    Number(c.plans) === 1 &&
      Number(c.tasks) === 2 &&
      Number(c.done_tasks) === 1 &&
      Number(c.checkins) === 1 &&
      Number(c.docs) === 1 &&
      Number(c.sessions) === 1,
    JSON.stringify(c),
  );

  // 12. 剩余 CRUD：删除任务 / 归档计划
  const { rows: planRows } = await db.query(
    `SELECT id FROM "Plan" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [uid],
  );
  const planId = planRows[0]?.id;
  const taskCount = async () =>
    (await db.query(`SELECT count(*)::int AS n FROM "Task" WHERE "userId" = $1`, [uid])).rows[0].n;

  await page.goto(`${BASE}/plans/${planId}`, { waitUntil: "domcontentloaded" });
  const beforeDel = await taskCount();
  await page.getByRole("button", { name: "删除任务" }).first().click();
  let afterDel = beforeDel;
  for (let i = 0; i < 24 && afterDel === beforeDel; i++) {
    await page.waitForTimeout(500);
    afterDel = await taskCount();
  }
  check("删除任务落库（2 → 1）", beforeDel === 2 && afterDel === 1, `${beforeDel} → ${afterDel}`);

  // 归档：archivePlanAction 用 updateMany({ id, userId })，状态转 archived
  await page.getByRole("button", { name: "归档这个计划" }).click();
  let planStatus = null;
  for (let i = 0; i < 24; i++) {
    const { rows } = await db.query(`SELECT status FROM "Plan" WHERE id = $1`, [planId]);
    planStatus = rows[0]?.status;
    if (planStatus === "archived") break;
    await page.waitForTimeout(500);
  }
  await page.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  const listText = await page.locator("body").innerText();
  check(
    "归档计划：状态转 archived 且从列表消失",
    planStatus === "archived" && !listText.includes("验收计划·数据结构"),
    `status=${planStatus}，列表仍含标题=${listText.includes("验收计划·数据结构")}`,
  );

  // 13. 越权（IDOR）：B 账号访问 A 的计划详情 → 必须 404，且不能泄漏标题。
  //     app/(app)/plans/[id]/page.tsx 用的是 findFirst({ id, userId }) + notFound()，
  //     这里实测把它锁住——归属校验写对了但哪天被改掉，这条会立刻红。
  const otherCtx = await browser.newContext();
  const otherPage = await otherCtx.newPage();
  otherPage.setDefaultTimeout(60000);
  await otherPage.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await otherPage.getByLabel("邮箱").fill(`accept-b-${Date.now()}@test.dev`);
  await otherPage.getByLabel("密码").fill(password);
  await otherPage.getByRole("button", { name: "注册并开始" }).click();
  await otherPage.waitForURL("**/today", { timeout: 30000 });
  const idorResp = await otherPage.goto(`${BASE}/plans/${planId}`, { waitUntil: "domcontentloaded" });
  await otherPage.waitForTimeout(1500);
  const idorText = await otherPage.locator("body").innerText();
  const idorLeaked = idorText.includes("验收计划·数据结构");
  // 安全属性是「不泄漏内容」；状态码或 404 文案任一成立即可（避免对 Next 的
  // notFound() 究竟返回 404 还是 200 过度约束）。
  const blocked =
    !idorLeaked && ((idorResp?.status() ?? 0) >= 400 || idorText.includes("这一页不存在"));
  check(
    "越权访问他人计划被拦（不泄漏内容）",
    blocked,
    `HTTP ${idorResp?.status()}，泄漏标题=${idorLeaked}，显示 404 文案=${idorText.includes("这一页不存在")}`,
  );
  await otherPage.screenshot({ path: `${SHOTS}08-idor-blocked.png` });
  await otherCtx.close();

  // ── 以下是错误路径与安全边界：部署后最容易暴露 500 的地方，
  //    单独开 context（空 cookie），不污染主会话。
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  anonPage.setDefaultTimeout(60000);

  // 12. 未登录直闯受保护页 → 必须被拦回登录页（而不是渲染出内容或 500）
  await anonPage.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
  await anonPage.waitForURL("**/login**", { timeout: 25000 });
  check("未登录访问 /today 被拦回登录页", anonPage.url().includes("/login"), anonPage.url());

  await anonPage.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await anonPage.waitForURL("**/login**", { timeout: 25000 });
  check("未登录访问 /plans 被拦回登录页", anonPage.url().includes("/login"), anonPage.url());

  // 13. 重复邮箱注册 → 应给出业务提示，而不是 500 / 唯一约束报错
  await anonPage.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await anonPage.getByLabel("邮箱").fill(email);
  await anonPage.getByLabel("密码").fill(password);
  await anonPage.getByRole("button", { name: "注册并开始" }).click();
  await anonPage.getByText(/已经注册过/).waitFor({ timeout: 25000 });
  check("重复邮箱注册被拒绝并给出提示（非 500）", true);

  // 14. 错误密码 → 提示必须与「邮箱不存在」一致，避免账号枚举
  await anonPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await anonPage.getByLabel("邮箱").fill(email);
  await anonPage.getByLabel("密码").fill("wrong-pass-999");
  await anonPage.getByRole("button", { name: "登录", exact: true }).click();
  await anonPage.getByText(/邮箱或密码不对/).waitFor({ timeout: 25000 });
  check("错误密码被拒绝且提示不区分账号是否存在", true);

  // 15. 邮箱不存在的登录 → 与上一条提示完全相同
  await anonPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await anonPage.getByLabel("邮箱").fill(`nobody-${Date.now()}@test.dev`);
  await anonPage.getByLabel("密码").fill(password);
  await anonPage.getByRole("button", { name: "登录", exact: true }).click();
  await anonPage.getByText(/邮箱或密码不对/).waitFor({ timeout: 25000 });
  check("不存在的邮箱提示与错误密码一致（防账号枚举）", true);

  // 16. 密码过短 → 注册时密码框带 minLength={8}，由 HTML5 原生校验在**提交前**拦住，
  //     所以不会出现服务端提示文案（服务端另有一道，见 lib/actions/auth.ts）。
  //     断言「确实被拦 + 没有建出账号」，而不是去找一句不存在的提示。
  const shortEmail = `short-${Date.now()}@test.dev`;
  await anonPage.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await anonPage.getByLabel("邮箱").fill(shortEmail);
  await anonPage.getByLabel("密码").fill("123");
  await anonPage.getByRole("button", { name: "注册并开始" }).click();
  await anonPage.waitForTimeout(1500);
  const tooShort = await anonPage
    .locator('input[type="password"]')
    .evaluate((el) => el.validity.tooShort === true);
  const stillOnRegister = anonPage.url().includes("/register");
  const { rows: leaked } = await db.query(`SELECT count(*)::int AS n FROM "User" WHERE email = $1`, [
    shortEmail,
  ]);
  check(
    "过短密码在提交前被拦且未建号",
    tooShort && stillOnRegister && leaked[0].n === 0,
    `validity.tooShort=${tooShort}，仍在 /register=${stillOnRegister}，建号数=${leaked[0].n}`,
  );

  // 17. 已登录遍历全部页面：既不能 500，也不能悄悄落到错误边界
  //     （上一轮就吃过亏：错误边界页 HTTP 仍是 200，只看状态码会漏判）
  const ROUTES = [
    "/today",
    "/plans",
    "/focus",
    "/checkin",
    "/chat",
    "/knowledge",
    "/reports",
    "/settings/model",
  ];
  const broken = [];
  for (const r of ROUTES) {
    const resp = await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" });
    const status = resp?.status() ?? 0;
    const text = await page.locator("body").innerText();
    if (status >= 500 || text.includes("页面渲染失败了")) broken.push(`${r}(HTTP ${status})`);
    await page.waitForTimeout(300);
  }
  check(
    `全部 ${ROUTES.length} 个页面无 500、无错误边界`,
    broken.length === 0,
    broken.length ? broken.join(", ") : "均正常",
  );

  // 18. 不存在的路由 → 应落到 404 页，而不是崩溃或 500
  const nf = await page.goto(`${BASE}/no-such-page-xyz`, { waitUntil: "domcontentloaded" });
  const nfText = await page.locator("body").innerText();
  check(
    "不存在的路由显示 404 页而非崩溃",
    nfText.includes("这一页不存在") && (nf?.status() ?? 0) < 500,
    `HTTP ${nf?.status()}`,
  );

  await anon.close();
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
