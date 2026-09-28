import type { Metadata } from "next";
import { Magnolia } from "@/components/dut/Magnolia";
import { PomodoroTimer } from "@/components/study/PomodoroTimer";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startOfToday } from "@/lib/date";

export const metadata: Metadata = { title: "专注" };

export default async function FocusPage() {
  const user = await requireUser();

  const [tasks, sessions] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, done: false },
      orderBy: { sortOrder: "asc" },
      take: 20,
      select: { id: true, title: true },
    }),
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, startedAt: { gte: startOfToday() }, completed: true },
      select: { duration: true },
    }),
  ]);

  const minutes = sessions.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-5 py-6">
      <div className="flex w-full items-center justify-between">
        <h1 className="text-xl font-medium text-ink">专注</h1>
        <div className="text-right">
          <p className="text-sm text-ink">{minutes} 分钟</p>
          <p className="text-xs text-muted">今日累计</p>
        </div>
      </div>

      <PomodoroTimer tasks={tasks} />

      {tasks.length === 0 && (
        <div className="flex w-full items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-line">
          <Magnolia className="h-8 w-8 shrink-0" />
          <p className="text-sm text-muted">
            还没有未完成的任务。不影响专注，但关联任务后统计更准。
          </p>
        </div>
      )}
    </div>
  );
}
