# 存档 · 下次说「开始」即可直接开工

> 存档时间：2026-10-03 09:50（UTC+8）
> 仓库：`Ccccr231/study-for-duters`（PRIVATE）· HEAD `17b7d02` · 38 个 commit · 工作区干净
> 本地与远端完全一致。**⚠️ 历史已重写过一次（清除泄漏的 token），旧的 commit SHA 全部失效。**

---

## 0. 一句话现状

**功能完整、12 项实测审计全绿、UI 已完成十一轮提升；线上仍未部署**
（Vercel 路线因账号受限放弃，改走阿里云自托管，脚本已备好）。

**当前需要你做的事只有两件**（我做不了，都需要你的账号）：
1. **轮换 DeepSeek API Key** —— 聊天记录里明文出现过（仓库里没有）
2. **部署** —— 买服务器；`deploy/SERVER.md` 与 `deploy/install.sh` 已就绪

---

## 0.1 最终实测状态（12 项审计，全部可复跑）

| 审计 | 命令 | 结果 |
|---|---|---|
| 类型 / 规范 / 单测 / 构建 | `pnpm typecheck` `pnpm lint` `pnpm test` `pnpm build` | 0 错误 · 0 问题 · 50/50 · 20/20 |
| 响应式溢出（320/390px） | `node scripts/overflow-check.mjs` | 6/6 |
| 无 JS 渐进增强 | `node scripts/nojs-check.mjs` | 7/7（注册/打卡/建计划真的落库） |
| 无 JS 骨架屏卡死 | `node scripts/skeleton-check.mjs` | 0/8 |
| 移动端原生化 | `node scripts/mobile-check.mjs` | 8/8 |
| 可访问性（ARIA/标题/焦点） | `node scripts/a11y-check.mjs` | 11/11 |
| 色彩对比度（WCAG AA） | `node scripts/contrast-check.mjs` | 156 处 0 不达标 |
| 读屏播报行为 | `node scripts/sr-check.mjs` | 10/10 |
| 滚动入场 | `node scripts/scroll-check.mjs` | 7/7 |
| 图片 srcset | `node scripts/srcset-check.mjs` | 4/4（@1x 省 90% / @3x 省 68%） |
| 密钥泄漏 | `node scripts/secret-scan.mjs` | 0 处（含全部 38 个提交） |
| 首屏性能（4G + 4× CPU 降速） | `a11y-check.mjs` 内 | FCP ~820ms · JS 137KB |

设计对照截图：`node scripts/shots.mjs after`（22 张，两种视口）。

---

## 0.2 2026-10-03 安全事件：Vercel token 泄漏与清除（教训值得记住）

`CHECKPOINT` 文档里曾写下 Vercel token 的**完整明文**，且该文件被提交，
导致 **17 个提交**都带着它，并推到了 GitHub。

只改工作区是不够的 —— 历史里的凭据会被每次 clone 带走。实际清除步骤：

```bash
# 1. --index-filter + update-index --cacheinfo 精确替换那一段字节
#    （hash-object -w --path=... 只写对象、不改索引，会表现为 "Ref is unchanged"）
git filter-branch -f --index-filter "<python scripts/_redact_secret.py>" -- --all
# 2. 删掉 refs/original/*（它们还指着旧历史）、删备份分支、expire reflog
git for-each-ref --format='%(refname)' refs/original | xargs -n1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --aggressive
# 3. 强制推送
git push --force origin main
```

核验（三重，缺一不可）：
- `git grep <token> $(git rev-list --all)` → 0 处
- 对象库：`git cat-file --batch-all-objects` 里无含该串的 blob
- **从远端 fetch 后重跑** `secret-scan.mjs` → 38 个提交全部干净

⚠️ **清除历史不能替代吊销**：凭据只要推送过就应视为已泄漏，
必须去服务商侧 revoke。本次 token 因对应账号受限已无用，
但**DeepSeek API Key 仍在待办里**。

教训：**永远不要把凭据写进任何会被提交的文件**，注释、文档、存档里都不行 ——
要写就写"已作废/去 XX 处 revoke"，不要写值。`scripts/secret-scan.mjs` 已固化这条检查。

---

## 0.1 最近的 UI 轮次（都有 commit）

| commit | 内容 |
|---|---|
| `1a1d7e9` | 路由入场过渡（并撤掉一套无效的 React `<ViewTransition>` 实现）+ 完成反馈 + 开场改每会话一次 |
| `f1f97ad` | 开场序列只在落地页播（不再拦在 `/login` 前）+ 平板断点对齐 |

其中两条经验值得记住：
- **Next 文档推荐的 React `<ViewTransition>` 在本项目不可用**：`react@19.2.8` 里
  `typeof ViewTransition === 'undefined'`（实测），那需要 canary。已换成
  `pathname` 作 key 的路由级入场动画，并实测「`router.refresh()` 不重放」。
- **调试截图时注意开场层**：全新 browser context 必然触发 2.4s 开场，
  截图脚本必须先等 `.intro` 消失（`shots.mjs` / `tablet-shots.mjs` 已内置 `waitIntroDone`）。

---

## 1. 下次开工先做这三件事（约 2 分钟）

```powershell
cd C:\Users\chenr\Documents\deepseek-harness\default-workspace\study-for-duters
git log --oneline -3        # 应为 2a3f752
git status --short          # 应为空
```

跑一遍闸门确认基线健康（沙箱环境用下面的**实际可用路径**，不是 `pnpm`）：

```powershell
$node = "C:\Users\chenr\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
& $node .\node_modules\typescript\bin\tsc --noEmit      # 期望 0 错误
& $node .\node_modules\vitest\vitest.mjs run            # 期望 40/40
& $node .\node_modules\eslint\bin\eslint.js .           # 期望 0 问题
```

需要看页面时（本地生产服务器，之前已起在 3100）：

```powershell
& $node .\node_modules\next\dist\bin\next build
& $node .\node_modules\next\dist\bin\next start -p 3100 -H 127.0.0.1
# 浏览器打开 http://127.0.0.1:3100
```

---

## 2. 进度

### ① ⚠️ **待你拍板：知识库只收 Markdown，普通学生没法用**（2026-10-03 用户提出）

用户原话：*"难道企图让一般的学生会把资料转成 markdown？肯定是支持 pdf word ppt 这种啊"* —— **批评成立**。

现状：`components/knowledge/KnowledgePanel.tsx` 的 `ACCEPT = ".md,.markdown,.txt,..."`，
标题写「上传资料（Markdown）」，`app/api/knowledge/ingest/route.ts` 按 `text/markdown` 入库。

**根因是决策过期**：`PLAN §2` 只收 `.md` 的理由是
「`pdf-parse` 在 **Vercel 免费层**（函数 60s 超时）解析大文件容易超时」——
而项目后来已改为**阿里云自托管**，这个约束早就不成立，但没人回来拆掉它。

用户实际会传的格式（查其 `study-materials` 仓库）：**.pdf 37 个、.xlsx 15 个、.docx/.doc 2 个、.md 仅 1 个**。

**建议方案（已与用户说明，待确认）**：**客户端解析**，把纯文本发给服务端入库。
| | 客户端解析 | 服务端解析 |
|---|---|---|
| 超时限制 | 无 | 大 PDF 仍可能超时 |
| 服务器内存 | 不占 | 50MB PDF 有风险 |
| 进度反馈 | 能显示"第 12/40 页" | 只能干等 |

- PDF → `pdfjs-dist`（ESM 更现代，优于老旧的 `pdf-parse`）
- DOCX → `mammoth`；PPTX / XLSX → `jszip` + 解析 XML
- **必须如实提示**：扫描版 PDF（拍照/影印）没有文字层，取不出文字，需 OCR
- 解析库约 1–2MB，**只在用户选文件时懒加载**，不影响其他页面
- 会改动 `PLAN §2` 的 MVP 边界 → 需在 `PLAN §14` 记偏差

> 用户尚未回答「全做还是先只做 PDF」。下次开工若无新指示，按**先只做 PDF** 推进
> （最刚需、收益最大），Office 系列随后。

### ② ~~替换主楼剪影 + 玉兰为官方/二创素材~~ ✅ 2026-10-03 完成（`53c4206`）

用户提供了水彩画稿（玉兰在左上、主楼在右下，米色纸底）。**试了三版才抠对**，
这段经验记下来，以后处理类似素材不必再走弯路：

1. 从整幅图四边洪水填充 → 只有画面外部透明，**裁剪矩形内仍是米色**，还带进无关元素。
2. 改为在裁剪区域内洪水填充 → 主楼周围那层浅灰绿水彩雾气不是纸底，填充到它就停，
   **矩形内仍留一片米色**。
3. ✅ **按「与纸底的色彩距离 → alpha」抠图**：笔触越淡越透明，正是水彩本来的合成方式。
   纸底距离≈0 全透明，楼体/花瓣不透明，过渡带自然半透明，**没有矩形底**。

落位与两个关键处理：
- 组件 `MagnoliaArt` / `BuildingArt`（**图片优先 + 缺图回退自绘**，`USE_ART=false` 整体回退）
- **深蓝底**（hero 主楼水印）：直接用 opacity 会发灰且露矩形底，
  改用 `.ink-on-blue`（`brightness(0) invert(1) opacity(0.22)`）提白；滤镜不改 alpha。
- **移动端 hero 改用校徽**：水彩是为浅底设计的，白底图压深蓝会显脏。
- 功能卡玉兰加 `bg-dut-mist/60` 淡底托住（44px 下水彩细节会糊）。
- 体积优化：512px + FASTOCTREE 量化，**降幅约 90%**（616→52KB / 379→36KB / 233→24KB）。

文档：README 合规节写明装饰素材同样来自所有者、**版权归原作者**；
`PLAN §14 #21` 记录本次覆盖 §6.3「装饰元素自绘」的偏差与回退路径。

### ② 字号阶梯 token 化（消除排版维度最后的漂移）← 下一项
实测现状：`text-sm`（14px）**76 次**、`text-[15px]` **39 次** —— 两个只差 1px 的近似值混用，
没有统一刻度。其余：`text-xs` 32、`text-xl` 10、`text-2xl` 4、`text-[11px]` 4、
`text-lg` 3、`text-[28px]` 3，以及 `text-[22px]`/`text-[44px]`/`text-[26px]`/`text-4xl` 各 1。

做法：在 `app/globals.css` 的 `@theme` 里定义一组语义 token（中文界面用奇数字号更清晰），
把 115 处替换掉，让每个字号都有明确角色（元数据 / 描述 / 正文 / 卡片标题 / 页面标题 / 统计 / hero）。

### ② 页面切换动效
Next 16 自带 React `<ViewTransition>`（无需额外配置，见 `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md:50`）。
把底部 tab 切换从硬切改成有空间含义的过渡。**注意**：底部导航不要用 `useLinkStatus`
（该组已有 `loading.tsx`，预取命中的导航会跳过 pending，见 `node_modules/next/dist/docs/.../use-link-status.md:76-83`）。

### ③ 可选（有余力再做）
- 任务勾选的"完成瞬间"强化（目前只有 `transition-colors`，勾掉后没有成就感反馈）
- 提交类按钮的 blur 交叉淡出（`filter: blur(2px)` 掩盖两个状态的重叠）
- `sm`–`lg`（640–1024px）区间仍是单列，靠平板宽度时偏空

---

## 3. 已完成的工作（四轮，都有 commit）

| commit | 内容 |
|---|---|
| `5cef7ad` | 静态审查补完：Server Action 权属与幂等加固（修 2 个高危） |
| `bd7979f` | 开源准备：MIT LICENSE + README 合规声明 |
| `5707044` | 清掉绕沙箱的 vitest 配置 |
| `9dec429` `cfdd0cb` | 阿里云自托管一键部署脚本 + 手册 |
| `71fdcb4` | 交接报告（给 codex 用） |
| `14fda7c` | **UI 第一轮**：动效地基（令牌/`.press`/`.tap`/reduced-motion）+ 流式滚动缺陷修复 |
| `d6e6069` | **UI 第二轮**：15 个文件的面板打磨 + 落地页响应式重做 |
| `e33b6d3` | **UI 第三轮**：21 处容器统一放宽（修桌面端 672px 窄列） |
| `7444ecc` | **校徽开场序列**（dolly zoom）+ 官方校徽接入 |
| `2a3f752` | **文创与情绪价值**：一天的节奏时间轴 + 校训带 |

### 已实现的动效（都在 `app/globals.css`）
- 令牌：`--ease-out/-in-out/-drawer`、`--dur-press/fast/base/slow`
- `.press`（大按钮 scale 0.98）/ `.tap`（小控件 scale 0.94）—— 覆盖全部 45 个可点击元素
- `.panel-in`（`@starting-style` 浮起入场）、`.rise`（交错入场）、`.bubble-in`、`.cell-pop`、`.skeleton`
- `.intro` / `.intro-emblem` / `.intro-glow` / `.intro-motto`（开场序列）
- `prefers-reduced-motion` 完整降级 + `prefers-reduced-transparency` 去 blur

### 开场序列（目标里的硬要求，已完成）
首次进入播一次：校徽 `scale(0.3) blur(14px)` → `scale(2.6) blur(0)`，2.4s，配光晕与校训淡入。
- 只播一次（`dut:intro-seen`）
- 显隐由 `data-intro` + CSS 决定（阻塞脚本在首帧前判断），**不能用 React state**，否则返回访问者会闪一下
- `prefers-reduced-motion` 下不播推进
- 校徽资产：`public/dut-emblem.png`（官方 JPEG 抠圆外留白后生成）

---

## 4. 常用的验证工具（都在仓库里）

| 脚本 | 作用 |
|---|---|
| `scripts/shots.mjs <label>` | 多视口（390×844 / 1280×800）设计对照截图，自动建临时账号造数据。产物 → `scripts/design-shots/<label>/`（已 gitignore） |
| `scripts/intro-shots.mjs` | 开场序列 6 个时间点 × 2 视口截图，并实测"二次访问不重播"与 reduced-motion |
| `scripts/overflow-check.mjs` | 320/390px 横向溢出巡检（曾抓到落地页底部文案被截断） |
| `scripts/e2e.mjs` | 接口级端到端 17 项（需 `DEEPSEEK_API_KEY`） |
| `scripts/ui-e2e.mjs` | 浏览器 UI 验收 11 项（需真实 Chrome + `DEEPSEEK_API_KEY`） |

`shots.mjs` / `intro-shots.mjs` / `overflow-check.mjs` 用 playwright-core 桥接，路径硬编码为
`C:/Users/chenr/.workbuddy/binaries/node/workspace/`（模块）与
`C:/Users/chenr/.agent-browser/browsers/chrome-154.0.8037.57/chrome.exe`（浏览器）。换机器要改这两处。

---

## 5. 本机环境坑（踩过的，别再踩）

| 坑 | 处理 |
|---|---|
| PowerShell 禁止运行 `.ps1` | 用 `.cmd` 版本，或直接 `& $node .\node_modules\<pkg>\...` |
| `pnpm exec` 不可用 | 用上面的 `$node` 绝对路径直接跑包入口 |
| Next 构建需先删 `.next` | `Remove-Item .next -Recurse -Force` 后再 build（否则偶发 EPERM） |
| 文件名含 `[` `]` | PowerShell 会当通配符，用 `-LiteralPath` |
| 中文写文件 | 用 `write` 工具或 Python `io.open(..., encoding='utf-8')`，**不要**用 `Set-Content -Encoding utf8`（会乱码/加 BOM） |
| git 提交信息含中文 | 写进临时文件后 `git commit -F <file>`；**不要**用 `Out-File -Encoding ascii`（中文会变问号） |

---

## 6. 待办与需要你决定的事

### 部署（阿里云路线，脚本已备好）
1. 买服务器：**2 核 2G 起 / Ubuntu 22.04 或 24.04 / 免备案选香港**
2. `scp deploy/install.sh root@IP:/root/` → `sudo bash /root/install.sh`（中途粘 Neon 的 `DATABASE_URL`）
3. **控制台安全组放行应用端口**（最容易漏，脚本改不了）
4. 脚本自动装 Node + 建 `.env` + 构建 + 注册 systemd（开机自启、崩溃重启）+ 自检
5. 细节见 `deploy/SERVER.md`

### 待你拍板
- **是否开源**：现仍 PRIVATE。转 public 后 `deploy/install.sh` 才能用 `curl` 直连下载
- **是否补域名**：无域名只能 `http://IP:端口`，**明文传输登录密码**；`deploy/SERVER.md §6` 有 Caddy 自动 HTTPS 步骤

### 安全（建议尽快做）
- ⚠️ **轮换 DeepSeek API Key**：聊天记录里明文出现过
- ✅ **Vercel token 已从仓库与全部历史中清除**（2026-10-03）：
  该值曾以明文写入本文档并被提交，17 个提交受影响；已重写历史并强制推送。
  token 本身已无用（对应账号受限），无需再操作。见 §0.2。
  已放弃 Vercel 路线（账号 `limited: true` 导致所有部署被 BLOCKED），token 已无用

---

## 7. 两条不能忘的硬性约定

1. **「不使用官方校徽」这条已被你的指示显式覆盖**（`PLAN §14 #20` 有偏差记录）。
   风险**未消除**：校徽与校名标准字受学校 VI 管理办法约束，以经营为目的使用需申请许可。
   回退方式：改 `components/dut/Emblem.tsx` 的 `EMBLEM_SRC` 一个常量即可。
   站内口径必须保持「面向 DUT 学生的个人/开源项目，非官方」。
2. **无 JS 渐进增强不能破坏**：`TodayTasks` / `CheckInCalendar` 是服务端渲染的纯表单/纯计算组件，
   刻意不加 `"use client"`。加任何交互都要确保不依赖 JS 也能用。

其余约定（连小理人设、LLM 用户自填、邮箱密码认证、UTC 切日、统计不过 LLM）见 `HANDOFF-2026-09-28-下午.md §1`。
