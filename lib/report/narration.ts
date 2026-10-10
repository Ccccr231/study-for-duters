// Agent Loop 的 Narrate 阶段：把 Compute 算出的指标交给 LLM，只让它「解释数字 + 给建议」。
// 输出走固定行协议（和 __SOURCES__ 一个思路），解析是纯函数，必须有单测（PLAN §8.1）。

import type { StudyMetrics } from "./compute";

/** 白名单 Action。PLAN §8.1：不允许 AI 直接删除用户数据；本阶段只支持 create_task 建议。 */
export type SuggestedAction = {
  type: "create_task";
  title: string;
  reason: string;
};

export type Narration = {
  /** 200 字内的今日总结 */
  summary: string;
  /** 明日建议（短列表，每条一行） */
  advice: string[];
  actions: SuggestedAction[];
};

const ACTION_WHITELIST = new Set(["create_task"]);

export function buildNarrationPrompt(metrics: StudyMetrics): string {
  const stats = {
    日期: metrics.date,
    今日专注分钟: metrics.focusMinutesToday,
    今日番茄数: metrics.pomodorosToday,
    近7天专注分钟: metrics.focusMinutes7d,
    近7天番茄数: metrics.pomodoros7d,
    近7天到期任务完成率:
      metrics.completionRate7d === null
        ? "无到期任务"
        : `${metrics.doneTasks7d}/${metrics.dueTasks7d}`,
    连续打卡天数: metrics.streakDays,
    待办任务: metrics.pendingTaskTitles,
    停滞任务_超2天未推进: metrics.staleTasks.map((t) => t.title),
  };

  return `下面是这位同学今天的学习数据（数据库统计结果，每一个数字都是准确的，直接引用，不要自己算别的数字）：

${JSON.stringify(stats, null, 2)}

请严格按以下行格式输出，不要输出任何其他内容：

SUMMARY: <今日总结，200 字以内，学长/学姐语气，基于上面的数字说话>
ADVICE: <明日建议第一条，一句话，可执行>
ADVICE: <明日建议第二条，一句话>
ACTION: create_task | <建议创建的任务标题> | <为什么建议，一句话>

规则：
- ADVICE 1~3 条，每条一行。
- ACTION 行可选、最多 2 条，且类型只能是 create_task；没有合适的建议就不写 ACTION 行。
- 所有数字必须原样引用上面的数据，禁止编造或自行推算新指标。`;
}

const MAX_TITLE_LEN = 60;
const MAX_REASON_LEN = 120;
const MAX_ACTIONS = 2;

/**
 * 解析模型输出。容错策略：
 * - 只认行首的 SUMMARY:/ADVICE:/ACTION:（全角冒号也认）
 * - 没有 SUMMARY 行时，把全文（去掉可识别的行）作为 summary，保证页面上有东西可看
 * - 非白名单 action 类型直接丢弃
 */
export function parseNarration(text: string): Narration {
  const lines = text.split(/\r?\n/);
  let summary = "";
  const advice: string[] = [];
  const actions: SuggestedAction[] = [];
  const leftover: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = /^(SUMMARY|ADVICE|ACTION)\s*[:：]\s*(.*)$/i.exec(line);
    if (!m) {
      leftover.push(line);
      continue;
    }

    const kind = m[1].toUpperCase();
    const payload = m[2].trim();

    if (kind === "SUMMARY") {
      if (!summary) summary = payload;
    } else if (kind === "ADVICE") {
      if (payload && advice.length < 3) advice.push(payload);
    } else if (kind === "ACTION") {
      const [type = "", title = "", reason = ""] = payload.split("|").map((s) => s.trim());
      if (
        ACTION_WHITELIST.has(type) &&
        title &&
        actions.length < MAX_ACTIONS
      ) {
        actions.push({
          type: "create_task",
          title: title.slice(0, MAX_TITLE_LEN),
          reason: (reason || "学习教练根据你的学习数据建议").slice(0, MAX_REASON_LEN),
        });
      }
    }
  }

  if (!summary) summary = leftover.join("\n").trim();

  return { summary, advice, actions };
}

/** 报告正文（Markdown）：总结 + 明日建议。存进 Report.content。 */
export function renderReportMarkdown(n: Narration): string {
  const parts = [n.summary];
  if (n.advice.length > 0) {
    parts.push("", "**明日建议**", ...n.advice.map((a) => `- ${a}`));
  }
  return parts.join("\n");
}
