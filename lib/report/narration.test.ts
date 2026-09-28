import { describe, expect, it } from "vitest";
import { parseNarration, renderReportMarkdown } from "./narration";

describe("parseNarration", () => {
  it("解析标准格式", () => {
    const n = parseNarration(
      [
        "SUMMARY: 今天专注了 50 分钟，两个番茄，节奏不错。",
        "ADVICE: 先把数据结构的链表题刷完",
        "ADVICE: 晚上补一次打卡",
        "ACTION: create_task | 复习链表反转 | 停滞 3 天了，明天最小一步",
      ].join("\n"),
    );
    expect(n.summary).toBe("今天专注了 50 分钟，两个番茄，节奏不错。");
    expect(n.advice).toEqual(["先把数据结构的链表题刷完", "晚上补一次打卡"]);
    expect(n.actions).toEqual([
      { type: "create_task", title: "复习链表反转", reason: "停滞 3 天了，明天最小一步" },
    ]);
  });

  it("兼容全角冒号与大小写", () => {
    const n = parseNarration("summary：今天没学，明天从 25 分钟开始。\nadvice: 只开一个番茄");
    expect(n.summary).toBe("今天没学，明天从 25 分钟开始。");
    expect(n.advice).toEqual(["只开一个番茄"]);
  });

  it("非白名单 action 丢弃，create_task 缺标题丢弃", () => {
    const n = parseNarration(
      [
        "SUMMARY: 总结",
        "ACTION: delete_task | 高数作业 | 删掉它",
        "ACTION: create_task |  | 没标题",
        "ACTION: create_task | 背单词 100 个 | 词汇量是该补了",
      ].join("\n"),
    );
    expect(n.actions).toEqual([
      { type: "create_task", title: "背单词 100 个", reason: "词汇量是该补了" },
    ]);
  });

  it("ADVICE 最多 3 条，ACTION 最多 2 条", () => {
    const text = [
      "SUMMARY: s",
      ...Array.from({ length: 5 }, (_, i) => `ADVICE: 建议${i}`),
      ...Array.from({ length: 4 }, (_, i) => `ACTION: create_task | 任务${i} | 理由${i}`),
    ].join("\n");
    const n = parseNarration(text);
    expect(n.advice).toHaveLength(3);
    expect(n.actions).toHaveLength(2);
  });

  it("完全没有 SUMMARY 行时，全文降级为 summary，保证有内容可看", () => {
    const n = parseNarration("今天状态一般，但打卡没断。\n明天先从一个小番茄开始。");
    expect(n.summary).toContain("今天状态一般");
    expect(n.advice).toEqual([]);
    expect(n.actions).toEqual([]);
  });

  it("ADVICE 行不会混进降级 summary", () => {
    const n = parseNarration("开头说了一句\nADVICE: 去睡觉\n结尾又说了一句");
    expect(n.summary).toBe("开头说了一句\n结尾又说了一句");
    expect(n.advice).toEqual(["去睡觉"]);
  });
});

describe("renderReportMarkdown", () => {
  it("总结 + 建议列表；无建议时只有总结", () => {
    expect(
      renderReportMarkdown({ summary: "s", advice: ["a", "b"], actions: [] }),
    ).toBe("s\n\n**明日建议**\n- a\n- b");
    expect(renderReportMarkdown({ summary: "s", advice: [], actions: [] })).toBe("s");
  });
});
