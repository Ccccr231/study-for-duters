const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 当天 00:00（UTC）。
 * 已知简化：按 UTC 切日而非用户本地时区，单校区场景够用；
 * v2 若跨时区，把时区存进 UserSetting 后按偏移切日。
 */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** 单次专注时长上限（分钟）：超过这个数一定是异常输入或时钟问题，不是真实专注。 */
export const MAX_SESSION_MINUTES = 180;

/**
 * 单次专注时长下限（分钟）：不足 1 分钟也记 1，避免 0 分钟记录污染均值。
 */
export const MIN_SESSION_MINUTES = 1;

/**
 * 由「客户端上报的开始时间」算专注时长（分钟），并做服务端钳制。
 *
 * 为什么不直接信前端传的 duration：Server Action 的入参全部来自浏览器，
 * 客户端可以随便填 startedAt。若不做钳制，一个手改的表单能把 duration
 * 写成任意大数，直接灌进今日时长 / 周时长 / 报告指标。
 *
 * 规则：startedAt 在未来 → 记最小时长（时钟漂移很常见，不作废整条记录）；
 * 其余按 now - startedAt 四舍五入并夹到 [MIN, MAX]。
 */
export function clampSessionMinutes(startedAt: Date, now: Date = new Date()): number {
  const raw = Math.round((now.getTime() - startedAt.getTime()) / 60000);
  if (!Number.isFinite(raw) || raw < MIN_SESSION_MINUTES) return MIN_SESSION_MINUTES;
  return Math.min(raw, MAX_SESSION_MINUTES);
}

/** 用 UTC 字段格式化，避免服务端（UTC）与浏览器时区不一致导致水合错位。 */
export function formatChineseDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getUTCDay()];
  return `${y} 年 ${m} 月 ${d} 日 · 周${week}`;
}
