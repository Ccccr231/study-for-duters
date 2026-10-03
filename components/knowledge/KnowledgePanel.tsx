"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { hasLlmConfig, loadLlmConfig } from "@/lib/ai/client-config";
import { ACCEPT_ATTR, extractFileText } from "@/lib/rag/extract";

export function KnowledgePanel() {
  // loaded 只表示"配置读过了"，不是"配好了"。
  // 关键：**没配模型也要能进知识库**——上传与关键词检索本来就不依赖模型
  // （见 app/api/knowledge/ingest/route.ts 的降级口径：没 embedding 就无向量落库，
  // 检索端走 bigram 关键词打分）。此前用 hasLlmConfig 整页拦截，把这条路堵死了。
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState<ReturnType<typeof loadLlmConfig>>(null);
  const [canChat, setCanChat] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [extracting, setExtracting] = useState(false);
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
    // canChat 只决定"能不能生成回答"，不决定"能不能传资料"
    setCanChat(hasLlmConfig(c));
    setLoaded(true);
  }, []);

  async function pickFile(file: File) {
    setExtracting(true);
    setIngestMsg({ ok: true, text: `正在读取 ${file.name}…` });
    try {
      const result = await extractFileText(file, (message) => {
        setIngestMsg({ ok: true, text: message });
      });

      // 扫描版 PDF 等"取不到文字"的情况：如实说明，不假装成功
      if (result.notice) {
        setIngestMsg({ ok: false, text: result.notice });
        return;
      }
      if (result.text.trim().length < 20) {
        setIngestMsg({
          ok: false,
          text: "这份文件里没读到文字，换一份试试，或直接把内容贴进下面的框里",
        });
        return;
      }

      // 提取结果放进文本框而不是直接入库：让用户能过目、能改，
      // 也顺便暴露"解析出来到底长什么样"，出问题好判断。
      setContent(result.text);
      if (!title) setTitle(result.suggestedTitle);
      setIngestMsg({
        ok: true,
        text: `已从 ${file.name} 读出 ${result.text.length.toLocaleString()} 字${
          result.units > 1 ? `（${result.units} 页/张）` : ""
        }，确认无误后点「加入知识库」`,
      });
    } catch (err) {
      setIngestMsg({
        ok: false,
        text: err instanceof Error ? err.message : "读取失败，换一份文件试试",
      });
    } finally {
      setExtracting(false);
    }
  }

  async function ingest() {
    // 注意：这里**不能**因为 config 为 null 就返回。
    // 没配模型时 config 是 null，但入库本来就不依赖模型——
    // 服务端拿到 null 会走 parseLlmConfig 失败→无向量落库的降级路径。
    // （此前写作 `if (!config || !content.trim()) return`，会把降级路径静默堵死。）
    if (!content.trim()) {
      setIngestMsg({ ok: false, text: "先贴点内容，或选一个文件" });
      return;
    }
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

  if (!loaded) return <p className="px-5 py-6 text-sm text-muted">读取本机配置…</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-5 px-5 py-6">
      <section className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-line">
        <div>
          <h2 className="text-sm font-medium text-ink">上传资料</h2>
          <p className="mt-0.5 text-meta text-muted">
            支持 PDF、Word、PPT、Excel、Markdown / 纯文本；传进来就能检索，不需要先配模型。
          </p>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="资料名，例如「数据结构·树」"
          className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="选一个文件读进来，或直接把内容贴在这里"
          className="rounded-lg border border-line bg-white p-3 text-body outline-none transition-colors duration-150 focus:border-dut"
        />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickFile(f);
            // 清掉 value，这样连续选同一个文件也能再次触发 onChange
            e.target.value = "";
          }}
        />
        <div className="flex gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={extracting}
            className="press h-11 rounded-lg bg-white px-4 text-sm text-dut ring-1 ring-line disabled:opacity-60"
          >
            {extracting ? "读取中…" : "选择文件"}
          </button>
          <button
            onClick={() => void ingest()}
            disabled={ingesting || extracting || !content.trim()}
            className="press h-11 flex-1 rounded-lg bg-dut text-body font-medium text-white disabled:opacity-50"
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
        <div>
          <h2 className="text-sm font-medium text-ink">问自己的资料</h2>
          <p className="mt-0.5 text-meta text-muted">
            先把资料传进来，再让连小理基于它回答。
          </p>
        </div>

        {/* 只有"生成回答"这一步需要模型；上传与检索不需要。
            所以这里不拦整页，只在缺模型时提示一句并给出去设置的入口。 */}
        {!canChat && (
          <div className="panel-in flex flex-col items-start gap-2 rounded-lg bg-dut-mist/60 p-3">
            <p className="text-sm text-ink">
              还差一步：填上模型才能生成回答（资料照常可以传、可以检索）
            </p>
            <Link
              href="/settings/model"
              className="press flex h-9 items-center justify-center rounded-lg bg-dut px-4 text-sm font-medium text-white"
            >
              去设置模型
            </Link>
          </div>
        )}

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
            className="h-11 flex-1 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
          />
          <button
            onClick={() => void ask()}
            disabled={asking || !question.trim() || !canChat}
            className="press h-11 rounded-lg bg-dut px-5 text-body font-medium text-white disabled:opacity-50"
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
          <div className="rounded-lg bg-surface p-3 text-body whitespace-pre-wrap text-ink">
            {answer}
          </div>
        )}
      </section>
    </div>
  );
}
