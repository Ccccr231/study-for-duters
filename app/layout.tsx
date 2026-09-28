import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
