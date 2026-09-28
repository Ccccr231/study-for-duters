# Study for DUTERS

面向大连理工学生（DUTERS）的学习台：**计划 → 专注 → 打卡 → 复盘**。

> 面向 DUT 学生的个人开源项目，**非官方**。不使用学校官方校徽与标准字作为产品标识，视觉元素均为自绘。
> 平台的 LLM 由使用者自行配置（Base URL / API Key / Model），**本项目不预置任何密钥**。

## 当前进度

- ✅ **W1**：账号（邮箱+密码）、学习计划与任务、番茄钟、打卡（连续天数 + 12 周热力图）、大工蓝主题、移动端布局
- ✅ **W2**：连小理对话（流式）、知识库 RAG（`.md` → 分块 → embedding → pgvector，未配 embedding 时降级全文检索）、设置页自填 LLM 配置（默认只存浏览器）
  - 待端到端验证：连数据库与真实 LLM 配置后的实际效果（见 PLAN.md §14）
- ⏳ **W3**：Agent Loop、每日学习报告、上线
  - 已做：每日学习报告（`/reports`，Observe → Compute → Narrate；指标纯函数 + 27 例单测；报告落库 `Report` 表；建议 action 只展示不自动写库）
  - 未做：Vercel Cron 定时生成（受「配置默认只存浏览器」约束，见 PLAN §14）、上线

详见 `PLAN.md`（方案与里程碑）、`REVIEW-2026-09-28.md`（外部执行审查记录）。

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
| `pnpm test` | 单元测试（vitest，W2 的 Compute 阶段会用到） |

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
```

## 说明

- **主色**：大工蓝，对应官方标准色 CMYK(90,45,0,0)，网页近似 `#1A5FB4`（`app/globals.css` 里一处改完全局生效）。拿到官方 RGB 后替换即可。
- **认证**：邮箱 + 密码，scrypt 哈希，会话为 httpOnly Cookie（JWT，30 天）。
- **日期**：按 UTC 切日，见 `lib/date.ts`。
- **不使用 next/font/google**：构建期需连外网，改用系统中文字体栈。
