"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 只记 digest，不把错误详情（可能含路径/配置）打到控制台以外的地方
    console.error("[app] render error", error.digest ?? error.name);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-surface px-6 py-16">
      <p className="text-lg font-medium text-ink">出了点问题</p>
      <p className="text-sm text-muted">页面渲染失败了，你的数据没有受影响。</p>
      <button
        onClick={reset}
        className="press flex h-10 items-center rounded-lg bg-dut px-5 text-sm font-medium text-white"
      >
        重试
      </button>
    </main>
  );
}
