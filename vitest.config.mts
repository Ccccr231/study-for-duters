import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 只跑 lib/ 下的纯逻辑单测（不碰数据库、不需要网络）
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
