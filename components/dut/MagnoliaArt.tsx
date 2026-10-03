"use client";

import { useState } from "react";
import { Magnolia } from "@/components/dut/Magnolia";
import { artSrcSet, SIZES } from "@/components/dut/art-sizes";

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
      // 多尺寸变体：小尺寸处不必下 512 的图（52KB → 6.1KB）。
      // 详见 components/dut/art-sizes.ts。
      srcSet={artSrcSet(ART_SRC)}
      sizes={SIZES.artSmall}
      alt=""
      aria-hidden="true"
      // 真实资产是 512×512（此前误写 720，会让浏览器推出错误的宽高比）
      width={512}
      height={512}
      loading="lazy"
      decoding="async"
      className={`shrink-0 object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
