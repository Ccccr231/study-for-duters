// 玉兰点缀：空状态 / 成就徽章用的简化花瓣，自绘。
export function Magnolia({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <g transform="translate(24 24)">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <ellipse
            key={deg}
            cx="0"
            cy="-13"
            rx="5.5"
            ry="11"
            fill="var(--dut-blue)"
            opacity={deg % 120 === 0 ? 0.5 : 0.32}
            transform={`rotate(${deg})`}
          />
        ))}
        <circle r="4.2" fill="var(--dut-blue-deep)" opacity="0.7" />
      </g>
    </svg>
  );
}
