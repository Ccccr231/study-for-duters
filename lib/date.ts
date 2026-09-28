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

/** 用 UTC 字段格式化，避免服务端（UTC）与浏览器时区不一致导致水合错位。 */
export function formatChineseDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getUTCDay()];
  return `${y} 年 ${m} 月 ${d} 日 · 周${week}`;
}
