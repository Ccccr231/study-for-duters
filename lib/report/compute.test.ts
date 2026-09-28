import { describe, expect, it } from "vitest";
import { computeMetrics, type RawSession, type RawTask } from "./compute";

const TODAY = "2026-09-28";

function session(day: string, duration: number, completed = true): RawSession {
  return { day, duration, completed };
}

function task(
  id: string,
  overrides: Partial<RawTask> = {},
): RawTask {
  return {
    id,
    title: `任务${id}`,
    done: false,
    createdDay: TODAY,
    dueDay: null,
    ...overrides,
  };
}

describe("computeMetrics", () => {
  it("统计今日专注时长与番茄数（只算已完成的）", () => {
    const m = computeMetrics({
      today: TODAY,
      sessions: [
        session(TODAY, 25),
        session(TODAY, 45),
        session(TODAY, 25, false), // 中断的不算
        session("2026-09-27", 25), // 昨天的不算进今日
      ],
      tasks: [],
      checkInDays: [],
    });
    expect(m.focusMinutesToday).toBe(70);
    expect(m.pomodorosToday).toBe(2);
  });

  it("近 7 天窗口含今天、含 6 天前，不含 7 天前", () => {
    const m = computeMetrics({
      today: TODAY,
      sessions: [
        session("2026-09-22", 25), // 恰好 6 天前 → 算
        session("2026-09-21", 25), // 7 天前 → 不算
        session(TODAY, 25),
      ],
      tasks: [],
      checkInDays: [],
    });
    expect(m.focusMinutes7d).toBe(50);
    expect(m.pomodoros7d).toBe(2);
  });

  it("完成率只统计近 7 天到期的任务；窗口内无到期任务时为 null", () => {
    const withDue = computeMetrics({
      today: TODAY,
      sessions: [],
      tasks: [
        task("a", { done: true, dueDay: "2026-09-25" }),
        task("b", { dueDay: TODAY }),
        task("c", { dueDay: "2026-09-21" }), // 7 天前到期 → 不算
        task("d", { dueDay: "2026-10-01" }), // 未来到期 → 不算
        task("e"), // 无截止 → 不算
      ],
      checkInDays: [],
    });
    expect(withDue.dueTasks7d).toBe(2);
    expect(withDue.doneTasks7d).toBe(1);
    expect(withDue.completionRate7d).toBe(0.5);

    const noDue = computeMetrics({ today: TODAY, sessions: [], tasks: [task("a")], checkInDays: [] });
    expect(noDue.completionRate7d).toBeNull();
  });

  it("停滞任务：未完成且创建超过 2 天；已完成或新创建的不算", () => {
    const m = computeMetrics({
      today: TODAY,
      sessions: [],
      tasks: [
        task("old", { createdDay: "2026-09-26" }), // 恰好 2 天前 → 停滞
        task("older", { createdDay: "2026-09-20" }), // 停滞
        task("new", { createdDay: "2026-09-27" }), // 1 天前 → 不算
        task("doneOld", { createdDay: "2026-09-20", done: true }), // 已完成 → 不算
      ],
      checkInDays: [],
    });
    expect(m.staleTasks.map((t) => t.id).sort()).toEqual(["old", "older"]);
  });

  it("待办列表只含未完成任务；连续打卡天数复用 computeStreak 规则", () => {
    const m = computeMetrics({
      today: TODAY,
      sessions: [],
      tasks: [task("a"), task("b", { done: true }), task("c")],
      checkInDays: ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-20"],
    });
    expect(m.pendingTaskTitles).toEqual(["任务a", "任务c"]);
    expect(m.streakDays).toBe(3); // 26/27/28 连续，20 号断开
  });
});
