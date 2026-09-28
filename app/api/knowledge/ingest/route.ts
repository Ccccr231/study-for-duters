import { embedMany } from "ai";
import { Prisma } from "@/lib/generated/prisma/client";
import { PARSE_FAILURE_TEXT, parseLlmConfig } from "@/lib/ai/config";
import { embeddingModel } from "@/lib/ai/provider";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { chunkMarkdown } from "@/lib/rag/chunk";

// MVP 只收 Markdown（PLAN §2「RAG 的 MVP 边界」）：
// PDF/DOCX 需要解析库 + 后台任务，在 Vercel 免费层 60s 超时下最容易卡死，v1.1 再扩。
//
// 降级口径（PLAN §8.2 / §14 #16）：没配 embedding 或向量化失败时，
// 文档照常落库、分块不带向量，检索端自然走 ILIKE 关键词匹配——
// 「传了资料就能问」不依赖 embedding 可用。

const MAX_CONTENT_CHARS = 200_000; // 约 5~8 万字，够一份笔记
const INSERT_BATCH = 50; // 每批最多 50 条，避免单条往返打满 Vercel 函数时长（PLAN §8.2）

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  let body: { config?: unknown; title?: unknown; content?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "未命名资料";
  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) return Response.json({ error: "内容为空" }, { status: 400 });
  if (content.length > MAX_CONTENT_CHARS) {
    return Response.json({ error: "内容太大了，先拆成几份再传" }, { status: 413 });
  }

  const chunks = chunkMarkdown(content);
  if (chunks.length === 0) return Response.json({ error: "没切出有效内容" }, { status: 400 });

  // 尝试向量化：没配 embedding 模型或调用失败都降级为无向量落库
  let embeddings: number[][] | null = null;
  let degradedReason: string | null = null;

  const parsed = parseLlmConfig(body.config);
  if (!parsed.ok || !parsed.config.embedModel) {
    degradedReason = "未配置 Embedding 模型";
  } else {
    try {
      const result = await embedMany({
        model: embeddingModel(parsed.config),
        values: chunks,
        maxRetries: 1,
      });
      embeddings = result.embeddings;
    } catch (err) {
      console.error("[ingest] embed failed, storing without vectors", err instanceof Error ? err.name : "unknown");
      degradedReason = "向量化失败（Embedding 模型名或额度问题）";
    }
  }

  const doc = await prisma.document.create({
    data: { userId: user.id, title, mimeType: "text/markdown", status: "ready" },
    select: { id: true },
  });

  // 向量列是 Unsupported 类型，Prisma 的 ORM 写不了，走原生 SQL 批量插入（每批 ≤ 50）
  for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
    const batch = chunks.slice(start, start + INSERT_BATCH);
    if (embeddings) {
      const rows = batch.map(
        (chunk, i) =>
          Prisma.sql`(${crypto.randomUUID()}, ${doc.id}, ${chunk}, ${start + i}, ${toVectorLiteral(embeddings[start + i])}::vector)`,
      );
      await prisma.$executeRaw(
        Prisma.sql`INSERT INTO "Chunk" ("id", "documentId", "content", "order", "embedding") VALUES ${Prisma.join(rows)}`,
      );
    } else {
      const rows = batch.map(
        (chunk, i) => Prisma.sql`(${crypto.randomUUID()}, ${doc.id}, ${chunk}, ${start + i})`,
      );
      await prisma.$executeRaw(
        Prisma.sql`INSERT INTO "Chunk" ("id", "documentId", "content", "order") VALUES ${Prisma.join(rows)}`,
      );
    }
  }

  return Response.json({
    ok: true,
    documentId: doc.id,
    chunks: chunks.length,
    degraded: embeddings === null,
    ...(degradedReason ? { message: `${degradedReason}，已按「无向量」保存，问答会走关键词匹配` } : {}),
  });
}
