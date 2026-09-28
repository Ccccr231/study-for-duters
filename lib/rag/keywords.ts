// 关键词检索的查询词提取：纯函数，必须有单测。
// 用于未配置 embedding 时的降级检索（PLAN §8.2 / §14 #18）。
//
// 为什么不能用整句 ILIKE：中文自然语言提问（「红黑树插入时叔叔是红色怎么办？」）
// 几乎不可能整句出现在笔记里，整句匹配 = 永远零命中。
// 做法：CJK 连续段切成二字组（bigram），拉丁词原样保留，检索端按命中数排序。

const CJK_RUN = /\p{Script=Han}+/gu;
const LATIN_WORD = /[A-Za-z0-9][A-Za-z0-9+.#-]*/g;

const MAX_KEYWORDS = 24;

/**
 * 从自然语言问题里提取检索关键词：
 * - CJK 连续段 → 去重二字组（单字段保留单字）
 * - 拉丁/数字词（≥2 字符）→ 原样
 * 结果去重、限量，保持出现顺序。
 */
export function extractKeywords(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (w: string) => {
    if (w && !seen.has(w) && out.length < MAX_KEYWORDS) {
      seen.add(w);
      out.push(w);
    }
  };

  for (const m of text.matchAll(CJK_RUN)) {
    const run = m[0];
    if (run.length === 1) {
      push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) {
      push(run.slice(i, i + 2));
    }
  }

  for (const m of text.matchAll(LATIN_WORD)) {
    if (m[0].length >= 2) push(m[0].toLowerCase());
  }

  return out;
}
