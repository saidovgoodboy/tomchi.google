#!/usr/bin/env bash
# Tomchi uchun Ubuntu/Debian .deb paket yasash skripti
set -euo pipefail

VERSION="2.0.0"
PKG="tomchi_${VERSION}_amd64"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build_deb/$PKG"

rm -rf "$ROOT_DIR/build_deb"
mkdir -p "$BUILD_DIR/DEBIAN" "$BUILD_DIR/opt/tomchi/backend" "$BUILD_DIR/opt/tomchi/firmware" "$BUILD_DIR/opt/tomchi/dist" "$BUILD_DIR/etc/systemd/system"

if [ -f "$ROOT_DIR/package-lock.json" ]; then
  (cd "$ROOT_DIR" && npm ci --silent && npm run build)
else
  (cd "$ROOT_DIR" && npm install --silent && npm run build)
fi
cp -r "$ROOT_DIR/backend/." "$BUILD_DIR/opt/tomchi/backend/"
cp -r "$ROOT_DIR/firmware/." "$BUILD_DIR/opt/tomchi/firmware/"
cp -r "$ROOT_DIR/dist/." "$BUILD_DIR/opt/tomchi/dist/"
cp "$ROOT_DIR/linux/tomchi.service" "$BUILD_DIR/etc/systemd/system/tomchi.service"

cat > "$BUILD_DIR/DEBIAN/control" <<EOF
Package: tomchi
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: amd64
Depends: python3, python3-venv, ffmpeg, tesseract-ocr, tesseract-ocr-eng, mesa-va-drivers, sqlite3
Maintainer: Tomchi <admin@tomchi.local>
Description: Tomchi IP Camera ANPR & Car Wash Bonus System (with ESP32 firmware & Tailscale support)
EOF

cat > "$BUILD_DIR/DEBIAN/postinst" <<'EOF'
#!/usr/bin/env bash
set -e
if ! id tomchi >/dev/null 2>&1; then
  useradd --system --home-dir /opt/tomchi --shell /usr/sbin/nologin tomchi
fi
usermod -aG video,render,dialout tomchi 2>/dev/null || true
mkdir -p /opt/tomchi/backend/database /opt/tomchi/backend/storage
if [ ! -d /opt/tomchi/.venv ]; then
  python3 -m venv /opt/tomchi/.venv
fi
/opt/tomchi/.venv/bin/pip install -q -r /opt/tomchi/backend/requirements.txt
chown -R tomchi:tomchi /opt/tomchi
systemctl daemon-reload
systemctl enable --now tomchi.service || true
EOF
chmod 755 "$BUILD_DIR/DEBIAN/postinst"

dpkg-deb --build "$BUILD_DIR"
echo "Tayyor .deb paket: $ROOT_DIR/build_deb/${PKG}.deb"
