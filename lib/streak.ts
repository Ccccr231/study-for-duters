// 连续打卡天数：纯函数，方便单测（不碰数据库）。
// 日期统一用 UTC 日历日的 YYYY-MM-DD 字符串，避免时区扰动。

export const DAY_MS = 24 * 60 * 60 * 1000;

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftKey(key: string, days: number): string {
  return dateKey(new Date(new Date(`${key}T00:00:00Z`).getTime() + days * DAY_MS));
}

/**
 * 连续天数。规则：
 * - 最后一次打卡是今天或昨天才可能 > 0（今天没打卡但昨天打了，连续数保留，给用户一天宽限）
 * - 从最后一次打卡往回逐天数，断一天就停
 */
export function computeStreak(dayKeys: string[], today: string): number {
  if (dayKeys.length === 0) return 0;

  const set = new Set(dayKeys);
  const last = [...dayKeys].sort().at(-1)!;
  if (last !== today && last !== shiftKey(today, -1)) return 0;

  let streak = 0;
  let cursor = last;
  while (set.has(cursor)) {
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}
