import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MagnoliaArt } from "@/components/dut/MagnoliaArt";
import { CopyStudyPrompt } from "@/components/study/CopyStudyPrompt";
import {
  archivePlanAction,
  createTaskAction,
  deleteTaskAction,
  saveLearningEvidenceAction,
  toggleTaskAction,
} from "@/lib/actions/study";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "计划详情" };

export default async function PlanDetailPage({ params }: PageProps<"/plans/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  const plan = await prisma.plan.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      goal: true,
      learnBuddyGuidance: true,
      independentResult: true,
      status: true,
      tasks: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, done: true },
      },
    },
  });

  if (!plan) notFound();

  const doneCount = plan.tasks.filter((t) => t.done).length;
  const nextTask = plan.tasks.find((t) => !t.done);
  const focus = plan.tasks.length
    ? await prisma.pomodoroSession.aggregate({
        where: { userId: user.id, taskId: { in: plan.tasks.map((t) => t.id) }, completed: true },
        _sum: { duration: true },
      })
    : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-5 px-5 py-6">
      <Link href="/plans" className="tap text-sm text-muted">
        ← 返回
      </Link>

      <div>
        <h1 className="text-xl font-medium text-ink [overflow-wrap:anywhere]">{plan.title}</h1>
        {plan.goal && <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">{plan.goal}</p>}
        <p className="mt-1 text-xs text-muted">
          {doneCount} / {plan.tasks.length} 项已完成 · 关联专注 {focus?._sum.duration ?? 0} 分钟
        </p>
      </div>

      <section className="border-y border-line py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-title font-medium text-ink">学习证据</h2>
            <p className="mt-1 text-xs text-muted">官方 LearnBuddy · 手动记录；学习台不会自动读取对话</p>
          </div>
          <CopyStudyPrompt title={plan.title} goal={plan.goal} />
        </div>
        <form action={saveLearningEvidenceAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="planId" value={plan.id} />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">连小理的关键提示</span>
            <textarea
              name="guidance"
              defaultValue={plan.learnBuddyGuidance ?? ""}
              maxLength={2000}
              rows={4}
              placeholder="摘录真实对话中帮助你推进的一两条提示"
              className="min-h-28 w-full resize-y rounded-md border border-line bg-white p-3 text-body text-ink outline-none focus:border-dut"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">我的独立验证</span>
            <textarea
              name="result"
              defaultValue={plan.independentResult ?? ""}
              maxLength={2000}
              rows={4}
              placeholder="写下重新解题的关键步骤、结果和仍有疑问的地方"
              className="min-h-28 w-full resize-y rounded-md border border-line bg-white p-3 text-body text-ink outline-none focus:border-dut"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">只填写真实过程；留空也可以稍后补充。</p>
            <button type="submit" className="press h-10 rounded-md bg-dut px-4 text-sm font-medium text-white">
              保存记录
            </button>
          </div>
        </form>
      </section>

      <form
        action={createTaskAction}
        className="flex gap-2 rounded-xl bg-white p-4 ring-1 ring-line"
      >
        <input type="hidden" name="planId" value={plan.id} />
        <input
          name="title"
          required
          maxLength={200}
          placeholder="加一个任务"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
        />
        <button
          type="submit"
          className="press h-11 shrink-0 rounded-lg bg-dut px-4 text-sm font-medium text-white"
        >
          添加
        </button>
      </form>

      {plan.tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white py-10 ring-1 ring-line">
          <MagnoliaArt className="h-10 w-10" />
          <p className="text-sm text-muted">还没有任务，加一个就能开始专注</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl bg-white ring-1 ring-line">
          {plan.tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-3">
              <form action={toggleTaskAction} className="flex min-w-0 flex-1 items-center gap-3">
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  type="submit"
                  aria-label={task.done ? "标记为未完成" : "标记为完成"}
                  className={`tap check-circle h-5 w-5 shrink-0 rounded-full border transition-colors duration-150 ${
                    task.done ? "check-pop border-jade bg-jade" : "border-line hover-dut"
                  }`}
                />
                <span
                  className={`min-w-0 text-body [overflow-wrap:anywhere] transition-colors duration-150 ${
                    task.done ? "text-muted line-through" : "text-ink"
                  }`}
                >
                  {task.title}
                </span>
              </form>
              <form action={deleteTaskAction} className="shrink-0">
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  type="submit"
                  aria-label="删除任务"
                  className="tap rounded-md px-1.5 py-1 text-xs text-muted/60 transition-colors duration-150 hover-amber"
                >
                  删除
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {plan.status === "active" && nextTask && (
        <Link
          href={`/focus?task=${encodeURIComponent(nextTask.id)}`}
          className="press flex h-11 items-center justify-center rounded-md bg-dut text-sm font-medium text-white"
        >
          专注完成下一项任务
        </Link>
      )}

      {plan.status === "active" && (
        <form action={archivePlanAction}>
          <input type="hidden" name="planId" value={plan.id} />
          <button type="submit" className="tap text-sm text-muted underline underline-offset-4">
            归档这个计划
          </button>
        </form>
      )}
    </div>
  );
}
