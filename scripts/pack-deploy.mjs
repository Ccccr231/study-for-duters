// 打包一个干净的可部署压缩包，供 scp 上传到服务器。
//
// 为什么用 `git archive` 而不是压缩整个目录：
// - 只含**已提交**的内容，不会把 node_modules / .next / .env / 临时文件带上去
// - 不含 .git，服务器上也就没有仓库历史（私有仓库的关键：不需要任何 GitHub 凭据）
// - .gitattributes 会生效（`deploy/*.sh` 已固定 LF，避免 Windows CRLF 上传后在 Linux 跑不了）
//
// 用法：
//   node scripts/pack-deploy.mjs            # 打包当前 HEAD
//   node scripts/pack-deploy.mjs --out D:\  # 指定输出目录
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT_DIR = outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : resolve(".");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const git = (a) => execFileSync("git", a, { encoding: "utf8" }).trim();

// 工作区必须干净：否则打出来的包与你以为的版本不一致
const dirty = git(["status", "--porcelain"]);
if (dirty) {
  console.error("✗ 工作区有未提交改动，请先提交（否则打出的包不是你预期的版本）：");
  console.error(dirty.split("\n").slice(0, 10).map((l) => "   " + l).join("\n"));
  process.exit(1);
}

const sha = git(["rev-parse", "HEAD"]);
const short = sha.slice(0, 7);
const subject = git(["log", "-1", "--format=%s"]);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

const tarName = `sfd-${short}.tar.gz`;
const tarPath = join(OUT_DIR, tarName);

// git archive 的 --prefix 让解压出来有一个顶层目录，配合 --strip-components=1 使用
execFileSync("git", [
  "archive",
  "--format=tar.gz",
  `--prefix=study-for-duters-${short}/`,
  "-o",
  tarPath,
  "HEAD",
]);

const kb = (statSync(tarPath).size / 1024).toFixed(0);

// 校验关键文件都在（少一个都可能在服务器上装不起来）
// ⚠️ 必须同时去掉 \r 和空行：Windows 的 tar 输出是 CRLF，
//    只 split('\n') 会让每个条目带一个 \r，导致 includes() 全部匹配失败
//    （第一次就是这么误报"压缩包缺少关键文件"的）。
const entries = execFileSync("tar", ["-tzf", tarPath], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);
const prefix = `study-for-duters-${short}/`;
const REQUIRED = [
  "package.json",
  "pnpm-lock.yaml",
  "deploy/install.sh",
  "prisma/schema.prisma",
  "prisma/migrations/000000_init/migration.sql",
  "public/pdf.worker.min.mjs",
  "scripts/apply-migration.mjs",
  "scripts/check-db.mjs",
  "scripts/sync-pdf-worker.mjs",
];
const missing = REQUIRED.filter((f) => !entries.includes(prefix + f));
if (missing.length) {
  console.error(`✗ 压缩包缺少关键文件：${missing.join(", ")}`);
  process.exit(1);
}
if (entries.some((e) => e.startsWith(prefix + "node_modules/") || e.startsWith(prefix + ".next/"))) {
  console.error("✗ 压缩包里混进了 node_modules 或 .next");
  process.exit(1);
}
if (entries.some((e) => e === prefix + ".env")) {
  console.error("✗ 压缩包里含 .env（绝不能上传）");
  process.exit(1);
}

console.log(`✅ 已打包 ${tarPath}`);
console.log(`   版本   ${short} · ${subject}`);
console.log(`   分支   ${branch}`);
console.log(`   大小   ${kb} KB · ${entries.filter(Boolean).length} 项`);
console.log(`   已校验 关键文件齐全；不含 node_modules / .next / .env / .git`);
console.log(`
下一步（把 <IP> 换成服务器公网 IP）：

  1) 上传
     scp "${tarPath}" root@<IP>:/root/

  2) 服务器上解包并部署
     mkdir -p /opt/study-for-duters-src
     tar -xzf /root/${tarName} -C /opt/study-for-duters-src --strip-components=1
     sudo bash /opt/study-for-duters-src/deploy/install.sh

  3) 装完必须补数据库迁移（install.sh 不做这步）
     cd /opt/study-for-duters
     pnpm exec prisma migrate deploy     # 失败则 node scripts/apply-migration.mjs
     node scripts/check-db.mjs           # 自检：表数与 pgvector

  4) 去云控制台安全组放行 TCP 3000（脚本改不了这一步）
`);
