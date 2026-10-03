"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "今日" },
  { href: "/plans", label: "计划" },
  { href: "/focus", label: "专注" },
  { href: "/checkin", label: "打卡" },
  { href: "/chat", label: "连小理" },
];

export function BottomNav() {
  const pathname = usePathname();

  // safe-bottom / safe-x：把内容推离 iPhone 的 Home 指示条与横屏圆角，
  // 否则最后一排 tab 会被指示条压住（配合 layout 的 viewportFit: "cover"）。
  return (
    <nav className="safe-bottom safe-x sticky bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur">
      <ul className="mx-auto flex w-full max-w-2xl sm:max-w-3xl">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`tap nav-tab flex h-14 items-center justify-center text-sm ${
                  active ? "text-dut font-medium" : "text-muted"
                }`}
              >
                <span className="flex flex-col items-center gap-1">
                  {/* 圆点常驻占位（不用 bg-transparent 切换），只改变透明度与大小：
                      这样切 tab 时它是"淡入并长大"，而不是凭空出现。 */}
                  <span
                    className="nav-dot h-1 w-1 rounded-full bg-dut"
                    style={{
                      opacity: active ? 1 : 0,
                      transform: active ? "scale(1)" : "scale(0.5)",
                    }}
                  />
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
