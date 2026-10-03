// 实测 srcset 是否真的省了带宽：对比浏览器在手机视口下实际下载了哪一档。
import { createRequire } from "node:module";
const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({
  executablePath: "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe",
  headless: true,
});

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  for (const [label, opts] of [
    ["@1x（390px 视口）", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
    ["@3x（iPhone 视口）", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 }],
  ]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const images = [];
    page.on("response", (r) => {
      const u = r.url();
      if (/dut-(magnolia|building|emblem).*\.png/.test(u)) {
        const size = Number(r.headers()["content-length"] ?? 0);
        images.push({ file: u.split("/").pop(), kb: Math.round(size / 1024) });
      }
    });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector(".intro");
          return !el || getComputedStyle(el).display === "none";
        },
        { timeout: 8000 },
      )
      .catch(() => {});
    await page.waitForTimeout(1200);

    const total = images.reduce((s, i) => s + i.kb, 0);
    console.log(`  ${label}: ${images.length} 张图 / 共 ${total}KB`);
    for (const i of images) console.log(`      ${i.file} ${i.kb}KB`);
    check(
      `${label} 未下载 512 原图`,
      images.every((i) => !/^dut-(magnolia|building|emblem)\.png$/.test(i.file)),
      images.map((i) => i.file).join(", "),
    );
    // 基线：三张图若都用 512 原图 = 52.0 + 35.8 + 23.6 = 111.4KB
    // 实际还要按页面用了几张算，这里用"每个已下载文件都用 512 原图"作保守基线
    const baseline = images.length * 52;
    check(
      `${label} 相比全用 512 原图（${baseline}KB）明显更省`,
      total < baseline * 0.85,
      `${total}KB vs 基线 ${baseline}KB（省 ${Math.round((1 - total / baseline) * 100)}%）`,
    );
    await ctx.close();
  }
} catch (e) {
  check("脚本未中断", false, String(e.message).split("\n")[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
