import { streamText } from "ai";
import { PARSE_FAILURE_TEXT, parseLlmConfig } from "@/lib/ai/config";
import { buildSystemPrompt } from "@/lib/ai/liaxiaoli";
import { chatModel } from "@/lib/ai/provider";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startOfToday } from "@/lib/date";
import { dateKey } from "@/lib/streak";
import { computeMetrics } from "@/lib/report/compute";
import {
  buildNarrationPrompt,
  parseNarration,
  renderReportMarkdown,
} from "@/lib/report/narration";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 每日学习报告（Agent Loop 的 Observe → Compute → Narrate，PLAN §8.1）。
 * POST { config, date? } → 流式输出报告正文；流正常结束后 upsert Report。
 * Execute 阶段不自动写库：模型建议的 action 存进 stats，由用户在页面上确认（见 PLAN §14）。
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  let body: { config?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const parsed = parseLlmConfig(body.config);
  if (!parsed.ok) {
    return Response.json({ error: PARSE_FAILURE_TEXT[parsed.reason] }, { status: 400 });
  }

  const todayKey = dateKey(startOfToday());
  const dateParam = typeof body.date === "string" ? body.date : todayKey;
  if (!DATE_KEY_RE.test(dateParam)) {
    return Response.json({ error: "日期格式应为 YYYY-MM-DD" }, { status: 400 });
  }
  if (dateParam > todayKey) {
    return Response.json({ error: "不能给未来的日期生成报告" }, { status: 400 });
  }
  const reportDate = new Date(`${dateParam}T00:00:00Z`);
  const weekStart = new Date(`${dateParam}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  // Observe：SQL 拉原始数据
  const [sessions, tasks, checkIns] = await Promise.all([
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, startedAt: { gte: weekStart, lt: new Date(reportDate.getTime() + 86400000) } },
      select: { startedAt: true, duration: true, completed: true },
    }),
    prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, done: true, createdAt: true, dueDate: true },
    }),
    prisma.checkIn.findMany({
      where: { userId: user.id, date: { gte: new Date(reportDate.getTime() - 60 * 86400000) } },
      select: { date: true },
    }),
  ]);

  // Compute：纯函数算指标，不过模型
  const metrics = computeMetrics({
    today: dateParam,
    sessions: sessions.map((s) => ({
      day: dateKey(s.startedAt),
      duration: s.duration,
      completed: s.completed,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      createdDay: dateKey(t.createdAt),
      dueDay: t.dueDate ? dateKey(t.dueDate) : null,
    })),
    checkInDays: checkIns.map((c) => dateKey(c.date)),
  });
  metrics.pendingTaskTitles = metrics.pendingTaskTitles.slice(0, 8);

  const system = buildSystemPrompt({
    focusMinutesToday: metrics.focusMinutesToday,
    pomodorosToday: metrics.pomodorosToday,
    streakDays: metrics.streakDays,
    pendingTasks: metrics.pendingTaskTitles,
  });

  const result = streamText({
    model: chatModel(parsed.config),
    system,
    messages: [{ role: "user", content: buildNarrationPrompt(metrics) }],
    temperature: parsed.config.temperature,
    maxRetries: 1,
  });

  const userId = user.id;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let acc = "";
      let failed = false;
      try {
        for await (const delta of result.textStream) {
          acc += delta;
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        failed = true;
        // 只回传泛化信息，不回显上游错误（可能带 key 或内网地址）
        controller.enqueue(encoder.encode("\n\n[连接中断，请检查模型配置]"));
        console.error("[reports] stream failed", err instanceof Error ? err.name : "unknown");
      } finally {
        controller.close();
      }

      // 流正常结束才落库；模型没产出有效内容（空 summary）也不落
      if (failed) return;
      const narration = parseNarration(acc);
      if (!narration.summary) return;

      try {
        await prisma.report.upsert({
          where: { userId_date: { userId, date: reportDate } },
          create: {
            userId,
            date: reportDate,
            content: renderReportMarkdown(narration),
            summary: narration.summary.slice(0, 200),
            stats: { metrics, actions: narration.actions },
          },
          update: {
            content: renderReportMarkdown(narration),
            summary: narration.summary.slice(0, 200),
            stats: { metrics, actions: narration.actions },
          },
        });
      } catch (err) {
        // 报告内容已经流给用户了，落库失败只记日志
        console.error("[reports] save failed", err instanceof Error ? err.name : "unknown");
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
