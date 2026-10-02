# 存档 · 下次说「开始」即可直接开工

> 存档时间：2026-10-02 23:00（UTC+8）
> 仓库：`Ccccr231/study-for-duters`（PRIVATE）· HEAD `2a3f752` · 21 个 commit · 工作区干净
> 本地与远端完全一致。

---

## 0. 一句话现状

**功能完整、验证通过、UI 已完成三轮提升 + 校徽开场序列；线上未部署**（Vercel 路线因账号受限放弃，改走阿里云自托管，脚本已备好）。
目标仍 active（已用 2/12 轮），下一轮做**字号阶梯 token 化**与**页面切换动效**。

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

## 2. 下一轮（Round 3）的计划

### ① 替换主楼剪影 + 玉兰为官方/二创素材（用户已定，等素材）

用户 2026-10-02 晚明确决定：**把海浪之外的装饰母题换成官方素材或民间二创**，
范围**只换「主楼剪影 + 玉兰」两个**，海浪（`WaveDivider`）保持自绘。

已确认的三个前提：
- **授权口径**：用户选择「公开可见的官方或二创素材，直接用了」。
  → README 与 `PLAN §14` 需补记：素材来源由所有者提供，**版权归原作者**；
  官方素材受学校 VI 管理办法约束（与校徽同性质）。风险由所有者承担。
- **交付方式**：用户直接发图（像 2026-10-02 发校徽那样）。注意 agent **无法下载图片二进制**
  （`web_fetch` 只能取文本），所以素材必须由用户提供，或提供 **SVG 的 URL**（SVG 是文本，可取）。
- **实现方式**（已与用户对齐）：做成「**图片优先 + 缺图回退现有自绘**」，
  与 `components/dut/Emblem.tsx` 同一模式，避免素材缺失时出现破图。

涉及的现有组件与使用位置：
| 组件 | 用在哪里 |
|---|---|
| `components/dut/MainBuildingSilhouette.tsx` | 落地页 hero 横向水印（`tone="onBlue"` 白描边）+ 移动端 hero |
| `components/dut/Magnolia.tsx` | 落地页 4 张功能卡、`/today` 无任务空状态、`/plans` 无计划空状态、`/plans/[id]` 无任务空状态 |

注意：
- 换成位图会丢掉**任意尺寸清晰**与**跟随主题色**（`--dut-blue` 一处改全局生效）两个特性；
  若素材是 SVG 则两者都保留，优先要 SVG。
- 主楼剪影当前用 `tone` 变体在深蓝底上转白描边；若是位图，深色底上要另做处理（反白或加浅色垫底）。

### ② 字号阶梯 token 化（消除排版维度最后的漂移）
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
- ⚠️ **Revoke Vercel token**：已作废的 Vercel token（完整值已于 2026-10-03 从仓库与 git 历史中清除）
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
