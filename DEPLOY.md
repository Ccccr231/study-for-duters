# 上线手册（W3）

目标：把 `study-for-duters` 部署到 Vercel，数据库用 Neon（Postgres + pgvector）。
前置：有 Neon 账号、Vercel 账号，代码已推到远端仓库。

## 1. Neon 建库

1. Neon 控制台新建项目（区域选离 Vercel 部署区最近的，通常新加坡/美西）。
2. 打开 SQL Editor，**整段执行** `prisma/migrations/000000_init/migration.sql`
   （含 `CREATE EXTENSION vector`，pgvector 与业务表同库）。
3. 复制连接串（带 `sslmode=require` 的那条）。

> 如果之后想在本地跑 `pnpm exec prisma migrate deploy` 管理迁移，需要先
> `pnpm exec prisma migrate resolve --applied 000000_init` 对齐迁移记录。
> 只在 Vercel 上用、不再本地演进 schema 的话，跳过这步也行。

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

按顺序点一遍，任何一步失败先查 Vercel Function Logs：

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

- **日期按 UTC 切日**（`lib/date.ts`）：北京时间早 8 点前的记录会算到前一天，
  单校区够用；跨时区再把时区存进 `UserSetting`。
- **没有 Cron 定时报告**：LLM 配置默认只存浏览器，服务端拿不到 key，
  报告是打开 `/reports` 时手动触发的（PLAN §14 #13）。做了 `ENCRYPTION_KEY`
  存库流程后才可以补 Cron。
- **CSP 未配置**：基线安全头已加（nosniff / DENY / Referrer-Policy / Permissions-Policy），
  CSP 等上线后按浏览器控制台报错逐步收紧。
- **staging 验证**：建议先在 Vercel Preview 部署上把 §4 跑一遍，再 promote 到 Production。
