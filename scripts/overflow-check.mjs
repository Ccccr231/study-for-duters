// 横向溢出检测：390px 窄屏下若存在超宽元素，会静默截断文字（落地页底部声明就中过招）。
// 用法：node scripts/overflow-check.mjs [baseUrl]
import { createRequire } from "node:module";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";

const PAGES = ["/", "/login", "/register"];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let problems = 0;

for (const width of [320, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  for (const path of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const report = await page.evaluate(() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth - de.clientWidth;
      const bad = [];
      if (overflow > 1) {
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // 元素右边界超出视口，且它自己没有把内容裁掉（overflow hidden 的不算）
          if (r.right > de.clientWidth + 1) {
            const cs = getComputedStyle(el);
            if (cs.overflowX === "visible" || cs.overflowX === "clip") {
              bad.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className && String(el.className).slice(0, 70)) || "",
                right: Math.round(r.right),
                text: (el.textContent ?? "").trim().slice(0, 28),
              });
            }
          }
        }
      }
      return { overflow, bad: bad.slice(0, 6) };
    });
    const tag = `${width}px ${path}`;
    if (report.overflow > 1) {
      problems++;
      console.log(`❌ ${tag} 横向溢出 ${report.overflow}px`);
      for (const b of report.bad) console.log(`     <${b.tag} class="${b.cls}"> right=${b.right} "${b.text}"`);
    } else {
      console.log(`✅ ${tag} 无横向溢出`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log(problems === 0 ? "\n全部通过" : `\n有 ${problems} 处溢出`);
process.exit(problems === 0 ? 0 : 1);
