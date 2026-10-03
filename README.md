# Study for DUTERS

面向大连理工学生（DUTERS）的学习台：**计划 → 专注 → 打卡 → 复盘**。

> 面向 DUT 学生的个人开源项目，**非官方**。不使用学校官方校徽与标准字作为产品标识，视觉元素均为自绘。
> 平台的 LLM 由使用者自行配置（Base URL / API Key / Model），**本项目不预置任何密钥**。

## 当前进度

- ✅ **W1**：账号（邮箱+密码）、学习计划与任务、番茄钟、打卡（连续天数 + 12 周热力图）、大工蓝主题、移动端布局
- ✅ **W2**：连小理对话（流式）、知识库 RAG（PDF / Word / PPT / Excel / `.md` → 浏览器端解析 → 分块 → embedding → pgvector，未配 embedding 时降级 bigram 关键词检索）、设置页自填 LLM 配置（默认只存浏览器）
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
| `node scripts/kb-check.mjs` | 知识库端到端：真实 PDF 上传 → 解析 → 入库（并验证"没配模型也能用"） |
| `node scripts/shots.mjs <label>` | 多视口设计对照截图（390×844 / 1280×800） |
| `node scripts/tablet-shots.mjs` | 中间断点截图（640 / 834 / 1024） |
| `node scripts/overflow-check.mjs` | 横向溢出巡检（320 / 390px） |
| `node scripts/route-check.mjs` | 路由入场动画是否触发、`router.refresh()` 是否误重放、切页耗时 |
| `node scripts/intro-state.mjs` | 开场序列在"新鲜/已看过/只开登录页"三种情形下的行为 |
| `node scripts/nojs-check.mjs` | **禁用 JS** 时核心流程是否可用（注册/打卡/建计划真的落库） |
| `node scripts/skeleton-check.mjs` | 无 JS 时各页面是否只剩骨架屏（这类问题肉眼看不出来） |
| `node scripts/mobile-check.mjs` | 移动端审计 8 项（安全区 / 点按延迟 / iOS 缩放 / hover 粘住） |
| `node scripts/a11y-check.mjs` | 可访问性审计（ARIA 名称 / 标题层级 / alt / 键盘焦点）+ 首屏性能实测 |
| `node scripts/contrast-check.mjs` | 逐个文字算 WCAG 对比度（**含半透明叠层的 alpha 合成**） |
| `node scripts/sr-check.mjs` | 读屏可用性 10 项（播报次数 / 无障碍标签 / live region 是否真在树里） |
| `node scripts/scroll-check.mjs` | 滚动入场：是否随滚动推进、不支持时是否安全、减弱动效是否关闭 |
| `node scripts/srcset-check.mjs` | 实测 `srcset` 是否真的省带宽（@1x 与 @3x 各跑一遍） |

## 图片带宽与滚动入场（实测）

**`srcset`**：三张水彩资产原图都是 512×512，但显示尺寸最小只有 32px。
用 `scripts/gen-art-variants.py` 生成 128/256/384 三档变体后实测：

| 屏幕 | 实际下载 | 对比全用 512 原图 |
|---|---|---|
| @1x（390px 视口） | 3 张 / **15KB** | 省 **90%** |
| @3x（iPhone 视口） | 4 张 / **67KB** | 省 **68%** |

512 原图在两种屏幕下都**零下载**。档位注意：最初只有 128/256 两档时，
@3x 下校徽需要 576px、主楼需要 288px，都会**跳档退回 512**（整页 87KB）——
加一档 384 才真正命中。

**滚动入场**：校训带与时间轴用纯 CSS 的 `animation-timeline: view()`（零 JS，符合无 JS 约束）。
**整个规则必须包在 `@supports (animation-timeline: view())` 里** ——
否则不支持的浏览器会把它当成"落在页面加载上的普通动画"、播完停在 `from`（`opacity: 0`），
内容会**永久不可见**。实测：进入视口 opacity 0.18 → 0.34 → 1；
全页滚动扫描「在视口内却仍然很淡」0 处；减弱动效下 `anims=0` 且完全可见。

## 读屏可用性（实测播报行为）

静态 ARIA 检查查不出"播报是否真的发生、会不会刷屏"。`node scripts/sr-check.mjs`（**10/10**）
用拦截 `/api/chat` 的假流回放真实流式过程，验证的是**行为**而不只是属性：

| 项 | 结果 |
|---|---|
| 流式回答的播报次数 | **恰好 1 次**（"连小理回答完毕：…"），不是每个 token 刷一次 |
| 计时数字 | **不是** live region（否则每秒刷爆读屏） |
| 番茄钟归零 | 独立播报区播一次（读屏用户看不到"计时归零"这件事） |
| 错误提示 | `role="alert"`（立即播报；`polite` 会被前面的内容排队挡住） |
| 热力图格子 | `aria-label` 为「9 月 28 日，已打卡」这样的人话，**不是**裸日期 `2026-09-28` |
| 热力图整体 | 一句 `sr-only` 总览「共打卡 N 天」，避免逐个读 84 格 |
| `sr-only` | 实测 1×1px，不占布局 |

设计原则：**正文不加 `aria-live`**（流式会刷屏），改用独立的隐藏播报区在关键节点写一次；
播报内容截断到 160 字，因为 live region 无法跳过，读整篇会强迫用户听完。

## 可访问性与首屏性能（实测）

`a11y-check.mjs` **11/11**、`contrast-check.mjs` **156 处文字 0 不达标**。
性能在 4G（150ms RTT / 4Mbps）+ CPU 4× 降速下实测：

| 指标 | 实测 |
|---|---|
| FCP | **~820ms** |
| DOMContentLoaded / load | ~810ms / ~1335ms |
| 首屏 JS | **137KB**（10 个文件，压缩后） |
| 首屏 CSS / 请求数 | 7KB / 28 个 |

对比度要点：`--dut-muted` 原为 `#6b7280`，在浅蓝底上只有 **4.24:1（不达 AA 的 4.5:1）**，
已加深为 `#525A66`（各处 6.11–6.97:1）。
**评估时必须对 `bg-dut-mist/60` 这类半透明叠层做 alpha 合成** ——
否则会把合成后的 `#f1f7fd` 误当成白纸而漏判。

## 移动端（手机上像不像原生应用）

这类问题在桌面浏览器上完全看不出来，`node scripts/mobile-check.mjs` 用 iPhone 14 Pro
的视口、`isMobile` + `hasTouch` 实测，当前 **8/8 通过**：

| 项 | 做法 |
|---|---|
| 刘海 / Home 指示条 | `viewportFit: "cover"` + `.safe-top` / `.safe-bottom` / `.safe-x`（`env(safe-area-inset-*)`） |
| 点按延迟约 300ms | 可点元素 `touch-action: manipulation` |
| 点按蓝色高亮框 | `-webkit-tap-highlight-color: transparent` |
| iOS 聚焦输入框自动放大整页 | 输入框字号必须 ≥16px（用 `text-body`） |
| 触屏上 hover "粘住" | **所有** hover 都包在 `@media (hover: hover) and (pointer: fine)` 里 |
| 双指缩放 | **不禁用**（不写 `maximum-scale` / `user-scalable=no`） |

## 无 JS 渐进增强（实测契约）

`node scripts/nojs-check.mjs` 用 `javaScriptEnabled: false` 的真实 Chrome 验证，当前 **7/7 通过**：

| 能力 | 无 JS | 说明 |
|---|---|---|
| 落地页 / 八页正文 | ✅ | 服务端直出 |
| 注册 | ✅ | React 19 为 Server Action 注入 `$ACTION_ID_*` 隐藏字段（渐进增强） |
| 打卡 | ✅ | 同上，真实落库 |
| 建计划 | ✅ | 同上，真实落库 |
| 任务勾选 / 删除 | ✅ | `<form action={ServerAction}>` |
| 连小理对话 / 知识库问答 / 模型设置 / 报告生成 | ❌ | 本来就要调 API 与流式渲染，无 JS 不可用 |

**两条必须守住的约束**（都踩过坑）：

1. **`<html>` 上 `data-intro` 的默认值必须是 `off`**，脚本在首帧前改成 `1` 才播开场。
   反过来（默认可见、靠脚本隐藏）在禁用 JS 时会让那个全屏层**永久遮住整页**。
2. **不要给路由组加 `loading.tsx`**。它引入的 Suspense 边界只会发骨架屏，
   而骨架屏只能靠 JS 替换 —— 加了之后 `/today` `/plans` `/focus` `/checkin` `/reports`
   五个页面在无 JS 下全部**永久停在加载态**（HTTP 仍是 200、HTML 也不小，肉眼查不出来）。
   需要加载态时用组件内的局部 `panel-in`/`skeleton`，不要用路由级 `loading.tsx`。

---

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
  (app)/knowledge     知识库：上传 PDF / Word / PPT / Excel / .md，检索问答
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
  rag/
    chunk.ts          Markdown 分块（800/120，小段合并）
    extract.ts        浏览器端解析 PDF / Word / PPT / Excel 为纯文本
    keywords.ts       bigram 降级检索
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
- **装饰素材（玉兰 / 主楼，2026-10-03 由所有者提供）**：`public/dut-magnolia.png` 与
  `public/dut-building.png` 取自所有者提供的一幅水彩画稿，**版权归原作者**。
  本项目按所有者「使用公开可见的官方或二创素材，直接用了」的决定接入，
  授权责任由所有者承担；原 `PLAN §6.3`「装饰元素自绘」的约定同样已被覆盖，见 `PLAN §14 #21`。
  处理方式：素材是米色纸底上的水彩，按「与纸底的色彩距离 → alpha」抠图
  （笔触越淡越透明），所以**适合浅色底**（白卡、浅色页面）；
  深蓝底上改用 `.ink-on-blue` 滤镜提成白色水印。
  `MagnoliaArt` / `BuildingArt` 两个组件都保留自绘回退，缺图不会破图。
- 海浪（`WaveDivider`）仍为**自绘**矢量，未使用外部素材。
- **依赖许可已盘点**：全树 570 个包，无 GPL / AGPL / SSPL / 商业限制类许可，
  以 MIT（433）/ ISC（56）/ Apache-2.0（49）为主；
  含弱 copyleft 的仅 MPL-2.0（`lightningcss`、`axe-core`）、EPL-2.0（`elkjs`，均为构建/测试期依赖）
  与 `@img/sharp-win32-x64`（`Apache-2.0 AND LGPL-3.0-or-later`，Next 自带的可选图像优化二进制），
  这些不影响本项目以 MIT 分发。
- **不预置任何资料**：知识库只承载用户自己上传的内容，仓库内不含第三方题库 / 教材 / 试卷。
- **AI 生成内容**：连小理的回答由使用者自配的模型生成，可能出错；统计数字由 SQL / 纯函数算出（不经模型），
  但模型对数字的文字解读仍需自行判断。

