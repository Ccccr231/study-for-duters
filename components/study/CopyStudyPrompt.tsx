"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyStudyPrompt({ title, goal }: { title: string; goal: string | null }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const prompt = `我正在学习${title}${goal ? `，目标是${goal}` : ""}。请先帮我判断该用什么方法，再用提问和提示引导我独立完成，不要直接给出最终答案。`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        title="复制向官方 LearnBuddy 提问的文字"
        className="tap inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm text-dut-deep"
      >
        {state === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {state === "copied" ? "已复制" : "复制提问"}
      </button>
      {state === "failed" && <span role="alert" className="text-xs text-red-600">复制失败，请手动输入问题</span>}
    </div>
  );
}
