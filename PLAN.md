# Study for DUTERS · 开发方案

> 状态：**已定稿，待开工**。开工时按「里程碑」章节顺序执行即可。
> 最近更新：2026-09-24

---

## 0. 决策结论（已确认）

| 决策项 | 结论 |
|---|---|
| 现有项目怎么处理 | **在现有代码上收敛到 MVP**，保留已跑通的模块，砍掉非核心功能 |
| RAG 方案 | **自研 pgvector**（解析 → 分块 → embedding → 检索），不接第三方 RAG 平台 |
| 部署 | **Vercel + Neon Postgres（免费层）**，pgvector 用 Neon 自带扩展 |
| 视觉主题 | **融入大连理工大学元素**：大工蓝为主色，海浪 / 玉兰 / 主楼轮廓为装饰母题 |
| AI 助手 | 名字 **连小理** |
| 模型（LLM） | **由用户在设置页自行填写** Base URL / API Key / Model，不预置任何密钥 |

技术选型来源：对 GitHub 上 9 个候选项目做了实测调研（2026-09-24），结论是**不 fork 任何大型平台**（LobeHub / Dify / Open WebUI），只做**库级与服务级复用**；2026-09-28 复核并扩样至 50 个项目，结论不变，新增「已评估但不采用」与「许可证红线」两节。详见第 11 节。

---

## 1. 产品定位

一句话：**给 DUT 学生用的、能把"计划 → 专注 → 打卡 → 复盘"闭环跑起来的 AI 学习台。**

用户是大连理工的学生（DUTERS）。产品的差异化不在"又一个聊天 UI"，而在于 **AI 能读到你的学习数据**（计划、任务、番茄钟、打卡）并给出针对性与连续的反馈。

MVP 的核心叙事（演示时按这个顺序讲）：

1. 建一个学习计划，AI 帮你拆成任务
2. 番茄钟专注，每次专注落一条记录
3. 每天打卡，累计连续天数
4. 问"我上周数据结构哪里没学扎实"，连小理从你的资料库里带引用回答
5. 每天 22:00 自动生成学习报告：今天学了什么、哪里断了、明天该做什么

---

## 2. MVP 范围（只做 5 件事）

| # | 功能 | 说明 |
|---|---|---|
| 1 | 注册登录 + 今日学习视图 | Plan / Task 的增删改查，今日任务清单 |
| 2 | 番茄钟 | 开始 / 暂停 / 结束，落 `PomodoroSession`，环形进度 |
| 3 | 每日打卡 | 打卡 + 连续天数统计 + 月历热力图 |
| 4 | RAG 知识库问答 | **只收 `.md`** → 分块 → embedding → pgvector 检索 → 带引用回答（PDF / DOCX 见下方「RAG 的 MVP 边界」） |
| 5 | 每日学习报告 | 定时任务跑 Agent Loop：SQL 算专注时长 + 完成率 + 打卡，LLM 写 200 字总结 + 明日建议（见 8.1） |

**明确砍到 v2（MVP 阶段一行代码都不写）：**

- WebSocket 实时聊天室、@AI 群聊流式（Vercel 不支持长连接，需独立服务，见 10.2）
- 3D 学习小岛、动态壁纸
- 长期记忆体系（先降级成 `Report` 表里的一个 `summary` 字段，够用）
- 复杂 Model Pool（先靠用户自填 + 简单重试兜底，不引入 LiteLLM）
- Markdown 富文本编辑器（Tiptap / Vditor 的选型见 §11；MVP 用原生 textarea 即可）

**RAG 的 MVP 边界（2026-09-28 修订）**

MVP **只支持 `.md`**，PDF / DOCX 推迟到 v1.1。

理由：`pdf-parse` 在 Vercel 免费层（函数 60s 超时）解析大文件容易超时，而免费层没有后台任务可以兜底——这是本项目最容易卡死的地方。Markdown 解析成本为零、体积小、瞬时完成，先把「传了资料就能问」这条路跑通，再扩格式。

v1.1 扩 PDF / DOCX 时，**必须同时**引入 Trigger.dev 承接入库任务（见 §11），两件事一起做，不要只加格式不加任务队列。

---

## 3. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 15（App Router）+ TypeScript | 沿用现有栈 |
| ORM | Prisma | 沿用 |
| 数据库 | Neon Serverless Postgres + **pgvector** 扩展 | Neon 原生支持 `CREATE EXTENSION vector` |
| AI 调用 | **Vercel AI SDK**（`streamText` / `generateObject` / tool calling） | 统一流式与工具调用，provider 走 OpenAI 兼容接口 |
| 认证 | 现有 Cookie 方案（JWT / session） | 沿用 |
| 文件存储 | 阿里云 OSS 预签名 PUT | 沿用，头像 / 附件 |
| UI | Tailwind CSS + shadcn/ui | 主题色改成大工蓝 |
| 部署 | Vercel（应用）+ Neon（数据库） | 见第 10 节 |

**依赖清单（开工时安装）**

```bash
npm i ai @ai-sdk/openai-compatible @ai-sdk/react
npm i @neondatabase/serverless        # 若走 Neon HTTP driver
npm i zod swr
# 解析：MVP 只收 md，原生解析即可，无需解析库
# v1.1 扩 PDF / DOCX 时再装：npm i pdf-parse mammoth（并同时引入 Trigger.dev，见 §11）
```

---

## 4. LLM 由用户自填（关键设计）

### 4.1 设置页字段

`/settings/model` 表单：

| 字段 | 说明 | 示例 |
|---|---|---|
| Provider | OpenAI 兼容 / Anthropic / 自定义 | `openai-compatible` |
| Base URL | 接口地址 | `https://api.deepseek.com/v1` |
| API Key | 用户自己的密钥 | `sk-xxx` |
| 对话模型 | 主模型 | `deepseek-chat` |
| Embedding 模型 | RAG 用，可留空 | `text-embedding-3-small` |
| Temperature | 默认 0.3 | |

### 4.2 存储策略（安全优先）

- **默认只存浏览器**：`localStorage`（或 IndexedDB）存配置，请求时随 header 带到服务端路由，**服务端不落库、不写日志**。
- **可选"跨设备同步"**：用户勾选后，用服务端 `ENCRYPTION_KEY`（env）做 AES-GCM 加密再存 `UserSetting` 表；前端只展示 `sk-****后四位`。
- **禁止**：把明文 key 写进 `.env`、写进 Prisma 日志、返回给任何 GET 接口。

**"不落库、不写日志"的具体做法**（不写清楚，实现时必漏）：

- 请求体（含 key）不得进入任何 `console.log`、中间件访问日志、Sentry 的 request body 采集；日志只记 `userId` + 模型名 + token 数。
- 错误对象回传前剥离原始 request：上游 SDK 报错经常把请求体回显进 `error.message`，必须过滤后再返回。
- 「测试连接」只返回 `true` / `false` + 一个泛化原因（`unauthorized` / `unreachable` / `model_not_found`），**不回显上游错误原文**。
- key 只在单个请求的生命周期内存在于内存：不写 Redis、不写临时文件、不作为异步任务的入参传递。

### 4.3 校验与降级

- 点"测试连接"→ 服务端用传入的 key 发一次最小请求（`/models` 或 1 token 的 chat），**只返回 true/false**，不落库。
- **未配置时**：所有 AI 入口显示引导卡片「先去设置填写 API，连小理才能说话」，按钮直达设置页；不发起任何请求、不报错。
- **未配 embedding 模型时**：RAG 降级为 Postgres 全文检索（`to_tsvector` + 中文可用 `simple` 配置或 pg_trgm），保证"传了资料就能问"，只是召回质量下降。**不要让功能直接不可用。**

### 4.4 调用封装

```
lib/ai/
  provider.ts      // 从请求读取用户配置，构造 OpenAI-compatible provider
  chat.ts          // streamText 封装（流式）
  embed.ts         // embedMany / embed 封装，失败降级
  agent.ts         // Agent Loop：Observe → Analyze → Plan → Execute
```

---

## 5. 连小理（AI 助手人格）

### 5.1 人设

> 名字：**连小理**
> 身份：大连理工大学学生的学习搭子，像同专业直系学长/学姐——专业、不说教、会开玩笑，但不油腻。
> 对用户称呼：DUTERS（复数）/ 你（单数）。

### 5.2 System Prompt 草案（开工时直接用，可微调）

```
你是"连小理"，大连理工大学（DUT）学生的学习搭子。

语气：像一个靠谱的直系学长/学姐。直接、具体、不说废话，不写"希望对你有帮助"这类套话。
- 用户说"学不动了"，先接住情绪，再给一个 25 分钟就能开始的最小动作，不要长篇励志。
- 给建议时必须引用用户的真实数据（任务完成率、专注时长、连续打卡天数、知识库内容），不要泛泛而谈。
- 不确定就说不确定，不编造课程内容、不编造校历与教务规定。
- 涉及选课、保研、教务流程等具体制度信息，明确提示"以教务处最新通知为准"。

你能调用的工具：
- get_study_status：读取学习计划、任务完成情况、番茄钟记录、打卡天数
- search_knowledge：在用户上传的资料库中检索（必须带引用）
- create_tasks：把目标拆解为可执行任务
- generate_report：生成学习报告

回答格式：口语化短句，需要列举时用短列表，尽量控制在 200 字以内；引用资料时标注 [文档名 · 第X块]。
```

### 5.3 人格落点（不是只写在 prompt 里）

- 空状态文案：「今天还没开始，先来个 25 分钟？」
- 打卡成功：「连续 3 天了，别断。」
- 报告开头：「今天有效专注 3 小时 20 分，比昨天多 40 分钟。」
- 加载态：连小理的呼吸动画 + 一句随机提示（「翻了下你这周的番茄钟…」）

---

## 6. 视觉规范：大连理工元素

### 6.1 色彩（Design Token）

| Token | 值 | 用途 |
|---|---|---|
| `--dut-blue` | `#1A5FB4`（近似，对应官方 CMYK 90/45/0/0） | 主色：按钮、链接、主楼剪影 |
| `--dut-blue-deep` | `#0B3C75` | 深色文字、深色底 |
| `--dut-blue-mist` | `#E8F1FB` | 浅色背景、卡片底 |
| `--dut-jade` | `#0F6E56` | 成功 / 已完成状态 |
| `--dut-amber` | `#BA7517` | 提醒 / 待办 |
| `--dut-ink` | `#1F2937` | 正文 |

> ⚠️ 官方标准色以《大连理工大学视觉形象识别系统管理手册》为准（标准色"大工蓝" CMYK 90/45/0/0，VI 源文件见 dlut.edu.cn 学校 VI 页）。开工时如能拿到官方 RGB/HEX，**以官方值为准覆盖上表**。

### 6.2 视觉母题（装饰用，抽象化处理）

- **海浪线**：页面头部 / 页脚的波浪分割线（SVG，`currentColor` 用大工蓝，透明度递减三层）。呼应"渤海之滨"。
- **玉兰**：打卡成就、空状态的点缀图形（自绘简化花瓣，**不要用官方素材**）。
- **主楼轮廓**：登录页 / 侧边栏底部的极简剪影（自绘线条稿）。
- **网格 + 蓝**：专注页背景用低对比度网格，强化"工科、严谨"的观感。

### 6.3 合规提醒（重要）

- **不使用官方校徽作为产品 Logo**，不做任何可能被视为官方出品的表述。校徽、校名标准字的使用受学校 VI 管理办法约束，且以经营为目的使用需申请许可。
- 产品自绘一个标识（比如"连小理"的头像：蓝色圆形 + 简笔玉兰/书本），与学校官方标识保持距离。
- 站内外文案统一口径：**"面向 DUT 学生的个人/开源项目"**，不宣称官方。
- **不收录、不索引任何学校内部或未授权资料。** 知识库内容完全由用户自行上传，平台不预置任何资料、不提供任何资料下载入口；连小理的回答只基于用户自己上传的内容。
- 这一条与 §4「LLM 由用户自填」是同一条定位线：**平台不承载资源，只承载工具。** 站内不要出现任何形式的资料分享 / 下载入口。

### 6.4 页面级元素

| 页面 | 大工元素落点 |
|---|---|
| 登录 / 注册 | 主楼剪影 + 海浪底部 + 大工蓝渐变（**不用渐变，用纯色分层**） |
| 今日视图 | 顶部海浪头图 + 今日日期 + "第 X 个学习日" |
| 番茄钟 | 环形进度用大工蓝，完成一刻环形填充 + 玉兰绽放微动效 |
| 打卡月历 | 连续天数用深浅蓝热力格，断点用琥珀色标出 |
| 知识库 | 文档卡片左侧竖条用主色，检索命中片段高亮大工蓝底 |
| 连小理对话 | 气泡圆角 + 头像（玉兰图标），流式出现时打字机效果 |

---

## 7. 数据模型（Prisma，7 张表）

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  plans     Plan[]
  tasks     Task[]
  sessions  PomodoroSession[]
  checkIns  CheckIn[]
  documents Document[]
  reports   Report[]
  setting   UserSetting?
}

model Plan {
  id        String   @id @default(cuid())
  userId    String
  title     String          // "数据结构期末冲刺"
  goal      String?         // 目标描述
  startDate DateTime
  endDate   DateTime
  status    String   @default("active")  // active | archived
  tasks     Task[]
  user      User     @relation(fields: [userId], references: [id])
}

model Task {
  id        String    @id @default(cuid())
  planId    String
  userId    String
  title     String
  done      Boolean   @default(false)
  dueDate   DateTime?
  estimate  Int?              // 预计番茄数
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  plan      Plan     @relation(fields: [planId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
}

model PomodoroSession {
  id        String   @id @default(cuid())
  userId    String
  taskId    String?
  startedAt DateTime
  endedAt   DateTime?
  duration  Int               // 分钟，通常 25
  completed Boolean  @default(false)
  user      User     @relation(fields: [userId], references: [id])
}

model CheckIn {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime          // 当天 00:00
  note      String?
  streak    Int               // 冗余：当天连续天数
  user      User     @relation(fields: [userId], references: [id])
  @@unique([userId, date])
}

model Document {              // 知识库
  id        String   @id @default(cuid())
  userId    String
  title     String
  sourceUrl String?           // OSS 地址
  mimeType  String            // md | pdf | docx
  status    String   @default("pending")  // pending | ready | failed
  chunks    Chunk[]
  user      User     @relation(fields: [userId], references: [id])
}

model Chunk {                 // 向量分块（pgvector）
  id         String @id @default(cuid())
  documentId String
  content    String
  order      Int
  embedding  Unsupported("vector(1536)")?   // 维度按所选 embedding 模型定
  document   Document @relation(fields: [documentId], references: [id])
}

model Report {                // AI 学习报告 / 长期记忆载体
  id        String   @id @default(cuid())
  userId    String
  date      DateTime
  content   String            // Markdown
  summary   String            // 供下次 Agent 读取的压缩记忆
  stats     Json              // 专注时长、完成率等快照
  user      User     @relation(fields: [userId], references: [id])
  @@unique([userId, date])
}

model UserSetting {           // 用户自填 LLM（可选加密存储）
  id             String @id @default(cuid())
  userId         String @unique
  provider       String            // openai-compatible | anthropic
  baseUrl        String
  apiKeyEnc      String?           // AES-GCM 密文，null = 仅本地存储
  keyHint        String?           // "sk-...abcd"
  chatModel      String
  embedModel     String?
  temperature    Float  @default(0.3)
  user           User   @relation(fields: [userId], references: [id])
}
```

**迁移注意**：pgvector 需要 `CREATE EXTENSION IF NOT EXISTS vector;`，且 `Unsupported("vector(1536)")` 的读写走 `prisma.$queryRaw` / `$executeRaw`。

---

## 8. Agent Loop 与 RAG 设计

### 8.1 Agent Loop（`lib/ai/agent.ts`）

**统计不进 LLM。** 指标全部由 SQL 算出，LLM 只负责「解释数字 + 给建议」。让模型去读一堆任务和时长、再推理"哪个任务有风险"，是这套系统里最不可靠、最贵、也最不可测的一环：数字可能被编造，而 `riskTaskIds` 一旦错，Execute 就会创建错误的任务。

```
Observe  → SQL 拉原始数据：今日/本周任务、番茄钟时长、打卡连续天数、最近 3 天 Report.summary
Compute  → SQL 直接算指标，不经过模型：
           { focus_minutes_today, focus_minutes_7d, completion_rate_7d,
             streak_days, stale_task_ids }      // stale = 连续 2 天未推进
Narrate  → 把这组数字交给 LLM（generateObject），只输出两件事：
           { summary: string, actions: [{ type, payload, reason }] }
Execute  → 仅执行白名单内的 Action；写库前记录 reason，UI 上可解释、可撤销
```

**约束**：

- Action 必须落在白名单里（创建任务、调整截止日期、生成报告、推送提醒），**不允许 AI 直接删除用户数据**。
- **LLM 输出的文案里不允许出现它自己算出来的数字。** 报告中的每一个统计值都必须来自 Compute 阶段；实现上把指标以结构化 JSON 传入，要求模型引用字段，而不是复述计算过程。
- Compute 阶段是纯函数（数据 → 指标），**必须有单元测试**。这是整个 Agent 里唯一能确定对错的部分，别把它测漏了。

### 8.2 RAG（自研，`lib/rag/`）

```
ingest(document)
  → parse(md 原生；v1.1 再加 pdf-parse / mammoth，见 §2、§11)
  → chunk：按标题 + 滑动窗口，800 tokens，overlap 120
  → embedMany（用户填的 embedding 模型）
  → 批量写 Chunk（每批 ≤ 50 条，避免 Vercel 函数超时）

search(query, topK = 6)
  → embed(query)
  → SELECT ... ORDER BY embedding <=> $1 LIMIT 6   （余弦距离）
  → 组装上下文，带 [文档名 · 块号] 引用

answer(query)
  → streamText(system=连小理, tools=[search_knowledge], messages)
  → 前端渲染引用来源卡片
```

**降级路径**（必须实现）：embedding 失败或未配置 → 回退 Postgres 全文检索；检索为空 → 连小理明确回答"你的资料库里没有这部分内容"，并提示可上传。

---

## 9. 页面结构与目录

```
app/
  (auth)/login            // 主楼剪影 + 海浪
  (auth)/register
  (app)/today             // 今日视图：任务 + 番茄钟入口 + 打卡
  (app)/plans             // 学习计划列表 / 详情
  (app)/pomodoro          // 番茄钟（可弹窗）
  (app)/knowledge         // 知识库：上传 / 列表 / 问答
  (app)/chat              // 连小理对话（流式）
  (app)/reports           // 学习报告列表 / 详情
  settings/model          // LLM 配置（Base URL / Key / Model / 测试连接）
  api/
    chat/route.ts         // 流式（读请求头里的用户配置）
    embed/route.ts
    knowledge/ingest/route.ts
    agent/report/route.ts // 由 Cron 触发
```

```
lib/
  ai/{provider,chat,embed,agent}.ts
  rag/{parse,chunk,embed,search}.ts
  db.ts  auth.ts  oss.ts
components/
  ui/          // shadcn 基础组件（改成大工蓝）
  dut/         // WaveDivider.tsx  Magnolia.tsx  MainBuildingSilhouette.tsx
  study/       // TaskList PomodoroRing CheckInCalendar StreakBadge
  liaxiaoli/   // ChatPanel MessageBubble AssistantAvatar EmptyState
prisma/schema.prisma
```

---

## 10. 部署与环境

### 10.1 Vercel + Neon

- Neon：`CREATE EXTENSION vector;`（控制台 SQL 编辑器执行，或首次迁移脚本）
- 环境变量：`DATABASE_URL`、`ENCRYPTION_KEY`（用于加密用户 key，可选）、`OSS_*`、`CRON_SECRET`
- Vercel Cron：`vercel.json` 配置每天 22:00 打 `/api/agent/report`，带 `CRON_SECRET` 校验
- Prisma：`prisma migrate deploy` 走 build 或单独的 postinstall

### 10.2 已知限制与对策

| 限制 | 影响 | 对策 |
|---|---|---|
| Vercel Serverless 函数超时（免费层 60s / Pro 300s） | 大 PDF ingestion 容易超时 | **MVP 只收 `.md`，此项风险不进入 MVP**；v1.1 扩 PDF / DOCX 时引入 Trigger.dev（Apache-2.0）承接后台入库，见 §11 |
| Vercel 不支持长连接 WebSocket | 聊天室无法跑 | v2 时把 ws sidecar 单独部署到 Fly.io / Railway，前端连独立域名 |
| Neon 免费层存储与算力上限 | 向量数据量 | 限制单用户 200 个文档 / 5000 块；超出提示清理 |
| 用户自填 key 的安全 | 泄露风险 | 默认仅浏览器存储；服务端不落库不记日志；HTTPS only |

---

## 11. 开源复用边界（调研结论 2026-09-24，2026-09-28 复核并扩样至 50 个项目）

**直接用（库 / 服务级）**

- `ai`（Vercel AI SDK，27.0k★，npm 周下载 29.8M）：流式、工具调用、结构化输出
- `@ai-sdk/openai-compatible`（周下载 9.4M）：用户自填 Base URL 的关键依赖
- `pgvector/pgvector`（23.2k★，PostgreSQL License，仅 17 个 open issue）：向量存储与检索，Neon 原生支持
- `pgvector/pgvector-node`（443★，MIT）：Prisma 里操作 vector 的糖，可选；不用它就直接 `$queryRaw`
- 阿里云 OSS 预签名 PUT（`ali-oss`）：文件直传
- `wa0x6e/cal-heatmap`（3.1k★，MIT）：打卡月历热力图，别手写 d3
- `open-spaced-repetition/ts-fsrs`（799★，MIT，周下载 187k）：间隔重复算法。v1.1 的差异化功能（错题 / 知识点卡片），纯函数库，接入成本极低
- `triggerdotdev/trigger.dev`（16.4k★，**Apache-2.0**，周下载 1.1M）：v1.1 的后台入库任务；MVP 不需要

**Markdown 编辑器（v1.1 选型；MVP 用原生 textarea 即可）**

- `ueberdosis/tiptap`（38.6k★，MIT，周下载 21.7M）：headless，和 shadcn / Tailwind 同一套心智 → **首选**
- `Vanessa219/vditor`（11.4k★，MIT）：Typora 式即时渲染，中文文档好 → 备选

**参考架构，不 fork**

- `vercel/chatbot`（21k★）：聊天 UI + Auth + 持久化的组织方式

**明确不 fork**

- `lobehub`（原 Lobe Chat，82.9k★）：已转向 Agent 平台，前端改 Vite SPA、弃 Prisma 改自研数据层，仓库 928.9MB，License 为自定义协议（NOASSERTION）
- `dify`（157.3k★）：Python + 多容器，自定义协议限制多租户转售/去品牌，改造成本高
- `open-webui`（153.4k★）：Python 栈，与本项目不符

**可不用的原因**：本项目的价值在"学习闭环"，不在聊天 UI。fork 大平台的典型结局是 80% 时间在跟它的架构打架。

**Agent 框架**：`mastra`（28.4k★，Apache-2.0 core，`ee/` 目录另授权）是唯一值得考虑的 TS 框架，但 **MVP 用 AI SDK 自己写 loop**。4 个阶段、5 个工具的规模，框架的抽象成本大于收益；等 loop 变成多步、需要持久化 / 重试 / 可观测时再引入。`langgraphjs` 只有 3.3k★（Python 版 42.4k★），TS 生态明显偏弱。

**已评估但不采用（2026-09-28 复核，避免以后重复调研）**

| 项目 | ★ | 最后推送 | 不采用原因 |
|---|---:|---|---|
| `steven-tey/novel` | 16.4k | 2025-01-18 | **停更 20 个月** |
| `pd4d10/bytemd` | 1.4k | 2025-02-12 | **停更 19 个月**（`bytemd/bytemd` 已 404） |
| `soketi/soketi` | 5.6k | 2025-03-03 | **停更 18 个月** + AGPL-3.0 |
| `songquanpeng/one-api` | 37.0k | 2026-01-09 | **停更 8 个月** |
| `microsoft/autogen` | 61.2k | 2026-04-15 | 已 5 个月未推 + Python 栈 |
| `Portkey-AI/gateway` | 13.1k | 2026-05-25 | 4 个月未推；MVP 不需要网关 |
| `khoj-ai/khoj` | 37.5k | 2026-08-02 | AGPL-3.0 |
| `microsoft/markitdown` | 187.3k | 2026-09-22 | 很好但是 **Python 进程**，为它养 sidecar 不值得；且扫描版 PDF 同样解析不出（需要 OCR） |
| `BerriAI/litellm` | 59.7k | 2026-09-28 | 1.7 GB + 5362 个 open issue + Python；MVP 不需要网关 |
| `langchain-ai/langgraphjs` | 3.3k | 2026-09-25 | TS 版社区仅 Python 版的 8% |
| `infiniflow/ragflow` | 91.4k | 2026-09-26 | Go + Python 多容器 |
| `mintplex-labs/anything-llm` | 66.5k | 2026-09-26 | 整个应用，不是库 |
| `Unstructured-IO/unstructured` | 15.5k | 2026-09-28 | 重系统依赖，不适合 serverless |

**v2 选型（现在只记结论，不动手）**

- **WebSocket 聊天室用 `centrifugal/centrifugo`（10.8k★，Apache-2.0）**，不自己写 sidecar。频道、在线状态、历史消息、JWT / Cookie 鉴权、广播全部内置；Go 单二进制、仅 23 个 open issue。自写的 sidecar 退化为"签发 token 给前端"。
  - 备选 `socket.io`（63.2k★，MIT）：生态最大，但鉴权 / 幂等 / 在线人数都要自己实现。
- **Model Pool**：先在 AI SDK 里写有序 fallback（额度耗尽 / 429 时切下一个模型，约 30 行）；出现多租户、计费、审计需求时才考虑网关。
- **长期记忆**：`mem0ai/mem0`（66.1k★，Apache-2.0）。MVP 用 `Report.summary` 就够。

**许可证红线（直接决定 §13 的"是否开源"）**

- **避开 AGPL-3.0**：khoj、AppFlowy、logseq、siyuan、soketi —— 提供网络服务即触发开源义务。
- **注意 SSPL**：`inngest` 服务端是 SSPL（非 OSI 认证），自建需开源整个服务栈；只用官方云则无碍。这也是推荐 Trigger.dev（Apache-2.0）的原因。
- **混合授权**：`mastra`（`ee/` 另授权，其余 Apache-2.0）、`litellm`（`enterprise/` 另授权，其余 MIT）—— 核心可用，别用到 EE / enterprise 目录的功能。
- **安全清单**（MIT / Apache-2.0 / PostgreSQL License）：Tiptap、centrifugo、pgvector、Trigger.dev、cal-heatmap、ts-fsrs、better-auth。

---

## 12. 里程碑与验收

### W1 · 骨架与业务闭环

- [ ] 登录注册跑通（沿用现有 Cookie 方案）
- [ ] Plan / Task CRUD + 今日视图
- [ ] 番茄钟（开始 / 暂停 / 结束，写入 `PomodoroSession`）
- [ ] 打卡 + 连续天数 + 月历热力图（用 `cal-heatmap`，别手写 d3）
- [ ] 大工蓝主题落地（Token + 海浪 / 主楼剪影组件）
- [ ] **移动端适配（从 W1 就开始，不后置）**：学生主要用手机，后置等于返工全部布局
- **验收**：能完整走一遍「建计划 → 专注 25 分钟 → 打卡」，数据都对；手机浏览器上同一套流程可点

### W2 · 连小理与 RAG

- [ ] 设置页：Base URL / API Key / Model / 测试连接（默认本地存储，见 4.2）
- [ ] 连小理对话页（流式，system prompt 落地）
- [ ] 知识库：**只收 `.md`**（按 §2 的 MVP 边界）→ 解析 → 分块 → embedding → pgvector
- [ ] 检索 + 带引用回答；未配 embedding 时降级全文检索
- **验收**：传一份自己的课程笔记（.md），问里面的问题，回答带正确引用

### W3 · Agent、报告与上线

- [ ] Agent Loop（Observe → **Compute** → **Narrate** → Execute，白名单 Action，见 8.1）
- [ ] 每日学习报告 + Vercel Cron 定时任务
- [ ] 部署 Vercel + Neon，绑定域名
- **验收**：第二天早上能看到昨晚自动生成的学习报告，且**报告里的每个数字都能在库里复算出来**

### v1.1 候选（W3 之后，按优先级）

1. PDF / DOCX 导入（**必须同时**引入 Trigger.dev，见 §2 / §11）
2. 间隔重复：`ts-fsrs` + 错题 / 知识点卡片
3. Markdown 富文本编辑器：Tiptap 或 Vditor（见 §11）
4. Agent Loop 多步化 + 长期记忆（`Report.summary` 升级为 mem0 或自建）

### v2 候选

WebSocket 聊天室（用 `centrifugo`，不自写 sidecar）、3D 学习小岛、动态壁纸、Model Pool / fallback 链

---

## 13. 开工前需要确认的最后一件事

**唯一硬阻塞**：

- [ ] **现有代码在哪**（本地路径 / Git 仓库地址）。

  这是唯一会让里程碑失准的前置条件。§0 写的"在现有代码上收敛到 MVP"目前只是意向，没有事实支撑——不看代码就定 W1，做出来的里程碑可能和真实起点对不上。

  开工第一步是**存量代码盘点**，产出四件事：

  1. 现有 Prisma schema 与 §7 的差异（哪些表能直接留、哪些要改）
  2. 现有认证方案能否直接沿用（若不能，先决定换不换，别边做边换）
  3. 已跑通、可保留的模块清单
  4. 必须砍掉的模块清单

---

## 14. 实现偏差记录（W1 / W2 / W3，2026-09-28）

实现与本文档不一致的地方，全部记在这里，避免文档和代码各说一套。

| # | 文档原计划 | 实际做法 | 原因 |
|---|---|---|---|
| 1 | §0 认证「沿用现有 Cookie 方案」 | 改为**邮箱 + 密码自建**：scrypt 哈希（`lib/auth/password.ts`）+ jose 签发 JWT 存 httpOnly Cookie | 存量代码确认不存在，"沿用"无事实基础；无邮件服务通道，验证码方案跑不通；面向本校学生，GitHub OAuth 覆盖率不足且国内登录不稳。**Cookie 会话的意图保留**。 |
| 2 | §12 W1「月历热力图用 `cal-heatmap`，别手写 d3」 | 手写 CSS grid 12 周热力图（`components/study/CheckInCalendar.tsx`） | cal-heatmap 是客户端图表库（带 d3），首屏要额外 JS 且 SSR 不便；这里的数据量用 CSS grid 服务端直出即可、移动端更稳。**没有手写 d3**，不违背该条的初衷；若以后要 tooltip / 缩放再换。 |
| 3 | §3 未指定 Next 版本 | Next **16.3.6**：`middleware.ts` 已 deprecated，改用 **`proxy.ts`**（default export `proxy`） | 框架升级带来的约定变化，已按新约定实现。 |
| 4 | §3 依赖清单含 `pdf-parse` / `mammoth` | 未安装 | 与 §2「MVP 只收 `.md`」一致，v1.1 扩格式时再装。 |
| 5 | §7 日期语义未说明 | 打卡与统计**按 UTC 切日**（`lib/date.ts`） | 服务端跑在 UTC。单校区场景够用；跨时区时把时区存进 `UserSetting` 再按偏移切日。 |

### W2（2026-09-28）

| # | 文档原计划 | 实际做法 | 原因 |
|---|---|---|---|
| 6 | §12 对话前端「用 Vercel AI SDK 的 `useChat`」 | 前端 `fetch` + `getReader()` 手动读流，接口统一返回 `text/plain` | 避开 AI SDK React 助手与服务端版本的耦合，协议自己说了算，移动端 fetch 流已够用。 |
| 7 | §12 RAG 引用展示未约定协议 | 流的第一行输出 `__SOURCES__[标题数组]`，再跟正文流，前端拆第一行渲染引用 | 自研 `text/plain` 流没有 AI SDK 的 data channel，用最简单的行协议传递来源。 |
| 8 | §7 向量检索假定 embedding 必配 | 用户未配 embedding 时降级为 `ILIKE` 关键词检索（仍走 `pgvector` 表，不报错） | LLM 配置全由用户自填，embedding 可能缺失；降级保证知识库「能用」，配好后自动走向量。 |
| 9 | §12 分块「按 token 切」 | 按**字符数**近似（800/120 滑窗），先按标题切段、小段合并、标题作前缀保留 | 中文 token 化要引依赖，字符近似 + 结构保留已够；`lib/rag/chunk.ts` 有单测覆盖。 |
| 10 | 未提单元测试 | 引入 vitest（`vitest.config.mts`），覆盖分块 / AI 配置解析 / 连续打卡纯函数（15 例） | 纯函数不依赖 DB，先把能测的钉住；DB 路径留给 Neon 就绪后的端到端验证。 |

### W3（2026-09-28，进行中）

| # | 文档原计划 | 实际做法 | 原因 |
|---|---|---|---|
| 11 | §8.1 stale = 「连续 2 天未推进」 | 近似为**未完成且创建超过 2 天**（`lib/report/compute.ts`） | `Task` 表没有 `updatedAt` / 推进记录，无法判断"未推进"；v1.1 加字段后改回严格定义。 |
| 12 | §8.1 Execute「仅执行白名单内 Action，写库前记录 reason」 | Execute **不自动写库**：模型的 action 建议（仅 `create_task`）解析后存进 `Report.stats`，页面上展示「连小理建议」，由用户手动到计划页添加 | 报告生成发生在用户浏览时，自动建任务会在用户没确认的情况下改数据；且 `Task` 必须挂 `planId`，AI 不知道该挂哪个计划。安全口径更严，不违背白名单初衷。 |
| 13 | §12 W3「每日学习报告 + Vercel Cron 定时任务」 | 暂不做 Cron，改为**用户打开 `/reports` 手动触发生成** | 硬性约定「LLM 配置默认只存浏览器 localStorage」，服务端 Cron 拿不到用户的 key，无法替用户调模型；等「可选加密存库」（UserSetting.apiKeyEnc）流程做完再补 Cron。 |
| 14 | §8.1 Narrate 用 `generateObject` 输出 `{summary, actions}` | 用 `streamText` + 固定行协议（`SUMMARY:` / `ADVICE:` / `ACTION: create_task \| 标题 \| 理由`），`parseNarration` 纯函数解析 | 与 W2 的 `__SOURCES__` 行协议一个思路：openai-compatible 各家对结构化输出支持参差不齐，行协议最稳且可单测（7 例）；格式损坏时全文降级为 summary。 |
| 15 | §4.3 测试连接「不回显上游错误」 | 补上**登录鉴权**（W2 漏了） | 未鉴权的 `/api/settings/test` 是一个「服务端代发请求」入口，可被用来盲探内网地址、白嫖函数资源。冒烟确认 5 个 API 路由未登录全部 401。 |
| 16 | §8.2 降级路径只说了检索端 | **ingest 端同样降级**：未配 embedding 或向量化失败时，文档照常落库、分块不带向量（`embedding` 列本来就是 nullable），响应带 `degraded: true` | 原实现「没配 embedding 就 400」，导致降级路径永远走不到——没配 embedding 的用户根本传不了资料，检索端的 ILIKE 降级形同虚设。改后「传了资料就能问」不依赖 embedding 可用。 |
| 17 | §8.2 ingest「批量写 Chunk（每批 ≤ 50 条）」 | W2 实际是逐条 INSERT；本轮改为 `Prisma.sql` + `Prisma.join` 的批量插入，每批 50 | 200k 字约 250 块，逐条是 250 次数据库往返，Vercel 60s 超时风险；批量后最多 5 次。 |

**仍未解决的前置条件**：本地无 Postgres，登录 / 任务 / 番茄钟 / 打卡的**数据库路径尚未端到端验证**（代码与迁移已就绪）。需要一个 Neon 库：执行 `prisma/migrations/000000_init/migration.sql`，把连接串填进 `.env` 的 `DATABASE_URL`，再 `pnpm exec prisma migrate resolve --applied 000000_init`（若用 `migrate deploy` 则不需要）。

  **盘点结论如果与 §7 / §12 冲突，先改 PLAN 再写代码。**

其余：

- [ ] 官方大工蓝 RGB/HEX 能否拿到（拿不到就用 6.1 的近似值，后续替换）
- [ ] 是否开源（影响是否引入 GPL / SSPL 依赖、是否加 LICENSE）。**只要依赖清单守住 §11 的「安全清单」（MIT / Apache-2.0 / PostgreSQL License），开源或闭源都不受限。**
