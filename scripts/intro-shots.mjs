// 开场序列验证：在动画的特定时间点截图，确认"脱焦推进 → 合焦铺满 → 淡出"这条时间线真的成立。
// 用法：node scripts/intro-shots.mjs [baseUrl]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/intro/", import.meta.url));
mkdirSync(OUT, { recursive: true });

// 取动画时间线上的几个时刻（毫秒）。总时长 2400ms。
const MOMENTS = [120, 400, 900, 1500, 2100, 2800];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let shot = 0;

for (const vp of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  // 全新 context => localStorage 为空 => 会播放开场
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();

  const started = Date.now();
  await page.goto(`${BASE}/`, { waitUntil: "commit" });

  for (const ms of MOMENTS) {
    const wait = ms - (Date.now() - started);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${OUT}${vp.name}-${String(ms).padStart(4, "0")}ms.png` });
    shot++;
  }

  // 再来一次：这次 localStorage 已有标记，开场不应出现
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const stillThere = await page.locator(".intro").count();
  const hidden = await page
    .locator(".intro")
    .evaluate((el) => getComputedStyle(el).display === "none")
    .catch(() => true);
  console.log(`${vp.name}: 二次访问 .intro 节点数=${stillThere} 已隐藏=${hidden}`);
  await page.screenshot({ path: `${OUT}${vp.name}-revisit.png` });
  shot++;

  // 减弱动效：应跳过推进
  const rmCtx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    reducedMotion: "reduce",
  });
  const rmPage = await rmCtx.newPage();
  await rmPage.goto(`${BASE}/`, { waitUntil: "commit" });
  const rmState = await rmPage.evaluate(() => document.documentElement.dataset.intro);
  console.log(`${vp.name}: prefers-reduced-motion 下 data-intro=${rmState}（应为 off，即不播推进）`);
  await rmPage.screenshot({ path: `${OUT}${vp.name}-reduced-motion.png` });
  shot++;

  await rmCtx.close();
  await ctx.close();
}

await browser.close();
console.log(`已输出 ${shot} 张 -> scripts/design-shots/intro/`);
