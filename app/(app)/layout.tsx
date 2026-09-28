import type { ReactNode } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/shell/BottomNav";
import { logoutAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
          <Link href="/today" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dut text-xs text-white">
              连
            </span>
            <span className="text-sm font-medium text-dut-deep">连小理</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">
              {user.name ?? user.email}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-muted">
                退出
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
      <BottomNav />
    </div>
  );
}
