// 海浪分割线：三层递减透明度，呼应「渤海之滨」。
// 纯装饰，aria-hidden。
export function WaveDivider({ className = "h-16 w-full" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0,44 C240,84 480,4 720,36 C960,68 1200,20 1440,48 L1440,80 L0,80 Z"
        fill="var(--dut-blue)"
        opacity="0.06"
      />
      <path
        d="M0,52 C260,88 500,16 740,44 C980,72 1220,28 1440,56 L1440,80 L0,80 Z"
        fill="var(--dut-blue)"
        opacity="0.1"
      />
      <path
        d="M0,62 C280,92 520,30 760,54 C1000,78 1240,40 1440,66 L1440,80 L0,80 Z"
        fill="var(--dut-blue)"
        opacity="0.16"
      />
    </svg>
  );
}
