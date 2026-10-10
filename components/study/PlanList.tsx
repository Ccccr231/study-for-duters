import Link from "next/link";
import { MagnoliaArt } from "@/components/dut/MagnoliaArt";

export type PlanSummary = {
  id: string;
  title: string;
  goal: string | null;
  _count: { tasks: number };
};

type Pagination = { page: number; totalPages: number; previousHref: string; nextHref: string };
const numberFormatter = new Intl.NumberFormat("zh-CN");

export function PlanList({ plans, pagination }: { plans: PlanSummary[]; pagination?: Pagination }) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10">
        <MagnoliaArt className="h-10 w-10" />
        <p className="text-sm text-muted">还没有计划，先建一个</p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {plans.map((plan) => (
          <li key={plan.id}>
            <Link href={`/plans/${plan.id}`} className="tap block py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 dir="auto" className="min-w-0 text-body font-medium text-ink [overflow-wrap:anywhere]">
                  {plan.title}
                </h2>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {numberFormatter.format(plan._count.tasks)} 个任务
                </span>
              </div>
              {plan.goal && (
                <p dir="auto" className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">
                  {plan.goal}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {pagination && pagination.totalPages > 1 && (
        <nav aria-label="计划分页" className="flex items-center justify-between gap-3 pt-3 text-sm">
          {pagination.page > 1 ? <Link href={pagination.previousHref} className="tap text-dut-deep">上一页</Link> : <span />}
          <span className="tabular-nums text-muted">{pagination.page} / {pagination.totalPages}</span>
          {pagination.page < pagination.totalPages ? <Link href={pagination.nextHref} className="tap text-dut-deep">下一页</Link> : <span />}
        </nav>
      )}
    </>
  );
}
