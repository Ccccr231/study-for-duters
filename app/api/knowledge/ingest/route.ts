import { embedMany } from "ai";
import { PARSE_FAILURE_TEXT, parseLlmConfig } from "@/lib/ai/config";
import { embeddingModel } from "@/lib/ai/provider";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { chunkMarkdown } from "@/lib/rag/chunk";

// MVP 只收 Markdown（PLAN §2「RAG 的 MVP 边界」）：
// PDF/DOCX 需要解析库 + 后台任务，在 Vercel 免费层 60s 超时下最容易卡死，v1.1 再扩。

const MAX_CONTENT_CHARS = 200_000; // 约 5~8 万字，够一份笔记

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

  const parsed = parseLlmConfig(body.config);
  if (!parsed.ok) {
    return Response.json({ error: PARSE_FAILURE_TEXT[parsed.reason] }, { status: 400 });
  }
  if (!parsed.config.embedModel) {
    return Response.json(
      { error: "还没填 Embedding 模型，无法建立索引（去设置页补一个）" },
      { status: 400 },
    );
  }

  const chunks = chunkMarkdown(content);
  if (chunks.length === 0) return Response.json({ error: "没切出有效内容" }, { status: 400 });

  let embeddings: number[][];
  try {
    const result = await embedMany({
      model: embeddingModel(parsed.config),
      values: chunks,
      maxRetries: 1,
    });
    embeddings = result.embeddings;
  } catch (err) {
    console.error("[ingest] embed failed", err instanceof Error ? err.name : "unknown");
    return Response.json({ error: "向量化失败：检查 Embedding 模型名是否填对" }, { status: 502 });
  }

  const doc = await prisma.document.create({
    data: { userId: user.id, title, mimeType: "text/markdown", status: "ready" },
    select: { id: true },
  });

  // 向量列是 Unsupported 类型，Prisma 的 ORM 写不了，走原生 SQL
  for (let i = 0; i < chunks.length; i++) {
    await prisma.$executeRaw`
      INSERT INTO "Chunk" ("id", "documentId", "content", "order", "embedding")
      VALUES (${crypto.randomUUID()}, ${doc.id}, ${chunks[i]}, ${i}, ${toVectorLiteral(embeddings[i])}::vector)
    `;
  }

  return Response.json({ ok: true, documentId: doc.id, chunks: chunks.length });
}
