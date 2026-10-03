"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasLlmConfig, loadLlmConfig, type StoredLlmConfig } from "@/lib/ai/client-config";

export function ReportPanel({ date, hasReport }: { date: string; hasReport: boolean }) {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [config, setConfig] = useState<StoredLlmConfig | null>(null);
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = loadLlmConfig();
    // 故意用 effect + setState：LLM 配置只在浏览器 localStorage 里，
    // 首次渲染（含 SSR）必须当作"未配置"，挂载后再读，否则与水合结果不一致。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(c);
    setReady(hasLlmConfig(c));
  }, []);

  async function generate() {
    if (!config || generating) return;
    setError(null);
    setText("");
    setGenerating(true);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, date }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError((data as { error?: string })?.error ?? "生成失败");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        // 流里带行协议标记（SUMMARY:/ADVICE:/ACTION:），展示时剥掉，落库的是解析后的干净版本
        setText(
          acc
            .replace(/^ACTION[:：].*$/gm, "")
            .replace(/^SUMMARY[:：]\s?/gm, "")
            .replace(/^ADVICE[:：]\s?/gm, "· ")
            .trimStart(),
        );
      }
      // 报告已在服务端落库：清掉流式预览，刷新出正式的「今日报告」卡片
      setText("");
      router.refresh();
    } catch {
      setError("网络中断，等一下再试");
    } finally {
      setGenerating(false);
    }
  }

  if (ready === null) return null;

  if (!ready) {
    // 配置要等挂载后从 localStorage 读，所以这块是"后出现"的：
    // 加 panel-in 让它浮起，而不是凭空闪出来。
    return (
      <section className="panel-in rounded-xl bg-white p-4 ring-1 ring-line">
        <p className="text-sm text-ink">AI 总结还没接上模型</p>
        <p className="mt-1 text-xs text-muted">
          上面的数据卡片不需要模型就能看；填好 Base URL / API Key / 模型名后，连小理才能帮你写总结。
        </p>
        <Link
          href="/settings/model"
          className="tap mt-3 inline-flex h-9 items-center rounded-lg bg-dut px-4 text-sm font-medium text-white"
        >
          去设置模型
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-line">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">连小理的今日总结</h2>
        <button
          onClick={() => void generate()}
          disabled={generating}
          className="tap h-9 rounded-lg bg-dut px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {generating ? "生成中…" : hasReport ? "重新生成" : "生成总结"}
        </button>
      </div>

      {text && (
        <p className="mt-3 whitespace-pre-wrap text-body text-ink">
          <span className="mr-1 font-medium text-dut">连小理：</span>
          {text}
        </p>
      )}
      {!text && !generating && !hasReport && (
        <p className="mt-2 text-xs text-muted">
          点「生成总结」，连小理会基于上面的真实数据写一段 200 字内的复盘和明日建议。
        </p>
      )}
      {error && <p role="status" className="panel-in mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
