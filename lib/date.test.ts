import { describe, expect, it } from "vitest";
import {
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  clampSessionMinutes,
  startOfToday,
} from "@/lib/date";

// 固定"现在"，避免用真实时钟导致断言漂移。
const NOW = new Date("2026-09-28T12:00:00Z");

function minutesAgo(m: number): Date {
  return new Date(NOW.getTime() - m * 60_000);
}

describe("clampSessionMinutes", () => {
  it("正常区间按四舍五入返回", () => {
    expect(clampSessionMinutes(minutesAgo(25), NOW)).toBe(25);
    expect(clampSessionMinutes(minutesAgo(44.4), NOW)).toBe(44);
    expect(clampSessionMinutes(minutesAgo(44.6), NOW)).toBe(45);
  });

  it("下限：不足 1 分钟记 1 分钟", () => {
    expect(clampSessionMinutes(minutesAgo(0.2), NOW)).toBe(MIN_SESSION_MINUTES);
    expect(clampSessionMinutes(NOW, NOW)).toBe(MIN_SESSION_MINUTES);
  });

  it("上限：超大时长被夹到 MAX_SESSION_MINUTES（防手改表单刷时长）", () => {
    // 客户端上报一个 30 天前的 startedAt —— 修复前会落库 43200 分钟并计入今日/周统计。
    expect(clampSessionMinutes(minutesAgo(30 * 24 * 60), NOW)).toBe(MAX_SESSION_MINUTES);
    expect(clampSessionMinutes(minutesAgo(1000), NOW)).toBe(MAX_SESSION_MINUTES);
  });

  it("startedAt 在未来（客户端时钟漂移）记最小时长，不作废记录", () => {
    const future = new Date(NOW.getTime() + 5 * 60_000);
    expect(clampSessionMinutes(future, NOW)).toBe(MIN_SESSION_MINUTES);
  });

  it("恰好等于上限时不再压缩", () => {
    expect(clampSessionMinutes(minutesAgo(MAX_SESSION_MINUTES), NOW)).toBe(MAX_SESSION_MINUTES);
    expect(clampSessionMinutes(minutesAgo(MAX_SESSION_MINUTES + 1), NOW)).toBe(MAX_SESSION_MINUTES);
  });

  it("永远落在 [MIN, MAX] 区间内", () => {
    for (const m of [-120, -1, 0, 0.4, 1, 25, 180, 181, 5000, 43_200]) {
      const d = clampSessionMinutes(minutesAgo(m), NOW);
      expect(d).toBeGreaterThanOrEqual(MIN_SESSION_MINUTES);
      expect(d).toBeLessThanOrEqual(MAX_SESSION_MINUTES);
      expect(Number.isInteger(d)).toBe(true);
    }
  });
});

describe("startOfToday", () => {
  it("返回 UTC 当日 00:00，与 lib/streak.ts 的 UTC 切日口径一致", () => {
    const t = startOfToday();
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
    expect(t.getUTCSeconds()).toBe(0);
    expect(t.getUTCMilliseconds()).toBe(0);
    // 同一天多次调用必须落在同一个 UTC 日历日
    expect(t.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });
});
