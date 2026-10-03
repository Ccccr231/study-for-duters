// 实测开场序列的两种情形：干净浏览器（应播）与已看过的浏览器（不应播）
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

// 情形 A：全新浏览器（无 localStorage）
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "commit" });
  await page.waitForTimeout(700);
  const st = await page.evaluate(() => {
    const el = document.querySelector(".intro");
    const em = document.querySelector(".intro-emblem");
    return {
      dataIntro: document.documentElement.dataset.intro,
      hasIntroEl: !!el,
      introDisplay: el ? getComputedStyle(el).display : null,
      emblemTransform: em ? getComputedStyle(em).transform : null,
      emblemFilter: em ? getComputedStyle(em).filter : null,
      seen: localStorage.getItem("dut:intro-seen"),
      anims: document.getAnimations().filter((a) => a.playState === "running").length,
    };
  });
  console.log("【全新浏览器 700ms】", JSON.stringify(st));
  await page.screenshot({ path: `${OUT}A-fresh-700ms.png` });
  await ctx.close();
}

// 情形 B：已看过（localStorage 有标记）
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("dut:intro-seen", "1");
    } catch {}
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => {
    const el = document.querySelector(".intro");
    return {
      dataIntro: document.documentElement.dataset.intro,
      hasIntroEl: !!el,
      introDisplay: el ? getComputedStyle(el).display : null,
    };
  });
  console.log("【已看过】", JSON.stringify(st));
  await page.screenshot({ path: `${OUT}B-seen.png` });
  await ctx.close();
}

await browser.close();
console.log(`截图 -> scripts/design-shots/intro-state/`);
