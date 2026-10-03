import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 第三方压缩产物（pdf.js 的 worker，由 scripts/sync-pdf-worker.mjs 从依赖复制而来），
    // 不该被 lint，也不该被我们改。
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
