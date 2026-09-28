// Markdown 分块：先按标题切段，段内再按滑动窗口切。
// 单位用「字符数」近似 token 数（中文 1 字约 0.6~1 token，英文 1 token 约 4 字符），
// 取 800/120 这组经验值即可，不追求精确——分块质量靠「合并小段 + 保留标题前缀」保证。

export const DEFAULT_CHUNK_SIZE = 800;
export const DEFAULT_CHUNK_OVERLAP = 120;

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

type Section = { heading: string | null; body: string };

/** 按标题把文档切成若干段，标题会作为后续每个块的前缀保留。 */
function splitByHeading(md: string): Section[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ heading, body });
    buffer = [];
  };

  for (const line of lines) {
    const m = HEADING_RE.exec(line);
    if (m) {
      flush();
      heading = m[2].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/** 滑动窗口切一段文本。 */
function sliding(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text];

  const step = Math.max(1, size - overlap);
  const out: string[] = [];
  for (let start = 0; start < text.length; start += step) {
    const piece = text.slice(start, start + size).trim();
    if (piece) out.push(piece);
    if (start + size >= text.length) break;
  }
  return out;
}

export function chunkMarkdown(
  md: string,
  opts: { size?: number; overlap?: number } = {},
): string[] {
  const size = opts.size ?? DEFAULT_CHUNK_SIZE;
  const overlap = opts.overlap ?? DEFAULT_CHUNK_OVERLAP;
  if (!md.trim()) return [];

  const chunks: string[] = [];
  for (const section of splitByHeading(md)) {
    // 标题本身也算内容：单独一块时保证短章节不会被丢掉
    const prefix = section.heading ? `## ${section.heading}\n\n` : "";
    for (const piece of sliding(section.body, size, overlap)) {
      chunks.push(`${prefix}${piece}`.trim());
    }
  }

  // 合并过小的相邻块，避免一堆碎片（每个碎片都要一次 embedding）
  const merged: string[] = [];
  const minSize = Math.floor(size / 4);
  for (const chunk of chunks) {
    const last = merged.at(-1);
    if (last && (last.length < minSize || chunk.length < minSize) && last.length + chunk.length <= size * 1.5) {
      merged[merged.length - 1] = `${last}\n\n${chunk}`;
    } else {
      merged.push(chunk);
    }
  }

  return merged;
}
