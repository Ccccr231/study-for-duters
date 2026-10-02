import Link from "next/link";
import type { Metadata } from "next";
import { WaveDivider } from "@/components/dut/WaveDivider";
import { Magnolia } from "@/components/dut/Magnolia";
import { TodayTasks } from "@/components/study/TodayTasks";
import { checkInAction } from "@/lib/actions/study";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatChineseDate, startOfToday } from "@/lib/date";

export const metadata: Metadata = { title: "今日" };

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
          <p className="text-xs tracking-wide text-white/70">{formatChineseDate(new Date())}</p>
          <h1 className="mt-2 text-[26px] leading-tight font-medium tracking-tight">
            {user.name ? `${user.name}，今天` : "今天"}先做点什么？
          </h1>
          {activePlan && (
            <Link
              href={`/plans/${activePlan.id}`}
              className="mt-2.5 inline-block text-sm text-white/85 underline decoration-white/30 underline-offset-4"
            >
              进行中：{activePlan.title}
            </Link>
          )}
          {/* 数字是这一屏的主角：加大字号、收紧字距（光学调整），标签退到次要层级 */}
          <div className="mt-6 flex gap-7 pb-7">
            {[
              [focusMinutes, "今日专注（分钟）"],
              [sessions.length, "完成番茄"],
              [streak, "连续打卡（天）"],
            ].map(([value, label]) => (
              <div key={label as string}>
                <p className="text-[28px] leading-none font-medium tracking-tight tabular-nums">
                  {value}
                </p>
                <p className="mt-1.5 text-[11px] tracking-wide text-white/70">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <WaveDivider className="h-10 w-full" />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5">
        {/* 打卡 */}
        <section className="rounded-xl bg-white p-4 ring-1 ring-line">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-ink">今日打卡</h2>
              <p className="mt-0.5 text-xs text-muted">
                {checkedToday
                  ? `已打卡，连续 ${streak} 天，别断。`
                  : streak > 0
                    ? `上次连续 ${streak} 天，今天还没打卡。`
                    : "第一次打卡，从今天开始。"}
              </p>
            </div>
            <form action={checkInAction} className="shrink-0">
              <button
                type="submit"
                disabled={checkedToday}
                className="press h-10 rounded-lg bg-dut px-4 text-sm font-medium text-white disabled:bg-line disabled:text-muted"
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
              <Link href={`/plans/${activePlan.id}`} className="tap text-xs text-dut">
                管理任务
              </Link>
            )}
          </div>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <Magnolia className="h-10 w-10" />
              <p className="text-sm text-muted">今天还没安排任务</p>
              <Link href="/plans" className="tap text-sm text-dut">
                去建一个学习计划
              </Link>
            </div>
          ) : (
            <TodayTasks tasks={tasks} />
          )}
        </section>

        <Link
          href="/focus"
          className="press flex h-12 items-center justify-center rounded-xl bg-dut text-[15px] font-medium text-white"
        >
          开始 25 分钟专注
        </Link>
      </div>
    </div>
  );
}
