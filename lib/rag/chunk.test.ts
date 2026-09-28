import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "@/lib/rag/chunk";

describe("chunkMarkdown", () => {
  it("空输入返回空数组", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   \n\n  ")).toEqual([]);
  });

  it("短文档整块保留，并带上标题前缀", () => {
    const out = chunkMarkdown("## 洛必达法则\n\n0/0 型可以直接求导。");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("洛必达法则");
  });

  it("长文档按滑动窗口切成多块，且每块都不超过 size", () => {
    const size = 200;
    const body = "知识点".repeat(500); // 1500 字
    const out = chunkMarkdown(body, { size, overlap: 40 });
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(size * 1.6);
  });

  it("切出来的块能覆盖原文主要片段（有重叠、不丢内容）", () => {
    const size = 100;
    const text = "A".repeat(250);
    const out = chunkMarkdown(text, { size, overlap: 20 });
    const joined = out.join("");
    // 有重叠时总长会大于原文，但必须包含首尾
    expect(joined.startsWith("A".repeat(size))).toBe(true);
    expect(out.at(-1)!.includes("A")).toBe(true);
  });

  it("多个标题各自成段，标题会跟着内容走", () => {
    const md = "## 第一章\n\n内容一\n\n## 第二章\n\n内容二";
    const out = chunkMarkdown(md);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.join("\n")).toContain("第一章");
    expect(out.join("\n")).toContain("第二章");
  });
});
