import { describe, expect, it } from "vitest";
import { extractKeywords } from "./keywords";

describe("extractKeywords", () => {
  it("中文整句切成二字组", () => {
    const kws = extractKeywords("红黑树插入");
    expect(kws).toEqual(["红黑", "黑树", "树插", "插入"]);
  });

  it("自然语言提问能提出实义词", () => {
    const kws = extractKeywords("红黑树插入时叔叔是红色怎么办？");
    expect(kws).toContain("红黑");
    expect(kws).toContain("叔叔");
    expect(kws).toContain("红色");
  });

  it("拉丁词原样保留并小写化，单字符拉丁丢弃", () => {
    const kws = extractKeywords("C++ 的 vector 和 list 有什么区别");
    expect(kws).toContain("c++");
    expect(kws).toContain("vector");
    expect(kws).toContain("list");
  });

  it("中英混合：二字组 + 拉丁词都有", () => {
    const kws = extractKeywords("B树和B+树的区别");
    expect(kws.some((k) => k === "树和")).toBe(true);
  });

  it("去重且限量 24 个", () => {
    const kws = extractKeywords("ababababab".repeat(10) + "一".repeat(100));
    expect(new Set(kws).size).toBe(kws.length);
    expect(kws.length).toBeLessThanOrEqual(24);
  });

  it("空输入 / 只有标点 → 空数组", () => {
    expect(extractKeywords("")).toEqual([]);
    expect(extractKeywords("？？？…")).toEqual([]);
  });
});
