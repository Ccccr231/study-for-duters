import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanList, type PlanSummary } from "@/components/study/PlanList";

const demo: PlanSummary[] = [
  { id: "demo-1", title: "高等数学：Stolz 定理", goal: "判断适用条件，独立完成一道极限题", _count: { tasks: 3 } },
  { id: "demo-2", title: "大学英语阅读", goal: "本周完成两篇精读", _count: { tasks: 2 } },
];

const worst: PlanSummary[] = [
  {
    id: "worst-1",
    title: "高等数学：Stolz 定理在分子分母均含有递推数列和根式时的适用条件与差分计算",
    goal: "先判断分母是否严格递增并趋于无穷，再计算相邻项差分，最后独立复做一道同类型极限题。",
    _count: { tasks: 1284 },
  },
  {
    id: "worst-2",
    title: "lim_{n→∞}(√(n²+n)+√(n²+2n)+···+√(n²+n²))/(n²+n)",
    goal: "https://example.com/course/advanced-mathematics/limits/stolz-theorem/problem-set/2026-fall?section=independent-practice",
    _count: { tasks: 1 },
  },
  { id: "worst-3", title: "极限", goal: null, _count: { tasks: 0 } },
  { id: "worst-4", title: "極限の応用と計算 · تطبيقات النهايات", goal: "<script>alert(1)</script> 是待处理的原样文本", _count: { tasks: 1000000 } },
];

const cases = [
  ["demo", "Demo data"],
  ["worst", "Worst case"],
  ["empty", "Empty"],
  ["one", "One"],
  ["thousand", "1,000 rows"],
] as const;

const PAGE_SIZE = 30;

export default async function PlanPreviewPage({ searchParams }: { searchParams: Promise<{ data?: string; page?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { data, page: rawPage } = await searchParams;
  const selected = cases.some(([value]) => value === data) ? data : "demo";
  const allPlans = selected === "worst" ? worst
    : selected === "empty" ? []
    : selected === "one" ? [worst[0]]
    : selected === "thousand"
      ? Array.from({ length: 1000 }, (_, i) => ({ ...worst[i % worst.length], id: `stress-${i}` }))
      : demo;
  const totalPages = Math.max(1, Math.ceil(allPlans.length / PAGE_SIZE));
  const parsedPage = Number(rawPage);
  const page = Math.min(Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1, totalPages);
  const plans = allPlans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-24 sm:max-w-3xl">
      <h1 className="mb-4 text-xl font-medium text-ink">学习计划</h1>
      <PlanList
        plans={plans}
        pagination={{
          page,
          totalPages,
          previousHref: `/dev/plan-preview?data=${selected}&page=${page - 1}`,
          nextHref: `/dev/plan-preview?data=${selected}&page=${page + 1}`,
        }}
      />
      <nav aria-label="测试数据" className="fixed inset-x-2 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100vw-1rem)] overflow-x-auto rounded-md border border-line bg-white p-1 shadow-lg">
        {cases.map(([value, label]) => (
          <Link
            key={value}
            href={`/dev/plan-preview?data=${value}`}
            aria-current={selected === value ? "page" : undefined}
            className={`shrink-0 rounded px-2 py-1.5 text-xs ${selected === value ? "bg-line text-ink" : "text-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
