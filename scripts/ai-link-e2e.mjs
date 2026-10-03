// AI 链路验收：连小理对话 / 知识库问答 / 报告生成。
//
// 为什么单独一个脚本：平台的约定是「不预置任何密钥」，所以主验收脚本 accept-e2e.mjs
// 只验证「未配模型时的降级行为」。这里换个思路——把 Base URL 指向本地假服务
// （scripts/mock-llm.mjs），就能在**没有任何真实 API Key** 的前提下把 AI 链路真正跑通。
//
// 它验证的是**接线**而不是模型质量：假服务会把收到的 system 上下文原样回显，
// 因此可以精确断言「待办标题」「资料原文」是否真的走到了模型面前。
//
// 用法（两个前置服务都要在跑）：
//   node scripts/mock-llm.mjs                                   # 假 LLM
//   npm run start:cloud                                        # 应用本体
//   E2E_BASE=http://127.0.0.1:3000 node scripts/ai-link-e2e.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "dotenv/config";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3000";
const MOCK = process.env.MOCK_BASE ?? "http://127.0.0.1:8787/v1";
const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const SHOTS = fileURLToPath(new URL("./accept-shots/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const email = `ailink-${Date.now()}@test.dev`;
const password = "ailink-pass-123";
const TODO_TITLE = "图的最短路径总结";
const DOC_MARKER = "红叔变色";

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
page.setDefaultTimeout(60000);

try {
  // 0. 假服务可达性（先自证前提成立，否则后面的失败会指向错误的方向）
  const ping = await fetch(`${MOCK}/models`).then((r) => r.ok).catch(() => false);
  check("假 LLM 服务可达", ping, MOCK);

  // 1. 注册
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("昵称（可留空）").fill("AI 验收");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "注册并开始" }).click();
  await page.waitForURL("**/today", { timeout: 30000 });
  check("注册 → /today", true);

  // 2. 造一个**未完成**的待办，供断言「学习数据进了模型上下文」
  await page.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("计划名，例如「数据结构期末冲刺」").fill("AI 链路验收计划");
  await page.getByRole("button", { name: "新建计划" }).click();
  await page.getByText("AI 链路验收计划").first().waitFor();
  await page.getByText("AI 链路验收计划").first().click();
  await page.waitForURL("**/plans/**");
  await page.getByPlaceholder("加一个任务").fill(TODO_TITLE);
  await page.getByRole("button", { name: "添加" }).click();
  await page.getByText(TODO_TITLE).waitFor();
  check("造出未完成待办（供 AI 引用）", true);

  // 3. 设置页：填假模型配置并测试连接
  await page.goto(`${BASE}/settings/model`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("https://api.deepseek.com/v1").fill(MOCK);
  await page.getByPlaceholder("sk-...").fill("mock-key-not-real");
  await page.getByPlaceholder("deepseek-chat").fill("mock-chat");
  await page.getByPlaceholder("text-embedding-3-small").fill("mock-embed");
  await page.getByRole("button", { name: "保存到本机" }).click();
  await page.getByText(/已保存到本机浏览器/).waitFor({ timeout: 20000 });
  check("模型配置保存到本机", true);

  await page.getByRole("button", { name: "测试连接" }).click();
  await page.getByText(/连上了/).waitFor({ timeout: 30000 });
  check("测试连接成功（服务端实测调通假模型）", true);
  await page.screenshot({ path: `${SHOTS}10-settings-connected.png` });

  // 4. 连小理对话：回复里必须出现那条待办 → 证明 SQL 算出的学习数据真的进了 prompt
  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("问点什么，回车发送").fill("我待办里有什么？一句话。");
  await page.getByPlaceholder("问点什么，回车发送").press("Enter");
  await page.waitForFunction(
    (m) => document.body.innerText.includes(m),
    "【MOCK】",
    { timeout: 90000 },
  );
  const chatText = await page.locator("body").innerText();
  check(
    "连小理对话打通，且回复引用了真实待办",
    chatText.includes("【MOCK】") && chatText.includes(TODO_TITLE),
    chatText.includes(TODO_TITLE) ? "回复含待办标题" : "回复未含待办标题",
  );
  await page.screenshot({ path: `${SHOTS}11-chat-mock.png` });

  // 5. 知识库入库：配了 embedding 模型后，不应再走「无向量」降级路径
  await page.goto(`${BASE}/knowledge`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("资料名，例如「数据结构·树」").fill("AI 链路·红黑树笔记");
  await page
    .getByPlaceholder("选一个文件读进来，或直接把内容贴在这里")
    .fill(
      `# 红黑树\n\n插入默认染红。叔叔是红色：父叔变黑祖父变红，问题向上传递。口诀：${DOC_MARKER}，黑叔旋转。`,
    );
  await page.getByRole("button", { name: "加入知识库" }).click();
  await page.getByText(/已入库/).waitFor({ timeout: 60000 });
  const ingText = await page.locator("body").innerText();
  const ingLine = ingText.split("\n").find((l) => l.includes("已入库")) ?? "";
  check(
    "知识库入库走真实向量（未降级）",
    /已入库/.test(ingText) && !ingLine.includes("未配置 Embedding 模型"),
    ingLine,
  );

  // 6. 知识库问答：回复里必须出现资料原文 → 证明检索结果真的进了 prompt
  await page.getByPlaceholder("例如：红黑树的插入怎么调整？").fill("叔叔是红色时怎么处理？");
  await page.getByRole("button", { name: "问", exact: true }).click();
  await page.waitForFunction(
    (m) => document.body.innerText.includes(m),
    "【MOCK】",
    { timeout: 90000 },
  );
  const askText = await page.locator("body").innerText();
  check(
    "知识库问答打通，且回复引用了资料原文",
    askText.includes("【MOCK】") && askText.includes(DOC_MARKER),
    askText.includes(DOC_MARKER) ? `回复含「${DOC_MARKER}」` : `回复未含「${DOC_MARKER}」`,
  );
  await page.screenshot({ path: `${SHOTS}12-knowledge-ask-mock.png` });

  // 7. 报告生成
  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /生成总结|重新生成/ }).click();
  await page.waitForFunction(
    (m) => document.body.innerText.includes(m),
    "【MOCK】",
    { timeout: 90000 },
  );
  check("报告生成打通（流式）", true);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}13-report-mock.png`, fullPage: true });

  // 8. 数据库侧核对：报告落库 + 向量真的写进了 Chunk.embedding
  const { rows: u } = await db.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
  const uid = u[0]?.id;
  const { rows: agg } = await db.query(
    `SELECT
       (SELECT count(*) FROM "Report" WHERE "userId" = $1) AS reports,
       (SELECT count(*) FROM "Chunk" c JOIN "Document" d ON c."documentId" = d."id"
          WHERE d."userId" = $1 AND c."embedding" IS NOT NULL) AS embedded_chunks`,
    [uid],
  );
  const a = agg[0];
  check(
    "DB 核对：报告已落库 + 资料块含真实向量",
    Number(a.reports) >= 1 && Number(a.embedded_chunks) >= 1,
    JSON.stringify(a),
  );
} catch (err) {
  check("脚本执行未抛异常", false, String(err).split("\n")[0]);
} finally {
  try {
    await page.screenshot({ path: `${SHOTS}98-ai-final.png`, fullPage: true });
  } catch {
    /* 浏览器已关就跳过 */
  }
  await browser.close();
  await db.query(`DELETE FROM "User" WHERE email LIKE 'ailink-%@test.dev'`).catch(() => {});
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) console.log("未通过：" + failed.map((f) => f.name).join(" | "));
process.exit(failed.length ? 1 : 0);
