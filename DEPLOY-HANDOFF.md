# 部署交接报告 · Study for DUTERS

> 交给部署执行方（WorkBuddy / 运维 / 任何工程师）
> 编写时间：2026-10-03 13:45（UTC+8）
> 目标仓库：`Ccccr231/study-for-duters`（**私有**）· HEAD `b1c3140` · 40 个 commit · 工作区干净
> 本地与远端完全一致；`tsc` 0 错误 · `eslint` 0 问题 · `vitest` 50/50 · `next build` 通过

---

## 0. 一句话

一个面向大连理工学生的 AI 学习台（Next.js 16 + Neon Postgres），**代码已就绪、可部署**；
目标形态是**无域名的自托管**：阿里云轻量服务器上跑应用本体，数据库继续用 Neon 免费档，
访问地址为 `http://<公网IP>:3000`。

**但当前有 3 个已知阻塞点必须先解决**（§3），否则照 `deploy/SERVER.md` 直接跑会失败。

---

## 1. 这个项目是什么

| 项 | 内容 |
|---|---|
| 形态 | 单体 Next.js 应用（App Router），服务端渲染，**无独立后端** |
| 业务 | 学习闭环：计划 → 番茄钟专注 → 打卡 → AI 复盘；另有 AI 对话与资料库问答 |
| 技术栈 | Next.js 16.3.6 · React 19.2.8 · TypeScript 5.9.3 · Tailwind v4 · Prisma 7 + `@prisma/adapter-pg` · Neon Postgres + pgvector |
| 运行时 | **Node 22**（脚本已按 22 装）· pnpm |
| 进程 | `next start -p 3000 -H 0.0.0.0`，由 systemd 托管（`study-for-duters.service`） |
| 数据库 | **不在服务器上** —— 用 Neon 的托管 Postgres（连接串走公网 + TLS） |
| LLM | **平台不预置任何密钥**。每个用户在自己的浏览器里填 Base URL / API Key / 模型名，配置只存 localStorage，服务端不落库 |
| 资料库 | 支持 PDF / Word / PPT / Excel / Markdown，**在用户浏览器里解析**成文本再入库（服务端不碰原文件） |

**两个必须记住的产品约束**（会影响你怎么验收，也影响你怎么跟人解释）：
1. **不预置任何密钥**：所以部署后界面上"AI 功能不可用"是**正常的**，页面上会提示用户自己去「设置 → 模型」填。不要误判为部署失败。
2. **知识库不含任何资料**：仓库里没有第三方题库/教材/试卷，用户传什么就有什么。

---

## 2. 已经准备好的东西（不用你再写）

| 文件 | 作用 |
|---|---|
| `scripts/pack-deploy.mjs` | **打包给 scp 上传**：`git archive` 当前 HEAD，校验关键文件齐全、不含 `node_modules`/`.next`/`.env`/`.git`，并打印后续命令 |
| `deploy/install.sh` | 一键部署脚本：装 Node 22 + pnpm → **获取代码（三种来源自动判断）** → 生成 `.env` → 装依赖 → 构建 → 注册 systemd → 放行防火墙 → 自检。**幂等**，可重复跑 |
| `deploy/SERVER.md` | 选机器、排错、运维、上 HTTPS（Caddy）、备案提醒 |
| `scripts/check-db.mjs` | 部署自检：连库、查表数、查 pgvector，并提示常见连接串错误 |
| `scripts/apply-migration.mjs` | 手动应用数据库迁移（幂等），用于 `prisma migrate deploy` 不可用时 |
| `README.md` | 本地跑起来、目录说明、**12 项实测审计的复跑命令** |
| `PLAN.md` | 方案与里程碑；`§14` 有合规偏差记录（见 §8） |
| `public/pdf.worker.min.mjs` | PDF 解析所需的 pdf.js worker（已在仓库里，`postinstall` 也会自动同步） |
| `AGENTS.md` | 给 AI 编码代理的项目规则（**只有改代码时才需要读**，部署用不到） |

---

## 3. ⚠️ 三个已知阻塞点（必须先解决）

### 3.1 代码怎么上服务器 —— **已定：scp 打包上传**

仓库是 **PRIVATE**，而 `deploy/install.sh` 里的默认 `REPO` 是公开 HTTPS 地址，
未认证 clone 会失败。**所有者已选定 scp 打包上传**，服务器上不需要任何 GitHub 凭据：

```powershell
# ── 在所有者 Windows 机器上执行（需要能 ssh 到服务器）
cd C:\Users\chenr\Documents\deepseek-harness\default-workspace\study-for-duters
node scripts/pack-deploy.mjs
```

该脚本用 `git archive` 打包当前 HEAD，并**自动校验**：9 个关键文件齐全、
不含 `node_modules` / `.next` / `.env` / `.git`，工作区不干净时直接拒绝打包。
输出里会带上完整的后续命令（含服务器公网 IP 占位）。

> ⚠️ 打包前**必须提交所有改动**，否则脚本会拒绝 —— 这是刻意的，
> 避免打出的包与你以为的版本不一致。

`deploy/install.sh` 已改为**自动识别代码来源**，scp 路线走第一个分支：

| 优先级 | 条件 | 行为 |
|---|---|---|
| 1 | `SFD_SOURCE` 或**脚本同级目录**有 `package.json` | 用上传的代码（`rsync -a --delete` 同步到 `/opt/study-for-duters`） |
| 2 | `/opt/study-for-duters/.git` 存在 | `git fetch && reset --hard origin/main` |
| 3 | 都没有 | 首次 clone（**私有仓库会失败**，不该走到这里） |

打包产物**不含 `.git`**，所以不会误触发第 2 个分支。

> 另两种方式保留备选，但都需要额外授权，**不要自行采用**：
> 带 PAT 的 HTTPS clone（会往服务器留凭据）、把仓库转 public（需所有者同意，见 §7）。

### 3.2 安装脚本**不会建数据库表**

`install.sh` 只跑了 `pnpm exec prisma generate`（生成客户端代码），
**没有跑迁移**。表结构在 `prisma/migrations/000000_init/migration.sql` 里，
需要单独应用一次，否则应用启动后所有查询都会报表不存在。

迁移里含 `CREATE EXTENSION IF NOT EXISTS vector`（pgvector）与 `vector(1536)` 列 ——
Neon 免费档支持，无需额外开通。

**部署时必须补这一步**（二选一，都幂等）：

```bash
cd /opt/study-for-duters
pnpm exec prisma migrate deploy        # 首选
# 若 CLI 因网络/参数问题连不上 Neon：
node scripts/apply-migration.mjs       # 备选，效果等价，会登记到 _prisma_migrations
```

**顺序建议**：先建好 Neon 库并复制连接串 → 跑 `install.sh`（中途粘贴连接串）→ 再跑迁移 → `systemctl restart study-for-duters`。

判断是否已应用过（**用仓库里的自检脚本，不要手写内联命令** —— 内联 `node -e` 要多层引号转义，极易写错而误判成"数据库有问题"）：

```bash
cd /opt/study-for-duters
node scripts/check-db.mjs
```

正常输出形如：

```
✓ 数据库连通，迁移已应用
  public schema 表数：10
  User 行数：<现有用户数>
  pgvector：已启用（0.8.6）
```

该脚本还会主动提示两类常见连接串错误（缺 `sslmode=require`、带了 `channel_binding=require`），
表不存在时直接告诉你该跑哪条命令，退出码非 0。

### 3.3 云控制台安全组要手动放行 3000 端口

`install.sh` 会调 `ufw allow 3000/tcp`，但**云厂商控制台的「安全组 / 防火墙」脚本改不了**。
不放行的话现象是「脚本自检说成功、外面打不开」—— 这是 `SERVER.md` 里点名的头号原因。

阿里云：控制台 → 轻量应用服务器 → 防火墙 → 添加入方向规则 `TCP 3000`。

---

## 4. 需要用户（所有者）提供的东西

部署方**拿不到**这些，必须向所有者索取：

| # | 需要什么 | 说明 |
|---|---|---|
| 1 | **服务器公网 IP + root 登录方式** | SSH 密钥或密码。scp 上传需要能 ssh 到服务器 |
| 2 | **Neon `DATABASE_URL`** | Neon 控制台 → Connection string。**必须带 `sslmode=require`，不要带 `channel_binding=require`**（后者在部分 Node 环境下会握手失败） |
| 3 | **是否已买服务器** | 未买则先按 `SERVER.md §1` 选：**2 核 2G 起**（1G 会 OOM）、Ubuntu 22.04/24.04、免备案选香港/新加坡 |
| 4 | ~~仓库访问方式~~ | ✅ **已定：scp 打包上传**（§3.1），无需额外授权 |
| 5 | **是否要上 HTTPS（域名）** | 见 §6，需要所有者先买域名 |

---

## 5. 部署步骤（照此执行）

### 5.1 在所有者 Windows 机器上：打包

```powershell
cd C:\Users\chenr\Documents\deepseek-harness\default-workspace\study-for-duters
node scripts/pack-deploy.mjs
```

产出 `sfd-<短SHA>.tar.gz`（约 850KB）。脚本会打印完整命令，下面也列一遍。

### 5.2 上传并部署

```bash
# ── 0. 服务器上先加 2G swap（2G 内存机器构建时容易 OOM，SERVER.md §5）
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# ── 1. 上传（在所有者 Windows 机器上执行，把 <IP> 换成公网 IP）
#     scp "sfd-<短SHA>.tar.gz" root@<IP>:/root/

# ── 2. 服务器上解包
mkdir -p /opt/study-for-duters-src
tar -xzf /root/sfd-<短SHA>.tar.gz -C /opt/study-for-duters-src --strip-components=1

# ── 3. 跑安装脚本
#     install.sh 会自动发现同级目录的 package.json，把这份代码同步到 /opt/study-for-duters
sudo bash /opt/study-for-duters-src/deploy/install.sh
#     中途会提示粘贴 DATABASE_URL（可留空、事后再改 /opt/study-for-duters/.env）

# ── 4. 应用数据库迁移（§3.2，脚本不会做）
cd /opt/study-for-duters
pnpm exec prisma migrate deploy        # 失败则 node scripts/apply-migration.mjs
node scripts/check-db.mjs              # 自检：表数与 pgvector

# ── 5. 重启让应用连上已建好的库
systemctl restart study-for-duters

# ── 6. 放行安全组（§3.3，在云控制台做，不是命令）
```

> **locale 提醒**：包里有一个中文文件名的文档（`AUDIT-2026-09-28-静态审查.md`）。
> 服务器 locale 不足时 `tar` 会报一条 `Invalid empty pathname` 警告。
> 该文件是**纯文档、应用不引用**，忽略即可；
> 若想彻底避免，解包前 `export LANG=C.UTF-8`。

### 5.3 更新代码（后续）

```bash
# 本地重新打包上传，然后在服务器上：
mkdir -p /opt/study-for-duters-src
tar -xzf /root/sfd-<新短SHA>.tar.gz -C /opt/study-for-duters-src --strip-components=1
sudo bash /opt/study-for-duters-src/deploy/install.sh   # 幂等，会重新同步+构建+重启
```

完成后的运维命令（`SERVER.md §5`）：

```bash
systemctl status study-for-duters      # 状态
systemctl restart study-for-duters     # 重启
journalctl -u study-for-duters -f      # 实时日志
```

---

## 6. 上线后建议尽快做：补域名 + HTTPS

**当前形态是 `http://IP:3000`，登录密码明文经过网络。** 自己测试没问题，
给同学正式用之前建议补域名 + HTTPS。`SERVER.md §6` 有完整步骤（Caddy 自动申请并续期
Let's Encrypt 证书，不用手动管）。上 HTTPS 后建议在安全组里**关掉 3000 端口的外部放行**，只留 80/443。

国内机房需 **ICP 备案**（1–2 周）；赶时间就先选香港/新加坡，免备案。

---

## 7. 需要所有者拍板的事（部署方不要自行决定）

| # | 事项 | 说明 |
|---|---|---|
| 1 | **仓库是否转 public** | **部署已不需要**（scp 方案与仓库可见性无关，见 §3.1）。仍列出是因为它会影响合规暴露面与"是否开源"的产品决策，但不是部署阻塞项 |
| 2 | **是否购买域名** | 决定要不要做 HTTPS |
| 3 | **合规风险**（见 §8） | 使用了大工官方校徽与所有者提供的水彩素材，`PLAN §14 #20/#21` 有记录，**风险未消除、责任在所有者**。转 public 会让这两项更显眼 |
| 4 | **是否需要给同学公开使用** | 公开使用会显著提高 #3 的暴露面，也意味着要真做 HTTPS |
| 5 | **是否清空现有测试数据** | ⚠️ 开发期间连的是**所有者自己的 Neon 库**，里面已有测试账号与数据（本报告编写时 `User` 表有 17 行，均为开发测试产生）。若要给真实用户用，建议**新建一个干净的 Neon 库**，而不是清空当前库 —— 当前库还留着开发期的数据，清空不可逆 |

---

## 7.1 关于数据库的一个建议

开发期的 `DATABASE_URL` 指向所有者自己的 Neon 库，里面是测试数据。
**推荐为线上新建一个独立的 Neon 库**（免费档可建多个），理由：

- 测试数据不会流到线上（那些人名、计划、打卡记录都是假的）
- 开发继续折腾不会影响线上
- 想清空线上只需删掉那个库重来

代价只是多填一次连接串。若所有者坚持复用同一个库，**上线前必须手工清空业务表**，
且这一步不可逆，需所有者明确确认后再做。

---

## 8. 合规现状（照实说明，不要淡化）

| 项 | 现状 | 记录 |
|---|---|---|
| 校徽 | **使用了官方校徽**（原 `PLAN §6.3` 约定是"自绘、与官方标识保持距离"，按所有者明确要求改为使用官方素材） | `PLAN §14 #20` |
| 水彩素材（玉兰、主楼） | **使用了所有者提供的水彩画稿**，版权归原作者 | `PLAN §14 #21` |
| 项目口径 | 面向 DUT 学生的**个人开源项目，非官方**；界面上有免责声明 | `README` / 落地页底部 |
| 知识库内容 | 仓库内**不含**任何第三方题库 / 教材 / 试卷 | — |

校徽与校名标准字的使用受学校 VI 管理办法约束，**以经营为目的使用需申请许可**。
所有者已知悉并选择承担。

---

## 9. 验收清单

部署完请**逐项实跑**，不要只看脚本输出：

| # | 检查 | 怎么做 | 期望 |
|---|---|---|---|
| 1 | 服务在跑 | `systemctl is-active study-for-duters` | `active` |
| 2 | 本机可访问 | `curl -I http://127.0.0.1:3000/login` | `200` |
| 3 | **外网可访问** | 浏览器开 `http://<公网IP>:3000` | 出现落地页（**不是** 502/超时） |
| 4 | 数据库连通 | `node scripts/check-db.mjs` | `✓ 数据库连通，迁移已应用`，表数 10，pgvector 已启用 |
| 5 | 注册可用 | 界面上注册一个新账号 | 跳转到 `/today`，且无 500 |
| 6 | 打卡落库 | 打卡页点「打卡」 | 连续天数变 1，热力图今天那格变深蓝 |
| 7 | 建计划落库 | 计划页建一个计划 | 列表里出现该计划 |
| 8 | **AI 未配置是正常的** | 打开「连小理」或「知识库」 | 应提示去「设置 → 模型」填配置，**这是预期行为**，不是故障 |
| 9 | 上传解析可用 | 设置里随便填个模型配置后，在知识库选一个 PDF | 弹出"已读出 N 字"，点「加入知识库」后提示已入库 |
| 10 | 开机自启 | `systemctl is-enabled study-for-duters` | `enabled` |

> 第 8 项特别说明：因为**平台不预置密钥**，未配置模型时 AI 功能不可用是设计如此。
> 想验证 AI 链路，需要所有者提供自己的 API Key（或用任意 OpenAI 兼容服务临时填一个）。

---

## 10. 排错速查

| 现象 | 最可能原因 | 处理 |
|---|---|---|
| 脚本停在第 2 步 clone | 走错了分支：私有仓库无法未认证 clone | 确认是按 §5 的方式跑的（解包后从 `/opt/study-for-duters-src` 执行脚本，脚本会走"已上传代码"分支而不是 clone） |
| 脚本说成功但外面打不开 | **安全组没放行 3000（§3.3）** | 控制台加入方向规则 |
| 应用启动即报错、日志有 `relation "User" does not exist` | **迁移没跑（§3.2）** | 跑 `prisma migrate deploy` |
| 构建失败、日志有 OOM / `Killed` | 内存不足 | 加 2G swap 后重跑（脚本本身也提示了） |
| 日志有 `AUTH_SECRET 未配置` | `.env` 没生成好 | 检查 `/opt/study-for-duters/.env`（脚本应已自动填） |
| 日志有数据库连接错误 | `DATABASE_URL` 错 / 缺 `sslmode=require` / 带了 `channel_binding=require` | 改 `/opt/study-for-duters/.env` 后重启 |
| 页面能开但 AI 报错 | **预期行为**（未配模型） | 见 §9 第 8 项 |

`SERVER.md §4` 有更细的分支判断。

---

## 11. 关键路径速查

```
仓库      Ccccr231/study-for-duters          私有 · HEAD b1c3140
应用目录  /opt/study-for-duters
服务名    study-for-duters.service
端口      3000
环境变量  /opt/study-for-duters/.env         仅需 DATABASE_URL + AUTH_SECRET
迁移      prisma/migrations/000000_init/     含 CREATE EXTENSION vector（pgvector）
```

**必需环境变量只有两个**（已核对代码里所有 `process.env.*` 用法）：
`DATABASE_URL`（Neon 连接串）与 `AUTH_SECRET`（`install.sh` 自动生成，上线后不要再改）。
`DEEPSEEK_API_KEY` 只被仓库里的 e2e 测试脚本使用，**生产部署不需要**。

---

## 12. 部署完成后请回传

1. 访问地址（`http://<公网IP>:3000`）与验收清单 §9 的逐项结果（哪几项过、哪几项不过、不过的报错原文）
2. `journalctl -u study-for-duters -n 100` 的尾部输出
3. `node scripts/check-db.mjs` 的输出（确认表与 pgvector 状态）
4. 若中途改了 `install.sh` 或其它脚本，**请说明改了什么** ——
   那份改动需要回写到仓库，否则下次部署会踩同一个坑
5. ✅ 本方案**不需要任何 GitHub 凭据**，所以没有 PAT 需要 revoke。
   若因故临时创建过 token，请在回传里明确说明并确认已 revoke。
