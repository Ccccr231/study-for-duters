"use client";

import { usePathname } from "next/navigation";

/**
 * 路由级入场过渡：内容随 pathname 变化重新挂载，并播一次轻微的上浮淡入。
 *
 * 为什么不用 View Transitions / React 的 <ViewTransition>（Next 文档推荐的那套）：
 * 那些 API 依赖 React canary，而本项目 react@19.2.8 里
 * `typeof ViewTransition === 'undefined'`（已实测），写了也不生效。
 * 与其留一段看起来对、实际不工作的代码，不如用一个可靠实现的入场动画。
 *
 * 关键设计：用 pathname 作 key。
 * - 切页面（/today → /focus）→ pathname 变 → 重新挂载 → 播入场。
 * - `router.refresh()`（打卡、勾选任务后刷新数据）不改 pathname，
 *   所以不会重挂载、不会重放动画——不会在用户刚操作完时闪一下。
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="route-in">
      {children}
    </div>
  );
}
