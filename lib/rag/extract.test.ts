import { describe, expect, it } from "vitest";
import { detectKind, isCjk, joinTextPieces } from "./extract";

// 这些纯函数守的是「PDF 提取出来的中文能不能读」这件事。
// 端到端测试太脆（要真 PDF + 浏览器），关键逻辑放这里。
// 真实来源：pdf.js 把 "数据结构复习笔记" 切成 ["数据","构复","笔","结","习","记"]，
// 且碎片顺序与视觉顺序不一致（已按坐标重排），拼接时若一律补空格就得到
// "数据 结构复 习笔 记" —— 这些用例就是那次修复的回归测试。

describe("isCjk", () => {
  it("识别汉字与中文标点", () => {
    expect(isCjk("数")).toBe(true);
    expect(isCjk("。")).toBe(true);
    expect(isCjk("，")).toBe(true);
    expect(isCjk("）")).toBe(true);
  });

  it("英文、数字、空格不算 CJK", () => {
    expect(isCjk("A")).toBe(false);
    expect(isCjk("9")).toBe(false);
    expect(isCjk(" ")).toBe(false);
  });
});

describe("joinTextPieces", () => {
  it("汉字之间不补空格（否则中文会被拆成一个个字）", () => {
    expect(joinTextPieces(["数据", "结构", "复习", "笔记"])).toBe("数据结构复习笔记");
  });

  it("英文碎片之间不补空格（补了会变成 Bellman- Ford）", () => {
    // 实测：若这里补空格，原文里已是 "Bellman-Ford" 的部分会变成 "Bellman- Ford"。
    // 碎片自带的尾空格会原样保留（可能产生连续空格），压空格是 tidy 的职责。
    expect(joinTextPieces(["Bellman", "Ford"])).toBe("BellmanFord");
    expect(joinTextPieces(["Bellman ", "Ford"])).toBe("Bellman  Ford");
  });

  it("中英交界处补一个空格", () => {
    expect(joinTextPieces(["按", "LL"])).toBe("按 LL");
    expect(joinTextPieces(["LL", "四种"])).toBe("LL 四种");
  });

  it("数字与汉字之间也补空格", () => {
    expect(joinTextPieces(["第", "12", "页"])).toBe("第 12 页");
  });

  it("忽略空片段", () => {
    expect(joinTextPieces(["红黑树", "", "插入"])).toBe("红黑树插入");
  });

  it("还原真实案例：PDF 碎片拼回可读的一句话", () => {
    // 模拟按 x 坐标排序后的碎片序列
    expect(joinTextPieces(["红黑树", "插入", "时，如果", "叔叔", "节点", "是红色", "的"])).toBe(
      "红黑树插入时，如果叔叔节点是红色的",
    );
  });
});

describe("detectKind", () => {
  it("按扩展名判断格式（大小写不敏感）", () => {
    expect(detectKind("笔记.pdf")).toBe("pdf");
    expect(detectKind("论文.DOCX")).toBe("docx");
    expect(detectKind("课件.pptx")).toBe("pptx");
    expect(detectKind("成绩表.xlsx")).toBe("xlsx");
    expect(detectKind("notes.md")).toBe("text");
    expect(detectKind("readme.txt")).toBe("text");
  });

  it("旧版二进制 Office 格式归为 unsupported（要提示用户另存）", () => {
    expect(detectKind("老文档.doc")).toBe("unsupported");
    expect(detectKind("老课件.ppt")).toBe("unsupported");
    expect(detectKind("老表格.xls")).toBe("unsupported");
  });
});
