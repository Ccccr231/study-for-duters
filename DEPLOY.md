# 上线手册（W3）

目标：把 `study-for-duters` 部署到 Vercel，数据库用 Neon（Postgres + pgvector）。
前置：有 Neon 账号、Vercel 账号，代码已推到远端仓库。

## 1. Neon 建库

1. Neon 控制台新建项目（区域选离 Vercel 部署区最近的，通常新加坡/美西）。
2. 应用迁移，两种方式选一个：
   - **首选**：本地填好 `.env` 后 `pnpm exec prisma migrate deploy`；
   - **fallback**：如果 schema-engine 连不上（Windows 上 CLI 子进程参数转义的已知问题，
     或 Neon 冷启动超时），用 `node scripts/apply-migration.mjs`——直接走 pg 驱动执行
     `prisma/migrations/000000_init/migration.sql` 并在 `_prisma_migrations` 登记，幂等。
3. 复制连接串（带 `sslmode=require` 的那条）。**不要带 `channel_binding=require`**：
   pg 驱动没问题，但 Prisma schema-engine 不支持。

> 2026-09-28 验收记录：当前 Neon 库（us-east-2）已通过 `scripts/apply-migration.mjs`
> 完成迁移，9 张业务表 + pgvector 扩展就绪；17 项端到端验收全部通过（`scripts/e2e.mjs`）。

## 2. 环境变量

| 变量 | 值 | 说明 |
|---|---|---|
| `DATABASE_URL` | Neon 连接串 | 必填 |
| `AUTH_SECRET` | `openssl rand -base64 32` 生成 | 必填，会话 JWT 签名；没有它登录会 500 |
| `ENCRYPTION_KEY` | 同上命令再生成一个 | **可选**，用户 LLM Key「跨设备同步」（AES-GCM 存库）的加密密钥；不配则 Key 只能存浏览器 |

不要把任何 LLM Key 写进环境变量——模型的 Base URL / Key / Model 由使用者在
「设置 → 模型」里自填（PLAN §4 的硬性约定）。

## 3. Vercel 部署

1. Import 仓库，Framework 选 Next.js（自动识别），**不需要改构建命令**。
2. 填上面三个环境变量（Production）。
3. Deploy。构建期不连数据库（所有页面都是 dynamic，`lib/db.ts` 延迟实例化），
   所以即使 DATABASE_URL 还没填对也能 build 过——但运行时会挂，别忘了一起填。

## 4. 上线后逐项验收（手动，约 10 分钟）

先在本地跑自动化验收（需要生产服务器已启动）：

```bash
pnpm exec next build && pnpm exec next start -p 3100
DEEPSEEK_API_KEY=sk-... node scripts/e2e.mjs      # 17 项：页面/对话/知识库降级/报告落库
DEEPSEEK_API_KEY=sk-... node scripts/ui-e2e.mjs   # 11 项：注册/登录/计划任务/打卡/设置/聊天/知识库/报告（真实 Chrome）
pnpm test                                          # 40 例单元测试
pnpm typecheck                                     # 类型检查
```

> 本机已实测：`pnpm build` 完整通过（20/20 页）、`pnpm typecheck` 0 错误、`pnpm test` 40/40。
> e2e 脚本需要 `DEEPSEEK_API_KEY`（聊天/知识库/报告三项会调模型），没配 key 时只覆盖其余项。

再按顺序手动点一遍（浏览器验收已覆盖的项可快速过），任何一步失败先查部署平台的 Function Logs：

- [ ] 落地页 200，favicon 是大工蓝「连」字标
- [ ] 注册新账号 → 自动进入 `/today`
- [ ] 退出 → 再登录（验证 Cookie 会话与 `AUTH_SECRET`）
- [ ] 未登录直接访问 `/today` `/chat` `/knowledge` `/reports` → 全部 307 到登录页
- [ ] 建一个计划 + 两个任务，勾掉一个（验证任务 CRUD 落库）
- [ ] 番茄钟跑一个 25 分钟（或改短验证），结束落库，今日视图分钟数上涨
- [ ] 打卡 → 连续天数变 1，热力图当天格变深蓝
- [ ] 「设置 → 模型」填 Base URL / Key / 模型名 → 测试连接通过
- [ ] `/chat` 连小理流式对话，回答里引用的是你的真实待办/打卡数据
- [ ] `/knowledge` 上传一个 `.md` → 状态 ready → 提问能命中并标注来源
  （没配 embedding 模型时应走 ILIKE 降级，同样能答）
- [ ] `/reports` 生成今日总结 → 刷新后报告仍在（验证 Report 落库），
  「连小理建议」只展示、不会自动建任务

## 5. 已知边界与遗留项

- **Server Action 已加固**（2026-09-28，见 `AUDIT-2026-09-28-静态审查.md`）：全部 7 个 Action
  都带 `requireUser()` 与 `userId` 归属过滤；本轮补了三处——专注时长服务端钳制到 ≤180 分钟
  （防手改表单灌假数据）、番茄钟 `taskId` 归属校验、打卡并发冲突按幂等处理。
- **向量维度固定 1536**：`Chunk.embedding` 是 `vector(1536)`，配 embedding 模型时输出维度必须一致
  （OpenAI text-embedding-3-small = 1536 可以；768/3072 维的模型会在 ingest 时报维度不匹配，
  需要改迁移重建列）。向量写入与余弦检索已过数据库级验证（2026-09-28）。
- **日期按 UTC 切日**（`lib/date.ts`）：北京时间早 8 点前的记录会算到前一天，
  单校区够用；跨时区再把时区存进 `UserSetting`。
- **没有 Cron 定时报告**：LLM 配置默认只存浏览器，服务端拿不到 key，
  报告是打开 `/reports` 时手动触发的（PLAN §14 #13）。做了 `ENCRYPTION_KEY`
  存库流程后才可以补 Cron。
- **CSP 未配置**：基线安全头已加（nosniff / DENY / Referrer-Policy / Permissions-Policy），
  CSP 等上线后按浏览器控制台报错逐步收紧。
- **staging 验证**：建议先在 Vercel Preview 部署上把 §4 跑一遍，再 promote 到 Production。
