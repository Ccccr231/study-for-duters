// Agent Loop 的 Compute 阶段：原始数据 → 指标。纯函数，不碰数据库，必须有单测（PLAN §8.1）。
// 所有日期一律用 UTC 日历日的 YYYY-MM-DD 字符串（与 lib/streak.ts 一致）。

import { computeStreak } from "@/lib/streak";

export type RawSession = {
  /** 开始时间的 UTC 日期 key（YYYY-MM-DD） */
  day: string;
  /** 分钟 */
  duration: number;
  completed: boolean;
};

export type RawTask = {
  id: string;
  title: string;
  done: boolean;
  /** 创建时间的 UTC 日期 key */
  createdDay: string;
  /** 截止日期的 UTC 日期 key，无则 null */
  dueDay: string | null;
};

export type StudyMetrics = {
  /** 统计对象日（今天），YYYY-MM-DD */
  date: string;
  focusMinutesToday: number;
  pomodorosToday: number;
  focusMinutes7d: number;
  pomodoros7d: number;
  /** 近 7 天到期任务的完成率（0~1）；窗口内没有到期任务时为 null */
  completionRate7d: number | null;
  dueTasks7d: number;
  doneTasks7d: number;
  streakDays: number;
  /** 未完成任务标题（按 sortOrder 排好序传入，最多 8 个） */
  pendingTaskTitles: string[];
  /** 停滞任务：未完成且创建超过 2 天（Task 没有 updatedAt，用创建时间近似，见 PLAN §14） */
  staleTasks: { id: string; title: string }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDay(key: string, days: number): string {
  return new Date(new Date(`${key}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function computeMetrics(input: {
  today: string;
  sessions: RawSession[];
  tasks: RawTask[];
  checkInDays: string[];
}): StudyMetrics {
  const { today, sessions, tasks, checkInDays } = input;
  const weekStart = shiftDay(today, -6); // 近 7 天含今天

  const doneSessions = sessions.filter((s) => s.completed);
  const todaySessions = doneSessions.filter((s) => s.day === today);
  const weekSessions = doneSessions.filter((s) => s.day >= weekStart && s.day <= today);

  const dueInWeek = tasks.filter((t) => t.dueDay !== null && t.dueDay >= weekStart && t.dueDay <= today);
  const doneDueInWeek = dueInWeek.filter((t) => t.done);

  const staleThreshold = shiftDay(today, -2);
  const staleTasks = tasks
    .filter((t) => !t.done && t.createdDay <= staleThreshold)
    .map((t) => ({ id: t.id, title: t.title }));

  return {
    date: today,
    focusMinutesToday: todaySessions.reduce((sum, s) => sum + s.duration, 0),
    pomodorosToday: todaySessions.length,
    focusMinutes7d: weekSessions.reduce((sum, s) => sum + s.duration, 0),
    pomodoros7d: weekSessions.length,
    completionRate7d: dueInWeek.length === 0 ? null : doneDueInWeek.length / dueInWeek.length,
    dueTasks7d: dueInWeek.length,
    doneTasks7d: doneDueInWeek.length,
    streakDays: computeStreak(checkInDays, today),
    pendingTaskTitles: tasks.filter((t) => !t.done).map((t) => t.title),
    staleTasks,
  };
}
