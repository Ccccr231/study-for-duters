// 验证滚动入场（animation-timeline: view()）真的随滚动推进，
// 且在"不支持该特性"时内容不会消失（@supports 守卫是否有效）。
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // 等开场层消失（全新 context 必然触发）
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector(".intro");
        return !el || getComputedStyle(el).display === "none";
      },
      { timeout: 8000 },
    )
    .catch(() => {});

  const count = await page.locator(".scroll-rise").count();
  check("页面上有滚动入场元素", count > 0, `${count} 个`);

  // 滚到时间轴，采样两个滚动位置的 opacity
  const samples = await page.evaluate(async () => {
    const el = document.querySelector(".scroll-rise");
    if (!el) return null;
    const read = () => {
      const s = getComputedStyle(el);
      return { opacity: Math.round(parseFloat(s.opacity) * 100) / 100, timeline: s.animationTimeline };
    };
    const before = read();
    el.scrollIntoView({ block: "end", behavior: "instant" });
    await new Promise((r) => setTimeout(r, 200));
    const entering = read();
    el.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise((r) => setTimeout(r, 200));
    const centered = read();
    return { before, entering, centered };
  });
  console.log(`  采样：远端 ${JSON.stringify(samples.before)} → 进入 ${JSON.stringify(samples.entering)} → 居中 ${JSON.stringify(samples.centered)}`);
  check(
    "animation-timeline 已挂上 view() 时间轴",
    samples.centered.timeline === "view()" || samples.centered.timeline === "view",
    String(samples.centered.timeline),
  );
  check(
    "滚动过程中透明度确实在变化（不是静态）",
    samples.entering.opacity < samples.centered.opacity,
    `进入 ${samples.entering.opacity} → 居中 ${samples.centered.opacity}`,
  );
  check("滚到位置后完全可见（opacity=1）", samples.centered.opacity >= 0.99, String(samples.centered.opacity));

  // 关键安全性：模拟"不支持 animation-timeline"的浏览器，内容不能消失。
  // 做法：禁用该属性（CDP 无法直接做），改为断言 @supports 守卫存在且规则在其中。
  const guarded = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const r of Array.from(rules)) {
        if (r.type === CSSRule.SUPPORTS_RULE && /animation-timeline/.test(r.conditionText || "")) {
          const hasScrollRise = Array.from(r.cssRules).some((inner) => {
            if (inner.type === CSSRule.MEDIA_RULE) {
              return Array.from(inner.cssRules).some((x) => x.selectorText === ".scroll-rise");
            }
            return inner.selectorText === ".scroll-rise";
          });
          if (hasScrollRise) return true;
        }
      }
    }
    return false;
  });
  check("规则被 @supports (animation-timeline) 守卫（不支持时不会永久隐藏）", guarded);

  // 全页滚动扫描：任何"已在视口内却仍然很淡"的元素都是 bug
  // （进场动画停在中途 = 内容读不到）。这条是上面单点采样的兜底。
  const stuck = await page.evaluate(async () => {
    const els = Array.from(document.querySelectorAll(".scroll-rise"));
    const H = window.innerHeight;
    const total = document.documentElement.scrollHeight;
    const bad = [];
    for (let y = 0; y <= total; y += 120) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const [idx, el] of els.entries()) {
        const rel = el.getBoundingClientRect().top / H;
        const op = parseFloat(getComputedStyle(el).opacity);
        if (rel < 0.5 && rel > -0.5 && op < 0.95) bad.push({ y, idx, rel: Math.round(rel * 100) / 100, op });
      }
    }
    window.scrollTo(0, 0);
    return bad;
  });
  check(
    "全页滚动扫描：没有元素在视口内却仍然很淡",
    stuck.length === 0,
    stuck.length ? JSON.stringify(stuck.slice(0, 5)) : "0 处",
  );
  // 减弱动效下不应有动画
  const rmCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const rmp = await rmCtx.newPage();
  await rmp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await rmp
    .waitForFunction(
      () => {
        const el = document.querySelector(".intro");
        return !el || getComputedStyle(el).display === "none";
      },
      { timeout: 8000 },
    )
    .catch(() => {});
  const rm = await rmp.evaluate(() => {
    const el = document.querySelector(".scroll-rise");
    if (!el) return null;
    const s = getComputedStyle(el);
    return { opacity: parseFloat(s.opacity), anims: el.getAnimations().length };
  });
  check(
    "减弱动效下滚动入场不启用、内容完全可见",
    !!rm && rm.opacity >= 0.99,
    JSON.stringify(rm),
  );
  await rmCtx.close();
} catch (e) {
  check("脚本未中断", false, String(e.message).split("\n")[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
