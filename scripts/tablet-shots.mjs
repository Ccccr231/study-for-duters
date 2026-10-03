// 中间断点（平板 ~834px）截图，用于核对 640–1024px 区间是否偏空
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/tablet/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// 全新 context 必然触发开场序列（2.4s），不跳过就会拍到开场层而不是页面。
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

for (const width of [640, 834, 1024]) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await waitIntroDone(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}landing-${width}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log("已输出 landing-640/834/1024.png");
