import type { Metadata } from "next";
import { CheckInCalendar } from "@/components/study/CheckInCalendar";
import { checkInAction } from "@/lib/actions/study";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startOfToday } from "@/lib/date";
import { computeStreak } from "@/lib/streak";

export const metadata: Metadata = { title: "打卡" };

export default async function CheckInPage() {
  const user = await requireUser();
  const today = startOfToday();

  const checkIns = await prisma.checkIn.findMany({
    where: { userId: user.id, date: { gte: new Date(today.getTime() - 83 * 86400000) } },
    orderBy: { date: "asc" },
    select: { date: true },
  });

  const days = checkIns.map((c) => c.date.toISOString().slice(0, 10));
  const checkedToday = days.includes(today.toISOString().slice(0, 10));
  // 连续天数统一走 lib/streak.ts 的纯函数（与报告、连小理共用同一套规则）
  const current = computeStreak(days, today.toISOString().slice(0, 10));

  return (
    <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-5 px-5 py-6">
      <h1 className="text-xl font-medium tracking-tight text-ink">打卡</h1>

      <section className="rounded-xl bg-white p-4 ring-1 ring-line">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-stat leading-none font-medium tracking-tight tabular-nums text-dut-deep">
              {current}
            </p>
            <p className="mt-1.5 text-meta tracking-wide text-muted">当前连续天数</p>
          </div>
          <form action={checkInAction}>
            <button
              type="submit"
              disabled={checkedToday}
              className="press h-10 rounded-lg bg-dut px-5 text-sm font-medium text-white disabled:bg-line disabled:text-muted"
            >
              {checkedToday ? "今天已打卡" : "打卡"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 ring-1 ring-line">
        <h2 className="mb-3 text-sm font-medium text-ink">最近 12 周</h2>
        <CheckInCalendar days={days} />
        <p className="mt-3 text-xs text-muted">
          深蓝为当天打过卡，浅蓝为没打，虚框为今天。
        </p>
      </section>

      <p className="text-xs text-muted">
        最近 12 周共 {checkIns.length} 次打卡。日期按 UTC 切日，见 lib/date.ts 的说明。
      </p>
    </div>
  );
}
