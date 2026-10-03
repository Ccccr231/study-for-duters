// 设计对照截图：在多个视口下把关键页面截图，用于改动前后的像素级对比。
// 需要先起生产服务器：node node_modules/next/dist/bin/next start -p 3100
//
// 用法：node scripts/shots.mjs <输出目录名> [baseUrl]
//   node scripts/shots.mjs before          -> scripts/design-shots/before/
//   node scripts/shots.mjs after           -> scripts/design-shots/after/
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const label = process.argv[2] ?? "shots";
const BASE = process.argv[3] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL(`./design-shots/${label}/`, import.meta.url));
mkdirSync(OUT, { recursive: true });

// 未登录可见的页面
const PUBLIC = ["/", "/login", "/register"];
// 需要登录的页面
const PRIVATE = ["/today", "/plans", "/focus", "/checkin", "/chat", "/knowledge", "/reports", "/settings/model"];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, dpr: 3 },   // iPhone 14 尺寸
  { name: "desktop", width: 1280, height: 800, dpr: 2 },
];

// 建一个临时账号用来截受保护页面
const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `shots-${Date.now()}@test.dev`;
const password = "shots-pass-123";

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// 等开场序列（首次进入会有 2.4s 的校徽推进）结束再截图，
// 否则全新 context 下拍到的是开场层而不是页面。返回访问者不会有这一层。
/**
 * 截图前禁用滚动入场动画。
 *
 * 为什么需要：`.scroll-rise` 用 `animation-timeline: view()`，**视口外的元素
 * 停在 opacity: 0**。而 `fullPage: true` 截图不会真的滚动页面，
 * 于是视口以下的滚动入场元素全是不可见的 —— 设计对照图会缺掉时间轴后半段与校训带。
 * （内容本身没问题，实测滚动到就有；这是截图工具的伪影。）
 */
async function disableScrollAnimations(page) {
  await page.addStyleTag({
    content: `.scroll-rise { animation: none !important; opacity: 1 !important; transform: none !important; }`,
  });
}

async function waitIntroDone(page) {
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector(".intro");
        return !el || getComputedStyle(el).display === "none";
      },
      { timeout: 8000 },
    )
    .catch(() => {});
}

let count = 0;
try {
  // 公开页必须用**未登录**上下文拍：/ 在已登录时会 redirect 到 /today，否则拍到的是今日页
  const pubCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pubPage = await pubCtx.newPage();
  pubPage.setDefaultTimeout(60000);
  for (const vp of VIEWPORTS) {
    await pubPage.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of PUBLIC) {
      await pubPage.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await waitIntroDone(pubPage);
  await disableScrollAnimations(pubPage);
      await pubPage.waitForTimeout(600); // 让入场动效走完
      await pubPage.screenshot({
        path: `${OUT}${vp.name}${path.replace(/\//g, "-") || "-root"}.png`,
        fullPage: true,
      });
      count++;
    }
  }
  await pubCtx.close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  // 登录态：走真实注册
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "注册并开始" }).click();
  await page.waitForURL("**/today", { timeout: 40000 });

  // 造一点数据，让页面不是空的（截图才有意义）
  const uid = (await db.query(`select id from "User" where email=$1`, [email])).rows[0].id;
  const planId = `shots-plan-${Date.now()}`;
  await db.query(
    `insert into "Plan" (id,"userId",title,goal,"startDate","endDate",status,"createdAt")
     values ($1,$2,$3,$4,now(),now()+interval '30 days','active',now())`,
    [planId, uid, "数据结构期末冲刺", "把图论和排序吃透"],
  );
  await db.query(
    `insert into "Task" (id,"planId","userId",title,done,"sortOrder","createdAt") values
     ($1,$2,$3,'图的最短路径总结',false,1,now()),
     ($4,$2,$3,'红黑树插入练习',true,2,now()),
     ($5,$2,$3,'排序算法对比表',false,3,now())`,
    [`t1-${Date.now()}`, planId, uid, `t2-${Date.now()}`, `t3-${Date.now()}`],
  );
  await db.query(
    `insert into "PomodoroSession" (id,"userId","startedAt","endedAt",duration,completed,"createdAt")
     values (gen_random_uuid()::text,$1,now()-interval '25 min',now(),25,true,now()),
            (gen_random_uuid()::text,$1,now()-interval '2 hour',now()-interval '70 min',45,true,now())`,
    [uid],
  );
  // 造 12 周打卡记录，让热力图有内容
  for (let i = 0; i < 40; i++) {
    const skip = i % 5 === 0;
    if (skip) continue;
    await db.query(
      `insert into "CheckIn" (id,"userId",date,streak) values (gen_random_uuid()::text,$1,$2,$3)
       on conflict ("userId",date) do nothing`,
      [uid, new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), 40 - i],
    );
  }

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const path of PRIVATE) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await disableScrollAnimations(page);
      await page.waitForTimeout(600); // 让入场动效走完
      const name = `${vp.name}${path.replace(/\//g, "-")}.png`;
      await page.screenshot({ path: `${OUT}${name}`, fullPage: true });
      count++;
    }
  }

  await ctx.close();
} catch (e) {
  console.error("截图失败：", String(e.message).split("\n")[0]);
} finally {
  await browser.close();
  await db.query(`delete from "User" where email=$1`, [email]);
  await db.end();
}

console.log(`已输出 ${count} 张截图 -> scripts/design-shots/${label}/`);
