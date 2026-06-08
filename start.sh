#!/usr/bin/env bash
# Render 启动脚本 — 构建前端 + 启动后端
set -e

echo "=== Building Frontend ==="
npx vite build

echo "=== Starting Backend ==="
node server/index.js
