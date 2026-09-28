"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Magnolia } from "@/components/dut/Magnolia";
import { hasLlmConfig, loadLlmConfig } from "@/lib/ai/client-config";

type Message = { role: "user" | "assistant"; content: string };

const OPENING = "今天想先学什么？我把你的待办和打卡数据都看过了。";

export function ChatPanel() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [config, setConfig] = useState<ReturnType<typeof loadLlmConfig>>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = loadLlmConfig();
    setConfig(c);
    setReady(hasLlmConfig(c));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || !config) return;

    setError(null);
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
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-5 py-10">
        <Magnolia className="h-12 w-12" />
        <p className="text-center text-[15px] text-ink">连小理还没接上模型</p>
        <p className="text-center text-sm text-muted">
          这个平台不预置任何密钥，需要你自己填 Base URL、API Key 和模型名。
        </p>
        <Link
          href="/settings/model"
          className="flex h-11 items-center justify-center rounded-lg bg-dut px-6 text-[15px] font-medium text-white"
        >
          去设置模型
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-5">
      {messages.length === 0 && (
        <div className="rounded-xl bg-white p-4 text-[15px] text-ink ring-1 ring-line">
          <span className="mr-1 font-medium text-dut">连小理：</span>
          {OPENING}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-4 py-3 text-[15px] whitespace-pre-wrap ${
              m.role === "user"
                ? "self-end bg-dut text-white"
                : "self-start bg-white text-ink ring-1 ring-line"
            }`}
          >
            {m.role === "assistant" && (
              <span className="mr-1 font-medium text-dut">连小理：</span>
            )}
            {m.content || (streaming ? "…" : "")}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
          className="h-11 flex-1 rounded-lg border border-line bg-white px-3 text-[15px] outline-none focus:border-dut"
        />
        <button
          onClick={() => void send()}
          disabled={streaming || !input.trim()}
          className="h-11 rounded-lg bg-dut px-5 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {streaming ? "…" : "发送"}
        </button>
      </div>
    </div>
  );
}
