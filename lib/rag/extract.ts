/**
 * 浏览器端资料解析：把 PDF / Word / PPT / Excel 提取成纯文本，再交给服务端分块入库。
 *
 * 为什么在客户端解析（而不是服务端）：
 * 1. 不受任何函数时限约束——当初「只收 Markdown」的理由是 Vercel 免费层 60s 超时，
 *    项目改自托管后该约束已不存在（见 PLAN §14 #22）；
 * 2. 不占服务器内存——几十 MB 的 PDF 在服务端解析有 OOM 风险；
 * 3. 能给出真实进度（第 12/40 页），失败也能在浏览器里直接看到原因。
 *
 * 解析库全部**动态 import**：只有用户真的选了文件才加载，
 * 不拖累知识库页面的首屏体积。
 */

export type ExtractProgress = (message: string, ratio?: number) => void;

export type ExtractResult = {
  /** 提取出的纯文本（Markdown 标题不是必需的，分块器按段落/标题切） */
  text: string;
  /** 用于提示用户的名字建议 */
  suggestedTitle: string;
  /** 页数 / 幻灯片数 / 工作表数，用于提示 */
  units: number;
  /** 解析过程中值得告诉用户的降级信息 */
  notice?: string;
};

/** 按扩展名归类 */
export type FileKind = "pdf" | "docx" | "pptx" | "xlsx" | "text" | "unsupported";

export function detectKind(fileName: string): FileKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "pptx":
      return "pptx";
    case "xlsx":
      return "xlsx";
    case "md":
    case "markdown":
    case "txt":
    case "text":
      return "text";
    default:
      // .doc / .ppt / .xls 是上世纪的二进制格式，解析库都不支持，明确告诉用户另存为新格式
      return "unsupported";
  }
}

/** 供 <input accept> 用 */
export const ACCEPT_ATTR =
  ".pdf,.docx,.pptx,.xlsx,.md,.markdown,.txt,application/pdf,text/markdown,text/plain";

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * 清理提取出的文本。
 *
 * 注意全部用 `[ \t]` 而不是 `\s`：`\s` 会把换行也吃掉，
 * 结果标题和正文会被粘成一整行（实测踩过），破坏原有的段落结构。
 * 这里只规整**水平空格**，换行结构原样保留。
 */
function tidy(raw: string): string {  return (
    raw
      .replace(/\r\n?/g, "\n")
      // 汉字之间的空格是拼接产生的，不是原文的（中文不用空格分词）
      .replace(
        /(?<=[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])[ \t]+(?=[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g,
        "",
      )
      // 汉字与英文/数字交界处留一个空格，反之亦然（避免英文单词粘连）
      .replace(/(?<=[\u4e00-\u9fff])[ \t]*(?=[A-Za-z0-9])/g, " ")
      .replace(/(?<=[A-Za-z0-9])[ \t]*(?=[\u4e00-\u9fff])/g, " ")
      // 中文标点前不留空格
      .replace(/[ \t]+(?=[，。；：、！？）】》”])/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** 是否 CJK（含中文标点区间）——用于判断"这里到底该不该加空格" */
export function isCjk(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x4e00 && c <= 0x9fff) || // 基本汉字
    (c >= 0x3400 && c <= 0x4dbf) || // 扩展 A
    (c >= 0x3000 && c <= 0x303f) || // 中文标点
    (c >= 0xff00 && c <= 0xffef) // 全角
  );
}

/**
 * 拼接一段文字里的碎片。
 *
 * 关键：**汉字之间不能补空格**。PDF 的文字碎片是按字体/排版切开的，
 * 若一律用空格 join，"数据结构复习笔记"会变成"数据 构复 笔 结 习 记"。
 *
 * 规则：**恰好一侧是 ASCII 字母/数字时才补空格**（中英交界）——
 * 汉字之间不补（中文不用空格分词），英文之间也不补
 * （碎片本身已带空格，或本就是同一个词的两段）。
 */
export function joinTextPieces(pieces: string[]): string {
  const isLatin = (ch: string) => /[A-Za-z0-9]/.test(ch);
  let out = "";
  for (const piece of pieces) {
    if (!piece) continue;
    if (out) {
      const prev = out[out.length - 1];
      const next = piece[0];
      if (isLatin(prev) !== isLatin(next)) out += " ";
    }
    out += piece;
  }
  return out;
}

/* ---------------- PDF ---------------- */

async function extractPdf(file: File, onProgress: ExtractProgress): Promise<ExtractResult> {
  const pdfjs = await import("pdfjs-dist");
  // worker 版本必须与主库完全一致，否则 pdf.js 会拒绝工作。
  // 这里把 worker 放在 public/ 下由同一份依赖复制而来（见 package.json 的 sync:pdf-worker），
  // 用静态路径而不是 CDN：内网/离线环境也能用。
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buf = await file.arrayBuffer();
  onProgress("正在读取 PDF…");
  const task = pdfjs.getDocument({ data: buf });
  const doc = await task.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress(`正在提取文字 第 ${i}/${doc.numPages} 页`, i / doc.numPages);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // pdf.js 给出的 item 顺序**不一定等于阅读顺序**：同一行常被按字体/排版切开、
    // 且顺序错乱（实测："数据结构复习笔记" 的碎片顺序是 数据 / 构复 / 笔 / 结 / 习 / 记，
    // 其中"结"的 x 坐标比"笔"更靠左）。所以按坐标重排：
    // 先按 y 分行，行内按 x 从左到右。
    type Piece = { str: string; x: number; y: number };
    const pieces: Piece[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str) continue;
      pieces.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
    }
    // y 相同视为同一行（浮点误差容忍 2pt）
    const lines: Piece[][] = [];
    for (const p of pieces) {
      const line = lines.find((l) => Math.abs(l[0].y - p.y) < 2);
      if (line) line.push(p);
      else lines.push([p]);
    }
    const ordered = lines
      .sort((a, b) => b[0].y - a[0].y) // y 越大越靠上
      .map((line) => joinTextPieces(line.sort((a, b) => a.x - b.x).map((p) => p.str)))
      .filter((s) => s.trim().length > 0);

    if (ordered.length) pages.push(ordered.join("\n"));
  }

  // pdfjs-dist 6 起 PDFDocumentProxy 不再有 destroy()，释放走 loadingTask
  await task.destroy();

  const joined = tidy(pages.join("\n\n"));
  // 扫描版 PDF 只有图片、没有文字层 —— 必须如实说明，否则用户会以为程序坏了
  const notice =
    joined.length < 50 && doc.numPages > 0
      ? "这份 PDF 里没有找到文字（多半是扫描件或拍照版），需要 OCR 才能读，暂时传不进来"
      : undefined;

  return {
    text: joined,
    suggestedTitle: baseName(file.name),
    units: doc.numPages,
    notice,
  };
}

/* ---------------- Word (.docx) ---------------- */

async function extractDocx(file: File, onProgress: ExtractProgress): Promise<ExtractResult> {
  onProgress("正在解析 Word 文档…");
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  // extractRawText 会保留段落换行，正好适合后续分块
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return {
    text: tidy(result.value),
    suggestedTitle: baseName(file.name),
    units: 1,
  };
}

/* ---------------- ZIP 容器（PPTX / XLSX） ---------------- */

async function openZip(file: File): Promise<import("jszip")> {
  const JSZip = (await import("jszip")).default;
  return JSZip.loadAsync(await file.arrayBuffer());
}

/** 把一段 XML 里的所有文字按文档顺序取出 */
function textFromXml(xml: string, textTag: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const nodes = Array.from(doc.getElementsByTagName(textTag));
  return nodes.map((n) => n.textContent ?? "").filter((s) => s.trim().length > 0);
}

async function extractPptx(file: File, onProgress: ExtractProgress): Promise<ExtractResult> {
  onProgress("正在解析 PPT…");
  const zip = await openZip(file);
  // 幻灯片文件名形如 ppt/slides/slide12.xml，要按数字排序而不是字典序
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  const slides: string[] = [];
  for (let i = 0; i < slideNames.length; i++) {
    onProgress(`正在提取文字 第 ${i + 1}/${slideNames.length} 张幻灯片`, (i + 1) / slideNames.length);
    const xml = await zip.file(slideNames[i])!.async("text");
    const lines = textFromXml(xml, "a:t");
    if (lines.length) slides.push(`第 ${i + 1} 页\n${lines.join("\n")}`);
  }

  return {
    text: tidy(slides.join("\n\n")),
    suggestedTitle: baseName(file.name),
    units: slideNames.length,
  };
}

async function extractXlsx(file: File, onProgress: ExtractProgress): Promise<ExtractResult> {
  onProgress("正在解析 Excel…");
  const zip = await openZip(file);

  // 共享字符串表：单元格类型为 s 时，值是这个表里的下标
  const shared: string[] = [];
  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (sharedFile) {
    const xml = await sharedFile.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      // 一个 si 里可能有多个富文本 run
      const parts = Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "");
      shared.push(parts.join(""));
    }
  }

  const sheetNames = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();

  const sheets: string[] = [];
  for (let i = 0; i < sheetNames.length; i++) {
    onProgress(`正在提取表格 第 ${i + 1}/${sheetNames.length} 个工作表`, (i + 1) / sheetNames.length);
    const xml = await zip.file(sheetNames[i])!.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");

    const rows: string[] = [];
    for (const row of Array.from(doc.getElementsByTagName("row"))) {
      const cells: string[] = [];
      for (const c of Array.from(row.getElementsByTagName("c"))) {
        const type = c.getAttribute("t");
        if (type === "inlineStr") {
          cells.push(Array.from(c.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
        } else {
          const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
          cells.push(type === "s" ? (shared[Number(v)] ?? "") : v);
        }
      }
      const line = cells.filter((s) => s.trim().length > 0).join(" | ");
      if (line) rows.push(line);
    }
    if (rows.length) sheets.push(`工作表 ${i + 1}\n${rows.join("\n")}`);
  }

  return {
    text: tidy(sheets.join("\n\n")),
    suggestedTitle: baseName(file.name),
    units: sheetNames.length,
  };
}

/* ---------------- 纯文本 ---------------- */

async function extractText(file: File): Promise<ExtractResult> {
  const raw = await file.text();
  return { text: tidy(raw), suggestedTitle: baseName(file.name), units: 1 };
}

/* ---------------- 统一入口 ---------------- */

export async function extractFileText(
  file: File,
  onProgress: ExtractProgress,
): Promise<ExtractResult> {
  const kind = detectKind(file.name);
  switch (kind) {
    case "pdf":
      return extractPdf(file, onProgress);
    case "docx":
      return extractDocx(file, onProgress);
    case "pptx":
      return extractPptx(file, onProgress);
    case "xlsx":
      return extractXlsx(file, onProgress);
    case "text":
      return extractText(file);
    default:
      throw new Error(
        "这个格式暂时读不了。旧版 .doc / .ppt / .xls 请先用 Office 或 WPS「另存为」.docx / .pptx / .xlsx 再传",
      );
  }
}
