#!/usr/bin/env bash
# 一键部署所有 Edge Functions 到 Supabase
# 使用方法: bash deploy_edge_functions.sh
set -euo pipefail

echo "============================================"
echo "  4homework → Supabase Edge Functions 部署"
echo "============================================"

# 检查登录状态
if ! supabase functions list &>/dev/null 2>&1; then
  echo ""
  echo "⚠️  需要先去获取 Personal Access Token:"
  echo "   1. 打开 https://supabase.com/dashboard/account/tokens"
  echo "   2. 点击「Generate New Token」"
  echo "   3. 复制 token"
  echo ""
  echo "   然后执行:"
  echo "   export SUPABASE_ACCESS_TOKEN=\"sbp_your_token_here\""
  echo "   supabase link --project-ref wamljmirzqviipsomjyu"
  echo ""
  echo "   或者直接运行下方命令部署:"
  echo ""
fi

# 定义函数列表
FUNCTIONS=("auth" "upload" "problems" "reviews" "parent")

echo "📦 即将部署 ${#FUNCTIONS[@]} 个 Edge Function:"
for fn in "${FUNCTIONS[@]}"; do
  echo "   - $fn"
done

echo ""
echo "🚀 开始部署..."

for fn in "${FUNCTIONS[@]}"; do
  echo -n "  $fn ... "
  if supabase functions deploy "$fn" --project-ref wamljmirzqviipsomjyu 2>&1; then
    echo "✅ $fn 部署成功"
  else
    echo "❌ $fn 部署失败"
  fi
done

echo ""
echo "============================================"
echo " 部署完成！"
echo ""
echo "  Edge Functions 地址:"
echo "  https://wamljmirzqviipsomjyu.supabase.co/functions/v1/auth"
echo "  https://wamljmirzqviipsomjyu.supabase.co/functions/v1/upload"
echo "  https://wamljmirzqviipsomjyu.supabase.co/functions/v1/problems"
echo "  https://wamljmirzqviipsomjyu.supabase.co/functions/v1/reviews"
echo "  https://wamljmirzqviipsomjyu.supabase.co/functions/v1/parent"
echo ""
echo "  部署完成后设置环境变量:"
echo "  supabase secrets set NVIDIA_API_KEY=你的key"
echo "  supabase secrets set NVIDIA_MODEL=nvidia/llama-3.2-nvlm-vision-90b"
echo "============================================"
