// 把 pdf.js 的 worker 从依赖里同步到 public/。
//
// 为什么需要它：pdf.js 的 worker 版本必须与主库**完全一致**，否则直接拒绝工作。
// 放 public/ 用静态路径（而不是 CDN）是为了内网/离线也能用。
// 手工复制会在升级 pdfjs-dist 后悄悄失配，所以固化成脚本，并挂在 postinstall 上。
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const src = join("node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const dest = join("public", "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn(`[sync-pdf-worker] 找不到 ${src}，跳过（未安装 pdfjs-dist？）`);
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[sync-pdf-worker] 已同步 -> ${dest}`);
