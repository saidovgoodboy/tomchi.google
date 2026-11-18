#!/usr/bin/env bash
# Tomchi — Linux + AMD RX 580 + Tailscale uchun 1 buyruqli avtomatik o'rnatuvchi.
# Ishlatish: sudo bash linux/install.sh

set -euo pipefail

APP_DIR="${TOMCHI_DIR:-/opt/tomchi}"
SERVICE_USER="${TOMCHI_USER:-tomchi}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== 1. Tizim paketlarini o'rnatish (FFmpeg, Tesseract, Mesa VA-API, Node.js, Python) =="
apt-get update -qq
apt-get install -y -qq \
  python3 python3-venv python3-pip \
  ffmpeg tesseract-ocr tesseract-ocr-eng \
  mesa-va-drivers vainfo libva-drm2 sqlite3 curl

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js topilmadi — frontend build uchun Node 22 o'rnatilmoqda..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

echo "== 2. AMD RX 580 VA-API tekshiruvi =="
if [ -e /dev/dri/renderD128 ]; then
  echo "Topildi: /dev/dri/renderD128"
  vainfo --display drm --device /dev/dri/renderD128 2>/dev/null | head -n 8 || true
else
  echo "Ogohlantirish: /dev/dri/renderD128 topilmadi, CPU dekodlash ishlatiladi."
fi

echo "== 3. Frontend PWA ni qurish va /opt/tomchi ga nusxalash =="
if [ -f "$REPO_DIR/package.json" ]; then
  if [ -f "$REPO_DIR/package-lock.json" ]; then
    (cd "$REPO_DIR" && npm ci --silent && npm run build)
  else
    (cd "$REPO_DIR" && npm install --silent && npm run build)
  fi
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi
usermod -aG video,render,dialout "$SERVICE_USER" 2>/dev/null || true

mkdir -p "$APP_DIR/backend/database" "$APP_DIR/backend/storage" "$APP_DIR/dist" "$APP_DIR/firmware"
cp -r "$REPO_DIR/backend/." "$APP_DIR/backend/"
cp -r "$REPO_DIR/firmware/." "$APP_DIR/firmware/"
if [ -d "$REPO_DIR/dist" ]; then
  cp -r "$REPO_DIR/dist/." "$APP_DIR/dist/"
fi

if [ ! -f "$APP_DIR/.env" ]; then
  DEVICE_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
  TOKEN_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  ADMIN_PASS="$(python3 -c 'import secrets; print(secrets.token_urlsafe(10))')"
  cat > "$APP_DIR/.env" <<EOF
APP_ENV=prod
PORT=8000
DEVICE_KEY=${DEVICE_KEY}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASS}
ADMIN_TOKEN_SECRET=${TOKEN_SECRET}
ANPR_ENABLED=true
USE_VAAPI=true
VAAPI_DEVICE=/dev/dri/renderD128
EOF
  chmod 600 "$APP_DIR/.env"
  echo "Yangi .env yaratildi ($APP_DIR/.env). Admin parol: ${ADMIN_PASS}"
fi

echo "== 4. Python muhiti va systemd servisi =="
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install -q --upgrade pip
"$APP_DIR/.venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"

cp "$REPO_DIR/linux/tomchi.service" /etc/systemd/system/tomchi.service
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
systemctl daemon-reload
systemctl enable --now tomchi.service

echo "== 5. Tailscale orqali telefondan HTTPS kirish =="
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if tailscale status >/dev/null 2>&1; then
  tailscale serve --bg 8000 || true
  TS_HOST="$(tailscale status --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("Self",{}).get("DNSName","").rstrip("."))' 2>/dev/null || true)"
  if [ -n "$TS_HOST" ]; then
    echo "Telefondan HTTPS kirish tayyor: https://${TS_HOST}"
  fi
else
  echo "Tailscale hali ulanmagan. Ulanish uchun: sudo tailscale up && sudo tailscale serve --bg 8000"
fi

echo "Lokal kirish: http://$(hostname -I | awk '{print $1}'):8000"
