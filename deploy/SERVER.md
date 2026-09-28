# 部署到自己的服务器（无域名 · IP + 端口）

适用于：不想用 Vercel、想要 24/7 在线、暂时不买域名的情况。
数据库继续用 Neon（免费档够用），服务器上只跑应用本体。

---

## 1. 买服务器

| 项目 | 建议 | 说明 |
|---|---|---|
| 厂商 | 阿里云 / 腾讯云**轻量应用服务器** | 学生认证有优惠；国外可选 Vultr、搬瓦工 |
| 配置 | **2 核 2G 起**（2 核 4G 更稳） | Next 构建吃内存，**1G 会 OOM** |
| 系统 | **Ubuntu 22.04 / 24.04** | 本手册与脚本按 Ubuntu 写 |
| 地域 | 免备案 → 香港 / 新加坡；国内用户求速度 → 国内机房（需备案） | |
| 硬盘 | 20G 起 | 依赖 + 构建产物约 1G |

先**不用买域名**。没有域名就先用 `http://公网IP:3000` 访问。

> ⚠️ **HTTP 是明文传输**：登录密码会以明文经过网络。自己测试没问题，
> 给同学正式用之前建议尽快补域名 + HTTPS（见 §6）。

---

## 2. 部署

### 2.1 把脚本弄到服务器上

仓库当前是**私有**的，所以 `curl raw.githubusercontent.com` 会 404。三选一：

**方式 A：从你电脑上传（最简单）**

```powershell
# 在你这台 Windows 上执行（把 IP 换成服务器公网 IP）
scp C:\Users\chenr\Documents\deepseek-harness\default-workspace\study-for-duters\deploy\install.sh root@你的公网IP:/root/
```

**方式 B：服务器上直接 clone（用 token）**

```bash
git clone https://<你的GitHub用户名>:<PAT>@github.com/Ccccr231/study-for-duters.git /tmp/sfd
cp /tmp/sfd/deploy/install.sh /root/
```

> 这会往 shell 历史里留下 token；用完执行 `history -c`，并给 PAT 设最短有效期。

**方式 C：仓库转 public 之后（最省事）**

```bash
curl -fsSL https://raw.githubusercontent.com/Ccccr231/study-for-duters/main/deploy/install.sh -o install.sh
```

### 2.2 执行

登录服务器（`ssh root@你的公网IP`），然后：

```bash
sudo bash /root/install.sh
```

脚本会依次完成：装 Node 22 + pnpm → 拉代码到 `/opt/study-for-duters` →
生成 `.env`（`AUTH_SECRET` 自动生成）→ 装依赖 → `prisma generate` → `next build` →
注册 systemd 服务（开机自启 + 崩溃自动重启）→ 开放防火墙端口 → 自检。

**中途会提示你粘贴 `DATABASE_URL`**：填你 Neon 控制台那条连接串
（带 `sslmode=require`，**不要**带 `channel_binding=require`）。可以留空跳过，事后再改
`/opt/study-for-duters/.env`。

脚本幂等，可以重复运行（会更新代码并重建）。

---

## 3. 最容易漏的一步：安全组

云服务器的**控制台安全组 / 防火墙**默认不放行 3000 端口，脚本改不了它。
去控制台**入方向规则**里放行 `3000/TCP`，否则外面永远连不上。

这是「脚本说成功但打不开」的头号原因。

---

## 4. 访问

```
http://你的公网IP:3000
```

首次打开如果 502 / 连接被拒，按顺序查：

```bash
systemctl status study-for-duters          # 服务在跑吗
journalctl -u study-for-duters -n 50       # 最近日志
curl -I http://127.0.0.1:3000/login        # 服务器本机能不能通
```

- 本机能通、外面不通 → **安全组没放行**（见 §3）
- 服务没起来 + 日志有 `AUTH_SECRET 未配置` → `.env` 没填好
- 日志有数据库连接错误 → `DATABASE_URL` 错了或缺 `sslmode=require`

---

## 5. 日常运维

```bash
systemctl status study-for-duters      # 状态
systemctl restart study-for-duters     # 重启
journalctl -u study-for-duters -f      # 实时日志

# 更新代码
cd /opt/study-for-duters
git pull && pnpm install && pnpm build && systemctl restart study-for-duters
```

**2G 内存的机器建议加 2G swap**（构建时不容易 OOM）：

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 6. 想上 HTTPS（需要域名）

1. 买个域名，在 DNS 里加一条 A 记录指向服务器公网 IP
2. 装 Caddy（自动申请并续期 Let's Encrypt 证书，不用手动管证书）：

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

3. 写 `/etc/caddy/Caddyfile`：

```
你的域名.com {
    reverse_proxy 127.0.0.1:3000
}
```

4. `systemctl reload caddy`。Caddy 会自己签证书，之后用 `https://你的域名.com` 访问。
5. 上 HTTPS 后建议在安全组里**关掉 3000 端口的外部放行**，只留 80/443。

---

## 7. 备案提醒（国内机房）

服务器若在国内机房，域名解析到它之前需要**ICP 备案**（约 1–2 周）。
赶时间就先选香港/新加坡，免备案、可直接上 HTTPS。
