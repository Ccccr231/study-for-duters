"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MagnoliaArt } from "@/components/dut/MagnoliaArt";
import { hasLlmConfig, loadLlmConfig } from "@/lib/ai/client-config";

type Message = { role: "user" | "assistant"; content: string };

const OPENING = "今天想先学什么？我会参考你的待办和打卡数据。";

/**
 * 给读屏播报用的截断。
 *
 * 播报整篇回答会让用户被迫听完（live region 无法跳过），
 * 所以只播开头一段，其余留给用户自己往下读。
 */
function truncateForSpeech(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}……（其余请往下阅读）`;
}

export function ChatPanel() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [config, setConfig] = useState<ReturnType<typeof loadLlmConfig>>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 只给读屏的播报内容：流式结束后播一次，避免逐个 token 刷屏
  const [announcement, setAnnouncement] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  // 是否"贴底"。流式期间每个 chunk 都会重跑滚动，若用户主动上滑看历史，
  // 还把他拽回底部会很烦人——所以只在贴底时跟随。
  const atBottomRef = useRef(true);

  useEffect(() => {
    const c = loadLlmConfig();
    // 故意用 effect + setState：LLM 配置只在浏览器 localStorage 里，
    // 首次渲染（含 SSR）必须当作"未配置"，挂载后再读，否则与水合结果不一致。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(c);
    setReady(hasLlmConfig(c));
  }, []);

  // 记录用户是否还在底部（留 120px 容差，接近底部就算贴底）
  useEffect(() => {
    const onScroll = () => {
      const el = document.scrollingElement;
      if (!el) return;
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!atBottomRef.current) return;
    // 尊重用户的减弱动效设置：直接跳到底，不做平滑滚动
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || !config) return;

    setError(null);
    setAnnouncement("");
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError((data as { error?: string })?.error ?? "请求失败");
        setMessages(next);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
      }
      // 流式结束后**播报一次完整回答**。
      // 不能给正文加 aria-live：那样每个 token 都会触发一次播报，读屏会被刷屏；
      // 也不能不播报，否则读屏用户根本不知道回答已经来了。
      // 折中：正文保持普通节点，另用一个隐藏的 role="status" 在完成时播一次。
      setAnnouncement(`学习教练回答完毕：${truncateForSpeech(acc)}`);
    } catch {
      setError("网络中断，等一下再试");
      setMessages(next);
    } finally {
      setStreaming(false);
    }
  }

  if (ready === null) {
    return <p className="px-5 py-6 text-sm text-muted">读取本机配置…</p>;
  }

  if (!ready) {
    return (
      <div className="panel-in mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col items-center gap-4 px-5 py-10">
        <MagnoliaArt className="h-12 w-12" />
        <p className="text-center text-body text-ink">学习教练还没接上模型</p>
        <p className="text-center text-sm text-muted">
          这个平台不预置任何密钥，需要你自己填 Base URL、API Key 和模型名。
        </p>
        <Link
          href="/settings/model"
          className="press flex h-11 items-center justify-center rounded-lg bg-dut px-6 text-body font-medium text-white"
        >
          去设置模型
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-4 px-5 py-5">
      {messages.length === 0 && (
        <div className="rounded-xl bg-white p-4 text-body text-ink ring-1 ring-line">
          <span className="mr-1 font-medium text-dut">学习教练：</span>
          {OPENING}
        </div>
      )}

      {/* 读屏播报区。平时为空，只在关键节点写入一次：
          - 回答流式结束 → 播一次摘要
          - 出错 → 见下面的 role="alert"
          正文本身保持普通节点，不加 aria-live（否则每个 token 都会播报）。 */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-4 py-3 text-body whitespace-pre-wrap ${
              m.role === "user"
                ? "self-end bg-dut text-white"
                : "bubble-in self-start bg-white text-ink ring-1 ring-line"
            }`}
          >
            {m.role === "assistant" && (
              <span className="mr-1 font-medium text-dut">学习教练：</span>
            )}
            {m.content ||
              (streaming ? (
                <span className="thinking-dots text-muted" aria-label="学习教练正在思考">
                  …
                </span>
              ) : (
                ""
              ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="panel-in text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="sticky bottom-20 flex gap-2 bg-surface pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="问点什么，回车发送"
          aria-label="给学习教练发消息"
          className="h-11 flex-1 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
        />
        <button
          onClick={() => void send()}
          disabled={streaming || !input.trim()}
          className="press h-11 rounded-lg bg-dut px-5 text-body font-medium text-white disabled:opacity-50"
        >
          {streaming ? "…" : "发送"}
        </button>
      </div>
    </div>
  );
}
