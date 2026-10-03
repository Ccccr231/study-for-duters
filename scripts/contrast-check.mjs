// 色彩对比度审计：按 WCAG 2.1 真实计算每个可见文字与背景的对比度。
// 这是前面 a11y-check 没做的事 —— 它只查了 ARIA/标题/alt，没算对比度。
// "次级灰字"是最容易不达标的地方，而它同时影响可读性与观感。
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/contrast/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `contrast-${Date.now()}@test.dev`;
const browser = await chromium.launch({
  executablePath: "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe",
  headless: true,
});

const CONTRAST_AUDIT = () => {
  const parseColor = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

  // 逐层向上合成实际生效的背景色。
  // 必须做 alpha 合成：`bg-dut-mist/60` 这类半透明叠层若被当成"透明"直接跳过，
  // 就会漏掉真正压在上面的那层浅蓝 —— 实测漏了 6 处，实际只有 4.25:1（不达 AA）。
  const bgOf = (el) => {
    const layers = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (c && c.a >= 0.999) break;
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) {
      base = {
        r: layer.r * layer.a + base.r * (1 - layer.a),
        g: layer.g * layer.a + base.g * (1 - layer.a),
        b: layer.b * layer.a + base.b * (1 - layer.a),
        a: 1,
      };
    }
    return base;
  };

  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const out = [];
  const seen = new Set();
  for (const el of Array.from(document.querySelectorAll("*"))) {
    // 只看直接含文字的叶子元素
    const hasText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    if (!hasText) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.95) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    const fg = parseColor(s.color);
    if (!fg || fg.a < 0.95) continue;
    const bg = bgOf(el);
    const cr = ratio(fg, bg);
    const px = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    // WCAG: 大字（≥24px，或 ≥18.66px 且粗体）门槛 3:1，其余 4.5:1
    const isLarge = px >= 24 || (px >= 18.66 && bold);
    const need = isLarge ? 3 : 4.5;
    const text = (el.textContent || "").trim().slice(0, 22);
    const key = `${s.color}|${px}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text,
      color: s.color,
      bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      px: Math.round(px),
      ratio: Math.round(cr * 100) / 100,
      need,
      pass: cr >= need,
    });
  }
  return out;
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  const jsCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const jp = await jsCtx.newPage();
  await jp.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await jp.getByLabel("邮箱").fill(email);
  await jp.getByLabel("密码").fill("contrast-pass-123456");
  await jp.getByRole("button", { name: "注册并开始" }).click();
  await jp.waitForURL("**/today", { timeout: 40000 });
  const cookies = await jsCtx.cookies();
  await jsCtx.close();
  await ctx.addCookies(cookies);

  const routes = ["/today", "/checkin", "/plans", "/focus", "/reports", "/knowledge", "/chat"];
  const allBad = [];
  const allRows = [];
  let totalChecked = 0;

  console.log("对比度（WCAG 2.1 AA：正文 4.5:1，大字 3:1）：");
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const rows = await page.evaluate(CONTRAST_AUDIT);
    totalChecked += rows.length;
    allRows.push(...rows.map((r) => ({ route, ...r })));
    const bad = rows.filter((r) => !r.pass);
    for (const b of bad) allBad.push({ route, ...b });
    console.log(`  ${route.padEnd(12)} 检查 ${String(rows.length).padStart(3)} 处，不达标 ${bad.length}`);
  }

  // 落地页单独测（配色不同）
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const landing = await page.evaluate(CONTRAST_AUDIT);
  totalChecked += landing.length;
  const landBad = landing.filter((r) => !r.pass).map((r) => ({ route: "/", ...r }));
  allBad.push(...landBad);
  console.log(`  ${"/".padEnd(12)} 检查 ${String(landing.length).padStart(3)} 处，不达标 ${landBad.length}`);

  console.log(`\n  合计检查 ${totalChecked} 处文字，不达标 ${allBad.length} 处`);
  if (allBad.length) {
    console.log("  不达标明细（前 15 条）：");
    for (const b of allBad.slice(0, 15)) {
      console.log(
        `    ${b.route} 「${b.text}」 ${b.px}px ${b.color} on ${b.bg} → ${b.ratio}:1（需 ${b.need}:1）`,
      );
    }
  }
  check("所有文字对比度达标（WCAG AA）", allBad.length === 0, `共 ${totalChecked} 处，不达标 ${allBad.length}`);

  // AA 是基线，不是目标。这里统计离 AAA(7:1) 还差多少，
  // 用来判断"次级灰字"是不是偏浅（偏浅会同时伤可读性与观感）。
  const aaRows = allRows.filter((r) => r.pass);
  const belowAAA = aaRows.filter((r) => r.ratio < 7);
  console.log(
    `\n  达 AA 的 ${aaRows.length} 处中，未达 AAA(7:1) 的 ${belowAAA.length} 处；` +
      `最低对比度 ${aaRows.length ? Math.min(...aaRows.map((r) => r.ratio)).toFixed(2) : "-"}:1`,
  );
  const worst = [...belowAAA].sort((a, b) => a.ratio - b.ratio).slice(0, 8);
  if (worst.length) {
    console.log("  对比度最低的 8 处：");
    for (const w of worst) {
      console.log(`    ${w.route} 「${w.text}」 ${w.px}px ${w.color} on ${w.bg} → ${w.ratio}:1`);
    }
  }
  await page.screenshot({ path: `${OUT}landing.png`, fullPage: true });
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
process.exit(failed.length === 0 ? 0 : 1);
