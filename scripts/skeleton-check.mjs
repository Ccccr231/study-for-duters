// 检测「无 JS 时页面是否只剩骨架屏」——这类问题肉眼看不出来（HTTP 200、HTML 也不小），
// 但禁用 JS 的用户看到的是永久加载状态。
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const ROUTES = ["/today", "/plans", "/focus", "/checkin", "/chat", "/knowledge", "/reports", "/settings/model"];

const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `skeleton-${Date.now()}@test.dev`;
const browser = await chromium.launch({
  executablePath: "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe",
  headless: true,
});

// 先拿登录态
const jsCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const jsPage = await jsCtx.newPage();
await jsPage.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
await jsPage.getByLabel("邮箱").fill(email);
await jsPage.getByLabel("密码").fill("skeleton-pass-123456");
await jsPage.getByRole("button", { name: "注册并开始" }).click();
await jsPage.waitForURL("**/today", { timeout: 40000 });
const cookies = await jsCtx.cookies();
await jsCtx.close();

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
await ctx.addCookies(cookies);
const page = await ctx.newPage();

console.log("无 JS 下各页面是否只剩骨架屏：\n");
let stuckCount = 0;
for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  const info = await page.evaluate(() => {
    const main = document.querySelector("main");
    const html = main?.innerHTML ?? "";
    return {
      hasSkeleton: /class="[^"]*skeleton/.test(html),
      hasSuspenseMarker: html.includes("<!--$?-->"),
      // 真内容：main 里的可见文字
      text: (main?.innerText ?? "").replace(/\s+/g, " ").trim(),
    };
  });
  const stuck = info.hasSkeleton && info.text.length < 40;
  if (stuck) stuckCount++;
  console.log(
    `${stuck ? "❌" : "✅"} ${route.padEnd(17)} 骨架=${info.hasSkeleton ? "有" : "无"} ` +
      `Suspense标记=${info.hasSuspenseMarker ? "有" : "无"} 正文${info.text.length}字` +
      (stuck ? `  ← 永久加载态` : ""),
  );
  if (!stuck && info.text) console.log(`      ${JSON.stringify(info.text.slice(0, 70))}`);
}

await browser.close();
const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(`delete from "User" where email=$1`, [email]);
await db.end();

console.log(`\n卡在骨架屏的页面: ${stuckCount}/${ROUTES.length}`);
process.exit(stuckCount === 0 ? 0 : 1);
