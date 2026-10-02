"use client";

import { useEffect, useState } from "react";
import { Emblem } from "@/components/dut/Emblem";

/** 与 globals.css 的 --intro-dur 默认值保持一致 */
const DURATION_MS = 2400;

/** 校训：一进校门就看得到的那八个字，放在这里是最直接的情绪锚点。 */
const MOTTO = ["海", "纳", "百", "川", "自", "强", "不", "息"];

/**
 * 首次进入的开场序列：校徽从远处脱焦推进（dolly zoom）→ 合焦铺满 → 淡出露出主界面。
 *
 * 几个刻意的取舍：
 * - **只播一次**（localStorage）。开场是「罕见/首次」场景，可以给到戏剧性；
 *   但每次刷新都放 2.4 秒动画会变成纯粹的阻碍——那正是 Emil 说的"高频元素不该有动画"。
 * - **显隐由 data-intro 属性 + CSS 决定**（见 globals.css 的 [data-intro="off"]），
 *   不由 React state 决定。因为服务端首帧一定会渲染这个层，
 *   若靠 state 隐藏，返回访问者每次加载都会先看到它闪一下。
 * - **纯 CSS 动画**，不用 JS 逐帧：序列是预定好的、不可中断的，用 CSS 跑在合成线程上，
 *   页面正在加载时也不会掉帧。
 * - **不阻塞交互**：容器 pointer-events:none，动画结束后会从 DOM 卸载。
 * - **prefers-reduced-motion 下退化为一次短淡出**（见 globals.css），不做推进。
 */
export function FirstVisitIntro() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // 不是本次要播（已看过 / 减弱动效），无需定时器——CSS 已经把它藏起来了
    if (document.documentElement.dataset.intro !== "1") return;

    // 动画结束后卸载，避免一个全屏 fixed 层长期占着合成层
    const unmountTimer = window.setTimeout(() => setDone(true), DURATION_MS + 100);
    return () => window.clearTimeout(unmountTimer);
  }, []);

  if (done) return null;

  return (
    <div
      className="intro pointer-events-none"
      style={{ "--intro-dur": `${DURATION_MS}ms` } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="intro-glow" />
      <div className="intro-emblem">
        <Emblem className="h-40 w-40 drop-shadow-[0_18px_50px_rgba(0,0,0,0.35)] sm:h-48 sm:w-48" />
      </div>
      <p className="intro-motto">{MOTTO.join(" · ")}</p>
    </div>
  );
}
