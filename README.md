# Study for DUTERS

面向大连理工学生（DUTERS）的学习台：**计划 → 专注 → 打卡 → 复盘**。

> 面向 DUT 学生的个人开源项目，**非官方**。不使用学校官方校徽与标准字作为产品标识，视觉元素均为自绘。
> 平台的 LLM 由使用者自行配置（Base URL / API Key / Model），**本项目不预置任何密钥**。

## 当前进度

- ✅ **W1**：账号（邮箱+密码）、学习计划与任务、番茄钟、打卡（连续天数 + 12 周热力图）、大工蓝主题、移动端布局
- ✅ **W2**：连小理对话（流式）、知识库 RAG（`.md` → 分块 → embedding → pgvector，未配 embedding 时降级 bigram 关键词检索）、设置页自填 LLM 配置（默认只存浏览器）
- ✅ **W3**：Agent Loop（Observe → Compute → Narrate，指标纯函数 + 33 例单测）、每日学习报告（`/reports`，落库 `Report` 表，建议 action 只展示不自动写库）、上线就绪（安全头 / 404 / 错误页 / 自绘图标 / robots）
- ⏳ **上线**：Vercel 部署待执行（`DEPLOY.md` 是完整手册）；Vercel Cron 定时报告未做（受「LLM 配置默认只存浏览器」约束，见 PLAN §14 #13）
- ✅ **验证**：接口级 e2e 17/17、浏览器 UI e2e 11/11（真实 Chrome + 真实 Neon）、单元测试 40/40

详见 `PLAN.md`（方案与里程碑）、`DEPLOY.md`（上线手册）、`AUDIT-2026-09-28-静态审查.md`（Server Action 权属与幂等审查）、`REVIEW-2026-09-28.md`（外部执行审查记录）。

## 技术栈

Next.js 16（App Router）· TypeScript · Prisma 7（driver adapter）· Neon Postgres + pgvector · Tailwind v4 · Vercel AI SDK（W2）

## 本地跑起来

```bash
cp .env.example .env      # 填 DATABASE_URL（Neon）和 AUTH_SECRET
pnpm install
pnpm exec prisma generate
```

建表：在 Neon 控制台执行 `prisma/migrations/000000_init/migration.sql`（含 `CREATE EXTENSION vector`），
然后 `pnpm exec prisma migrate resolve --applied 000000_init` 让迁移记录对齐。

```bash
pnpm dev                  # http://localhost:3000
```

常用脚本：

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建 / 启动 |
| `pnpm typecheck` | 类型检查 |
| `pnpm test` | 单元测试（vitest） |
| `node scripts/apply-migration.mjs` | 手动应用迁移（schema-engine 连不上 Neon 时的 fallback，幂等） |
| `node scripts/e2e.mjs` | 接口级端到端验收 17 项（需先起生产服务器 + `DEEPSEEK_API_KEY` 环境变量） |
| `node scripts/ui-e2e.mjs` | 浏览器 UI 验收 11 项（真实 Chrome 走注册/登录/表单/聊天/报告，截图存 `scripts/ui-e2e-shots/`） |

## 部署

| 方式 | 文档 | 适用 |
|---|---|---|
| Vercel + Neon | `DEPLOY.md` | 有 Vercel 账号，免运维 |
| **自己的服务器** | `deploy/SERVER.md` + `deploy/install.sh` | 要 24/7 在线、不想依赖第三方平台 |

服务器方式为一键脚本（Ubuntu）：装 Node、拉代码、建 `.env`、构建、注册 systemd 开机自启、
开放端口、自检，全程无需手工配置。

## 目录

```
app/
  page.tsx            落地页（已登录跳 /today）
  login/ register/    邮箱 + 密码
  (app)/today         今日视图：待办、今日统计、打卡
  (app)/plans         计划列表 / 计划详情（任务 CRUD）
  (app)/focus         番茄钟（25 / 45 分钟，结束落库）
  (app)/checkin       打卡 + 12 周热力图
  (app)/chat          连小理对话（流式）
  (app)/knowledge     知识库：上传 .md / 检索问答
  (app)/reports       学习报告：指标卡片 + 连小理 AI 总结 + 历史报告
  (app)/settings/model  LLM 配置（Base URL / Key / Model，默认只存浏览器）
  api/chat            连小理流式接口（注入学习数据）
  api/knowledge/      ingest（分块+向量入库）/ ask（检索，降级 ILIKE）
  api/reports         生成每日报告（流式，结束后 upsert Report 表）
  api/settings/test   测试 LLM 连接（不回显上游错误）
lib/
  db.ts               Prisma 7 + @prisma/adapter-pg
  auth/               password（scrypt）· session（jose Cookie）· constants
  actions/            Server Actions：auth / study
  date.ts             按 UTC 切日的日期工具
  ai/                 配置解析 · provider · 连小理 system prompt · 浏览器侧配置
  rag/                Markdown 分块（800/120，小段合并）
  report/             Compute 纯函数（指标）· Narrate 提示词与行协议解析
  streak.ts           连续打卡天数（纯函数）
components/
  dut/                海浪 · 主楼剪影 · 玉兰（自绘）
  shell/              底部导航（5 tab）
  study/              今日任务 · 番茄钟 · 打卡日历
  liaxiaoli/          对话面板    knowledge/  知识库面板    settings/  模型设置
  reports/            报告生成面板
proxy.ts              会话粗筛（Next 16 的 middleware 新约定）
deploy/
  install.sh          服务器一键部署（Ubuntu，装依赖 → 构建 → systemd 自启）
  SERVER.md           自托管手册（选机器、安全组、运维、上 HTTPS）
```

## 说明

- **主色**：大工蓝，对应官方标准色 CMYK(90,45,0,0)，网页近似 `#1A5FB4`（`app/globals.css` 里一处改完全局生效）。拿到官方 RGB 后替换即可。
- **认证**：邮箱 + 密码，scrypt 哈希，会话为 httpOnly Cookie（JWT，30 天）。
- **日期**：按 UTC 切日，见 `lib/date.ts`。
- **不使用 next/font/google**：构建期需连外网，改用系统中文字体栈。
- **密钥不落库**：平台的 LLM 配置（Base URL / Key / Model）默认只存浏览器 localStorage；
  服务端不接受也不保存任何预置密钥，日志不记请求体。部署方只需配 `DATABASE_URL` 与 `AUTH_SECRET`。

## 测试

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` | TypeScript 类型检查（0 错误） |
| `pnpm test` | 单元测试（vitest，40 例：日期钳制 / 分块 / 关键词 / 报告指标 / 行协议 / LLM 配置 / 连续打卡） |

以上三项均已在真实环境跑过：`next build` 20/20 页通过、`tsc` 0 错误、`eslint` 0 问题、vitest 40/40。

## 许可与合规

- 本项目以 **MIT License** 开源，见 [LICENSE](LICENSE)。
- **非官方**：个人项目，与大连理工大学无隶属关系，不代表校方立场，不宣称官方出品。
- **校徽使用（已由项目所有者明确决定）**：首次进入的开场序列使用**官方校徽**
  （`public/dut-emblem.png`，由官方图稿抠去圆外留白后生成）。
  ⚠️ 原 `PLAN.md §6.3` 的约定是「不使用官方校徽、自绘标识」；此项已按所有者要求变更，
  相关许可责任随之转移——校徽与校名标准字的使用受学校 VI 管理办法约束，
  以经营为目的使用需申请许可。
  如需回归自绘方案，把 `components/dut/Emblem.tsx` 里的 `EMBLEM_SRC` 换成自绘资源即可，
  其余代码无需改动。
- 其余装饰元素（海浪 / 玉兰 / 主楼剪影）仍为**自绘抽象图形**，不使用官方素材。
- **依赖许可已盘点**：全树 570 个包，无 GPL / AGPL / SSPL / 商业限制类许可，
  以 MIT（433）/ ISC（56）/ Apache-2.0（49）为主；
  含弱 copyleft 的仅 MPL-2.0（`lightningcss`、`axe-core`）、EPL-2.0（`elkjs`，均为构建/测试期依赖）
  与 `@img/sharp-win32-x64`（`Apache-2.0 AND LGPL-3.0-or-later`，Next 自带的可选图像优化二进制），
  这些不影响本项目以 MIT 分发。
- **不预置任何资料**：知识库只承载用户自己上传的内容，仓库内不含第三方题库 / 教材 / 试卷。
- **AI 生成内容**：连小理的回答由使用者自配的模型生成，可能出错；统计数字由 SQL / 纯函数算出（不经模型），
  但模型对数字的文字解读仍需自行判断。

