// 验证路由入场动画：切页后 .route-in 是否重新挂载并播动画，
// 以及 router.refresh()（打卡/勾选后刷新数据）是否**不会**重放。
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/route/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `route-${Date.now()}@test.dev`;
const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

// 读 .route-in 上的动画状态
const readState = () =>
  page.evaluate(() => {
    const el = document.querySelector(".route-in");
    if (!el) return { found: false };
    const anims = el.getAnimations();
    return {
      found: true,
      total: anims.length,
      running: anims.filter((a) => a.playState === "running").length,
      name: anims[0]?.animationName ?? null,
      currentTime: anims[0] ? Math.round(anims[0].currentTime) : null,
    };
  });

try {
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("route-pass-123456");
  await page.getByRole("button", { name: "注册并开始" }).click();
  await page.waitForURL("**/today", { timeout: 40000 });
  await page.waitForTimeout(500);

  console.log("切页时的 .route-in 动画：");
  for (const tab of ["计划", "专注", "打卡"]) {
    const beforeUrl = new URL(page.url()).pathname;
    const t0 = Date.now();
    await page.getByRole("link", { name: tab }).first().click();
    // 量出「点击 → URL 变化」的耗时。这个数字有意义：
    // 为了让无 JS 用户看到内容而移除了 loading.tsx，切页不再有骨架屏兜底，
    // 必须确认没有慢到能被感知。
    await page.waitForFunction((prev) => location.pathname !== prev, beforeUrl, { timeout: 15000 });
    const elapsed = Date.now() - t0;
    await page.waitForTimeout(70);
    const mid = await readState();
    console.log(
      `  ${tab}: 切页 ${elapsed}ms；之后 running=${mid.running}/${mid.total} name=${mid.name} t=${mid.currentTime}`,
    );
    await page.screenshot({ path: `${OUT}tab-${tab}-mid.png` });
    await page.waitForTimeout(400);
  }

  // router.refresh() 不应重放：勾选任务（Server Action 会 revalidate + refresh）
  await page.goto(`${BASE}/plans`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("计划名，例如「数据结构期末冲刺」").fill("路由验证计划");
  await page.getByRole("button", { name: "新建计划" }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("link", { name: /路由验证计划/ }).first().click();
  await page.waitForURL(/\/plans\/.+/, { timeout: 20000 });
  await page.getByPlaceholder("加一个任务").fill("勾选测试任务");
  await page.getByRole("button", { name: "添加" }).click();
  await page.waitForTimeout(2500);

  const beforeToggle = await readState();
  await page.getByLabel("标记为完成").first().click();
  await page.waitForTimeout(120);
  const afterToggle = await readState();
  console.log(
    `\n勾选任务后（会触发 router.refresh）：running=${afterToggle.running}/${afterToggle.total}，` +
      `动画 currentTime 之前=${beforeToggle.currentTime} 之后=${afterToggle.currentTime}`,
  );
  console.log(
    afterToggle.running === 0
      ? "  ✅ 未重放动画"
      : "  ❌ 动画被重放了（refresh 不该触发入场）",
  );
} catch (e) {
  console.error("中断：", String(e.message).split("\n")[0]);
} finally {
  await browser.close();
  await db.query(`delete from "User" where email=$1`, [email]);
  await db.end();
}
console.log(`截图 -> scripts/design-shots/route/`);
