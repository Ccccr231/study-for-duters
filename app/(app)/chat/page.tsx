import type { Metadata } from "next";
import { ChatPanel } from "@/components/coach/ChatPanel";

export const metadata: Metadata = { title: "学习教练" };

export default function ChatPage() {
  return (
      <div className="mx-auto w-full max-w-2xl sm:max-w-3xl">
      <div className="px-5 pt-5">
        <h1 className="text-xl font-medium tracking-tight text-ink">学习教练</h1>
        <p className="mt-0.5 text-xs text-muted">
          基于你的专注、待办和资料回答 · 站内自建助手
        </p>
      </div>
      <ChatPanel />
    </div>
  );
}
