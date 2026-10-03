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

  // 真传一份资料，确认入库走通（降级路径）
  await page.getByPlaceholder("资料名，例如「数据结构·树」").fill("降级验证资料");
  await page
    .getByPlaceholder("把笔记贴进来，或点下面的按钮选文件")
    .fill("## 红黑树\n\n插入时若叔叔节点为红色，则把父辈染黑、祖父染红，再向上检查。");
  await page.getByRole("button", { name: "加入知识库" }).click();
  await page.waitForTimeout(3500);
  const afterIngest = await page.evaluate(() => document.body.innerText);
  console.log(
    "入库结果:",
    /入库|切成|失败|错误/.test(afterIngest)
      ? afterIngest.split("\n").find((l) => /入库|切成|失败|错误/.test(l))
      : "(未见提示)",
  );
  const docs = await db.query(`select count(*)::int c from "Document"`);
  const chunks = await db.query(`select count(*)::int c from "Chunk"`);
  console.log(`  数据库：Document=${docs.rows[0].c} Chunk=${chunks.rows[0].c}`);
  await page.screenshot({ path: `${OUT}after-ingest.png`, fullPage: true });
} catch (e) {
  console.error("中断：", String(e.message).split("\n")[0]);
} finally {
  await browser.close();
  await db.query(`delete from "User" where email=$1`, [email]);
  await db.end();
}
console.log(`截图 -> scripts/design-shots/kb/`);
