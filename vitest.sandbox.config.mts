// 沙箱/受限环境专用 vitest 配置。
//
// 为什么需要它：vitest 默认的 `forks` 池要靠「父进程 pipe 捕获子进程输出」拉起 worker。
// 在受限执行环境里（本机 DSH 沙箱）这条 spawn 会被拒（EPERM spawnSync / EPERM pipe），
// 表现为 `[vitest-pool]: Failed to terminate forks worker`，测试根本跑不起来。
// `threads` 池在进程内起 worker，不需要 pipe，因此在这个环境能跑。
//
// 注意：这里的内容必须与 vitest.config.mts 保持一致（同样的 alias 与 include）。
// 两者重复是为了绕开上述环境限制，不是配置分裂——正常机器上请直接用 `pnpm test`
// （vitest.config.mts），不要改 package.json 的默认配置去迁就本机沙箱。
//
// 用法：node node_modules/vitest/vitest.mjs run --config vitest.sandbox.config.mts
import { fileURLToPath } from "node:url";

const config = {
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    pool: "threads",
  },
};

export default config;
