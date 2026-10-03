// 验证开场序列的播放位置：
// 1) 落地页首次进入 → 播
// 2) 直接打开 /login → **不播**（用户还没进应用，不该被拦 2.4 秒）
// 3) 播过之后会话内再进落地页 → 不播
// 4) 直接打开 /login 后，再进落地页 → 仍应播（/login 不该把标记写掉）
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/intro-state/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

const probe = (page) =>
  page.evaluate(() => {
    const el = document.querySelector(".intro");
    return {
      dataIntro: document.documentElement.dataset.intro,
      introVisible: !!el && getComputedStyle(el).display !== "none",
      seen: sessionStorage.getItem("dut:intro-seen"),
    };
  });

// 1) 全新会话打开落地页
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "commit" });
  await page.waitForTimeout(600);
  console.log("1) 全新会话打开落地页:", JSON.stringify(await probe(page)));
  await page.screenshot({ path: `${OUT}1-landing-fresh.png` });

  // 3) 同会话再进落地页
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  console.log("3) 同会话再进落地页:", JSON.stringify(await probe(page)));
  await ctx.close();
}

// 2) 全新会话直接打开 /login
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "commit" });
  await page.waitForTimeout(600);
  console.log("2) 全新会话直接打开 /login:", JSON.stringify(await probe(page)));
  await page.screenshot({ path: `${OUT}2-login-fresh.png` });

  // 4) 同一会话再进落地页 —— 应该仍然播（/login 不该写标记）
  await page.goto(`${BASE}/`, { waitUntil: "commit" });
  await page.waitForTimeout(600);
  console.log("4) 从 /login 再进落地页:", JSON.stringify(await probe(page)));
  await page.screenshot({ path: `${OUT}4-landing-after-login.png` });
  await ctx.close();
}

await browser.close();
console.log(`截图 -> scripts/design-shots/intro-state/`);
