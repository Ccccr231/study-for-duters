import { describe, expect, it } from "vitest";
import { maskKey, parseLlmConfig } from "@/lib/ai/config";
import { computeStreak, shiftKey } from "@/lib/streak";

describe("parseLlmConfig", () => {
  it("正常配置通过，并去掉结尾斜杠", () => {
    const r = parseLlmConfig({
      baseUrl: "https://api.deepseek.com/v1/",
      apiKey: "sk-test",
      chatModel: "deepseek-chat",
      temperature: 0.7,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(r.config.chatModel).toBe("deepseek-chat");
    expect(r.config.temperature).toBe(0.7);
    expect(r.config.embedModel).toBeUndefined();
  });

  it("缺字段返回对应原因，而不是抛错", () => {
    expect(parseLlmConfig({}).ok).toBe(false);
    expect(parseLlmConfig({ baseUrl: "https://x.com", apiKey: "k" })).toEqual({
      ok: false,
      reason: "missing_model",
    });
    expect(parseLlmConfig({ baseUrl: "ftp://x.com", apiKey: "k", chatModel: "m" })).toEqual({
      ok: false,
      reason: "bad_url",
    });
  });

  it("temperature 越界会被夹到 0~2，非法值回落 0.3", () => {
    const a = parseLlmConfig({ baseUrl: "https://x.com", apiKey: "k", chatModel: "m", temperature: 9 });
    expect(a.ok && a.config.temperature).toBe(2);
    const b = parseLlmConfig({ baseUrl: "https://x.com", apiKey: "k", chatModel: "m", temperature: "abc" });
    expect(b.ok && b.config.temperature).toBe(0.3);
  });

  it("maskKey 只留后四位", () => {
    expect(maskKey("sk-abcdefgh1234")).toContain("1234");
    expect(maskKey("sk-abcdefgh1234")).not.toContain("abcdefgh");
  });
});

describe("computeStreak", () => {
  const today = "2026-09-28";

  it("没打过卡是 0", () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it("今天打了卡，从今天往回数", () => {
    expect(computeStreak(["2026-09-26", "2026-09-27", "2026-09-28"], today)).toBe(3);
  });

  it("今天没打但昨天打了，保留连续数（给一天宽限）", () => {
    expect(computeStreak(["2026-09-26", "2026-09-27"], today)).toBe(2);
  });

  it("断档超过一天就归零", () => {
    expect(computeStreak(["2026-09-20", "2026-09-21"], today)).toBe(0);
  });

  it("中间有空洞只数最后一段", () => {
    expect(computeStreak(["2026-09-24", "2026-09-26", "2026-09-27", "2026-09-28"], today)).toBe(3);
  });

  it("shiftKey 前后推移正确", () => {
    expect(shiftKey("2026-09-28", -1)).toBe("2026-09-27");
    expect(shiftKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});
