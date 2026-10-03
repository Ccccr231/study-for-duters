// 可访问性 + 首屏性能审计。
// 可访问性是"获奖级"网站的硬门槛（评审都会看），而这类问题肉眼同样看不出来
// —— 和前面查过的无 JS、移动端一样，必须机检。
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/a11y/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `a11y-${Date.now()}@test.dev`;
const browser = await chromium.launch({
  executablePath: "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe",
  headless: true,
});

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// 在页面里跑的可访问性检查
const AUDIT = () => {
  const problems = [];
  const q = (s) => Array.from(document.querySelectorAll(s));
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const accName = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();

  for (const el of q("button, a[href]")) {
    if (visible(el) && !accName(el)) problems.push(`可访问名称为空: <${el.tagName.toLowerCase()}>`);
  }

  for (const el of q("input:not([type=hidden]), textarea, select")) {
    if (!visible(el)) continue;
    const id = el.id;
    const hasFor = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
    const wrapped = el.closest("label");
    const aria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
    const title = el.getAttribute("title");
    const ph = el.getAttribute("placeholder");
    if (!hasFor && !wrapped && !aria && !title && !ph) {
      problems.push(`表单控件无标签: <${el.tagName.toLowerCase()} name=${el.getAttribute("name")}>`);
    }
  }

  for (const el of q("img")) {
    if (!el.hasAttribute("alt")) problems.push(`img 缺 alt: ${el.getAttribute("src")}`);
  }

  const hs = q("h1,h2,h3,h4,h5,h6").filter(visible);
  const h1s = hs.filter((h) => h.tagName === "H1");
  if (h1s.length === 0) problems.push("页面没有 h1");
  if (h1s.length > 1) problems.push(`页面有 ${h1s.length} 个 h1（应唯一）`);
  let prev = 0;
  for (const h of hs) {
    const lvl = Number(h.tagName[1]);
    if (prev && lvl > prev + 1)
      problems.push(`标题跳级 h${prev}→h${lvl}「${(h.textContent || "").trim().slice(0, 14)}」`);
    prev = lvl;
  }

  if (!document.documentElement.lang) problems.push("<html> 缺 lang");

  return { problems, headings: hs.map((h) => h.tagName).join(" ") };
};

let ctx;
try {
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  console.log("可访问性：");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  let a = await page.evaluate(AUDIT);
  check("落地页（未登录）", a.problems.length === 0, a.problems.slice(0, 5).join(" | "));
  await page.screenshot({ path: `${OUT}landing.png` });

  // 建账号
  const jsCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const jp = await jsCtx.newPage();
  await jp.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await jp.getByLabel("邮箱").fill(email);
  await jp.getByLabel("密码").fill("a11y-pass-123456");
  await jp.getByRole("button", { name: "注册并开始" }).click();
  await jp.waitForURL("**/today", { timeout: 40000 });
  const cookies = await jsCtx.cookies();
  await jsCtx.close();
  await ctx.addCookies(cookies);

  for (const route of ["/today", "/checkin", "/plans", "/focus", "/reports", "/knowledge", "/chat"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    a = await page.evaluate(AUDIT);
    check(`${route}`, a.problems.length === 0, a.problems.slice(0, 4).join(" | "));
  }
  await page.screenshot({ path: `${OUT}today.png`, fullPage: true });

  // 键盘焦点可见性
  await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
  const focus = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("a[href], button")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const bad = [];
    for (const el of els) {
      el.focus();
      const s = getComputedStyle(el);
      const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      const shadow = s.boxShadow !== "none";
      if (!outline && !shadow) bad.push((el.textContent || "").trim().slice(0, 12) || el.tagName);
    }
    return { total: els.length, bad };
  });
  check(
    "键盘焦点有可见指示",
    focus.bad.length === 0,
    `检查 ${focus.total} 个，无指示 ${focus.bad.length} 个 ${JSON.stringify(focus.bad.slice(0, 6))}`,
  );

  // 首屏性能
  console.log("\n首屏性能（4G：150ms RTT / 4Mbps，CPU 4× 降速）：");
  const perfCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await perfCtx.addCookies(cookies);
  const pp = await perfCtx.newPage();
  const cdp = await perfCtx.newCDPSession(pp);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await pp.goto(`${BASE}/today`, { waitUntil: "load" });
  await pp.waitForTimeout(1200);
  const perf = await pp.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource");
    const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
    const css = res.filter((r) => /\.css(\?|$)/.test(r.name));
    const enc = (l) => l.reduce((s, r) => s + (r.encodedBodySize || 0), 0);
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      dcl: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      fcp: fcp ? Math.round(fcp.startTime) : null,
      jsCount: js.length,
      jsBytes: enc(js),
      cssBytes: enc(css),
      reqs: res.length,
    };
  });
  console.log(
    `  FCP ${perf.fcp}ms · DCL ${perf.dcl}ms · load ${perf.load}ms\n` +
      `  JS ${perf.jsCount} 个 / ${(perf.jsBytes / 1024).toFixed(0)}KB · CSS ${(perf.cssBytes / 1024).toFixed(0)}KB · 请求 ${perf.reqs} 个`,
  );
  check("FCP < 2000ms", perf.fcp !== null && perf.fcp < 2000, `${perf.fcp}ms`);
  check("首屏 JS < 250KB（压缩后）", perf.jsBytes < 250 * 1024, `${(perf.jsBytes / 1024).toFixed(0)}KB`);
  await perfCtx.close();
} catch (e) {
  check("脚本未中断", false, String(e.message).split("\n")[0]);
} finally {
  await browser.close();
  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  await db.query(`delete from "User" where email=$1`, [email]);
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
console.log(`截图 -> scripts/design-shots/a11y/`);
process.exit(failed.length === 0 ? 0 : 1);
