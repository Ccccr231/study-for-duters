#!/usr/bin/env bash
# Study for DUTERS · 服务器一键部署（Ubuntu 22.04 / 24.04，无域名、IP + 端口访问）
#
# 用法（在服务器上以 root 运行）：
#
#   【推荐】打包上传（仓库保持私有，服务器上不需要任何 GitHub 凭据）
#     本地：node scripts/pack-deploy.mjs        # 生成 deploy-<sha>.tar.gz
#     上传：scp deploy-<sha>.tar.gz root@<公网IP>:/root/
#     服务器：
#       mkdir -p /opt/study-for-duters-src
#       tar -xzf /root/deploy-<sha>.tar.gz -C /opt/study-for-duters-src --strip-components=1
#       sudo bash /opt/study-for-duters-src/deploy/install.sh
#     （脚本会自动发现同级的 package.json，把这份代码同步到 /opt/study-for-duters）
#
#   【已转 public】curl 下载后跑，脚本会自己 clone
#     curl -fsSL https://raw.githubusercontent.com/Ccccr231/study-for-duters/main/deploy/install.sh -o install.sh
#     sudo bash install.sh
#
#   【已在服务器上 clone 过】直接重跑，脚本会 git pull
#     sudo bash /opt/study-for-duters/deploy/install.sh
#
# 脚本会做：
#   1. 装 Node.js 22 + pnpm
#   2. 获取代码到 /opt/study-for-duters（三种来源自动判断，见第 2 步注释）
#   3. 生成 .env（DATABASE_URL 需要你填，AUTH_SECRET 自动生成）
#   4. pnpm install + prisma generate + next build
#   5. 注册 systemd 服务（开机自启、崩溃自动重启）
#   6. 开放防火墙端口
#
# ⚠️ 本脚本**不会**建数据库表，装完还要跑一次迁移（见 DEPLOY-HANDOFF.md §3.2）：
#     cd /opt/study-for-duters && pnpm exec prisma migrate deploy
#     （失败则 node scripts/apply-migration.mjs）
#    然后：node scripts/check-db.mjs   # 自检
#
# 幂等：重复运行会更新代码并重建，不会重复装 Node / 重复注册服务。
set -euo pipefail

REPO="https://github.com/Ccccr231/study-for-duters.git"
APP_DIR="/opt/study-for-duters"
APP_PORT="${APP_PORT:-3000}"
SERVICE="study-for-duters"
NODE_MAJOR=22

log() { echo -e "\n\033[1;34m==> $*\033[0m"; }
die() { echo -e "\n\033[1;31m✗ $*\033[0m" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行（sudo bash install.sh）"

# ---------- 1. Node.js + pnpm ----------
log "安装 Node.js ${NODE_MAJOR} 与 pnpm"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt "$NODE_MAJOR" ]; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg git
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
else
  log "Node 已满足：$(node -v)"
fi
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm
echo "  node $(node -v) / pnpm $(pnpm -v)"

# ---------- 2. 获取代码 ----------
# 代码有三种来源，按优先级自动判断（命令行可用 SFD_SOURCE=<路径> 强制指定）：
#   1) SFD_SOURCE / 脚本同级目录里有 package.json → 用**已上传的代码**
#      （推荐：scp / 打包上传，仓库保持私有，不需要在服务器上放任何 GitHub 凭据）
#   2) /opt/study-for-duters/.git 存在 → 从 git 拉取更新
#   3) 都没有 → 首次 clone（**仓库若仍是私有，此步会失败**，请改用方式 1）
log "获取代码到 ${APP_DIR}"

SOURCE_DIR="${SFD_SOURCE:-}"
if [ -z "${SOURCE_DIR}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "${SCRIPT_DIR}/package.json" ]; then
    SOURCE_DIR="${SCRIPT_DIR}"
  fi
fi

if [ -n "${SOURCE_DIR}" ] && [ -f "${SOURCE_DIR}/package.json" ]; then
  echo "  代码来源：已上传的目录 ${SOURCE_DIR}"
  if [ "${SOURCE_DIR}" = "${APP_DIR}" ]; then
    echo "  源目录就是 ${APP_DIR}，原地使用，不做拷贝"
  else
    mkdir -p "${APP_DIR}"
    # --delete 让目标与上传内容完全一致（否则被删掉的文件会残留）
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete --exclude '.env' --exclude 'node_modules' --exclude '.next' \
        "${SOURCE_DIR}/" "${APP_DIR}/"
    else
      # 没装 rsync 时的退路：先清掉旧代码（保留 .env 与依赖缓存）
      find "${APP_DIR}" -mindepth 1 -maxdepth 1 \
        ! -name '.env' ! -name 'node_modules' ! -name '.next' -exec rm -rf {} +
      cp -a "${SOURCE_DIR}/." "${APP_DIR}/"
    fi
    echo "  已同步到 ${APP_DIR}"
  fi
elif [ -d "${APP_DIR}/.git" ]; then
  echo "  代码来源：git（${APP_DIR} 已是仓库）"
  git -C "${APP_DIR}" fetch --all -q
  git -C "${APP_DIR}" reset --hard origin/main -q
else
  echo "  代码来源：git clone（首次）"
  echo "  ⚠️ 若仓库仍是私有，这一步会因无凭据而失败 —— 请改用打包上传（见 DEPLOY-HANDOFF.md §3.1 方案 A）"
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone -q "${REPO}" "${APP_DIR}"
fi
cd "${APP_DIR}"

# ---------- 3. .env ----------
log "配置 .env"
if [ ! -f .env ]; then
  cat > .env <<EOF
# Neon 连接串（带 sslmode=require，不要带 channel_binding=require）
DATABASE_URL=""
# 会话 JWT 签名密钥（本脚本自动生成，上线后不要再改）
AUTH_SECRET="$(head -c 32 /dev/urandom | base64)"
EOF
  chmod 600 .env
  echo "  已生成 .env（AUTH_SECRET 已自动填好）"
else
  echo "  .env 已存在，保持不动"
fi

if ! grep -q '^DATABASE_URL="postgres' .env 2>/dev/null; then
  echo ""
  echo "  ⚠️  还需要填 DATABASE_URL（Neon 连接串）"
  read -r -p "  粘贴 DATABASE_URL 后回车（直接回车跳过，事后再改 /opt/study-for-duters/.env）： " DBURL
  if [ -n "${DBURL}" ]; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DBURL}\"|" .env
    echo "  已写入"
  else
    echo "  已跳过 —— 后面一定要填，否则应用启动会报错"
  fi
fi

# ---------- 4. 依赖与构建 ----------
log "安装依赖"
pnpm install --frozen-lockfile

log "生成 Prisma Client"
pnpm exec prisma generate

log "构建（2G 内存建议先加 swap，见 README）"
if ! pnpm build; then
  die "构建失败。2G 内存机器常见原因是 OOM：先执行 'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile' 再重跑本脚本"
fi

# ---------- 5. systemd ----------
log "注册 systemd 服务（开机自启 + 崩溃重启）"
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=Study for DUTERS (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=$(command -v node) ${APP_DIR}/node_modules/next/dist/bin/next start -p ${APP_PORT} -H 0.0.0.0
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE}" >/dev/null
systemctl restart "${SERVICE}"
sleep 4

# ---------- 6. 防火墙 ----------
log "开放端口 ${APP_PORT}"
if command -v ufw >/dev/null 2>&1; then
  ufw allow "${APP_PORT}/tcp" >/dev/null 2>&1 || true
  echo "  ufw 已放行（若 ufw 未启用可忽略）"
fi
echo "  ⚠️ 云厂商控制台的「安全组 / 防火墙」也要放行 ${APP_PORT} 端口，这一步脚本改不了"

# ---------- 7. 自检 ----------
log "自检"
systemctl is-active --quiet "${SERVICE}" && echo "  ✓ 服务运行中" || echo "  ✗ 服务未运行，查：journalctl -u ${SERVICE} -n 50"
if curl -fsS -o /dev/null -m 10 "http://127.0.0.1:${APP_PORT}/login"; then
  echo "  ✓ 本地 http://127.0.0.1:${APP_PORT}/login 返回 200"
else
  echo "  ✗ 本地探测失败，查：journalctl -u ${SERVICE} -n 50"
fi

PUBLIC_IP="$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || echo '<你的公网IP>')"
cat <<EOF

────────────────────────────────────────────
部署完成

访问地址：http://${PUBLIC_IP}:${APP_PORT}

常用命令：
  systemctl status ${SERVICE}      # 状态
  systemctl restart ${SERVICE}     # 重启
  journalctl -u ${SERVICE} -f      # 实时日志
  cd ${APP_DIR} && git pull && pnpm install && pnpm build && systemctl restart ${SERVICE}   # 更新代码

下一步建议：补一个域名 + HTTPS（http 明文传输密码不安全）
────────────────────────────────────────────
EOF
