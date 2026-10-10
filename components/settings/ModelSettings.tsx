"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  EMPTY_CONFIG,
  hasLlmConfig,
  loadLlmConfig,
  saveLlmConfig,
  type StoredLlmConfig,
} from "@/lib/ai/client-config";

export function ModelSettings() {
  const [config, setConfig] = useState<StoredLlmConfig>(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    // 故意用 effect + setState：配置只在浏览器 localStorage 里，
    // 首次渲染（含 SSR）必须用 EMPTY_CONFIG，挂载后再读，否则与水合结果不一致。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(loadLlmConfig() ?? EMPTY_CONFIG);
    setLoaded(true);
  }, []);

  function update<K extends keyof StoredLlmConfig>(key: K, value: StoredLlmConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }

  async function save() {
    saveLlmConfig(config);
    setResult({ ok: true, message: "已保存到本机浏览器（不会上传到服务器）" });
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      setResult({ ok: data.ok, message: data.ok ? "连上了" : (data.message ?? "连不上") });
    } catch {
      setResult({ ok: false, message: "请求失败，检查网络" });
    } finally {
      setTesting(false);
    }
  }

  const ready = hasLlmConfig(config);

  return (
    <div className="flex flex-col gap-5">
      {!loaded ? (
        <p className="text-sm text-muted">读取本机配置…</p>
      ) : (
        // 配置要等挂载后从 localStorage 读，所以表单是"后出现"的：
        // 单独包一层是为了让 panel-in 只随表单播一次，而不是连"读取中"一起播。
        <div className="panel-in flex flex-col gap-5">
          <div
            className={`rounded-xl p-3 text-sm ${
              ready ? "bg-dut-mist text-dut-deep" : "bg-amber/10 text-amber"
            }`}
          >
            {ready ? "已配置，学习教练可以说话了。" : "还没配置完整，AI 功能会用引导卡片提示你。"}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Base URL</span>
            <input
              value={config.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder="https://api.deepseek.com/v1"
              className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">API Key</span>
            <input
              value={config.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">对话模型</span>
            <input
              value={config.chatModel}
              onChange={(e) => update("chatModel", e.target.value)}
              placeholder="deepseek-chat"
              className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">
              Embedding 模型<span className="text-muted/70">（知识库用，可留空）</span>
            </span>
            <input
              value={config.embedModel}
              onChange={(e) => update("embedModel", e.target.value)}
              placeholder="text-embedding-3-small"
              className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
            />
          </label>

          <div className="flex gap-3">
            <button
              onClick={save}
              className="press h-11 flex-1 rounded-lg bg-dut text-body font-medium text-white"
            >
              保存到本机
            </button>
            <button
              onClick={test}
              disabled={testing || !ready}
              className="press h-11 rounded-lg bg-white px-5 text-body text-dut ring-1 ring-line disabled:opacity-50"
            >
              {testing ? "测试中…" : "测试连接"}
            </button>
          </div>

          {result && (
            <p
              role="status"
              className={`panel-in text-sm ${result.ok ? "text-jade" : "text-red-600"}`}
            >
              {result.message}
            </p>
          )}

          <div className="rounded-xl bg-white p-4 text-sm text-muted ring-1 ring-line">
            <p className="font-medium text-ink">关于安全</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>配置只存在你这台设备的浏览器里，服务端不落库、不记日志。</li>
              <li>每次对话时随请求传给服务端用于调用模型，请求结束即从内存释放。</li>
              <li>不填 Embedding 模型，知识库会降级成关键词检索，仍然能用。</li>
            </ul>
            <p className="mt-3">
              配好了就去
              {/* transform 对纯行内链接无效，inline-block 才能让 .tap 真的缩一下 */}
              <Link href="/chat" className="tap inline-block text-dut">
                跟学习教练说两句
              </Link>
              。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
