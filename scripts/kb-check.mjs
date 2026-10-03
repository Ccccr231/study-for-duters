// 验证：没配模型时知识库仍可进入、可上传（这是设计里就有的降级路径），
// 只有"生成回答"需要模型。
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/kb/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `kb-${Date.now()}@test.dev`;
const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
// 注意：不写任何 localStorage => 等于"没配模型"
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

try {
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("kb-pass-123456");
  await page.getByRole("button", { name: "注册并开始" }).click();
  await page.waitForURL("**/today", { timeout: 40000 });

  await page.goto(`${BASE}/knowledge`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => ({
    hasUploadSection: !!document.body.innerText.includes("上传资料"),
    hasModelGate: !!document.body.innerText.includes("先接上模型才能建知识库"),
    hasSoftPrompt: !!document.body.innerText.includes("还差一步"),
    askDisabled: (() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const b = btns.find((x) => x.textContent?.trim() === "问");
      return b ? b.disabled : null;
    })(),
  }));
  console.log("没配模型时的知识库页面:", JSON.stringify(state));
  console.log(
    state.hasUploadSection && !state.hasModelGate
      ? "  ✅ 知识库可用（上传区在、整页拦截已移除）"
      : "  ❌ 仍被拦截",
  );
  console.log(state.hasSoftPrompt ? "  ✅ 提问处有软提示" : "  ⚠️ 未见软提示");
  await page.screenshot({ path: `${OUT}no-model.png`, fullPage: true });

  // 真传一份 PDF，确认「浏览器解析 → 入库」整条链路走通
  const pdfPath =
    process.env.PDF_FIXTURE ??
    "C:/Users/chenr/Documents/deepseek-harness/default-workspace/_pdf_test/ds-notes.pdf";
  await page.setInputFiles('input[type="file"]', pdfPath);
  await page.waitForTimeout(6000); // 等解析（含 worker 首次加载）
  const extracted = await page.evaluate(() => {
    const ta = document.querySelector("textarea");
    return { len: ta ? ta.value.length : 0, head: ta ? ta.value.slice(0, 80) : "" };
  });
  console.log(`解析结果：提取 ${extracted.len} 字`);
  console.log(`  开头: ${JSON.stringify(extracted.head)}`);
  const progressText = await page.evaluate(() => document.body.innerText);
  const notice = progressText.split("\n").find((l) => /读出|没有找到文字|读不了|失败/.test(l));
  console.log(`  提示: ${notice ?? "(无)"}`);
  await page.screenshot({ path: `${OUT}pdf-extracted.png`, fullPage: true });

  await page.getByRole("button", { name: "加入知识库" }).click();
  await page.waitForTimeout(4000);
  const afterIngest = await page.evaluate(() => document.body.innerText);
  console.log(
    "入库结果:",
    afterIngest.split("\n").find((l) => /已入库|入库失败|失败|错误/.test(l)) ?? "(未见提示)",
  );
  const docs = await db.query(`select count(*)::int c from "Document"`);
  const chunks = await db.query(`select count(*)::int c from "Chunk"`);
  const sample = await db.query(`select content from "Chunk" order by "order" limit 1`);
  console.log(`  数据库：Document=${docs.rows[0].c} Chunk=${chunks.rows[0].c}`);
  if (sample.rows[0]) {
    console.log(`  首块内容前 60 字: ${JSON.stringify(String(sample.rows[0].content).slice(0, 60))}`);
  }
  await page.screenshot({ path: `${OUT}after-ingest.png`, fullPage: true });
} catch (e) {
  console.error("中断：", String(e.message).split("\n")[0]);
} finally {
  await browser.close();
  await db.query(`delete from "User" where email=$1`, [email]);
  await db.end();
}
console.log(`截图 -> scripts/design-shots/kb/`);
