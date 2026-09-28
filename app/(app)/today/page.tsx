import Link from "next/link";
import { WaveDivider } from "@/components/dut/WaveDivider";
import { Magnolia } from "@/components/dut/Magnolia";
import { TodayTasks } from "@/components/study/TodayTasks";
import { checkInAction } from "@/lib/actions/study";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatChineseDate, startOfToday } from "@/lib/date";

export default async function TodayPage() {
  const user = await requireUser();
  const today = startOfToday();

  const [tasks, sessions, lastCheckIn, activePlan] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, done: false },
      orderBy: { sortOrder: "asc" },
      take: 6,
      select: { id: true, title: true, planId: true, dueDate: true },
    }),
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, startedAt: { gte: today }, completed: true },
      select: { duration: true },
    }),
    prisma.checkIn.findFirst({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      select: { date: true, streak: true },
    }),
    prisma.plan.findFirst({
      where: { userId: user.id, status: "active" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  const focusMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  const checkedToday = lastCheckIn?.date.getTime() === today.getTime();
  const streak = lastCheckIn?.streak ?? 0;

  return (
    <div className="flex flex-col pb-8">
      <section className="bg-dut px-5 pt-6 text-white">
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-sm opacity-80">{formatChineseDate(new Date())}</p>
          <h1 className="mt-1 text-2xl font-medium">
            {user.name ? `${user.name}，今天` : "今天"}先做点什么？
          </h1>
          {activePlan && (
            <Link
              href={`/plans/${activePlan.id}`}
              className="mt-2 inline-block text-sm opacity-90 underline decoration-white/40"
            >
              进行中：{activePlan.title}
            </Link>
          )}
          <div className="mt-5 flex gap-6 pb-6">
            <div>
              <p className="text-2xl font-medium">{focusMinutes}</p>
              <p className="text-xs opacity-80">今日专注（分钟）</p>
            </div>
            <div>
              <p className="text-2xl font-medium">{sessions.length}</p>
              <p className="text-xs opacity-80">完成番茄</p>
            </div>
            <div>
              <p className="text-2xl font-medium">{streak}</p>
              <p className="text-xs opacity-80">连续打卡（天）</p>
            </div>
          </div>
        </div>
      </section>
      <WaveDivider className="h-10 w-full" />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5">
        {/* 打卡 */}
        <section className="rounded-xl bg-white p-4 ring-1 ring-line">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-ink">今日打卡</h2>
              <p className="mt-0.5 text-xs text-muted">
                {checkedToday
                  ? `已打卡，连续 ${streak} 天，别断。`
                  : streak > 0
                    ? `上次连续 ${streak} 天，今天还没打卡。`
                    : "第一次打卡，从今天开始。"}
              </p>
            </div>
            <form action={checkInAction}>
              <button
                type="submit"
                disabled={checkedToday}
                className="h-10 rounded-lg bg-dut px-4 text-sm text-white disabled:bg-line disabled:text-muted"
              >
                {checkedToday ? "已打卡" : "打卡"}
              </button>
            </form>
          </div>
        </section>

        {/* 今日任务 */}
        <section className="rounded-xl bg-white p-4 ring-1 ring-line">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">待办</h2>
            {activePlan && (
              <Link href={`/plans/${activePlan.id}`} className="text-xs text-dut">
                管理任务
              </Link>
            )}
          </div>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <Magnolia className="h-10 w-10" />
              <p className="text-sm text-muted">今天还没安排任务</p>
              <Link href="/plans" className="text-sm text-dut">
                去建一个学习计划
              </Link>
            </div>
          ) : (
            <TodayTasks tasks={tasks} />
          )}
        </section>

        <Link
          href="/focus"
          className="flex h-12 items-center justify-center rounded-xl bg-dut text-[15px] font-medium text-white"
        >
          开始 25 分钟专注
        </Link>
      </div>
    </div>
  );
}
