import type { ReactNode } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/shell/BottomNav";
import { RouteTransition } from "@/components/shell/RouteTransition";
import { logoutAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* safe-top / safe-x：状态栏与横屏圆角区域不要被内容盖住 */}
      <header className="safe-top safe-x sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        {/* 内容宽度：手机全宽、桌面 768px。此前固定 672px，
            在 1280px 屏上左右各留一条空带，视觉上像被夹住。 */}
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4 sm:max-w-3xl">
          <Link href="/today" className="tap flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dut text-xs text-white">
              连
            </span>
            <span className="text-sm font-medium text-dut-deep">连小理</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/knowledge" className="tap text-sm text-muted transition-colors duration-150 hover-ink">
              资料
            </Link>
            <Link href="/reports" className="tap text-sm text-muted transition-colors duration-150 hover-ink">
              报告
            </Link>
            <Link href="/settings/model" className="tap text-sm text-muted transition-colors duration-150 hover-ink">
              设置
            </Link>
            <span className="hidden text-sm text-muted sm:inline">
              {user.name ?? user.email}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="tap text-sm text-muted transition-colors duration-150 hover-ink"
              >
                退出
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* 路由级入场过渡：pathname 变就重挂载并播一次上浮淡入。
          放在 layout 一处生效、覆盖全部子页面；
          router.refresh()（打卡/勾选任务后刷新数据）不改 pathname，所以不会重放。 */}
      <main className="flex-1">
        <RouteTransition>{children}</RouteTransition>
      </main>
      <BottomNav />
    </div>
  );
}
