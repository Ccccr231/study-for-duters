import { CheckInCalendar } from "@/components/study/CheckInCalendar";
import { checkInAction } from "@/lib/actions/study";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startOfToday } from "@/lib/date";

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
  const latest = checkIns.at(-1);

  // 连续天数：从最后一次打卡往回推，断一天就停
  let current = 0;
  if (latest && (latest.date.getTime() === today.getTime() || latest.date.getTime() === today.getTime() - 86400000)) {
    const sorted = [...checkIns].sort((a, b) => a.date.getTime() - b.date.getTime());
    let cursor = latest.date.getTime();
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].date.getTime() === cursor) {
        current += 1;
        cursor -= 86400000;
      } else break;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6">
      <h1 className="text-xl font-medium text-ink">打卡</h1>

      <section className="rounded-xl bg-white p-4 ring-1 ring-line">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-medium text-dut-deep">{current}</p>
            <p className="text-xs text-muted">当前连续天数</p>
          </div>
          <form action={checkInAction}>
            <button
              type="submit"
              disabled={checkedToday}
              className="h-10 rounded-lg bg-dut px-5 text-sm font-medium text-white disabled:bg-line disabled:text-muted"
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
