"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "今日" },
  { href: "/plans", label: "计划" },
  { href: "/focus", label: "专注" },
  { href: "/checkin", label: "打卡" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur">
      <ul className="mx-auto flex w-full max-w-2xl">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex h-14 items-center justify-center text-sm ${
                  active ? "text-dut font-medium" : "text-muted"
                }`}
              >
                <span className="flex flex-col items-center gap-1">
                  <span
                    className={`h-1 w-1 rounded-full ${active ? "bg-dut" : "bg-transparent"}`}
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
