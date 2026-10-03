"use client";

import { useState } from "react";
import { Magnolia } from "@/components/dut/Magnolia";

/**
 * 玉兰图（水彩素材）。
 *
 * ⚠️ 素材来源与版权：图片由项目所有者提供（2026-10-03），版权归原作者。
 * 原 `PLAN §6.3` 的约定是「装饰元素自绘、不使用官方素材」，此项已按所有者要求变更，
 * 见 `PLAN §14 #21`。若需回退自绘，把 USE_ART 置为 false 即可。
 *
 * 处理方式：素材是"米色纸上的水彩画"，用「与纸底的色彩距离 → alpha」抠图，
 * 笔触越淡越透明（这正是水彩本来的合成方式）。所以：
 * - 用在白色卡面上最自然（本项目的卡片就是 bg-white）
 * - 用在有色底上会透出底色，需谨慎
 */
const ART_SRC = "/dut-magnolia.png";
const USE_ART = true;

export function MagnoliaArt({ className = "h-8 w-8" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  // 素材缺失 / 关闭时回退到自绘玉兰，避免破图
  if (!USE_ART || failed) return <Magnolia className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 需要 onError 回退，且是装饰性小图
    <img
      src={ART_SRC}
      alt=""
      aria-hidden="true"
      width={720}
      height={720}
      loading="lazy"
      decoding="async"
      className={`shrink-0 object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
