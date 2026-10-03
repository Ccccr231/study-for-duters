// 密钥泄漏排查：扫工作区与**全部 git 历史**（历史里的凭据同样会被 clone 带走）。
//
// 为什么需要它：本项目真实发生过一次 —— 有人把 Vercel token 的完整明文
// 写进 CHECKPOINT 文档并提交，导致 17 个提交都带着它；
// 只改工作区不够，必须重写历史 + 强制推送才能清除。
//
// 用法：node scripts/secret-scan.mjs
// 退出码 1 = 发现可疑内容。
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** 常见凭据形态。注意：这里**不能**写任何真实凭据，否则脚本本身就成了泄漏源。 */
const PATTERNS = [
  { name: "OpenAI/DeepSeek 风格 API Key", re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { name: "Vercel Token", re: /\bvcp_[A-Za-z0-9]{20,}/g },
  { name: "GitHub Token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: "Neon 连接串凭据", re: /\bnpg_[A-Za-z0-9]{10,}/g },
  { name: "含密码的 Postgres 连接串", re: /postgres(?:ql)?:\/\/[^:\s"']+:[^@\s"']+@/g },
  { name: "私钥块", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // 兜底：形如 "apiKey": "很长的一串"
  {
    name: "疑似硬编码的 key/token/secret",
    re: /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/gi,
  },
];

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "design-shots"]);
const SKIP_FILE = /pnpm-lock\.yaml|package-lock\.json/;

/**
 * 本地凭据文件：`.env` 本就该放真凭据，且已被 .gitignore 排除，不是泄漏。
 * 判断"是否会被提交"比判断"是否含凭据"更有意义 —— 泄漏的前提是进了版本库。
 */
const LOCAL_ONLY = /(^|[\\/])\.env(\.local|\.development|\.production)?$/;

/** 占位符文本：`.env.example` 里出现这些属正常 */
const PLACEHOLDER = /USER|PASSWORD|PASSWD|YOUR|CHANGE|EXAMPLE|xxx|\.\.\.|<|>/i;

let problems = 0;
let skippedLocal = 0;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (!SKIP_FILE.test(p)) out.push(p);
  }
  return out;
}

// ---------- 1. 工作区 ----------
console.log("工作区扫描（跳过 .env 等本地凭据文件 —— 它们被 gitignore 排除，不构成泄漏）：");
const files = walk(".");
for (const file of files) {
  if (LOCAL_ONLY.test(file)) {
    skippedLocal++;
    continue;
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // 二进制等读不了就跳过
  }
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (!m) continue;
    // 占位符（.env.example 之类）不算
    if (m.every((hit) => PLACEHOLDER.test(hit))) continue;
    problems++;
    console.log(`  ❌ ${file} 命中「${name}」：${m[0].slice(0, 24)}…`);
  }
}
if (problems === 0) console.log(`  ✅ 无命中（跳过 ${skippedLocal} 个本地凭据文件）`);

// ---------- 2. git 历史 ----------
console.log("\ngit 历史扫描（所有提交，历史里的凭据会被 clone 带走）：");
let revs = [];
try {
  revs = execFileSync("git", ["rev-list", "--all"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
} catch {
  console.log("  （不是 git 仓库，跳过）");
}

if (revs.length) {
  let histHits = 0;
  for (const { name, re } of PATTERNS) {
    // git grep 对每个模式在全部历史里找（用 -E 的扩展正则，需转换写法）
    const pattern = re.source.replace(/\\b/g, "\\b");
    try {
      const out = execFileSync(
        "git",
        ["grep", "-I", "-l", "-E", pattern, ...revs],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const lines = out.split("\n").filter(Boolean);
      if (lines.length) {
        histHits += lines.length;
        problems += lines.length;
        const sample = lines[0].split(":")[0].slice(0, 8);
        console.log(`  ❌ 历史命中「${name}」：${lines.length} 处（如提交 ${sample}）`);
      }
    } catch {
      // git grep 无命中时返回非 0，属正常
    }
  }
  if (histHits === 0) {
    console.log(`  ✅ ${revs.length} 个提交全部干净`);
  } else {
    console.log(
      "\n  清除方式：git filter-branch --index-filter（见 CHECKPOINT 里 2026-10-03 的记录），" +
        "\n  必须同时删除 refs/original、expire reflog、git gc --prune=now，然后 force push；" +
        "\n  ⚠️ 已经推出去的凭据**必须去服务商侧 revoke** —— 清除历史不能替代吊销。",
    );
  }
}

console.log(`\n${problems === 0 ? "✅ 通过：未发现凭据泄漏" : `❌ 发现 ${problems} 处可疑内容`}`);
process.exit(problems === 0 ? 0 : 1);
