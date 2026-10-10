"use client";

import { useState } from "react";
import { artSrcSet, SIZES } from "@/components/dut/art-sizes";

/**
 * 大工校徽。
 *
 * ⚠️ 合规提醒（原 PLAN §6.3 的约定，现按用户明确要求改为使用官方校徽）
 * 校徽、校名标准字的使用受学校 VI 管理办法约束，以经营为目的使用需申请许可。
 * 本项目的口径仍是「面向 DUT 学生的个人/开源项目，非官方」，使用校徽不代表校方出品。
 * 若日后需要回归「自绘标识」，把 EMBLEM_SRC 换成自绘的 SVG 即可，无需改其它代码。
 *
 * 资源：public/dut-emblem.png —— 由官方 JPEG 抠去圆外留白后生成（透明 PNG）。
 * 换图只需覆盖这个文件，或改下面的常量。
 */
const EMBLEM_SRC = "/dut-emblem.png";

export function Emblem({
  className = "h-16 w-16",
  sizes = SIZES.emblemSmall,
}: {
  className?: string;
  /** 显示尺寸提示，供浏览器挑最小的够用档位（如开场序列传 emblemIntro） */
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);

  // 图片缺失时不留破图：退回自绘的「学」字圆形标识。
  if (failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-full bg-dut text-white ring-2 ring-white/25 ${className}`}
        aria-label="学习台"
      >
        <span className="text-[0.42em] font-medium">学</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 开场序列需要极简依赖，且要能用 onError 回退
    <img
      src={EMBLEM_SRC}
      srcSet={artSrcSet(EMBLEM_SRC)}
      sizes={sizes}
      alt="大连理工大学校徽"
      width={512}
      height={512}
      // 校徽出现在开场首屏，必须立刻加载；
      // 若用 lazy，开场动画会先显示空白再补图。
      loading="eager"
      // 首屏关键图，用高优先级提示浏览器提前取
      fetchPriority="high"
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
