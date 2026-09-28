# Study for DUTERS · 交接报告（给 codex）

> 交接时间：2026-09-28 21:30（UTC+8）
> 交接对象：接手「阿里云服务器部署」+「网页 UI 动效美化」的 agent
> 项目：面向大连理工学生（DUTERS）的 AI 学习台：计划 → 专注 → 打卡 → 复盘

---

## 0. 一句话现状

**功能已完整、已验证、已推送 GitHub；线上还没部署（原 Vercel 路线因账号受限放弃）。**
本轮要做的是两件事：**① 走阿里云自托管部署上线；② 网页 UI 动效美化。**

---

## 1. 仓库与关键位置

| 项目 | 值 |
|---|---|
| 代码路径 | `C:\Users\chenr\Documents\deepseek-harness\default-workspace\study-for-duters` |
| GitHub | `Ccccr231/study-for-duters`（**PRIVATE**，origin 用 SSH） |
| 当前 HEAD | `cfdd0cb`（14 个 commit，**工作区干净，本地与远端完全一致**） |
| 分支 | `main` |
| 数据库 | Neon Postgres（us-east-2）+ pgvector，**迁移已完成**，10 张表 |
| 方案文档 | `PLAN.md`（§14 是实现偏差记录，**改代码前必读**） |
| 安全审查 | `AUDIT-2026-09-28-静态审查.md` |
| 上线手册 | `DEPLOY.md`（Vercel 路线）、`deploy/SERVER.md` + `deploy/install.sh`（自托管路线） |

`.env`（gitignored）里已有可用的 `DATABASE_URL` 和 `AUTH_SECRET`。

---

## 2. 已完成并验证的工作（不要重做）

| 模块 | 状态 |
|---|---|
| W1 账号/计划任务/番茄钟/打卡 + 大工蓝主题 | ✅ |
| W2 连小理流式对话 + 知识库 RAG + 设置页 | ✅ |
| W3 每日学习报告（Agent Loop）+ 上线就绪 | ✅ |
| 安全审查（Server Action 权属/幂等加固） | ✅ `5cef7ad` |
| 接口级 e2e 17/17（真实 Neon + DeepSeek） | ✅ `scripts/e2e.mjs` |
| 浏览器 UI e2e 11/11（真实 Chrome 全表单） | ✅ `scripts/ui-e2e.mjs` |
| 单元测试 40 例 | ✅ |
| 开源准备（MIT LICENSE + 合规声明） | ✅ `bd7979f` |

### 本轮完整验证结果（21:00 复跑，全绿）

| 检查 | 结果 |
|---|---|
| `pnpm build`（next build） | ✅ **20/20 页通过** |
| `pnpm typecheck`（tsc --noEmit） | ✅ 0 错误 |
| `pnpm test`（vitest） | ✅ **40/40** |
| `eslint` | ✅ 0 问题 |
| 公网真实浏览器验收（真实 Chrome + 真实 Neon） | ✅ **14/14** |

公网 14 项覆盖：注册 → 落库、退出、重新登录、建计划、建任务、勾选任务（`done` 落库）、
打卡（`streak=1` 落库）、5 个受保护页可达性。

### 数据库现状

- `User` 表有 **1 个账号**：`caochenrui0410@qq.com`（**用户本人注册的，不要删**）
- 其余表为空。我的测试账号已全部清理。

---

## 3. 任务一：阿里云服务器部署上线

### 3.1 用户已确认的选择

| 决策项 | 选择 |
|---|---|
| 平台 | **阿里云**（不走 Vercel） |
| 域名 | **暂时没有**，先用 `http://公网IP:端口` |
| 数据库 | **继续用现有 Neon**，不在服务器上装 Postgres |
| 仓库可见性 | 仍 PRIVATE，验完再考虑转 public |

### 3.2 已有资产（直接用，别重写）

- **`deploy/install.sh`** —— 一键部署脚本，已经写好并验证：
  - 语法：`bash -n` 通过；入库 blob 为**纯 LF**（CR=0，见 `.gitattributes` 的 `*.sh text eol=lf`）
  - 流程：装 Node 22 + pnpm → `git clone` 到 `/opt/study-for-duters` → 生成 `.env`
    （`AUTH_SECRET` 自动生成，`DATABASE_URL` 交互式填入）→ `pnpm install` →
    `prisma generate` → `pnpm build` → 注册 systemd（开机自启 + 崩溃重启）→
    开放 ufw 端口 → 自检并打印访问地址
  - **幂等**，可重复运行
  - 构建失败时提示加 swap（2G 机器 OOM 的常见坑）
- **`deploy/SERVER.md`** —— 自托管手册：选机器、安全组、排障顺序、运维命令、加 swap、
  以及后续补域名上 HTTPS 的 Caddy 完整步骤。

### 3.3 部署步骤

```bash
# 1. 上传脚本（仓库私有，raw 链接会 404）
scp deploy/install.sh root@服务器IP:/root/

# 2. 执行
sudo bash /root/install.sh
#    中途粘贴 Neon 的 DATABASE_URL（带 sslmode=require，不要带 channel_binding=require）

# 3. 阿里云控制台「安全组」入方向放行应用端口（脚本改不了，最常见的失败原因）

# 4. 访问 http://服务器IP:3000
```

### 3.4 阿里云特有注意事项（重点）

1. **安全组**：阿里云轻量/ECS 默认不放行自定义端口。必须在控制台入方向放行（如 3000）。
   这是「脚本报成功但打不开」的头号原因。
2. **地域与备案**：国内地域绑域名需 **ICP 备案**（1–2 周）。要免备案选**香港**。
   纯 IP + 端口访问不涉及备案。
3. **内存**：Next 构建吃内存，**2G 是下限，1G 会 OOM**。用 2 核 2G 起，并加 2G swap。
4. **系统**：Ubuntu 22.04 / 24.04。脚本按 Ubuntu（apt）写，**换 CentOS/dnf 需要改脚本**。
5. **镜像**：国内机器拉 `deb.nodesource.com` 可能慢，必要时换国内镜像源。

### 3.5 部署后必须验收（这是硬要求）

不要只看「服务起来了」就报完成。按 `DEPLOY.md §4` 的清单，至少跑通：

- [ ] 落地页 200，favicon 是大工蓝「连」字标
- [ ] 注册新账号 → 自动进 `/today`，且**数据库里真的多出一条 User 记录**
- [ ] 退出 → 再登录（验证 `AUTH_SECRET` 与 Cookie 会话）
- [ ] 未登录访问 `/today` `/chat` `/knowledge` `/reports` → 全部 307 跳登录页
- [ ] 建计划 + 两个任务，勾掉一个（验证落库）
- [ ] 打卡 → 连续天数变 1，热力图当天格变深蓝
- [ ] `/settings/model` 填 LLM 配置 → 测试连接通过
- [ ] `/chat` 连小理回答**引用真实待办/打卡数据**（需用户自备 DeepSeek key）
- [ ] `/knowledge` 上传 `.md` → ready → 提问命中并标来源
- [ ] `/reports` 生成报告 → 刷新后仍在（验证 Report 落库）

**可复用的自动化验收**：`scripts/e2e.mjs`（17 项）和 `scripts/ui-e2e.mjs`（11 项）都支持
`E2E_BASE` 环境变量指向任意 URL，改一个变量就能拿来验服务器版本。
注意 `ui-e2e.mjs` 里 `CHROME` 和 `playwright-core` 用的是本机绝对路径
（`C:/Users/chenr/.agent-browser/browsers/...` 和 `C:/Users/chenr/.workbuddy/binaries/...`），
在服务器上跑需要换成对应环境的浏览器路径。

### 3.6 一个建议的代码改动（部署稳定性）

`lib/generated/`（Prisma Client）是 gitignored 的，仓库里没有。当前靠
`install.sh` 里显式执行 `pnpm exec prisma generate` 解决。

**建议**在 `package.json` 加：

```json
"scripts": {
  "postinstall": "prisma generate"
}
```

已实测：`prisma generate` **在未设置 `DATABASE_URL` 时也能成功**（exit 0），
所以放进 `postinstall` 是安全的，能避免任何平台（服务器或未来换平台）上
「首次构建缺 Prisma Client」的问题。

---

## 4. 任务二：网页 UI 动效美化

### 4.1 视觉规范（硬性，改动必须遵守）

- **主色大工蓝** `#1A5FB4`（`app/globals.css` 里定义为 CSS 变量，改一处全局生效）
- 色板变量：`--dut-blue` / `--dut-blue-deep` / `--dut-blue-mist` / `--dut-jade` /
  `--dut-amber` / `--dut-ink` / `--dut-muted` / `--dut-line` / `--dut-surface`
- **装饰母题**：海浪 / 玉兰 / 主楼剪影 —— 均为**自绘抽象图形**，
  **禁止使用官方校徽与标准字**；口径必须是「个人项目、非官方」
- 技术栈：Next.js 16 App Router + Tailwind v4（`@theme inline`，无 tailwind.config 文件）
- 移动端优先（底部 5 tab 导航，常用视口 `420×860`）

### 4.2 涉及的文件

```
app/globals.css                          1336B：色板变量 + @theme，动效 keyframes 建议加这里
app/(app)/layout.tsx                     应用外壳
app/(app)/loading.tsx                    加载骨架
components/shell/BottomNav.tsx           底部导航（5 tab）
components/dut/Magnolia.tsx              玉兰（自绘 SVG）
components/dut/WaveDivider.tsx           海浪（自绘 SVG）
components/dut/MainBuildingSilhouette.tsx 主楼剪影（自绘 SVG）
components/study/PomodoroTimer.tsx       番茄钟（SVG 圆环进度，已有 stroke-dashoffset 过渡）
components/study/CheckInCalendar.tsx     12 周热力图（CSS grid）
components/study/TodayTasks.tsx          今日任务列表
components/liaxiaoli/ChatPanel.tsx       连小理对话面板
components/knowledge/KnowledgePanel.tsx  知识库面板
components/reports/ReportPanel.tsx       报告面板
components/settings/ModelSettings.tsx    LLM 设置
components/auth/AuthForm.tsx             登录/注册表单
app/page.tsx                             落地页
```

### 4.3 动效的美化方向（建议，可自行判断）

- **落地页**：海浪/玉兰入场动画、主楼剪影视差、渐变光斑
- **番茄钟**：圆环进度已有基础过渡；可加脉冲呼吸、结束时的完成反馈动画
  （注意：**真实 25 分钟计时尚未做过端到端验证**，见 §5）
- **热力图**：格子逐个渐显、打卡当天的高亮脉冲
- **任务勾选**：勾选时的划线/缩放微交互（`TodayTasks` 目前是纯服务端表单，无客户端状态）
- **页面切换**：App Router 的 `loading.tsx` 骨架 + 视图过渡
- **对话面板**：流式文字逐字出现的节奏、消息入场

### 4.4 动效约束（重要，别踩）

1. **`prefers-reduced-motion` 必须处理**：对 `reduce` 用户关闭/降级动画。
2. **不要引入重型动画库**（如 GSAP / framer-motion 需要评估体积）。
   当前依赖里没有动画库；优先用 **CSS 动画 / Tailwind / 原生 SVG**。
   若确要加依赖，先看 `PLAN.md §11` 的许可证红线（不能引入 GPL/AGPL/SSPL）。
3. **不要破坏渐进增强**：`TodayTasks` / `CheckInCalendar` 现在是**无 JS 也能用**的
   服务端渲染表单（`<form action={ServerAction}>`）。加客户端动画时**不要丢掉这个特性**。
4. **注意水合一致性**：服务端与浏览器时区可能不同，所有日期渲染**必须用 UTC 取值**
   （见 `lib/date.ts` 和 `CheckInCalendar.tsx` 的 `getUTC*` 写法）。加动画别引入
   依赖本地时间/随机数的首屏差异。
5. **构建期不能连外网**：项目**刻意不用 `next/font/google`**，改用系统中文字体栈。
   别加需要构建期联网的资源。

### 4.5 动效改动的验收

- [ ] `pnpm build` 通过（20/20 页）
- [ ] `pnpm typecheck` 0 错误
- [ ] `pnpm test` 40/40 不回归
- [ ] `eslint` 0 问题
- [ ] 移动端视口（420×860）与桌面都正常
- [ ] 开 `prefers-reduced-motion: reduce` 后动画被关闭
- [ ] 无 JS 时核心表单仍可用（`TodayTasks` 勾选、`CheckInCalendar` 渲染）
- [ ] 用真实浏览器截图对比（`scripts/ui-e2e.mjs` 会把截图写到 `scripts/ui-e2e-shots/`）

---

## 5. 已知边界与坑（务必先读，能省几个小时）

### 5.1 产品硬性约定（改了要问用户）

- AI 助手名 **连小理**，学长/学姐语气，**200 字内**，必须基于真实数据、**不编造**
- **LLM 由用户在设置页自填**（Base URL / Key / Model），**平台不预置任何密钥**，
  默认只存浏览器 localStorage
- 认证：**邮箱 + 密码**（scrypt + jose httpOnly Cookie 30 天），**不用 OAuth**
- 知识库**不预置任何资料**，只承载用户上传
- 日期统一 **UTC 切日**（`lib/date.ts`、`lib/streak.ts`）
- 统计指标**全部由 SQL / 纯函数算出，不经 LLM**（PLAN §8.1）

### 5.2 环境坑（Windows 本机）

| 坑 | 处理 |
|---|---|
| PowerShell 禁止运行 `.ps1`（`npm.ps1`/`pnpm.ps1`/`npx.ps1`） | 用 `.cmd` 版本，或直接用 `node node_modules/<pkg>/...` 入口 |
| `pnpm` 全局脚本被拦 | 用捆绑的 node 直接跑 `node node_modules/vitest/vitest.mjs run` 等 |
| git 推送 | 已恢复正常（SSH 可用） |
| Next 构建产物 | 构建前若失败可删 `.next` 重试 |

### 5.3 已知功能边界（**不要当成 bug**）

- **向量维度固定 1536**：`Chunk.embedding` 是 `vector(1536)`，换 embedding 模型维度不符会报错
- **番茄钟真实 25 分钟计时未验证**：只验证了「结束后落库」的逻辑，
  没有真的挂机跑满 25 分钟看计时准确性
- **无 Cron 定时报告**：报告是打开 `/reports` 时手动触发的
  （受「LLM 配置默认只存浏览器」约束，服务端拿不到 key）
- **未配 embedding 时**知识库走 **bigram 关键词降级检索**，这是**设计如此**，不是 bug
- **CSP 未配置**：只有基线安全头，等上线后按浏览器报错逐步收紧
- **`PomodoroSession.taskId` 无外键**：应用层已做归属校验，schema 层没加约束（见 AUDIT §5）

### 5.4 安全提醒

- **用户明文发过一个 DeepSeek API key**，需要提醒他**轮换**（在 DeepSeek 控制台重新生成）
- 用户也给过一个 **Vercel token**（`vcp_...`），Vercel 路线已放弃，
  **建议提醒他直接 revoke 掉**
- 我全程只用环境变量传递，没有写进任何文件、没有入 git

### 5.5 Vercel 路线的失败原因（避免重蹈）

`Ccccr231` 账号在 Vercel 上 `limited: true`（API 返回的用户对象带此字段），
导致**所有部署（Git 集成与 CLI 直推）都被 `BLOCKED`**。
需要用户在 Vercel 后台完成账号验证（邮箱/实名）才能用。
`.vercel/project.json` 还留在本地（被 gitignore），如果彻底放弃 Vercel 可以删掉。

---

## 6. 交接检查清单

接手后建议先做这几步确认现状：

```bash
cd C:\Users\chenr\Documents\deepseek-harness\default-workspace\study-for-duters
git log --oneline -3          # 应为 cfdd0cb
git status --short            # 应为空
pnpm typecheck && pnpm test   # 应为 0 错误 / 40 通过
pnpm build                    # 应为 20/20 页通过
```

若以上都过，说明基线健康，可以直接开始两项任务。

---

## 7. 需要用户配合的事项（提前告知）

1. **阿里云服务器**：用户尚未购买。需要他买好并给出 IP / SSH 访问方式。
2. **是否补域名**：目前无域名。HTTP 明文传输登录密码，
   正式给同学用之前建议补域名 + HTTPS（`deploy/SERVER.md §6` 有 Caddy 步骤）。
3. **是否转 public**：用户说了「验完再转」，当前保持 PRIVATE。
4. **DeepSeek key 轮换**、**Vercel token revoke**。
