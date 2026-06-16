#!/usr/bin/env bash
# Render 启动脚本 — 构建前端 + 下载中文字体 + 启动后端
set -e

echo "=== Building Frontend (clean) ==="
rm -rf dist node_modules/.vite
npx vite build

echo "=== Installing Chinese Font for PDF ==="
mkdir -p assets/fonts
if command -v apt-get &>/dev/null; then
  sudo apt-get install -y fonts-noto-cjk 2>/dev/null && echo "fonts-noto-cjk installed via apt"
fi
# Download fallback (if apt fails, e.g. non-Ubuntu env)
if [ ! -f "assets/fonts/NotoSansSC-Regular.ttf" ]; then
  curl -sL --max-time 60 -o "assets/fonts/NotoSansSC-Regular.ttf" \
    "https://github.com/notofonts/noto-cjk/releases/download/Sans2.004/08_NotoSansCJKsc-Regular.otf" 2>/dev/null || true
fi
ls -lh assets/fonts/ 2>/dev/null || true
rm -f .gitignore.tmp

echo "=== Starting Backend ==="
node server/index.js
