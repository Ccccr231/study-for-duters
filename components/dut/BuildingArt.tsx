"use client";

import { useState } from "react";
import { MainBuildingSilhouette } from "@/components/dut/MainBuildingSilhouette";
import { artSrcSet, SIZES } from "@/components/dut/art-sizes";

/**
 * 主楼图（水彩素材）。
 *
 * ⚠️ 素材来源与版权：图片由项目所有者提供（2026-10-03），版权归原作者。
 * 原 `PLAN §6.3` 约定「装饰元素自绘」，此项已按所有者要求变更，见 `PLAN §14 #21`。
 *
 * 处理方式：素材是"米色纸上的水彩画"，按「与纸底的色彩距离 → alpha」抠图，
 * 笔触越淡越透明。**因此它适合浅色底**（白卡、浅色页面）；
 * 深蓝底上请改用 `MainBuildingSilhouette` 的 `tone="onBlue"` 白描边版本——
 * 白底水彩压在深蓝上会显得脏。
 */
const ART_SRC = "/dut-building.png";
const USE_ART = true;

export function BuildingArt({ className = "h-20 w-auto" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!USE_ART || failed) return <MainBuildingSilhouette className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 需要 onError 回退，且是装饰性插图
    <img
      src={ART_SRC}
      // 多尺寸变体：登录页只显示 96px 高，不必下 512 的图（35.8KB → 4.4KB）
      srcSet={artSrcSet(ART_SRC)}
      sizes={SIZES.building}
      alt=""
      aria-hidden="true"
      // 真实资产是 512×512（此前误写 720，会让浏览器推出错误的宽高比）
      width={512}
      height={512}
      decoding="async"
      className={`object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
