import type { Metadata } from "next";
import { KnowledgePanel } from "@/components/knowledge/KnowledgePanel";

export const metadata: Metadata = { title: "知识库" };

export default function KnowledgePage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="px-5 pt-5">
        <h1 className="text-xl font-medium tracking-tight text-ink">知识库</h1>
        <p className="mt-0.5 text-xs text-muted">
          传 Markdown 笔记进来，连小理只基于你自己的资料回答
        </p>
      </div>
      <KnowledgePanel />
    </div>
  );
}
