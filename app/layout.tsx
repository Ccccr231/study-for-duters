import type { Metadata, Viewport } from "next";
import { FirstVisitIntro } from "@/components/shell/FirstVisitIntro";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Study for DUTERS · 连小理学习台",
    template: "%s · Study for DUTERS",
  },
  description:
    "面向大连理工学生（DUTERS）的学习台：计划 → 专注 → 打卡 → 复盘。个人开源项目，非官方。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a5fb4",
};

/**
 * 在首帧之前决定要不要播开场序列，避免"先渲染再隐藏"的闪烁。
 * 必须阻塞执行（不能 defer/async），这也是 Next 官方推荐的防闪模式。
 * 标记键要与 FirstVisitIntro.tsx 里的 SEEN_KEY 保持一致。
 */
const INTRO_BOOTSTRAP = `(function(){try{
var m=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var seen=window.localStorage.getItem('dut:intro-seen');
if(seen||m){document.documentElement.dataset.intro='off';return}
document.documentElement.dataset.intro='1';
window.localStorage.setItem('dut:intro-seen','1');
}catch(e){document.documentElement.dataset.intro='off'}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col">
        <FirstVisitIntro />
        {children}
      </body>
    </html>
  );
}
