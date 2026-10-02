// 主楼剪影：极简线条稿（中间塔楼 + 两侧对称配楼 + 台阶）。
// 自绘抽象轮廓，不使用学校官方素材——见 PLAN §6.3 的合规约定。
//
// tone="onBlue" 用于蓝色 hero 背景：默认的深蓝描边放在 bg-dut 上等于隐形，
// 必须换成白色描边才能透出线条。
export function MainBuildingSilhouette({
  className = "h-24 w-auto",
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "onBlue";
}) {
  const stroke = tone === "onBlue" ? "rgba(255,255,255,0.85)" : "var(--dut-blue-deep)";
  // onBlue 用于大面积的 hero 水印，要靠外层 opacity 控深浅，
  // 所以内部线条给满透明度（否则 0.55 × 外层 opacity 会淡到看不见）。
  const groupOpacity = tone === "onBlue" ? 1 : 0.55;
  return (
    <svg viewBox="0 0 320 120" className={className} aria-hidden="true">
      <g stroke={stroke} strokeWidth="1.6" fill="none" opacity={groupOpacity}>
        {/* 两侧配楼 */}
        <path d="M20 96 V52 H84 V96" />
        <path d="M236 96 V52 H300 V96" />
        {/* 配楼窗（简化为竖线） */}
        <path d="M34 62 V86 M48 62 V86 M62 62 V86" opacity="0.5" />
        <path d="M258 62 V86 M272 62 V86 M286 62 V86" opacity="0.5" />
        {/* 主塔 */}
        <path d="M112 96 V34 H208 V96" />
        {/* 塔顶尖 */}
        <path d="M112 34 L160 10 L208 34" />
        <path d="M160 10 V22" />
        {/* 主塔窗格 */}
        <path d="M124 46 V86 M142 46 V86 M160 46 V86 M178 46 V86 M196 46 V86" opacity="0.5" />
        <path d="M124 62 H196" opacity="0.35" />
        {/* 台阶与地面 */}
        <path d="M96 96 H224 M88 104 H232" />
        <path d="M8 104 H312" opacity="0.4" />
      </g>
    </svg>
  );
}
