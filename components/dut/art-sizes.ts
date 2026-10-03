/**
 * 水彩素材的多尺寸变体。
 *
 * 三张资产原图都是 512×512，但实际显示尺寸最小只有 32px
 * （玉兰 44–48px、主楼 96px、校徽 160–192px），直接上 512 的图在小尺寸上纯属浪费带宽：
 * 玉兰 52KB → 128 档 6.1KB，主楼 35.8 → 4.4KB，校徽 23.6 → 5KB。
 *
 * 变体由 Pillow 生成（LANCZOS 缩放 + FASTOCTREE 量化，与既有抠图流程一致）。
 * 512 原图保留：开场校徽在 @2x 下需要 384px 以上，128/256 都不够。
 */

export const ART_WIDTHS = [128, 256, 384, 512] as const;

/** 由基名生成 srcset（如 /dut-magnolia.png → "...-128.png 128w, ... 256w, ... 512w"） */
export function artSrcSet(base: string): string {
  return ART_WIDTHS.map((w) =>
    w === 512 ? `${base} 512w` : `${base.replace(/\.png$/, `-${w}.png`)} ${w}w`,
  ).join(", ");
}

/**
 * 各处的显示尺寸（供 <img sizes> 用）。
 *
 * 写的是"最大显示宽度"，浏览器据此挑最小的够用档位。
 * 注意浏览器还会考虑 DPR：`48px` 在 @2x 屏上会取 96px 的档位（→ 128 档）。
 */
export const SIZES = {
  /** 站内小图示（玉兰，最大 h-12 = 48px） */
  artSmall: "48px",
  /** 登录/注册页的主楼（h-24 = 96px） */
  building: "96px",
  /** 开场序列的校徽（h-40 = 160px，sm 起 h-48 = 192px）。
   *  声明 128px 而不是真实显示宽度：这段动画全程是「模糊 → 放大」的推进，
   *  起点 blur(8px) 且整体 scale 不到 0.4，任何缩放细节都看不出来。
   *  128 × 3 = 384 正好命中 384 档，省下调 512 原图（24KB → 18KB，且在首屏关键路径上）。 */
  emblemIntro: "128px",
  /** 站内其余校徽用法（h-16 = 64px） */
  emblemSmall: "64px",
  /** 落地页 hero 的主楼水印（h-32 = 128px） */
  buildingWatermark: "128px",
} as const;
