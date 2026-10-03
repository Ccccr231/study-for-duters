import type { Metadata } from "next";
import { ReportPanel } from "@/components/reports/ReportPanel";

export const metadata: Metadata = { title: "学习报告" };
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatChineseDate, startOfToday } from "@/lib/date";
import { dateKey } from "@/lib/streak";
import { computeMetrics } from "@/lib/report/compute";
import type { SuggestedAction } from "@/lib/report/narration";

/** Report.stats 是 Json 字段，小心地取出建议 action。 */
function extractActions(stats: unknown): SuggestedAction[] {
  if (typeof stats !== "object" || stats === null) return [];
  const actions = (stats as { actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [];
  return actions.filter(
    (a): a is SuggestedAction =>
      typeof a === "object" &&
      a !== null &&
      (a as { type?: unknown }).type === "create_task" &&
      typeof (a as { title?: unknown }).title === "string" &&
      typeof (a as { reason?: unknown }).reason === "string",
  );
}

export default async function ReportsPage() {
  const user = await requireUser();
  const today = startOfToday();
  const todayKey = dateKey(today);
  const weekStart = new Date(today.getTime() - 6 * 86400000);

  const [sessions, tasks, checkIns, reports] = await Promise.all([
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, startedAt: { gte: weekStart } },
      select: { startedAt: true, duration: true, completed: true },
    }),
    prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, done: true, createdAt: true, dueDate: true },
    }),
    prisma.checkIn.findMany({
      where: { userId: user.id, date: { gte: new Date(today.getTime() - 60 * 86400000) } },
      select: { date: true },
    }),
    prisma.report.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 8,
    }),
  ]);

  const metrics = computeMetrics({
    today: todayKey,
    sessions: sessions.map((s) => ({
      day: dateKey(s.startedAt),
      duration: s.duration,
      completed: s.completed,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      createdDay: dateKey(t.createdAt),
      dueDay: t.dueDate ? dateKey(t.dueDate) : null,
    })),
    checkInDays: checkIns.map((c) => dateKey(c.date)),
  });

  const todayReport = reports.find((r) => dateKey(r.date) === todayKey);
  const pastReports = reports.filter((r) => dateKey(r.date) !== todayKey);
  const suggestions = todayReport ? extractActions(todayReport.stats) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-5 px-5 py-6">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-ink">学习报告</h1>
        <p className="mt-1 text-xs text-muted">{formatChineseDate(today)}</p>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 ring-1 ring-line">
          <p className="text-2xl font-medium tracking-tight tabular-nums text-dut-deep">{metrics.focusMinutesToday}</p>
          <p className="text-xs text-muted">今日专注（分钟 · {metrics.pomodorosToday} 个番茄）</p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-line">
          <p className="text-2xl font-medium tracking-tight tabular-nums text-dut-deep">{metrics.focusMinutes7d}</p>
          <p className="text-xs text-muted">近 7 天专注（分钟）</p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-line">
          <p className="text-2xl font-medium tracking-tight tabular-nums text-dut-deep">
            {metrics.completionRate7d === null
              ? "—"
              : `${metrics.doneTasks7d}/${metrics.dueTasks7d}`}
          </p>
          <p className="text-xs text-muted">近 7 天到期任务完成</p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-line">
          <p className="text-2xl font-medium tracking-tight tabular-nums text-dut-deep">{metrics.streakDays}</p>
          <p className="text-xs text-muted">连续打卡（天）</p>
        </div>
      </section>

      {metrics.staleTasks.length > 0 && (
        <section className="rounded-xl bg-white p-4 ring-1 ring-line">
          <h2 className="text-sm font-medium text-ink">停滞任务</h2>
          <p className="mt-1 text-xs text-muted">超过 2 天没推进，建议今天挑一个最小步骤开始：</p>
          <ul className="mt-2 list-inside list-disc text-sm text-ink">
            {metrics.staleTasks.slice(0, 5).map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        </section>
      )}

      <ReportPanel date={todayKey} hasReport={Boolean(todayReport)} />

      {todayReport && (
        <section className="rounded-xl bg-white p-4 ring-1 ring-line">
          <h2 className="text-sm font-medium text-ink">今日报告</h2>
          <p className="mt-2 whitespace-pre-wrap text-body text-ink">{todayReport.content}</p>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="rounded-xl bg-white p-4 ring-1 ring-line">
          <h2 className="text-sm font-medium text-ink">连小理建议</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {suggestions.map((a, i) => (
              <li key={i} className="text-sm text-ink">
                <span className="font-medium text-dut">建议新建任务：</span>
                {a.title}
                <span className="block text-xs text-muted">{a.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">AI 不会替你写库，觉得合适就到「计划」里手动加上。</p>
        </section>
      )}

      {pastReports.length > 0 && (
        <section className="rounded-xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-2 text-sm font-medium text-ink">最近的报告</h2>
          <ul className="flex flex-col gap-3">
            {pastReports.map((r) => (
              <li key={r.id}>
                <p className="text-xs text-muted">{formatChineseDate(r.date)}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-ink">{r.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
