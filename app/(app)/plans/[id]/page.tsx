import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Magnolia } from "@/components/dut/Magnolia";
import {
  archivePlanAction,
  createTaskAction,
  deleteTaskAction,
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
      status: true,
      tasks: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, done: true },
      },
    },
  });

  if (!plan) notFound();

  const doneCount = plan.tasks.filter((t) => t.done).length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6">
      <Link href="/plans" className="text-sm text-muted">
        ← 返回
      </Link>

      <div>
        <h1 className="text-xl font-medium tracking-tight text-ink">{plan.title}</h1>
        {plan.goal && <p className="mt-1 text-sm text-muted">{plan.goal}</p>}
        <p className="mt-1 text-xs text-muted">
          {doneCount} / {plan.tasks.length} 已完成
        </p>
      </div>

      <form
        action={createTaskAction}
        className="flex gap-2 rounded-xl bg-white p-4 ring-1 ring-line"
      >
        <input type="hidden" name="planId" value={plan.id} />
        <input
          name="title"
          required
          placeholder="加一个任务"
          className="h-11 flex-1 rounded-lg border border-line bg-white px-3 text-[15px] outline-none transition-colors duration-150 focus:border-dut"
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
          <Magnolia className="h-10 w-10" />
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
                  className={`tap h-5 w-5 shrink-0 rounded-full border transition-colors duration-150 ${
                    task.done ? "border-jade bg-jade" : "border-line hover:border-dut"
                  }`}
                />
                <span
                  className={`truncate text-[15px] transition-colors duration-150 ${
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
                  className="tap rounded-md px-1.5 py-1 text-xs text-muted/60 transition-colors duration-150 hover:text-amber"
                >
                  删除
                </button>
              </form>
            </li>
          ))}
        </ul>
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
