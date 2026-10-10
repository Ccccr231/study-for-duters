import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Study for DUTERS · 学习台",
    template: "%s · Study for DUTERS",
  },
  description:
    "面向大连理工学生（DUTERS）的学习台：计划 → 专注 → 打卡 → 复盘。个人开源项目，非官方。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 不要 maximumScale / userScalable: false —— 那会禁掉双指缩放，
  // 对视力不佳的用户是实打实的伤害，而且 iOS 本来就忽略它。
  // viewportFit: "cover" 让页面延伸到刘海/圆角区域，
  // 再由 .safe-top / .safe-bottom 把内容推回安全区（见 globals.css）。
  viewportFit: "cover",
  themeColor: "#1a5fb4",
};

/**
 * 在首帧之前决定要不要播开场序列，避免"先渲染再隐藏"的闪烁。
 * 必须阻塞执行（不能 defer/async），这也是 Next 官方推荐的防闪模式。
 *
 * 用 sessionStorage 而不是 localStorage：**每个标签页会话播一次**。
 * - 会话内刷新 / 切页面 → 不再播（否则每次刷新都等 2.4 秒就成阻碍了）
 * - 关掉标签页重新打开、或开新标签 → 再播一次（保留仪式感）
 * 想改成只播一次，把 sessionStorage 换成 localStorage 即可。
 *
 * 注意：这里**只判断、不写标记**。标记由 FirstVisitIntro 真正挂载时写入，
 * 这样"直接打开 /login"的人不会被记为已看过，之后正常进落地页还能看到开场。
 */
const INTRO_BOOTSTRAP = `(function(){try{
var m=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var seen=window.sessionStorage.getItem('dut:intro-seen');
document.documentElement.dataset.intro=(!seen&&!m)?'1':'off';
}catch(e){document.documentElement.dataset.intro='off'}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-intro 的**默认值是 off**，脚本在首帧前把它改成 "1" 才播开场。
    // 这样禁用 JS 时开场层保持隐藏（否则那个全屏层会永久遮住整页）。
    <html lang="zh-CN" className="h-full antialiased" data-intro="off" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_BOOTSTRAP }} />
      </head>
      {/* 开场序列不放在这里：它只在落地页播。
          放在 root layout 会导致「第一次访问 /login 也先播 2.4 秒校徽」，
          用户还没进应用就被拦住。 */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
