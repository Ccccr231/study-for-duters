import type { Metadata } from "next";
import { PlanList } from "@/components/study/PlanList";
import { createPlanAction } from "@/lib/actions/study";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "计划" };

const PAGE_SIZE = 30;

export default async function PlansPage({ searchParams }: PageProps<"/plans">) {
  const user = await requireUser();
  const { page: rawPage } = await searchParams;
  const parsedPage = Number(rawPage);
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const total = await prisma.plan.count({ where: { userId: user.id, status: "active" } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const plans = await prisma.plan.findMany({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      goal: true,
      _count: { select: { tasks: true } },
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-5 px-5 py-6">
      <h1 className="text-xl font-medium tracking-tight text-ink">学习计划</h1>

      <form
        action={createPlanAction}
        className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-line"
      >
        <input
          name="title"
          required
          maxLength={120}
          placeholder="计划名，例如「数据结构期末冲刺」"
          className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
        />
        <input
          name="goal"
          maxLength={500}
          placeholder="目标（可留空）"
          className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
        />
        <button
          type="submit"
          className="press h-10 rounded-lg bg-dut text-sm font-medium text-white"
        >
          新建计划
        </button>
      </form>

      <PlanList
        plans={plans}
        pagination={{ page, totalPages, previousHref: `/plans?page=${page - 1}`, nextHref: `/plans?page=${page + 1}` }}
      />
    </div>
  );
}
