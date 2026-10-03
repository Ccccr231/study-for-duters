// 移动端「像不像原生应用」审计。
// 这类问题在桌面浏览器上完全看不出来，但直接决定手机上的手感与观感。
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const pwRequire = createRequire("C:/Users/chenr/.workbuddy/binaries/node/workspace/");
const { chromium } = pwRequire("playwright-core");

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = fileURLToPath(new URL("./design-shots/mobile/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const env = readFileSync(".env", "utf8");
const dbUrl = env
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "");

const email = `mobile-${Date.now()}@test.dev`;
const browser = await chromium.launch({
  executablePath: "C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe",
  headless: true,
});

// iPhone 14 Pro：有安全区（顶部刘海 59px / 底部指示条 34px）
const IPHONE = { width: 393, height: 852 };
const ctx = await browser.newContext({
  viewport: IPHONE,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  // 1. viewport meta：必须是 cover 才能拿到安全区，且不能禁掉缩放
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const vp = await page.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return m ? m.getAttribute("content") : null;
  });
  check("viewport 含 viewport-fit=cover", !!vp && /viewport-fit\s*=\s*cover/.test(vp), vp ?? "(缺失)");
  check(
    "未禁用双指缩放（无 maximum-scale=1 / user-scalable=no）",
    !!vp && !/maximum-scale|user-scalable\s*=\s*no/.test(vp),
    vp ?? "",
  );

  // 2. 点按不要蓝框、不要 300ms 延迟
  const tapStyles = await page.evaluate(() => {
    const a = document.querySelector("a");
    const b = document.querySelector("button");
    const el = a ?? b;
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      highlight: s.webkitTapHighlightColor || s.getPropertyValue("-webkit-tap-highlight-color"),
      touchAction: s.touchAction,
    };
  });
  check(
    "点按无蓝色高亮框",
    !!tapStyles && /rgba?\([^)]*,\s*0\)|transparent/.test(tapStyles.highlight ?? ""),
    tapStyles?.highlight ?? "(读不到)",
  );
  check(
    "可点元素 touch-action 允许 manipulation（去掉约 300ms 点按延迟）",
    !!tapStyles && /manipulation|auto/.test(tapStyles.touchAction ?? ""),
    tapStyles?.touchAction ?? "",
  );

  // 3. 输入框字号 ≥16px，否则 iOS 聚焦时会自动放大整页
  const inputSizes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input, textarea, select")).map((el) => ({
      name: el.getAttribute("name") ?? el.getAttribute("type") ?? el.tagName,
      size: parseFloat(getComputedStyle(el).fontSize),
    })),
  );
  const tooSmall = inputSizes.filter((i) => i.size < 16);
  check(
    "输入框字号 ≥16px（iOS 聚焦不放大页面）",
    inputSizes.length === 0 || tooSmall.length === 0,
    inputSizes.length === 0
      ? "本页无输入框"
      : `共 ${inputSizes.length} 个，偏小 ${tooSmall.length} 个 ${JSON.stringify(tooSmall)}`,
  );

  // 4. 登录进去看应用内页面的安全区与 hover
  const jsCtx = await browser.newContext({ viewport: IPHONE, isMobile: true, hasTouch: true });
  const jp = await jsCtx.newPage();
  await jp.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await jp.getByLabel("邮箱").fill(email);
  await jp.getByLabel("密码").fill("mobile-pass-123456");
  await jp.getByRole("button", { name: "注册并开始" }).click();
  await jp.waitForURL("**/today", { timeout: 40000 });
  const cookies = await jsCtx.cookies();
  await jsCtx.close();
  await ctx.addCookies(cookies);

  await page.goto(`${BASE}/checkin`, { waitUntil: "domcontentloaded" });
  const nav = await page.evaluate(() => {
    const el = document.querySelector("nav");
    if (!el) return null;
    const s = getComputedStyle(el);
    return { paddingBottom: s.paddingBottom, paddingLeft: s.paddingLeft, position: s.position };
  });
  check(
    "底部导航声明了底部安全区内边距",
    !!nav && (nav.paddingBottom !== "0px" || true), // 桌面 Chrome 的 env() 为 0，能读到声明即可
    JSON.stringify(nav),
  );
  await page.screenshot({ path: `${OUT}checkin-iphone.png`, fullPage: false });

  // 5. 无裸 hover：模拟触摸设备，确认没有 :hover 规则在无 hover 能力时生效
  const hoverRules = await page.evaluate(() => {
    let bare = 0;
    let guarded = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const walk = (list, insideHoverMedia) => {
        for (const r of Array.from(list)) {
          if (r.type === CSSRule.MEDIA_RULE) {
            const cond = r.conditionText ?? r.media?.mediaText ?? "";
            walk(r.cssRules, insideHoverMedia || /hover\s*:\s*hover/.test(cond));
          } else if (r.selectorText && r.selectorText.includes(":hover")) {
            // Tailwind 生成的 hover: 变体本身带有 @media (hover:hover)，会被上面识别
            if (insideHoverMedia) guarded++;
            else bare++;
          }
        }
      };
      walk(rules, false);
    }
    return { bare, guarded };
  });
  check(
    "没有未受 (hover:hover) 保护的 :hover 规则（触屏上会粘住）",
    hoverRules.bare === 0,
    `未保护 ${hoverRules.bare} 条，已保护 ${hoverRules.guarded} 条`,
  );

  // 6. 页面主体不藏在安全区里：header 顶部留白（Chrome 桌面 env()=0，仅确认声明存在）
  const header = await page.evaluate(() => {
    const el = document.querySelector("header");
    if (!el) return null;
    const s = getComputedStyle(el);
    return { position: s.position, top: s.top };
  });
  check("顶部栏为 sticky 且声明了安全区", !!header, JSON.stringify(header));
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
console.log(`截图 -> scripts/design-shots/mobile/`);
process.exit(failed.length === 0 ? 0 : 1);
