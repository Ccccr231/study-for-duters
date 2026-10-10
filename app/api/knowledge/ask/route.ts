import { embed, streamText } from "ai";
import { PARSE_FAILURE_TEXT, parseLlmConfig } from "@/lib/ai/config";
import { buildSystemPrompt } from "@/lib/ai/study-coach";
import { chatModel, embeddingModel } from "@/lib/ai/provider";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startOfToday } from "@/lib/date";
import { computeStreak, dateKey } from "@/lib/streak";
import { extractKeywords } from "@/lib/rag/keywords";

type Hit = { title: string; content: string };

const TOP_K = 6;

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

/** 有 embedding 走向量检索；没有就降级为关键词匹配，保证「传了资料就能问」。 */
async function search(userId: string, question: string, vector: number[] | null): Promise<Hit[]> {
  if (vector) {
    return prisma.$queryRaw<Hit[]>`
      SELECT d."title" AS title, c."content" AS content
      FROM "Chunk" c
      JOIN "Document" d ON c."documentId" = d."id"
      WHERE d."userId" = ${userId}
      ORDER BY c."embedding" <=> ${toVectorLiteral(vector)}::vector
      LIMIT ${TOP_K}
    `;
  }

  // 降级检索：整句 ILIKE 对中文提问几乎必然零命中（§14 #18），
  // 改成 bigram 关键词打分：命中越多的块排越前。
  const keywords = extractKeywords(question);
  if (keywords.length > 0) {
    return prisma.$queryRaw<Hit[]>`
      SELECT title, content FROM (
        SELECT d."title" AS title, c."content" AS content,
          (SELECT count(*) FROM unnest(CAST(${keywords} AS text[])) AS k
           WHERE c."content" ILIKE '%' || k || '%') AS score
        FROM "Chunk" c
        JOIN "Document" d ON c."documentId" = d."id"
        WHERE d."userId" = ${userId}
      ) s
      WHERE s.score > 0
      ORDER BY s.score DESC, s.title
      LIMIT ${TOP_K}
    `;
  }

  // 问题里提不出任何关键词（纯标点等），退回整句匹配，聊胜于无
  const keyword = `%${question.slice(0, 40)}%`;
  return prisma.$queryRaw<Hit[]>`
    SELECT d."title" AS title, c."content" AS content
    FROM "Chunk" c
    JOIN "Document" d ON c."documentId" = d."id"
    WHERE d."userId" = ${userId} AND c."content" ILIKE ${keyword}
    LIMIT ${TOP_K}
  `;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  let body: { config?: unknown; question?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "问题为空" }, { status: 400 });

  const parsed = parseLlmConfig(body.config);
  if (!parsed.ok) {
    return Response.json({ error: PARSE_FAILURE_TEXT[parsed.reason] }, { status: 400 });
  }
  // 检索不依赖模型，但**生成回答**依赖它。必须在这里显式校验：
  // 否则会一路走到 chatModel() 才失败，报错对用户毫无意义。
  if (!parsed.config.baseUrl || !parsed.config.apiKey || !parsed.config.chatModel) {
    return Response.json(
      {
        error:
          "还没填模型：资料可以照常上传和检索，但生成回答需要先在「设置 → 模型」里填好 Base URL / Key / 模型名",
      },
      { status: 400 },
    );
  }

  let vector: number[] | null = null;
  if (parsed.config.embedModel) {
    try {
      const r = await embed({ model: embeddingModel(parsed.config), value: question, maxRetries: 1 });
      vector = r.embedding;
    } catch (err) {
      console.error("[ask] embed failed, fallback to keyword", err instanceof Error ? err.name : "unknown");
    }
  }

  let hits: Hit[] = [];
  try {
    hits = await search(user.id, question, vector);
  } catch (err) {
    console.error("[ask] search failed", err instanceof Error ? err.name : "unknown");
    return Response.json({ error: "检索失败：数据库还没有建表（见 README 的建表步骤）" }, { status: 503 });
  }

  const today = startOfToday();
  const [sessions, tasks, checkIns] = await Promise.all([
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, startedAt: { gte: today }, completed: true },
      select: { duration: true },
    }),
    prisma.task.findMany({
      where: { userId: user.id, done: false },
      orderBy: { sortOrder: "asc" },
      take: 5,
      select: { title: true },
    }),
    prisma.checkIn.findMany({
      where: { userId: user.id, date: { gte: new Date(today.getTime() - 60 * 86400000) } },
      select: { date: true },
    }),
  ]);

  const system = buildSystemPrompt({
    focusMinutesToday: sessions.reduce((s, x) => s + x.duration, 0),
    pomodorosToday: sessions.length,
    streakDays: computeStreak(checkIns.map((c) => dateKey(c.date)), dateKey(today)),
    pendingTasks: tasks.map((t) => t.title),
    sources: hits.map((h) => ({ title: h.title, content: h.content.slice(0, 1200) })),
  });

  const result = streamText({
    model: chatModel(parsed.config),
    system,
    messages: [{ role: "user", content: question }],
    temperature: parsed.config.temperature,
    maxRetries: 1,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 先把来源以首行注释形式带出去，前端据此渲染引用卡片
        controller.enqueue(encoder.encode(`__SOURCES__${JSON.stringify(hits.map((h) => h.title))}\n`));
        for await (const delta of result.textStream) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        controller.enqueue(encoder.encode("\n\n[连接中断，请检查模型配置]"));
        console.error("[ask] stream failed", err instanceof Error ? err.name : "unknown");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
