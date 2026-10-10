import { streamText } from "ai";
import { PARSE_FAILURE_TEXT, parseLlmConfig } from "@/lib/ai/config";
import { buildSystemPrompt } from "@/lib/ai/study-coach";
import { chatModel } from "@/lib/ai/provider";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startOfToday } from "@/lib/date";
import { computeStreak, dateKey } from "@/lib/streak";

type IncomingMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  let body: { config?: unknown; messages?: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const parsed = parseLlmConfig(body.config);
  if (!parsed.ok) {
    return Response.json({ error: PARSE_FAILURE_TEXT[parsed.reason] }, { status: 400 });
  }

  const messages = Array.isArray(body.messages)
    ? body.messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: m.content }))
    : [];

  if (messages.length === 0) {
    return Response.json({ error: "没有消息内容" }, { status: 400 });
  }

  // 学习数据全部由 SQL 算，模型只负责解释数字（PLAN §8.1）
  const today = startOfToday();
  const [sessions, tasks, checkIns] = await Promise.all([
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, startedAt: { gte: today }, completed: true },
      select: { duration: true },
    }),
    prisma.task.findMany({
      where: { userId: user.id, done: false },
      orderBy: { sortOrder: "asc" },
      take: 8,
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
  });

  const result = streamText({
    model: chatModel(parsed.config),
    system,
    messages,
    temperature: parsed.config.temperature,
    maxRetries: 1,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of result.textStream) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        // 只回传泛化信息，不回显上游错误（可能带 key 或内网地址）
        controller.enqueue(encoder.encode("\n\n[连接中断，请检查模型配置]"));
        console.error("[chat] stream failed", err instanceof Error ? err.name : "unknown");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
