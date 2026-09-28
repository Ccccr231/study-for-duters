import Link from "next/link";
import type { Metadata } from "next";
import { Magnolia } from "@/components/dut/Magnolia";
import { createPlanAction } from "@/lib/actions/study";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "计划" };

export default async function PlansPage() {
  const user = await requireUser();

  const plans = await prisma.plan.findMany({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      goal: true,
      endDate: true,
      _count: { select: { tasks: true } },
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6">
      <h1 className="text-xl font-medium text-ink">学习计划</h1>

      <form
        action={createPlanAction}
        className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-line"
      >
        <input
          name="title"
          required
          placeholder="计划名，例如「数据结构期末冲刺」"
          className="h-11 rounded-lg border border-line bg-white px-3 text-[15px] outline-none focus:border-dut"
        />
        <input
          name="goal"
          placeholder="目标（可留空）"
          className="h-11 rounded-lg border border-line bg-white px-3 text-[15px] outline-none focus:border-dut"
        />
        <button
          type="submit"
          className="h-10 rounded-lg bg-dut text-sm font-medium text-white"
        >
          新建计划
        </button>
      </form>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white py-10 ring-1 ring-line">
          <Magnolia className="h-10 w-10" />
          <p className="text-sm text-muted">还没有计划，先建一个</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link
                href={`/plans/${plan.id}`}
                className="block rounded-xl bg-white p-4 ring-1 ring-line"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-medium text-ink">{plan.title}</h2>
                  <span className="text-xs text-muted">{plan._count.tasks} 个任务</span>
                </div>
                {plan.goal && <p className="mt-1 text-sm text-muted">{plan.goal}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
