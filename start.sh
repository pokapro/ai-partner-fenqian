#!/usr/bin/env bash
# Render 启动脚本 — 构建前端 + 下载中文字体 + 启动后端
set -e

echo "=== Building Frontend (clean) ==="
rm -rf dist node_modules/.vite
npx vite build

echo "=== Downloading Chinese Font for PDF ==="
mkdir -p assets/fonts
FONT_REG="assets/fonts/NotoSansSC-Regular.ttf"
FONT_BOLD="assets/fonts/NotoSansSC-Bold.ttf"
if [ ! -f "$FONT_REG" ]; then
  curl -sL --max-time 60 -o "$FONT_REG" \
    "https://fonts.gstatic.com/s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYw.ttf"
fi
if [ ! -f "$FONT_BOLD" ]; then
  curl -sL --max-time 60 -o "$FONT_BOLD" \
    "https://fonts.gstatic.com/s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaGzjCnYw.ttf"
fi
if [ -f "$FONT_REG" ]; then
  echo "Font files size: $(ls -lh "$FONT_REG" | awk '{print $5}') + $(ls -lh "$FONT_BOLD" | awk '{print $5}')"
else
  echo "[WARN] 中文字体下载失败，PDF中文可能乱码"
fi

echo "=== Starting Backend ==="
node server/index.js
