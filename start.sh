#!/bin/bash
# 启动 AI 合伙分钱方案生成器 + Cloudflare Tunnel
# 使用方法: bash start.sh

echo "========================================="
echo "  AI 合伙分钱方案生成器 V0 - 启动脚本"
echo "========================================="

# Kill existing processes
kill $(lsof -ti:3000) 2>/dev/null
kill $(ps aux | grep cloudflared | grep -v grep | awk '{print $2}') 2>/dev/null
sleep 1

# Start Node server
cd "$(dirname "$0")"
nohup node server/index.js > /tmp/partnerserver.log 2>&1 &
sleep 3

# Check server
curl -s --connect-timeout 3 http://127.0.0.1:3000/api/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Node server 启动成功"
else
    echo "❌ Node server 启动失败"
    exit 1
fi

# Start Cloudflare Tunnel
nohup cloudflared tunnel --url http://127.0.0.1:3000 > /tmp/cloudflared.log 2>&1 &
sleep 8

TUNNEL_URL=$(grep -o 'https://[a-z-]*\.trycloudflare\.com' /tmp/cloudflared.log | head -1)
if [ -n "$TUNNEL_URL" ]; then
    echo "✅ Tunnel 启动成功"
    echo "🌐 公网 URL: $TUNNEL_URL"
    echo ""
    echo "   API 测试: curl $TUNNEL_URL/api/health"
    echo "   前端页面: $TUNNEL_URL"
else
    echo "❌ Tunnel 启动失败，请检查 /tmp/cloudflared.log"
fi

echo ""
echo "启动完成！"
