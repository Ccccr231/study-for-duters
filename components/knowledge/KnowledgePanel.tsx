"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MagnoliaArt } from "@/components/dut/MagnoliaArt";
import { hasLlmConfig, loadLlmConfig } from "@/lib/ai/client-config";

// MVP 只收 Markdown：解析成本为零、体积小、能避开 Vercel 免费层 60s 超时。
// PDF / DOCX 见 PLAN §2「RAG 的 MVP 边界」，v1.1 配合后台任务再扩。
const ACCEPT = ".md,.markdown,.txt,text/markdown,text/plain";

export function KnowledgePanel() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [config, setConfig] = useState<ReturnType<typeof loadLlmConfig>>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  // 错误单独用一个状态，不要塞回 answer：answer 是流式正文（每个 chunk 都在变），
  // 把错误混进去既会让它出现在错误的位置，也无法被屏幕阅读器作为一次状态变化播报。
  const [askError, setAskError] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const c = loadLlmConfig();
    // 故意用 effect + setState：LLM 配置只在浏览器 localStorage 里，
    // 首次渲染（含 SSR）必须当作"未配置"，挂载后再读，否则与水合结果不一致。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(c);
    setReady(hasLlmConfig(c));
  }, []);

  async function pickFile(file: File) {
    const text = await file.text();
    setContent(text);
    if (!title) setTitle(file.name.replace(/\.(md|markdown|txt)$/i, ""));
  }

  async function ingest() {
    if (!config || !content.trim()) return;
    setIngesting(true);
    setIngestMsg(null);
    try {
      const res = await fetch("/api/knowledge/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          title: title.trim() || "未命名资料",
          content,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        chunks?: number;
        error?: string;
        degraded?: boolean;
        message?: string;
      };
      setIngestMsg(
        data.ok
          ? {
              ok: true,
              text: `已入库，切成 ${data.chunks} 块${data.degraded && data.message ? `（${data.message}）` : ""}`,
            }
          : { ok: false, text: data.error ?? "入库失败" },
      );
      if (data.ok) {
        setContent("");
        setTitle("");
      }
    } catch {
      setIngestMsg({ ok: false, text: "网络失败" });
    } finally {
      setIngesting(false);
    }
  }

  async function ask() {
    const q = question.trim();
    if (!q || !config) return;
    setAsking(true);
    setAnswer("");
    setAskError(null);
    setSources([]);

    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, question: q }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => null);
        setAskError((d as { error?: string })?.error ?? "请求失败");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let first = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        let delta = decoder.decode(value, { stream: true });
        if (first) {
          // 首行是 __SOURCES__[...]，把它摘出来再拼正文
          const nl = delta.indexOf("\n");
          if (nl !== -1) {
            const head = delta.slice(0, nl);
            if (head.startsWith("__SOURCES__")) {
              try {
                setSources(JSON.parse(head.slice("__SOURCES__".length)));
              } catch {
                /* 解析失败就当作没有来源 */
              }
              delta = delta.slice(nl + 1);
            }
            first = false;
          }
        }
        acc += delta;
        setAnswer(acc);
      }
    } catch {
      setAskError("网络中断，等一下再试");
    } finally {
      setAsking(false);
    }
  }

  if (ready === null) return <p className="px-5 py-6 text-sm text-muted">读取本机配置…</p>;

  if (!ready) {
    // 配置要等挂载后从 localStorage 读，所以这块是"后出现"的：
    // 加 panel-in 让它浮起，而不是凭空闪出来。
    return (
      <div className="panel-in mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col items-center gap-4 px-5 py-10">
        <MagnoliaArt className="h-12 w-12" />
        <p className="text-[15px] text-ink">先接上模型才能建知识库</p>
        <Link
          href="/settings/model"
          className="press flex h-11 items-center justify-center rounded-lg bg-dut px-6 text-[15px] font-medium text-white"
        >
          去设置模型
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-5 px-5 py-6">
      <section className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-line">
        <h2 className="text-sm font-medium text-ink">上传资料（Markdown）</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="资料名，例如「数据结构·树」"
          className="h-11 rounded-lg border border-line bg-white px-3 text-[15px] outline-none transition-colors duration-150 focus:border-dut"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="把 Markdown 粘贴进来，或点下面的按钮选文件"
          className="rounded-lg border border-line bg-white p-3 text-[15px] outline-none transition-colors duration-150 focus:border-dut"
        />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickFile(f);
          }}
        />
        <div className="flex gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="press h-11 rounded-lg bg-white px-4 text-sm text-dut ring-1 ring-line"
          >
            选择文件
          </button>
          <button
            onClick={() => void ingest()}
            disabled={ingesting || !content.trim()}
            className="press h-11 flex-1 rounded-lg bg-dut text-[15px] font-medium text-white disabled:opacity-50"
          >
            {ingesting ? "入库中…" : "加入知识库"}
          </button>
        </div>
        {ingestMsg && (
          <p
            role="status"
            className={`panel-in text-sm ${ingestMsg.ok ? "text-jade" : "text-red-600"}`}
          >
            {ingestMsg.text}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-line">
        <h2 className="text-sm font-medium text-ink">问自己的资料</h2>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void ask();
              }
            }}
            placeholder="例如：红黑树的插入怎么调整？"
            className="h-11 flex-1 rounded-lg border border-line bg-white px-3 text-[15px] outline-none transition-colors duration-150 focus:border-dut"
          />
          <button
            onClick={() => void ask()}
            disabled={asking || !question.trim()}
            className="press h-11 rounded-lg bg-dut px-5 text-[15px] font-medium text-white disabled:opacity-50"
          >
            {asking ? "…" : "问"}
          </button>
        </div>

        {sources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {[...new Set(sources)].map((s) => (
              <span key={s} className="rounded bg-dut-mist px-2 py-1 text-xs text-dut-deep">
                {s}
              </span>
            ))}
          </div>
        )}

        {askError && (
          <p role="status" className="panel-in text-sm text-red-600">
            {askError}
          </p>
        )}

        {/* 回答区是流式的（每个 chunk 都在变），所以不加 aria-live——
            否则读屏会被反复打断。它只承载正文，错误走上面的独立通道。 */}
        {answer && (
          <div className="rounded-lg bg-surface p-3 text-[15px] whitespace-pre-wrap text-ink">
            {answer}
          </div>
        )}
      </section>
    </div>
  );
}
