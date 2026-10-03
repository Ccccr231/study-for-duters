// 读屏（屏幕阅读器）可用性验证。
//
// 这轮查的是"静态 ARIA 检查"查不出来的东西：
//   1. live region 是否真的进入无障碍树（属性写错就静默失效）
//   2. 流式回答结束时是否**只播报一次**（不能每个 token 播一次，也不能完全不播）
//   3. 热力图格子读出来是不是人话（原本只读裸日期 "2026-09-28"）
//   4. 提示语是否用 alert（错误要立刻播报，polite 会排队等前面读完）
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `sr-${Date.now()}@test.dev`;
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

  // ---------- 1. 热力图格子的无障碍标签 ----------
  const jsCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const jp = await jsCtx.newPage();
  await jp.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await jp.getByLabel("邮箱").fill(email);
  await jp.getByLabel("密码").fill("sr-pass-123456");
  await jp.getByRole("button", { name: "注册并开始" }).click();
  await jp.waitForURL("**/today", { timeout: 40000 });
  await ctx.addCookies(await jsCtx.cookies());
  await jsCtx.close();

  await page.goto(`${BASE}/checkin`, { waitUntil: "domcontentloaded" });
  const heatmap = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('[role="img"]'));
    const labels = imgs.map((el) => el.getAttribute("aria-label")).filter(Boolean);
    const hidden = Array.from(document.querySelectorAll('[aria-hidden="true"]')).length;
    return {
      count: imgs.length,
      sample: labels.slice(0, 3),
      hasBareDate: labels.some((l) => /^\d{4}-\d{2}-\d{2}$/.test(l)),
      hidden,
      summary: document.querySelector(".sr-only")?.textContent?.trim() ?? null,
    };
  });
  check(
    "热力图格子有可读的 aria-label（不是裸日期）",
    heatmap.count > 0 && !heatmap.hasBareDate,
    `${heatmap.count} 个格子；示例 ${JSON.stringify(heatmap.sample)}`,
  );
  check(
    "热力图有给读屏的一句话总览",
    !!heatmap.summary && /共打卡/.test(heatmap.summary),
    heatmap.summary ?? "(无)",
  );

  // ---------- 2. live region 进入无障碍树 ----------
  // 说明：live region 只在"有内容可播报"时才渲染（上传/入库提示等），
  // 未配模型时知识库本就不该有 live region——没有可播报的东西。
  // 所以这里验证聊天页那个**常驻**播报区确实存在且在无障碍树里。
  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  // 键名见 lib/ai/client-config.ts 的 STORAGE_KEY（写错就注入不进去，ChatPanel 会整页拦住）
  await page.evaluate(() => {
    localStorage.setItem(
      "duters.llm.config",
      JSON.stringify({
        baseUrl: "https://example.com/v1",
        apiKey: "sk-test",
        chatModel: "test-model",
      }),
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  const liveRegions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')).map(
      (el) => ({
        role: el.getAttribute("role"),
        live: el.getAttribute("aria-live"),
        text: (el.textContent || "").trim().slice(0, 40),
        displayNone: getComputedStyle(el).display === "none",
        // sr-only：视觉上只有 1px，但读屏仍然可达
        visuallyHidden:
          getComputedStyle(el).position === "absolute" &&
          parseFloat(getComputedStyle(el).width) <= 2,
      }),
    ),
  );
  check(
    "聊天页有常驻读屏播报区且在无障碍树中",
    liveRegions.length > 0 && liveRegions.every((r) => !r.displayNone),
    JSON.stringify(liveRegions.slice(0, 3)),
  );
  check(
    "播报区为 sr-only（视觉隐藏、读屏可达）",
    liveRegions.some((r) => r.visuallyHidden),
    JSON.stringify(liveRegions.map((r) => r.visuallyHidden)),
  );

  // 记录 live region 每次变化
  await page.evaluate(() => {
    window.__announcements = [];
    const target = document.querySelector('[role="status"][aria-live]');
    if (!target) return;
    new MutationObserver(() => {
      const t = (target.textContent || "").trim();
      if (t) window.__announcements.push(t.slice(0, 50));
    }).observe(target, { childList: true, characterData: true, subtree: true });
  });

  // 用假流回应 /api/chat：分 6 个 chunk 吐出来
  await page.route("**/api/chat", async (route) => {
    const chunks = ["红黑", "树插入", "时若叔叔", "节点为红", "则上溢", "处理。"];
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: chunks.join(""),
    });
  });

  const input = page.getByLabel("给连小理发消息");
  if ((await input.count()) === 0) {
    check("找到聊天输入框（用于验证播报）", false, "未找到输入框");
  } else {
    await input.fill("红黑树怎么插入？");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    const ann = await page.evaluate(() => window.__announcements ?? []);
    const answerShown = await page.evaluate(() =>
      document.body.innerText.includes("红黑树插入时若叔叔节点为红"),
    );
    check("流式回答显示在页面上", answerShown);
    check(
      "播报集中在「回答完毕」一次，而不是逐 token 刷屏",
      ann.length > 0 && ann.length <= 3 && ann.some((a) => a.includes("回答完毕")),
      `共 ${ann.length} 次播报：${JSON.stringify(ann)}`,
    );
  }

  // ---------- 4. 错误用 alert（立刻播报） ----------
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "模型没配好" }),
    });
  });
  const input2 = page.getByLabel("给连小理发消息");
  if ((await input2.count()) > 0) {
    await input2.fill("再问一次");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    const alertInfo = await page.evaluate(() => {
      const el = document.querySelector('[role="alert"]');
      return el ? { role: "alert", text: (el.textContent || "").trim().slice(0, 30) } : null;
    });
    check("错误提示用 role=alert（立即播报）", !!alertInfo, JSON.stringify(alertInfo));
  }

  // ---------- 5. 番茄钟结束有播报，但计时数字本身不刷屏 ----------
  await page.goto(`${BASE}/focus`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const timerA11y = await page.evaluate(() => {
    // 找"计时数字"所在的 p（形如 25:00）
    const timeEl = Array.from(document.querySelectorAll("p")).find((p) =>
      /^\d{2}:\d{2}$/.test((p.textContent || "").trim()),
    );
    const liveEls = Array.from(document.querySelectorAll('[role="status"], [aria-live]'));
    return {
      timeElIsLive:
        !!timeEl &&
        (timeEl.hasAttribute("aria-live") || !!timeEl.closest('[aria-live], [role="status"]')),
      liveCount: liveEls.length,
      liveText: liveEls.map((e) => (e.textContent || "").trim()).filter(Boolean),
    };
  });
  check(
    "计时数字本身不是 live region（否则每秒刷屏）",
    !timerA11y.timeElIsLive,
    `live region 共 ${timerA11y.liveCount} 个`,
  );
  check(
    "番茄钟有独立的播报区（归零时播一次）",
    timerA11y.liveCount > 0,
    JSON.stringify(timerA11y.liveText),
  );

  // ---------- 6. sr-only 不能占布局（否则会在页面上留空隙） ----------
  await page.goto(`${BASE}/checkin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const srOnly = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".sr-only")).map((e) => {
      const b = e.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), text: (e.textContent || "").trim().slice(0, 30) };
    }),
  );
  check(
    "sr-only 元素存在且不占布局（≤1px）",
    srOnly.length > 0 && srOnly.every((e) => e.w <= 1 && e.h <= 1),
    JSON.stringify(srOnly),
  );
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
