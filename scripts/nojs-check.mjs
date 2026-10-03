// 无 JS 场景实测：禁用 JavaScript 后，核心流程还能不能用。
// 这是目标里「保持无 JS 渐进增强」这条的验收脚本——此前只是断言，从未实测。
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const CHROME = "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe";
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/nojs/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `nojs-${Date.now()}@test.dev`;
const password = "nojs-pass-123456";
/** 建过的测试账号，清理时一并删除（含 JS 流程里新建的那个） */
const emailsToClean = [];

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
// javaScriptEnabled: false —— 浏览器完全禁用 JS（模拟脚本被拦、老旧环境）
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  javaScriptEnabled: false,
});
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  // 0. 开场层不应挡住内容
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const introBlocks = await page
    .evaluate(() => {
      const el = document.querySelector(".intro");
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    })
    .catch(() => false);
  check("无 JS 时开场层不挡内容", !introBlocks, introBlocks ? "开场层仍然可见（会永久遮挡）" : "");
  await page.screenshot({ path: `${OUT}landing-nojs.png` });

  const landingText = await page.evaluate(() => document.body.innerText);
  check("落地页渲染出内容", landingText.includes("Study for DUTERS"));

  // 1. 注册页：原生表单是否可用。
  // 注意：**不要**用 `form.getAttribute("action")` 当判据——RSC 的 action 未必是字面属性，
  // 这个断言曾把"其实能用"误判为失败。真正的判据是下面实际提交后有没有落库。
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  const regForm = await page.evaluate(() => {
    const f = document.querySelector("form");
    if (!f) return { hasForm: false };
    return {
      hasForm: true,
      inputs: f.querySelectorAll("input").length,
      hasSubmit: !!f.querySelector('button[type="submit"], input[type="submit"]'),
      names: Array.from(f.querySelectorAll("input")).map((i) => i.getAttribute("name")),
    };
  });
  check(
    "注册页有可提交的原生表单（含邮箱/密码字段与提交按钮）",
    regForm.hasForm &&
      regForm.hasSubmit &&
      regForm.names?.includes("email") &&
      regForm.names?.includes("password"),
    JSON.stringify(regForm),
  );
  await page.screenshot({ path: `${OUT}register-nojs.png` });

  // 2. 真的注册一下（无 JS），看能不能落库 —— 这才是"渐进增强有效"的证据
  if (regForm.hasForm) {
    await page.fill('input[name="email"]', email).catch(() => {});
    await page.fill('input[name="password"]', password).catch(() => {});
    await page.click('button[type="submit"]').catch(() => {});
    await page.waitForTimeout(3000);
    const users = await db.query(`select id from "User" where email=$1`, [email]);
    check("无 JS 能完成注册（落库）", users.rowCount === 1, `rows=${users.rowCount}, url=${page.url()}`);
  }

  // ---- 以下用 JS 建好账号，再切回无 JS 验证"服务端渲染表单"是否可用 ----
  // 新开一个邮箱，避免与上面无 JS 注册的账号撞车
  const email2 = `nojs2-${Date.now()}@test.dev`;
  const jsCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const jsPage = await jsCtx.newPage();
  await jsPage.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await jsPage.getByLabel("邮箱").fill(email2);
  await jsPage.getByLabel("密码").fill(password);
  await jsPage.getByRole("button", { name: "注册并开始" }).click();
  let navOk = true;
  try {
    await jsPage.waitForURL("**/today", { timeout: 40000 });
  } catch (e) {
    navOk = false;
    console.log(`    注册后未跳到 /today（url=${jsPage.url()}）：${String(e.message).split("\n")[0]}`);
    const body = await jsPage.evaluate(() => document.body.innerText.slice(0, 200));
    console.log(`    页面文字: ${JSON.stringify(body)}`);
  }
  const cookies = await jsCtx.cookies();
  console.log(`    JS 注册: navOk=${navOk} cookies=${cookies.length}`);
  await jsCtx.close();
  emailsToClean.push(email2);

  if (cookies.length) {
    await ctx.addCookies(cookies);
    // 3. 打卡：服务端表单，无 JS 应可提交。
    // 定位要点：页面 header 里的「退出」也是 form，且打卡按钮在 sticky header 之下，
    // 普通 click 可能被判定为被遮挡——所以按文字精确定位 + focus 后回车。
    await page.goto(`${BASE}/checkin`, { waitUntil: "domcontentloaded" });
    console.log(`    带 cookie 访问 /checkin -> url=${page.url()}`);
    const checkinBtn = page.getByRole("button", { name: /^(打卡|今天已打卡)$/ });
    const btnCount = await checkinBtn.count();
    const btnText = btnCount ? ((await checkinBtn.first().textContent()) ?? "").trim() : "";
    const btnDisabled = btnCount ? await checkinBtn.first().isDisabled() : true;
    check("打卡页有可提交的原生表单", btnCount > 0, `按钮="${btnText}" disabled=${btnDisabled}`);
    if (btnCount > 0 && !btnDisabled) {
      await checkinBtn.first().focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3500);
      const c = await db.query(
        `select count(*)::int n from "CheckIn" where "userId"=(select id from "User" where email=$1)`,
        [email2],
      );
      check("无 JS 能完成打卡（落库）", c.rows[0].n >= 1, `rows=${c.rows[0].n}, url=${page.url()}`);
    }

    // 4. 建计划：同样是服务端表单（用 Enter 提交，理由同打卡）。
    // 注意要用按钮文字定位——页面 header 里的「退出」也是 type=submit，
    // 早先直接取第一个 submit 按钮，结果把登录态退掉了（测试写错，不是应用问题）。
    await page.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="title"]', "无 JS 验证计划").catch(() => {});
    await page.locator('input[name="title"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3500);
    const plans = await db.query(
      `select count(*)::int n from "Plan" where "userId"=(select id from "User" where email=$1)`,
      [email2],
    );
    check("无 JS 能创建计划（落库）", plans.rows[0].n >= 1, `rows=${plans.rows[0].n}, url=${page.url()}`);
    await page.screenshot({ path: `${OUT}plans-nojs.png` });
  } else {
    check("（跳过服务端表单验证：未能取得登录态）", false);
  }
} catch (e) {
  check("脚本未中断", false, String(e.message).split("\n")[0]);
} finally {
  await browser.close();
  for (const e of emailsToClean) await db.query(`delete from "User" where email=$1`, [e]);
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
console.log(`截图 -> scripts/design-shots/nojs/`);
process.exit(failed.length === 0 ? 0 : 1);
